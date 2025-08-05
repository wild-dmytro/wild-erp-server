/**
 * Модель для роботи з комунікацією по запитах
 * Обробляє повідомлення, коментарі та системні події
 */
const db = require('../config/db');
const { withTransaction } = require('../utils/db.utils');

/**
 * Додавання нового повідомлення до запиту
 * @param {Object} messageData - Дані повідомлення
 * @returns {Promise<Object>} Створене повідомлення
 */
const addCommunication = async (messageData) => {
  const {
    request_id,
    sender_id,
    message,
    message_type = 'comment',
    attachments = null,
    metadata = null,
    is_internal = false
  } = messageData;

  return withTransaction(async (client) => {
    // Перевіряємо чи існує запит
    const requestExists = await client.query(
      'SELECT id FROM bizdev_requests WHERE id = $1',
      [request_id]
    );

    if (requestExists.rows.length === 0) {
      throw new Error('Запит не знайдено');
    }

    // Додаємо повідомлення
    const insertQuery = `
      INSERT INTO bizdev_request_communications (
        request_id, sender_id, message, message_type, 
        attachments, metadata, is_internal
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await client.query(insertQuery, [
      request_id, sender_id, message, message_type,
      attachments, metadata, is_internal
    ]);

    // Оновлюємо час останнього оновлення запиту
    await client.query(
      'UPDATE bizdev_requests SET updated_at = NOW(), updated_by = $1 WHERE id = $2',
      [sender_id, request_id]
    );

    return await getCommunicationById(result.rows[0].id, client);
  });
};

/**
 * Отримання повідомлення за ID
 * @param {number} communicationId - ID повідомлення
 * @param {Object} client - Клієнт бази даних (для транзакцій)
 * @returns {Promise<Object|null>} Повідомлення або null
 */
const getCommunicationById = async (communicationId, client = null) => {
  const queryClient = client || db;

  const query = `
    SELECT 
      rc.*,
      sender.username as sender_username,
      sender.first_name as sender_first_name,
      sender.last_name as sender_last_name,
      sender.role as sender_role,
      editor.username as edited_by_username,
      editor.first_name as edited_by_first_name,
      editor.last_name as edited_by_last_name
    FROM bizdev_request_communications rc
    LEFT JOIN users sender ON rc.sender_id = sender.id
    LEFT JOIN users editor ON rc.edited_by = editor.id
    WHERE rc.id = $1
  `;

  const result = await queryClient.query(query, [communicationId]);
  
  if (result.rows.length === 0) {
    return null;
  }

  const communication = result.rows[0];
  
  return {
    ...communication,
    sender_info: {
      id: communication.sender_id,
      username: communication.sender_username,
      first_name: communication.sender_first_name,
      last_name: communication.sender_last_name,
      role: communication.sender_role
    },
    edited_by_info: communication.edited_by ? {
      id: communication.edited_by,
      username: communication.edited_by_username,
      first_name: communication.edited_by_first_name,
      last_name: communication.edited_by_last_name
    } : null
  };
};

/**
 * Отримання всіх повідомлень по запиту
 * @param {number} requestId - ID запиту
 * @param {Object} options - Опції пагінації та фільтрації
 * @returns {Promise<Object>} Список повідомлень з метаданими
 */
const getRequestCommunications = async (requestId, options = {}) => {
  const {
    include_internal = false,
    message_type,
    page = 1,
    limit = 50,
    sort_order = 'ASC' // За замовчуванням від старих до нових
  } = options;

  const offset = (page - 1) * limit;
  const conditions = ['rc.request_id = $1'];
  const params = [requestId];
  let paramIndex = 2;

  // Фільтри
  if (!include_internal) {
    conditions.push('rc.is_internal = false');
  }

  if (message_type) {
    conditions.push(`rc.message_type = ${paramIndex++}`);
    params.push(message_type);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const query = `
    SELECT 
      rc.*,
      sender.username as sender_username,
      sender.first_name as sender_first_name,
      sender.last_name as sender_last_name,
      sender.role as sender_role,
      editor.username as edited_by_username,
      editor.first_name as edited_by_first_name,
      editor.last_name as edited_by_last_name
    FROM bizdev_request_communications rc
    LEFT JOIN users sender ON rc.sender_id = sender.id
    LEFT JOIN users editor ON rc.edited_by = editor.id
    ${whereClause}
    ORDER BY rc.created_at ${sort_order}
    LIMIT ${paramIndex} OFFSET ${paramIndex + 1}
  `;

  params.push(limit, offset);

  // Запит для підрахунку загальної кількості
  const countQuery = `
    SELECT COUNT(*) as total
    FROM bizdev_request_communications rc
    ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    db.query(query, params),
    db.query(countQuery, params.slice(0, -2))
  ]);

  const total = parseInt(countResult.rows[0].total);
  const communications = dataResult.rows.map(comm => ({
    ...comm,
    sender_info: {
      id: comm.sender_id,
      username: comm.sender_username,
      first_name: comm.sender_first_name,
      last_name: comm.sender_last_name,
      role: comm.sender_role
    },
    edited_by_info: comm.edited_by ? {
      id: comm.edited_by,
      username: comm.edited_by_username,
      first_name: comm.edited_by_first_name,
      last_name: comm.edited_by_last_name
    } : null
  }));

  return {
    communications,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Редагування повідомлення
 * @param {number} communicationId - ID повідомлення
 * @param {string} newMessage - Новий текст повідомлення
 * @param {number} editedBy - ID користувача, який редагує
 * @returns {Promise<Object>} Оновлене повідомлення
 */
const editCommunication = async (communicationId, newMessage, editedBy) => {
  const query = `
    UPDATE bizdev_request_communications 
    SET message = $1, 
        is_edited = true, 
        edited_at = NOW(), 
        edited_by = $2
    WHERE id = $3
    RETURNING *
  `;

  const result = await db.query(query, [newMessage, editedBy, communicationId]);
  
  if (result.rows.length === 0) {
    throw new Error('Повідомлення не знайдено');
  }

  return await getCommunicationById(communicationId);
};

/**
 * Видалення повідомлення (м'яке видалення)
 * @param {number} communicationId - ID повідомлення
 * @param {number} deletedBy - ID користувача, який видаляє
 * @returns {Promise<boolean>} Успішність видалення
 */
const deleteCommunication = async (communicationId, deletedBy) => {
  const query = `
    UPDATE bizdev_request_communications 
    SET message = '[Повідомлення видалено]', 
        is_edited = true, 
        edited_at = NOW(), 
        edited_by = $1,
        metadata = COALESCE(metadata, '{}'::jsonb) || '{"deleted": true}'::jsonb
    WHERE id = $2
  `;

  const result = await db.query(query, [deletedBy, communicationId]);
  return result.rowCount > 0;
};

/**
 * Додавання файлового вкладення
 * @param {number} communicationId - ID повідомлення
 * @param {Object} fileData - Дані файлу
 * @returns {Promise<Object>} Оновлене повідомлення
 */
const addAttachment = async (communicationId, fileData) => {
  const { filename, file_path, file_size, mime_type } = fileData;

  const query = `
    UPDATE bizdev_request_communications 
    SET attachments = COALESCE(attachments, '[]'::jsonb) || 
        jsonb_build_array(jsonb_build_object(
          'filename', $1,
          'file_path', $2,
          'file_size', $3,
          'mime_type', $4,
          'uploaded_at', NOW()
        ))
    WHERE id = $5
    RETURNING *
  `;

  const result = await db.query(query, [
    filename, file_path, file_size, mime_type, communicationId
  ]);

  if (result.rows.length === 0) {
    throw new Error('Повідомлення не знайдено');
  }

  return await getCommunicationById(communicationId);
};

/**
 * Отримання статистики комунікації по запиту
 * @param {number} requestId - ID запиту
 * @returns {Promise<Object>} Статистика
 */
const getCommunicationStats = async (requestId) => {
  const query = `
    SELECT 
      COUNT(*) as total_messages,
      COUNT(CASE WHEN message_type = 'comment' THEN 1 END) as comments_count,
      COUNT(CASE WHEN message_type = 'system' THEN 1 END) as system_messages_count,
      COUNT(CASE WHEN message_type = 'status_change' THEN 1 END) as status_changes_count,
      COUNT(CASE WHEN message_type = 'assignment' THEN 1 END) as assignments_count,
      COUNT(CASE WHEN message_type = 'file_upload' THEN 1 END) as file_uploads_count,
      COUNT(CASE WHEN is_internal = true THEN 1 END) as internal_messages_count,
      COUNT(CASE WHEN attachments IS NOT NULL AND jsonb_array_length(attachments) > 0 THEN 1 END) as messages_with_attachments,
      COUNT(DISTINCT sender_id) as unique_participants,
      MIN(created_at) as first_message_at,
      MAX(created_at) as last_message_at
    FROM bizdev_request_communications
    WHERE request_id = $1
  `;

  const result = await db.query(query, [requestId]);
  const stats = result.rows[0];

  // Конвертуємо строки в числа
  Object.keys(stats).forEach(key => {
    if (key.includes('count') || key === 'unique_participants') {
      stats[key] = parseInt(stats[key]);
    }
  });

  return stats;
};

/**
 * Пошук повідомлень по запитах
 * @param {Object} searchOptions - Опції пошуку
 * @returns {Promise<Array>} Результати пошуку
 */
const searchCommunications = async (searchOptions) => {
  const {
    query: searchQuery,
    request_id,
    sender_id,
    message_type,
    date_from,
    date_to,
    include_internal = false,
    limit = 100
  } = searchOptions;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (searchQuery) {
    conditions.push(`rc.message ILIKE ${paramIndex++}`);
    params.push(`%${searchQuery}%`);
  }

  if (request_id) {
    conditions.push(`rc.request_id = ${paramIndex++}`);
    params.push(request_id);
  }

  if (sender_id) {
    conditions.push(`rc.sender_id = ${paramIndex++}`);
    params.push(sender_id);
  }

  if (message_type) {
    conditions.push(`rc.message_type = ${paramIndex++}`);
    params.push(message_type);
  }

  if (date_from) {
    conditions.push(`rc.created_at >= ${paramIndex++}`);
    params.push(date_from);
  }

  if (date_to) {
    conditions.push(`rc.created_at <= ${paramIndex++}`);
    params.push(date_to);
  }

  if (!include_internal) {
    conditions.push('rc.is_internal = false');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      rc.*,
      sender.username as sender_username,
      sender.first_name as sender_first_name,
      sender.last_name as sender_last_name,
      ur.name as request_name,
      ur.type as request_type
    FROM bizdev_request_communications rc
    LEFT JOIN users sender ON rc.sender_id = sender.id
    LEFT JOIN bizdev_requests ur ON rc.request_id = ur.id
    ${whereClause}
    ORDER BY rc.created_at DESC
    LIMIT ${paramIndex}
  `;

  params.push(limit);

  const result = await db.query(query, params);
  
  return result.rows.map(comm => ({
    ...comm,
    sender_info: {
      id: comm.sender_id,
      username: comm.sender_username,
      first_name: comm.sender_first_name,
      last_name: comm.sender_last_name
    },
    request_info: {
      id: comm.request_id,
      name: comm.request_name,
      type: comm.request_type
    }
  }));
};

module.exports = {
  addCommunication,
  getCommunicationById,
  getRequestCommunications,
  editCommunication,
  deleteCommunication,
  addAttachment,
  getCommunicationStats,
  searchCommunications
};