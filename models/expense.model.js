const db = require("../config/db");

/**
 * Отримує статистику витрат за мережами
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @returns {Promise<Array>} Масив об'єктів статистики за мережами
 */
const getNetworkStats = async ({ startDate, endDate } = {}) => {
  const conditions = ["TRUE"];
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
      network,
      COUNT(*) as count,
      SUM(amount) as total_amount
    FROM (
      SELECT 
        er.network,
        er.amount
      FROM 
        expense_requests er
      JOIN 
        requests r ON er.request_id = r.id
      WHERE 
        ${whereClause}
      UNION ALL
      SELECT 
        arr.network,
        arr.amount
      FROM 
        agent_refill_requests arr
      JOIN 
        requests r ON arr.request_id = r.id
      WHERE 
        ${whereClause} AND network IS NOT NULL
    ) combined
    GROUP BY 
      network
    ORDER BY 
      total_amount DESC
  `,
    params
  );

  return result.rows;
};

/**
 * Отримує статистику витрат за командами
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @returns {Promise<Array>} Масив об'єктів статистики за командами
 */
const getTeamExpenseStats = async ({ startDate, endDate } = {}) => {
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

  const result = await db.query(
    `
    SELECT 
      t.name as team_name,
      COUNT(*) as request_count,
      SUM(er.amount) as total_amount
    FROM 
      expense_requests er
    JOIN 
      requests r ON er.request_id = r.id
    JOIN 
      users u ON r.user_id = u.id
    JOIN 
      teams t ON u.team_id = t.id
    WHERE 
      ${whereClause}
    GROUP BY 
      t.name
    ORDER BY 
      total_amount DESC
  `,
    params
  );

  return result.rows;
};

/**
 * Отримує всі витрати з фільтрацією та пагінацією
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {number} [options.page=1] - Номер сторінки
 * @param {number} [options.limit=10] - Кількість записів на сторінці
 * @param {string} [options.status] - Статус заявки
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @param {number} [options.minAmount] - Мінімальна сума
 * @param {number} [options.maxAmount] - Максимальна сума
 * @param {string} [options.network] - Мережа для фільтрації
 * @param {string} [options.purpose] - Призначення платежу (пошук за частковим збігом)
 * @param {number} [options.teamId] - ID команди для фільтрації
 * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
 */
const getAllExpenses = async ({
  page = 1,
  limit = 10,
  status,
  startDate,
  endDate,
  minAmount,
  maxAmount,
  network,
  purpose,
  teamId,
  departmentId
}) => {
  try{
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
      conditions.push(`er.amount >= $${paramIndex++}`);
      params.push(minAmount);
    }
  
    if (maxAmount) {
      conditions.push(`er.amount <= $${paramIndex++}`);
      params.push(maxAmount);
    }
  
    if (network) {
      conditions.push(`er.network = $${paramIndex++}`);
      params.push(network);
    }
  
    if (purpose) {
      conditions.push(`er.purpose ILIKE $${paramIndex++}`);
      params.push(`%${purpose}%`);
    }
  
    if (teamId) {
      conditions.push(`u.team_id = $${paramIndex++}`);
      params.push(teamId);
    }
  
    if (departmentId) {
      conditions.push(`r.department_id = $${paramIndex++}`);
      params.push(departmentId);
    }
  
    const whereClause = conditions.join(" AND ");
  
    // Виконання запиту для отримання даних з пагінацією
    const query = `
      SELECT 
        r.id,
        r.status,
        r.created_at,
        r.department_id,
        er.purpose,
        er.seller_service,
        er.amount,
        er.network,
        er.wallet_address,
        er.transaction_hash,
        er.transaction_time,
        et.id as expense_type_id,
        et.name as expense_type_name,
        u.username as created_by_username,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
        t.name as team_name,
        fm.username as finance_manager_username,
        CONCAT(fm.first_name, ' ', fm.last_name) as finance_manager_name
      FROM 
        expense_requests er
      JOIN 
        requests r ON er.request_id = r.id
      JOIN 
        users u ON r.user_id = u.id
      JOIN 
        teams t ON u.team_id = t.id
      JOIN 
        expense_types et ON er.expense_type_id = et.id
      LEFT JOIN 
        users fm ON r.finance_manager_id = fm.id
      WHERE 
        ${whereClause}
      ORDER BY 
        r.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
  
    console.log(query)
  
    params.push(parseInt(limit), offset);
  
    // Виконання запиту для отримання загальної кількості результатів
    const countQuery = `
      SELECT 
        COUNT(*) as total
      FROM 
        expense_requests er
      JOIN 
        requests r ON er.request_id = r.id
      JOIN 
        users u ON r.user_id = u.id
      JOIN 
        teams t ON u.team_id = t.id
      WHERE 
        ${whereClause}
    `;
  
    const [dataResult, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, params.length - 2)),
    ]);
  
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);
  
    return {
      data: dataResult.rows,
      pagination: {
        total,
        totalPages,
        currentPage: parseInt(page),
        perPage: parseInt(limit),
      },
    };
  } catch(error){
    console.error(error);
  }
};

/**
 * Отримує загальну статистику витрат
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @returns {Promise<Object>} Об'єкт із загальною статистикою
 */
const getExpenseSummary = async ({ startDate, endDate }) => {
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

  // Запит для отримання загальної суми та кількості витрат
  const query = `
    SELECT 
      SUM(er.amount) as total_amount,
      COUNT(*) as total_count,
      MIN(er.amount) as min_amount,
      MAX(er.amount) as max_amount,
      AVG(er.amount) as avg_amount
    FROM 
      expense_requests er
    JOIN 
      requests r ON er.request_id = r.id
    WHERE 
      ${whereClause}
  `;

  const result = await db.query(query, params);

  // Запит для отримання кількості заявок за статусами
  const statusQuery = `
    SELECT 
      r.status,
      COUNT(*) as count
    FROM 
      expense_requests er
    JOIN 
      requests r ON er.request_id = r.id
    WHERE 
      ${whereClause}
    GROUP BY 
      r.status
  `;

  const statusResult = await db.query(statusQuery, params);

  return {
    summary: result.rows[0],
    statusStats: statusResult.rows,
  };
};

module.exports = {
  getNetworkStats,
  getTeamExpenseStats,
  getAllExpenses,
  getExpenseSummary,
};
