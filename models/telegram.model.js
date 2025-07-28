// server/models/telegram.model.js
const db = require('../config/db');

/**
 * Створити нову розсилку
 * @param {Object} broadcastData - Дані розсилки
 * @returns {Promise<number>} ID створеної розсилки
 */
const createBroadcast = async (broadcastData) => {  
  try {
    await db.query('BEGIN');
    
    const {
      title,
      message,
      sender_id,
      target_type,
      target_departments,
      target_teams,
      target_users
    } = broadcastData;
    
    // Підрахувати кількість отримувачів
    const totalRecipients = await calculateRecipients(target_type, {
      target_departments,
      target_teams,
      target_users
    });
    
    // Створити запис розсилки
    const broadcastResult = await db.query(`
      INSERT INTO telegram_broadcasts 
      (title, message, sender_id, target_type, target_departments, target_teams, target_users, total_recipients) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      title,
      message,
      sender_id,
      target_type,
      target_departments,
      target_teams,
      target_users,
      totalRecipients
    ]);
    
    const broadcastId = broadcastResult.rows[0].id;
    
    // Отримати список отримувачів
    const recipients = await getRecipients(target_type, {
      target_departments,
      target_teams,
      target_users
    });
    
    // Створити деталі розсилки для кожного отримувача
    if (recipients.length > 0) {
      const values = recipients.map((recipient, index) => 
        `($1, $${index + 2}, 'pending')`
      ).join(',');
      
      const params = [broadcastId, ...recipients.map(r => r.id)];
      
      await db.query(`
        INSERT INTO telegram_broadcast_details (broadcast_id, user_id, status)
        VALUES ${values}
      `, params);
    }
    
    await db.query('COMMIT');
    return broadcastId;
    
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

/**
 * Підрахувати кількість отримувачів
 * @param {string} targetType - Тип цільової аудиторії
 * @param {Object} targets - Об'єкт з цільовими групами
 * @returns {Promise<number>} Кількість отримувачів
 */
const calculateRecipients = async (targetType, targets) => {
  let query;
  let params = [];
  
  switch (targetType) {
    case 'all':
      query = 'SELECT COUNT(*) FROM users WHERE is_active = true AND telegram_id IS NOT NULL';
      break;
      
    case 'department':
      if (!targets.target_departments || targets.target_departments.length === 0) return 0;
      query = `
        SELECT COUNT(*) FROM users 
        WHERE department_id = ANY($1) AND is_active = true AND telegram_id IS NOT NULL
      `;
      params = [targets.target_departments];
      break;
      
    case 'team':
      if (!targets.target_teams || targets.target_teams.length === 0) return 0;
      query = `
        SELECT COUNT(*) FROM users 
        WHERE team_id = ANY($1) AND is_active = true AND telegram_id IS NOT NULL
      `;
      params = [targets.target_teams];
      break;
      
    case 'specific_users':
      if (!targets.target_users || targets.target_users.length === 0) return 0;
      query = `
        SELECT COUNT(*) FROM users 
        WHERE id = ANY($1) AND is_active = true AND telegram_id IS NOT NULL
      `;
      params = [targets.target_users];
      break;
      
    default:
      return 0;
  }
  
  const result = await db.query(query, params);
  return parseInt(result.rows[0].count);
};

/**
 * Отримати список отримувачів
 * @param {string} targetType - Тип цільової аудиторії
 * @param {Object} targets - Об'єкт з цільовими групами
 * @returns {Promise<Array>} Масив отримувачів
 */
const getRecipients = async (targetType, targets) => {
  let query;
  let params = [];
  
  const selectFields = `
    u.id, 
    u.telegram_id, 
    u.first_name, 
    u.last_name, 
    u.username,
    d.name as department_name,
    t.name as team_name
  `;
  
  switch (targetType) {
    case 'all':
      query = `
        SELECT ${selectFields}
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN teams t ON u.team_id = t.id
        WHERE u.is_active = true AND u.telegram_id IS NOT NULL
      `;
      break;
      
    case 'department':
      if (!targets.target_departments || targets.target_departments.length === 0) return [];
      query = `
        SELECT ${selectFields}
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN teams t ON u.team_id = t.id
        WHERE u.department_id = ANY($1) AND u.is_active = true AND u.telegram_id IS NOT NULL
      `;
      params = [targets.target_departments];
      break;
      
    case 'team':
      if (!targets.target_teams || targets.target_teams.length === 0) return [];
      query = `
        SELECT ${selectFields}
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN teams t ON u.team_id = t.id
        WHERE u.team_id = ANY($1) AND u.is_active = true AND u.telegram_id IS NOT NULL
      `;
      params = [targets.target_teams];
      break;
      
    case 'specific_users':
      if (!targets.target_users || targets.target_users.length === 0) return [];
      query = `
        SELECT ${selectFields}
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN teams t ON u.team_id = t.id
        WHERE u.id = ANY($1) AND u.is_active = true AND u.telegram_id IS NOT NULL
      `;
      params = [targets.target_users];
      break;
      
    default:
      return [];
  }
  
  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Оновити статус розсилки
 * @param {number} broadcastId - ID розсилки
 * @param {string} status - Новий статус
 * @param {Object} additionalData - Додаткові дані для оновлення
 * @returns {Promise<Object>} Оновлена розсилка
 */
const updateBroadcastStatus = async (broadcastId, status, additionalData = {}) => {
  const fields = ['status = $2'];
  const params = [broadcastId, status];
  let paramIndex = 3;
  
  if (status === 'in_progress' && !additionalData.started_at) {
    fields.push(`started_at = $${paramIndex++}`);
    params.push(new Date());
  }
  
  if (status === 'completed' && !additionalData.completed_at) {
    fields.push(`completed_at = $${paramIndex++}`);
    params.push(new Date());
  }
  
  if (additionalData.successful_sends !== undefined) {
    fields.push(`successful_sends = $${paramIndex++}`);
    params.push(additionalData.successful_sends);
  }
  
  if (additionalData.failed_sends !== undefined) {
    fields.push(`failed_sends = $${paramIndex++}`);
    params.push(additionalData.failed_sends);
  }
  
  const query = `
    UPDATE telegram_broadcasts 
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *
  `;
  
  const result = await db.query(query, params);
  return result.rows[0];
};

/**
 * Оновити статус відправки для конкретного користувача
 * @param {number} detailId - ID деталі розсилки
 * @param {string} status - Новий статус
 * @param {string} errorMessage - Повідомлення про помилку (якщо є)
 * @returns {Promise<Object>} Оновлена деталь
 */
const updateBroadcastDetail = async (detailId, status, errorMessage = null) => {
  const query = `
    UPDATE telegram_broadcast_details 
    SET status = $2, error_message = $3, sent_at = $4
    WHERE id = $1
    RETURNING *
  `;
  
  const sentAt = status === 'sent' ? new Date() : null;
  const result = await db.query(query, [detailId, status, errorMessage, sentAt]);
  return result.rows[0];
};

/**
 * Отримати розсилку з деталями
 * @param {number} broadcastId - ID розсилки
 * @returns {Promise<Object>} Дані розсилки
 */
const getBroadcastById = async (broadcastId) => {
  const query = `
    SELECT 
      tb.*,
      u.username as sender_username,
      CONCAT(u.first_name, ' ', u.last_name) as sender_full_name
    FROM telegram_broadcasts tb
    LEFT JOIN users u ON tb.sender_id = u.id
    WHERE tb.id = $1
  `;
  
  const result = await db.query(query, [broadcastId]);
  return result.rows[0] || null;
};

/**
 * Отримати деталі розсилки для виконання
 * @param {number} broadcastId - ID розсилки
 * @returns {Promise<Array>} Масив деталей для відправки
 */
const getBroadcastDetailsForExecution = async (broadcastId) => {
  const query = `
    SELECT 
      bd.id as detail_id,
      bd.user_id,
      u.telegram_id,
      u.first_name,
      u.last_name,
      u.username
    FROM telegram_broadcast_details bd
    JOIN users u ON bd.user_id = u.id
    WHERE bd.broadcast_id = $1 AND bd.status = 'pending' AND u.telegram_id IS NOT NULL
    ORDER BY bd.id
  `;
  
  const result = await db.query(query, [broadcastId]);
  return result.rows;
};

/**
 * Отримати всі розсилки з пагінацією
 * @param {Object} options - Опції запиту
 * @returns {Promise<Object>} Список розсилок з пагінацією
 */
const getAllBroadcasts = async (options = {}) => {
  const { page = 1, limit = 10, status, sender_id } = options;
  const offset = (page - 1) * limit;
  
  let whereConditions = [];
  let params = [limit, offset];
  let paramIndex = 3;
  
  if (status) {
    whereConditions.push(`tb.status = $${paramIndex++}`);
    params.push(status);
  }
  
  if (sender_id) {
    whereConditions.push(`tb.sender_id = $${paramIndex++}`);
    params.push(sender_id);
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  
  const query = `
    SELECT 
      tb.*,
      u.username as sender_username,
      CONCAT(u.first_name, ' ', u.last_name) as sender_full_name
    FROM telegram_broadcasts tb
    LEFT JOIN users u ON tb.sender_id = u.id
    ${whereClause}
    ORDER BY tb.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  
  const result = await db.query(query, params);
  
  // Підрахувати загальну кількість
  const countQuery = `
    SELECT COUNT(*) 
    FROM telegram_broadcasts tb
    ${whereClause}
  `;
  const countParams = params.slice(2); // Забираємо limit і offset
  const countResult = await db.query(countQuery, countParams);
  
  return {
    data: result.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count),
      pages: Math.ceil(countResult.rows[0].count / limit)
    }
  };
};

