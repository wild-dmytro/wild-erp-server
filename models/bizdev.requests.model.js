/**
 * Модель для роботи з запитами користувачів
 * Обробляє CRUD операції для запитів та комунікації
 */
const db = require("../config/db");
const { withTransaction } = require("../utils/db.utils");

/**
 * Створення нового запиту
 * @param {Object} requestData - Дані запиту
 * @returns {Promise<Object>} Створений запит
 */
const createUserRequest = async (requestData) => {
  const {
    name,
    description,
    type,
    priority = "medium",
    deadline,
    created_by,
    assigned_to,
    tags = [],
    attachments = null,
    metadata = null,
  } = requestData;

  return withTransaction(async (client) => {
    // Створюємо запит
    const insertRequestQuery = `
      INSERT INTO bizdev_requests (
        name, description, type, priority, deadline, 
        created_by, assigned_to, tags, attachments, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const requestResult = await client.query(insertRequestQuery, [
      name,
      description,
      type,
      priority,
      deadline,
      created_by,
      assigned_to,
      tags,
      attachments,
      metadata,
    ]);

    const newRequest = requestResult.rows[0];

    // Додаємо автора до підписок
    const subscriptionQuery = `
      INSERT INTO bizdev_request_subscriptions (request_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (request_id, user_id) DO NOTHING
    `;

    await client.query(subscriptionQuery, [newRequest.id, created_by]);

    // Якщо є призначений користувач, додаємо його до підписок
    if (assigned_to && assigned_to !== created_by) {
      await client.query(subscriptionQuery, [newRequest.id, assigned_to]);
    }

    // Додаємо початкове системне повідомлення
    const initialMessageQuery = `
      INSERT INTO request_communications (
        request_id, sender_id, message_type, message
      )
      VALUES ($1, $2, 'system', $3)
    `;

    const initialMessage = `Запит створено користувачем ${created_by}`;
    await client.query(initialMessageQuery, [
      newRequest.id,
      created_by,
      initialMessage,
    ]);

    return await getRequestById(newRequest.id, client);
  });
};

/**
 * Отримання запиту за ID з повною інформацією
 * @param {number} requestId - ID запиту
 * @param {Object} client - Клієнт бази даних (опціонально для транзакцій)
 * @returns {Promise<Object|null>} Запит з деталями або null
 */
const getRequestById = async (requestId, client = null) => {
  const queryClient = client || db;

  const query = `
    SELECT 
      ur.*,
      creator.username as created_by_username,
      creator.first_name as created_by_first_name,
      creator.last_name as created_by_last_name,
      assignee.username as assigned_to_username,
      assignee.first_name as assigned_to_first_name,
      assignee.last_name as assigned_to_last_name,
      updater.username as updated_by_username,
      updater.first_name as updated_by_first_name,
      updater.last_name as updated_by_last_name,
      COUNT(rc.id) as communications_count
    FROM bizdev_requests ur
    LEFT JOIN users creator ON ur.created_by = creator.id
    LEFT JOIN users assignee ON ur.assigned_to = assignee.id
    LEFT JOIN users updater ON ur.updated_by = updater.id
    LEFT JOIN request_communications rc ON ur.id = rc.request_id
    WHERE ur.id = $1
    GROUP BY ur.id, creator.id, assignee.id, updater.id
  `;

  const result = await queryClient.query(query, [requestId]);

  if (result.rows.length === 0) {
    return null;
  }

  const request = result.rows[0];

  // Форматуємо дані
  return {
    ...request,
    communications_count: parseInt(request.communications_count),
    created_by_info: {
      id: request.created_by,
      username: request.created_by_username,
      first_name: request.created_by_first_name,
      last_name: request.created_by_last_name,
    },
    assigned_to_info: request.assigned_to
      ? {
          id: request.assigned_to,
          username: request.assigned_to_username,
          first_name: request.assigned_to_first_name,
          last_name: request.assigned_to_last_name,
        }
      : null,
    updated_by_info: request.updated_by
      ? {
          id: request.updated_by,
          username: request.updated_by_username,
          first_name: request.updated_by_first_name,
          last_name: request.updated_by_last_name,
        }
      : null,
  };
};

/**
 * Отримання списку запитів з фільтрацією та пагінацією
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Object>} Список запитів з метаданими
 */
const getRequests = async (options = {}) => {
  const {
    status,
    type,
    priority,
    created_by,
    assigned_to,
    search,
    page = 1,
    limit = 20,
    sort_by = "created_at",
    sort_order = "DESC",
  } = options;

  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Фільтри
  if (status) {
    conditions.push(`ur.status = $${paramIndex++}`);
    params.push(status);
  }

  if (type) {
    conditions.push(`ur.type = $${paramIndex++}`);
    params.push(type);
  }

  if (priority) {
    conditions.push(`ur.priority = $${paramIndex++}`);
    params.push(priority);
  }

  if (created_by) {
    conditions.push(`ur.created_by = $${paramIndex++}`);
    params.push(created_by);
  }

  if (assigned_to) {
    conditions.push(`ur.assigned_to = $${paramIndex++}`);
    params.push(assigned_to);
  }

  if (search) {
    conditions.push(
      `(ur.name ILIKE $${paramIndex} OR ur.description ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Основний запит
  const query = `
    SELECT 
      ur.*,
      creator.username as created_by_username,
      creator.first_name as created_by_first_name,
      creator.last_name as created_by_last_name,
      assignee.username as assigned_to_username,
      assignee.first_name as assigned_to_first_name,
      assignee.last_name as assigned_to_last_name,
      COUNT(rc.id) as communications_count
    FROM bizdev_requests ur
    LEFT JOIN users creator ON ur.created_by = creator.id
    LEFT JOIN users assignee ON ur.assigned_to = assignee.id
    LEFT JOIN request_communications rc ON ur.id = rc.request_id
    ${whereClause}
    GROUP BY ur.id, creator.id, assignee.id
    ORDER BY ur.${sort_by} ${sort_order}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  // Запит для підрахунку загальної кількості
  const countQuery = `
    SELECT COUNT(DISTINCT ur.id) as total
    FROM bizdev_requests ur
    LEFT JOIN users creator ON ur.created_by = creator.id
    LEFT JOIN users assignee ON ur.assigned_to = assignee.id
    ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    db.query(query, params),
    db.query(countQuery, params.slice(0, -2)), // Видаляємо limit та offset для підрахунку
  ]);

  const total = parseInt(countResult.rows[0].total);
  const requests = dataResult.rows.map((request) => ({
    ...request,
    communications_count: parseInt(request.communications_count),
    created_by_info: {
      id: request.created_by,
      username: request.created_by_username,
      first_name: request.created_by_first_name,
      last_name: request.created_by_last_name,
    },
    assigned_to_info: request.assigned_to
      ? {
          id: request.assigned_to,
          username: request.assigned_to_username,
          first_name: request.assigned_to_first_name,
          last_name: request.assigned_to_last_name,
        }
      : null,
  }));

  return {
    requests,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Оновлення запиту
 * @param {number} requestId - ID запиту
 * @param {Object} updateData - Дані для оновлення
 * @param {number} updatedBy - ID користувача, який оновлює
 * @returns {Promise<Object>} Оновлений запит
 */
const updateRequest = async (requestId, updateData, updatedBy) => {
  const {
    name,
    description,
    type,
    priority,
    deadline,
    assigned_to,
    tags,
    attachments,
    metadata,
  } = updateData;

  return withTransaction(async (client) => {
    // Отримуємо поточний запит для порівняння
    const currentRequest = await getRequestById(requestId, client);
    if (!currentRequest) {
      throw new Error("Запит не знайдено");
    }

    // Готуємо дані для оновлення
    const fieldsToUpdate = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fieldsToUpdate.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (description !== undefined) {
      fieldsToUpdate.push(`description = $${paramIndex++}`);
      values.push(description);
    }

    if (type !== undefined) {
      fieldsToUpdate.push(`type = $${paramIndex++}`);
      values.push(type);
    }

    if (priority !== undefined) {
      fieldsToUpdate.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }

    if (deadline !== undefined) {
      fieldsToUpdate.push(`deadline = $${paramIndex++}`);
      values.push(deadline);
    }

    if (assigned_to !== undefined) {
      fieldsToUpdate.push(`assigned_to = $${paramIndex++}`);
      values.push(assigned_to);
    }

    if (tags !== undefined) {
      fieldsToUpdate.push(`tags = $${paramIndex++}`);
      values.push(tags);
    }

    if (attachments !== undefined) {
      fieldsToUpdate.push(`attachments = $${paramIndex++}`);
      values.push(attachments);
    }

    if (metadata !== undefined) {
      fieldsToUpdate.push(`metadata = $${paramIndex++}`);
      values.push(metadata);
    }

    if (fieldsToUpdate.length === 0) {
      return currentRequest;
    }

    fieldsToUpdate.push(`updated_by = $${paramIndex++}`);
    values.push(updatedBy);

    values.push(requestId);

    const updateQuery = `
      UPDATE bizdev_requests 
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    await client.query(updateQuery, values);

    // Додаємо системне повідомлення про оновлення
    if (
      assigned_to !== undefined &&
      assigned_to !== currentRequest.assigned_to
    ) {
      const assignmentMessage = assigned_to
        ? `Запит призначено користувачу ${assigned_to}`
        : "Призначення запиту скасовано";

      await client.query(
        `
        INSERT INTO request_communications (request_id, sender_id, message_type, message)
        VALUES ($1, $2, 'assignment', $3)
      `,
        [requestId, updatedBy, assignmentMessage]
      );

      // Додаємо нового призначеного до підписок
      if (assigned_to) {
        await client.query(
          `
          INSERT INTO bizdev_request_subscriptions (request_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (request_id, user_id) DO NOTHING
        `,
          [requestId, assigned_to]
        );
      }
    }

    return await getRequestById(requestId, client);
  });
};

/**
 * Оновлення статусу запиту
 * @param {number} requestId - ID запиту
 * @param {string} newStatus - Новий статус
 * @param {number} changedBy - ID користувача, який змінює статус
 * @param {string} reason - Причина зміни статусу
 * @returns {Promise<Object>} Оновлений запит
 */
const updateRequestStatus = async (
  requestId,
  newStatus,
  changedBy,
  reason = null
) => {
  return withTransaction(async (client) => {
    // Отримуємо поточний запит
    const currentRequest = await getRequestById(requestId, client);
    if (!currentRequest) {
      throw new Error("Запит не знайдено");
    }

    const oldStatus = currentRequest.status;

    // Оновлюємо статус
    const updateQuery = `
      UPDATE bizdev_requests 
      SET status = $1, 
          updated_by = $2,
          completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
      WHERE id = $3
      RETURNING *
    `;

    await client.query(updateQuery, [newStatus, changedBy, requestId]);

    // Додаємо запис до історії змін статусу
    const historyQuery = `
      INSERT INTO bizdev_request_status_history (request_id, old_status, new_status, changed_by, change_reason)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await client.query(historyQuery, [
      requestId,
      oldStatus,
      newStatus,
      changedBy,
      reason,
    ]);

    // Додаємо повідомлення про зміну статусу
    const statusMessage = reason
      ? `Статус змінено з "${oldStatus}" на "${newStatus}". Причина: ${reason}`
      : `Статус змінено з "${oldStatus}" на "${newStatus}"`;

    await client.query(
      `
      INSERT INTO request_communications (request_id, sender_id, message_type, message)
      VALUES ($1, $2, 'status_change', $3)
    `,
      [requestId, changedBy, statusMessage]
    );

    return await getRequestById(requestId, client);
  });
};

/**
 * Видалення запиту
 * @param {number} requestId - ID запиту
 * @returns {Promise<boolean>} Успішність видалення
 */
const deleteRequest = async (requestId) => {
  const query = "DELETE FROM bizdev_requests WHERE id = $1";
  const result = await db.query(query, [requestId]);
  return result.rowCount > 0;
};

/**
 * Отримання статистики запитів
 * @param {Object} filters - Фільтри для статистики
 * @returns {Promise<Object>} Статистика
 */
const getRequestsStats = async (filters = {}) => {
  const { created_by, assigned_to, date_from, date_to } = filters;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (created_by) {
    conditions.push(`created_by = $${paramIndex++}`);
    params.push(created_by);
  }

  if (assigned_to) {
    conditions.push(`assigned_to = $${paramIndex++}`);
    params.push(assigned_to);
  }

  if (date_from) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(date_from);
  }

  if (date_to) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(date_to);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT 
      COUNT(*) as total_requests,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests,
      COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_requests,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_requests,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_requests,
      COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold_requests,
      COUNT(CASE WHEN type = 'INFO' THEN 1 END) as info_requests,
      COUNT(CASE WHEN type = 'OFFER' THEN 1 END) as offer_requests,
      COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent_requests,
      COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_requests,
      COUNT(CASE WHEN deadline < NOW() AND status NOT IN ('completed', 'cancelled') THEN 1 END) as overdue_requests
    FROM bizdev_requests
    ${whereClause}
  `;

  const result = await db.query(query, params);
  const stats = result.rows[0];

  // Конвертуємо строки в числа
  Object.keys(stats).forEach((key) => {
    stats[key] = parseInt(stats[key]);
  });

  return stats;
};

module.exports = {
  createUserRequest,
  getRequestById,
  getRequests,
  updateRequest,
  updateRequestStatus,
  deleteRequest,
  getRequestsStats,
};
