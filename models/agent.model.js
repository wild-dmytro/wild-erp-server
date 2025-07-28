const db = require("../config/db");

/**
 * Отримує список всіх активних агентів
 * @returns {Promise<Array>} Масив агентів
 */
const getAllAgents = async () => {
  const result = await db.query(
    "SELECT * FROM agents WHERE is_active = TRUE ORDER BY name"
  );

  return result.rows;
};

/**
 * Отримує статистику поповнень агентів
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @returns {Promise<Array>} Масив статистики поповнень агентів
 */
const getAgentRefillStats = async ({ startDate, endDate } = {}) => {
  const conditions = ["r.status = 'completed'"];
  const params = [];
  let paramIndex = 1;

  if (startDate) {
    conditions.push(`r.created_at >= $${paramIndex++}`);
    params.push(startDate.toISOString());
  }

  if (endDate) {
    conditions.push(`r.created_at <= $${paramIndex++}`);
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(newEndDate.toISOString());
  }

  const whereClause = conditions.join(" AND ");

  const result = await db.query(
    `
    SELECT 
      a.name as agent_name,
      ar.server,
      COUNT(*) as count,
      SUM(ar.amount) as total_amount
    FROM 
      agent_refill_requests ar
    JOIN 
      agents a ON ar.agent_id = a.id
    JOIN 
      requests r ON ar.request_id = r.id
    WHERE 
      ${whereClause}
    GROUP BY 
      a.name, ar.server
    ORDER BY 
      total_amount DESC
  `,
    params
  );

  return result.rows;
};

/**
 * Отримує всі поповнення агентів з фільтрацією та пагінацією
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {number} [options.page=1] - Номер сторінки
 * @param {number} [options.limit=10] - Кількість записів на сторінці
 * @param {string} [options.status] - Статус заявки
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @param {number} [options.minAmount] - Мінімальна сума
 * @param {number} [options.maxAmount] - Максимальна сума
 * @param {string} [options.server] - Сервер для фільтрації
 * @param {number} [options.agentId] - ID агента для фільтрації
 * @param {number} [options.teamId] - ID команди для фільтрації
 * @param {number} [options.departmentId] - ID відділу для фільтрації
 * @param {number} [options.userId] - ID користувача для фільтрації
 * @param {string} [options.network] - Мережа для фільтрації
 * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
 */
const getAllAgentRefills = async ({
  page = 1,
  limit = 10,
  status,
  startDate,
  endDate,
  minAmount,
  maxAmount,
  server,
  agentId,
  teamId,
  departmentId,
  userId,
  network,
}) => {
  const offset = (page - 1) * limit;

  // Побудова WHERE умов на основі фільтрів
  const conditions = ["TRUE"];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`r.status = $${paramIndex++}`);
    params.push(status);
  }

  if (startDate) {
    conditions.push(`r.created_at >= $${paramIndex++}`);
    params.push(startDate.toISOString());
  }

  if (endDate) {
    conditions.push(`r.created_at <= $${paramIndex++}`);
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(newEndDate.toISOString());
  }

  if (minAmount) {
    conditions.push(`ar.amount >= $${paramIndex++}`);
    params.push(minAmount);
  }

  if (maxAmount) {
    conditions.push(`ar.amount <= $${paramIndex++}`);
    params.push(maxAmount);
  }

  if (server) {
    conditions.push(`ar.server ILIKE $${paramIndex++}`);
    params.push(`%${server}%`);
  }

  if (agentId) {
    conditions.push(`ar.agent_id = $${paramIndex++}`);
    params.push(agentId);
  }

  if (teamId) {
    conditions.push(`u.team_id = $${paramIndex++}`);
    params.push(teamId);
  }

  // Додаємо фільтр по відділу
  if (departmentId) {
    conditions.push(`u.department_id = $${paramIndex++}`);
    params.push(departmentId);
  }

  // Додаємо фільтр по користувачу
  if (userId) {
    conditions.push(`u.id = $${paramIndex++}`);
    params.push(userId);
  }

  // Додаємо фільтр по мережі
  if (network) {
    conditions.push(`ar.network = $${paramIndex++}`);
    params.push(network);
  }

  const whereClause = conditions.join(" AND ");

  // Виконання запиту для отримання даних з пагінацією
  const query = `
    SELECT 
      r.id,
      r.status,
      r.created_at,
      r.updated_at,
      r.request_type,
      a.name as agent_name,
      a.id as agent_id,
      ar.server,
      ar.amount,
      ar.wallet_address,
      ar.network,
      ar.transaction_hash,
      ar.fee,
      u.id as created_by_id,
      u.username as created_by_username,
      CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
      u.team_id,
      t.name as team_name,
      tl.id as teamlead_id,
      tl.username as teamlead_username,
      CONCAT(tl.first_name, ' ', tl.last_name) as teamlead_name,
      fm.id as finance_manager_id,
      fm.username as finance_manager_username,
      CONCAT(fm.first_name, ' ', fm.last_name) as finance_manager_name,
      d.id as department_id,
      d.name as department_name
    FROM 
      agent_refill_requests ar
    JOIN 
      agents a ON ar.agent_id = a.id
    JOIN 
      requests r ON ar.request_id = r.id
    JOIN 
      users u ON r.user_id = u.id
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      users tl ON r.teamlead_id = tl.id
    LEFT JOIN 
      users fm ON r.finance_manager_id = fm.id
    LEFT JOIN
      departments d ON u.department_id = d.id
    WHERE 
      ${whereClause}
    ORDER BY 
      r.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  params.push(parseInt(limit), offset);

  // Виконання запиту для отримання загальної кількості результатів
  const countQuery = `
    SELECT 
      COUNT(*) as total,
      SUM(
        ar.amount
      ) as total_amount
    FROM 
      agent_refill_requests ar
    JOIN 
      agents a ON ar.agent_id = a.id
    JOIN 
      requests r ON ar.request_id = r.id
    JOIN 
      users u ON r.user_id = u.id
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN
      departments d ON u.department_id = d.id
    WHERE 
      ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    db.query(query, params),
    db.query(countQuery, params.slice(0, params.length - 2)),
  ]);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);
  const totalAmount = parseFloat(countResult.rows[0].total_amount) || 0;

  return {
    data: dataResult.rows,
    pagination: {
      total,
      totalPages,
      totalAmount,
      currentPage: parseInt(page),
      perPage: parseInt(limit),
    },
  };
};

