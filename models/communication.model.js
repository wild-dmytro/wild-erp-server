// =====================================
// models/communication.model.js
// Основна модель для роботи з комунікаціями
// =====================================

const db = require('../config/db');
const { withTransaction } = require('../utils/db.utils');

class CommunicationModel {
  /**
   * Додавання нової комунікації
   * @param {Object} data - Дані комунікації
   * @param {string} contextType - Тип контексту ('flow' або 'bizdev_request')
   * @param {number} contextId - ID контексту
   */
  static async addCommunication(data, contextType, contextId) {
    const {
      sender_id,
      recipient_id = null,
      message_type = 'message',
      subject = null,
      message,
      attachments = null,
      metadata = null,
      priority = 'normal',
      is_urgent = false,
      is_internal = false
    } = data;

    return withTransaction(async (client) => {
      // Перевіряємо існування контексту
      await this._validateContext(client, contextType, contextId);

      // Додаємо комунікацію
      const communicationResult = await client.query(`
        INSERT INTO communications (
          sender_id, recipient_id, message_type, subject, message,
          attachments, metadata, priority, is_urgent, is_internal
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        sender_id, recipient_id, message_type, subject, message,
        attachments, metadata, priority, is_urgent, is_internal
      ]);

      const communication = communicationResult.rows[0];

      // Додаємо контекст
      await client.query(`
        INSERT INTO communication_contexts (communication_id, context_type, context_id)
        VALUES ($1, $2, $3)
      `, [communication.id, contextType, contextId]);

      // Оновлюємо час останнього оновлення контексту
      await this._updateContextTimestamp(client, contextType, contextId, sender_id);

      return await this.getCommunicationById(communication.id, client);
    });
  }

  /**
   * Отримання комунікацій за контекстом
   * @param {string} contextType - Тип контексту
   * @param {number} contextId - ID контексту
   * @param {Object} options - Опції пагінації та фільтрації
   */
  static async getCommunicationsByContext(contextType, contextId, options = {}) {
    const {
      page = 1,
      limit = 50,
      is_internal = null,
      message_type = null,
      sender_id = null,
      search = null,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options;

    const offset = (page - 1) * limit;
    let whereConditions = ['cc.context_type = $1', 'cc.context_id = $2'];
    let params = [contextType, contextId];
    let paramIndex = 3;

    // Додаткові фільтри
    if (is_internal !== null) {
      whereConditions.push(`c.is_internal = $${paramIndex}`);
      params.push(is_internal);
      paramIndex++;
    }

    if (message_type) {
      whereConditions.push(`c.message_type = $${paramIndex}`);
      params.push(message_type);
      paramIndex++;
    }

    if (sender_id) {
      whereConditions.push(`c.sender_id = $${paramIndex}`);
      params.push(sender_id);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(c.message ILIKE $${paramIndex} OR c.subject ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Валідація сортування
    const validSortFields = ['created_at', 'updated_at', 'priority', 'message_type'];
    const validSortOrders = ['ASC', 'DESC'];
    
    if (!validSortFields.includes(sort_by)) {
      throw new Error(`Недійсне поле для сортування: ${sort_by}`);
    }
    
    if (!validSortOrders.includes(sort_order.toUpperCase())) {
      throw new Error(`Недійсний порядок сортування: ${sort_order}`);
    }

    const query = `
      SELECT 
        c.*,
        cc.context_type,
        cc.context_id,
        sender.username as sender_username,
        sender.first_name as sender_first_name,
        sender.last_name as sender_last_name,
        sender.role as sender_role,
        recipient.username as recipient_username,
        recipient.first_name as recipient_first_name,
        recipient.last_name as recipient_last_name,
        editor.username as edited_by_username,
        editor.first_name as edited_by_first_name,
        editor.last_name as edited_by_last_name
      FROM communications c
      JOIN communication_contexts cc ON c.id = cc.communication_id
      LEFT JOIN users sender ON c.sender_id = sender.id
      LEFT JOIN users recipient ON c.recipient_id = recipient.id
      LEFT JOIN users editor ON c.edited_by = editor.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY c.${sort_by} ${sort_order.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    // Підрахунок загальної кількості
    const countQuery = `
      SELECT COUNT(*) as total
      FROM communications c
      JOIN communication_contexts cc ON c.id = cc.communication_id
      WHERE ${whereConditions.join(' AND ')}
    `;

    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    const communications = result.rows.map(comm => this._formatCommunication(comm));

    return {
      communications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Отримання комунікації за ID
   */
  static async getCommunicationById(communicationId, client = null) {
    const queryClient = client || db;

    const query = `
      SELECT 
        c.*,
        cc.context_type,
        cc.context_id,
        sender.username as sender_username,
        sender.first_name as sender_first_name,
        sender.last_name as sender_last_name,
        sender.role as sender_role,
        recipient.username as recipient_username,
        recipient.first_name as recipient_first_name,
        recipient.last_name as recipient_last_name,
        editor.username as edited_by_username,
        editor.first_name as edited_by_first_name,
        editor.last_name as edited_by_last_name
      FROM communications c
      JOIN communication_contexts cc ON c.id = cc.communication_id
      LEFT JOIN users sender ON c.sender_id = sender.id
      LEFT JOIN users recipient ON c.recipient_id = recipient.id
      LEFT JOIN users editor ON c.edited_by = editor.id
      WHERE c.id = $1
    `;

    const result = await queryClient.query(query, [communicationId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this._formatCommunication(result.rows[0]);
  }

  /**
   * Редагування комунікації
   */
  static async editCommunication(communicationId, newMessage, editedBy) {
    const query = `
      UPDATE communications 
      SET message = $1, 
          is_edited = true, 
          edited_at = NOW(), 
          edited_by = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await db.query(query, [newMessage, editedBy, communicationId]);
    
    if (result.rows.length === 0) {
      throw new Error('Комунікацію не знайдено');
    }

    return await this.getCommunicationById(communicationId);
  }

  /**
   * Видалення комунікації (м'яке видалення)
   */
  static async deleteCommunication(communicationId, deletedBy) {
    const query = `
      UPDATE communications 
      SET message = '[Повідомлення видалено]', 
          is_edited = true, 
          edited_at = NOW(), 
          edited_by = $1,
          updated_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) || '{"deleted": true}'::jsonb
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [deletedBy, communicationId]);
    
    if (result.rows.length === 0) {
      throw new Error('Комунікацію не знайдено');
    }

    return result.rows[0];
  }

  /**
   * Позначення комунікації як прочитаної
   */
  static async markAsRead(communicationId, userId) {
    const query = `
      UPDATE communications 
      SET is_read = true, 
          read_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND (recipient_id = $2 OR recipient_id IS NULL)
      RETURNING *
    `;

    const result = await db.query(query, [communicationId, userId]);
    return result.rows.length > 0;
  }

  /**
   * Отримання статистики комунікацій
   */
  static async getCommunicationStats(contextType, contextId) {
    const query = `
      SELECT 
        COUNT(*) as total_communications,
        COUNT(CASE WHEN c.is_read = false THEN 1 END) as unread_count,
        COUNT(CASE WHEN c.message_type = 'comment' THEN 1 END) as comments_count,
        COUNT(CASE WHEN c.message_type = 'system' THEN 1 END) as system_messages_count,
        COUNT(CASE WHEN c.is_internal = true THEN 1 END) as internal_count,
        COUNT(CASE WHEN c.is_urgent = true THEN 1 END) as urgent_count,
        MAX(c.created_at) as last_communication_at
      FROM communications c
      JOIN communication_contexts cc ON c.id = cc.communication_id
      WHERE cc.context_type = $1 AND cc.context_id = $2
    `;

    const result = await db.query(query, [contextType, contextId]);
    return result.rows[0];
  }

  /**
   * Пошук комунікацій
   */
  static async searchCommunications(searchQuery, options = {}) {
    const {
      context_type = null,
      context_id = null,
      sender_id = null,
      page = 1,
      limit = 50
    } = options;

    const offset = (page - 1) * limit;
    let whereConditions = ['(c.message ILIKE $1 OR c.subject ILIKE $1)'];
    let params = [`%${searchQuery}%`];
    let paramIndex = 2;

    if (context_type) {
      whereConditions.push(`cc.context_type = $${paramIndex}`);
      params.push(context_type);
      paramIndex++;
    }

    if (context_id) {
      whereConditions.push(`cc.context_id = $${paramIndex}`);
      params.push(context_id);
      paramIndex++;
    }

    if (sender_id) {
      whereConditions.push(`c.sender_id = $${paramIndex}`);
      params.push(sender_id);
      paramIndex++;
    }

    const query = `
      SELECT 
        c.*,
        cc.context_type,
        cc.context_id,
        sender.username as sender_username,
        sender.first_name as sender_first_name,
        sender.last_name as sender_last_name
      FROM communications c
      JOIN communication_contexts cc ON c.id = cc.communication_id
      LEFT JOIN users sender ON c.sender_id = sender.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);
    const communications = result.rows.map(comm => this._formatCommunication(comm));

    return {
      communications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rows.length
      }
    };
  }

  // Приватні допоміжні методи
  static async _validateContext(client, contextType, contextId) {
    let tableName;
    switch (contextType) {
      case 'flow':
        tableName = 'flows';
        break;
      case 'bizdev_request':
        tableName = 'bizdev_requests';
        break;
      default:
        throw new Error(`Невідомий тип контексту: ${contextType}`);
    }

    const result = await client.query(
      `SELECT id FROM ${tableName} WHERE id = $1`,
      [contextId]
    );

    if (result.rows.length === 0) {
      throw new Error(`${contextType} з ID ${contextId} не знайдено`);
    }
  }

  static async _updateContextTimestamp(client, contextType, contextId, userId) {
    let updateQuery;
    switch (contextType) {
      case 'flow':
        updateQuery = 'UPDATE flows SET updated_at = NOW(), updated_by = $1 WHERE id = $2';
        break;
      case 'bizdev_request':
        updateQuery = 'UPDATE bizdev_requests SET updated_at = NOW(), updated_by = $1 WHERE id = $2';
        break;
      default:
        return; // Не оновлюємо для невідомих типів
    }

    await client.query(updateQuery, [userId, contextId]);
  }

  static _formatCommunication(comm) {
    return {
      ...comm,
      sender_info: {
        id: comm.sender_id,
        username: comm.sender_username,
        first_name: comm.sender_first_name,
        last_name: comm.sender_last_name,
        role: comm.sender_role
      },
      recipient_info: comm.recipient_id ? {
        id: comm.recipient_id,
        username: comm.recipient_username,
        first_name: comm.recipient_first_name,
        last_name: comm.recipient_last_name
      } : null,
      edited_by_info: comm.edited_by ? {
        id: comm.edited_by,
        username: comm.edited_by_username,
        first_name: comm.edited_by_first_name,
        last_name: comm.edited_by_last_name
      } : null
    };
  }
}

module.exports = CommunicationModel;