/**
 * Отримати статистику розсилок
 * @param {Object} options - Опції запиту
 * @returns {Promise<Object>} Статистика розсилок
 */
const getBroadcastsStats = async (options = {}) => {
  const { startDate, endDate, sender_id } = options;
  
  let whereConditions = [];
  let params = [];
  let paramIndex = 1;
  
  if (startDate) {
    whereConditions.push(`created_at >= $${paramIndex++}`);
    params.push(startDate);
  }
  
  if (endDate) {
    whereConditions.push(`created_at <= $${paramIndex++}`);
    params.push(endDate);
  }
  
  if (sender_id) {
    whereConditions.push(`sender_id = $${paramIndex++}`);
    params.push(sender_id);
  }
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  
  const query = `
    SELECT 
      COUNT(*) as total_broadcasts,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_broadcasts,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_broadcasts,
      COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_broadcasts,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_broadcasts,
      SUM(total_recipients) as total_recipients,
      SUM(successful_sends) as total_successful_sends,
      SUM(failed_sends) as total_failed_sends
    FROM telegram_broadcasts
    ${whereClause}
  `;
  
  const result = await db.query(query, params);
  return result.rows[0];
};

module.exports = {
  createBroadcast,
  calculateRecipients,
  getRecipients,
  updateBroadcastStatus,
  updateBroadcastDetail,
  getBroadcastById,
  getBroadcastDetailsForExecution,
  getAllBroadcasts,
  getBroadcastsStats
};