/**
 * Отримує статистику поповнень за агентами
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @returns {Promise<Array>} Масив статистики за агентами
 */
const getAgentRefillStatsByAgent = async ({ startDate, endDate }) => {
  // Побудова WHERE умов
  const conditions = ["r.status IN ('approved_by_finance', 'completed')"];
  const params = [];
  let paramIndex = 1;

  if (startDate) {
    conditions.push(`r.created_at >= $${paramIndex++}`);
    params.push(startDate.toISOString());
  }

  if (endDate) {
    conditions.push(`r.created_at <= $${paramIndex++}`);
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(newEndDate.toISOString());
  }

  const whereClause = conditions.join(" AND ");

  console.log(whereClause);

  // Запит для отримання даних за агентами
  const query = `
    SELECT 
      a.id as agent_id,
      a.name as agent_name,
      COUNT(*) as refill_count,
      SUM(ar.amount) as total_amount,
      MIN(ar.amount) as min_amount,
      MAX(ar.amount) as max_amount,
      AVG(ar.amount) as avg_amount
    FROM 
      agent_refill_requests ar
    JOIN 
      agents a ON ar.agent_id = a.id
    JOIN 
      requests r ON ar.request_id = r.id
    WHERE 
      ${whereClause}
    GROUP BY 
      a.id, a.name
    ORDER BY 
      total_amount DESC
  `;

  console.log();

  const result = await db.query(query, params);

  return result.rows;
};

/**
 * Отримує статистику поповнень агентів за серверами
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @param {number} [options.agentId] - ID агента для фільтрації
 * @returns {Promise<Array>} Масив статистики за серверами
 */
const getAgentRefillStatsByServer = async ({ startDate, endDate, agentId }) => {
  // Побудова WHERE умов
  const conditions = ["r.status IN ('approved_by_finance', 'completed')"];
  const params = [];
  let paramIndex = 1;

  if (startDate) {
    conditions.push(`r.created_at >= $${paramIndex++}`);
    params.push(startDate.toISOString());
  }

  if (endDate) {
    conditions.push(`r.created_at <= $${paramIndex++}`);
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(newEndDate.toISOString());
  }

  if (agentId) {
    conditions.push(`ar.agent_id = $${paramIndex++}`);
    params.push(agentId);
  }

  const whereClause = conditions.join(" AND ");

  // Запит для отримання даних за серверами
  const query = `
    SELECT 
      ar.server,
      COUNT(*) as refill_count,
      SUM(ar.amount) as total_amount
    FROM 
      agent_refill_requests ar
    JOIN 
      requests r ON ar.request_id = r.id
    WHERE 
      ${whereClause}
    GROUP BY 
      ar.server
    ORDER BY 
      total_amount DESC
  `;

  const result = await db.query(query, params);

  return result.rows;
};

module.exports = {
  getAllAgents,
  getAgentRefillStats,
  getAllAgentRefills,
  getAgentRefillStatsByAgent,
  getAgentRefillStatsByServer,
};
