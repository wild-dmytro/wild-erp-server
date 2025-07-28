const db = require("../config/db");

/**
 * Отримує статистику витрат за відділами
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @returns {Promise<Array>} Масив об'єктів статистики за відділами
 */
const getDepartmentExpenseStats = async ({ startDate, endDate } = {}) => {
  // Побудова базових умов для requests
  const requestConditions = [
    "r.status IN ('approved_by_finance', 'completed')",
  ];
  // Окремі умови для таблиці salaries
  const salaryConditions = ["s.status = 'paid'"];

  const params = [];
  let paramIndex = 1;

  // Фільтр за діапазоном дат
  if (startDate && endDate) {
    // Для requests таблиці
    requestConditions.push(
      `r.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`
    );

    // Для salaries таблиці (використовуємо ті ж параметри)
    salaryConditions.push(
      `s.paid_at BETWEEN $${paramIndex - 2} AND $${paramIndex - 1}`
    );

    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(startDate, newEndDate.toISOString());
  }

  const requestWhereClause =
    requestConditions.length > 0
      ? `WHERE ${requestConditions.join(" AND ")}`
      : "";

  const salaryWhereClause =
    salaryConditions.length > 0
      ? `WHERE ${salaryConditions.join(" AND ")}`
      : "";

  // SQL-запит для агрегації даних по запитах (поповнення та витрати) по відділах
  const requestsQuery = `
    SELECT
      COALESCE(d.name, 'Невизначений відділ') as department_name,
      d.id as department_id,
      SUM(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount ELSE 0 END) as agent_refill_amount,
      COUNT(CASE WHEN r.request_type = 'agent_refill' THEN r.id END) as agent_refill_count,
      SUM(CASE WHEN r.request_type = 'expenses' THEN er.amount ELSE 0 END) as expense_amount,
      COUNT(CASE WHEN r.request_type = 'expenses' THEN r.id END) as expense_count
    FROM
      requests r
    JOIN
      users u ON r.user_id = u.id
    LEFT JOIN
      departments d ON u.department_id = d.id
    LEFT JOIN
      agent_refill_requests ar ON r.id = ar.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN
      expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
    ${requestWhereClause}
    GROUP BY
      d.id, d.name
    ORDER BY
      (SUM(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount ELSE 0 END) +
       SUM(CASE WHEN r.request_type = 'expenses' THEN er.amount ELSE 0 END)) DESC
  `;

  // SQL-запит для сум зарплат по відділах
  const salariesQuery = `
    SELECT
      COALESCE(d.name, 'Невизначений відділ') as department_name,
      d.id as department_id,
      SUM(s.amount) as salary_amount,
      COUNT(s.id) as salary_count
    FROM
      salaries s
    JOIN
      users u ON s.user_id = u.id
    LEFT JOIN
      departments d ON u.department_id = d.id
    ${salaryWhereClause}
    GROUP BY
      d.id, d.name
    ORDER BY
      SUM(s.amount) DESC
  `;

  // Виконуємо обидва запити
  const [requestsResult, salariesResult] = await Promise.all([
    db.query(requestsQuery, params),
    db.query(salariesQuery, params.length > 0 ? params : []),
  ]);

  // Об'єднуємо результати
  const departmentMap = new Map();

  // Обробляємо дані з запитів (поповнення та витрати)
  requestsResult.rows.forEach((row) => {
    const departmentKey = row.department_id || 'null';
    departmentMap.set(departmentKey, {
      department_id: row.department_id,
      department_name: row.department_name,
      agent_refill_amount: parseFloat(row.agent_refill_amount || 0),
      agent_refill_count: parseInt(row.agent_refill_count || 0),
      expense_amount: parseFloat(row.expense_amount || 0),
      expense_count: parseInt(row.expense_count || 0),
      salary_amount: 0,
      salary_count: 0,
    });
  });

  // Додаємо дані з зарплат
  salariesResult.rows.forEach((row) => {
    const departmentKey = row.department_id || 'null';
    if (departmentMap.has(departmentKey)) {
      const dept = departmentMap.get(departmentKey);
      dept.salary_amount = parseFloat(row.salary_amount || 0);
      dept.salary_count = parseInt(row.salary_count || 0);
    } else {
      departmentMap.set(departmentKey, {
        department_id: row.department_id,
        department_name: row.department_name,
        agent_refill_amount: 0,
        agent_refill_count: 0,
        expense_amount: 0,
        expense_count: 0,
        salary_amount: parseFloat(row.salary_amount || 0),
        salary_count: parseInt(row.salary_count || 0),
      });
    }
  });

  // Конвертуємо Map в масив і обчислюємо загальні суми
  const result = Array.from(departmentMap.values()).map((dept) => {
    const total_amount = dept.agent_refill_amount + dept.expense_amount + dept.salary_amount;
    const total_count = dept.agent_refill_count + dept.expense_count + dept.salary_count;

    return {
      ...dept,
      total_amount: parseFloat(total_amount.toFixed(2)),
      total_count,
    };
  });

  // Сортуємо за загальною сумою
  return result.sort((a, b) => b.total_amount - a.total_amount);
};

/**
 * Отримує детальну статистику витрат за конкретним відділом
 * @param {number} departmentId - ID відділу
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата
 * @param {Date} [options.endDate] - Кінцева дата
 * @returns {Promise<Object>} Детальна статистика відділу
 */
const getDepartmentDetailStats = async (departmentId, { startDate, endDate } = {}) => {
  const conditions = ["r.status IN ('approved_by_finance', 'completed')"];
  const params = [departmentId];
  let paramIndex = 2;

  if (startDate && endDate) {
    conditions.push(`r.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`);
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(startDate, newEndDate.toISOString());
  }

  const whereClause = conditions.join(" AND ");

  // Запит для детальної статистики
  const query = `
    SELECT
      d.name as department_name,
      d.description as department_description,
      COUNT(DISTINCT u.id) as user_count,
      
      -- Статистика поповнень агентів
      COUNT(CASE WHEN r.request_type = 'agent_refill' THEN r.id END) as agent_refill_count,
      COALESCE(SUM(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount END), 0) as agent_refill_amount,
      COALESCE(AVG(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount END), 0) as agent_refill_avg,
      
      -- Статистика витрат
      COUNT(CASE WHEN r.request_type = 'expenses' THEN r.id END) as expense_count,
      COALESCE(SUM(CASE WHEN r.request_type = 'expenses' THEN er.amount END), 0) as expense_amount,
      COALESCE(AVG(CASE WHEN r.request_type = 'expenses' THEN er.amount END), 0) as expense_avg,
      
      -- Статистика за мережами (топ-3)
      STRING_AGG(DISTINCT ar.network, ', ') as agent_networks,
      STRING_AGG(DISTINCT er.network, ', ') as expense_networks
      
    FROM
      departments d
    LEFT JOIN
      users u ON d.id = u.department_id AND u.is_active = true
    LEFT JOIN
      requests r ON u.id = r.user_id
    LEFT JOIN
      agent_refill_requests ar ON r.id = ar.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN
      expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
    WHERE
      d.id = $1 AND (r.id IS NULL OR (${whereClause}))
    GROUP BY
      d.id, d.name, d.description
  `;

  const result = await db.query(query, params);
  
  if (result.rows.length === 0) {
    return null;
  }

  const departmentStats = result.rows[0];

  // Додатковий запит для статистики зарплат
  const salaryQuery = `
    SELECT
      COUNT(s.id) as salary_count,
      COALESCE(SUM(s.amount), 0) as salary_amount,
      COALESCE(AVG(s.amount), 0) as salary_avg
    FROM
      salaries s
    JOIN
      users u ON s.user_id = u.id
    WHERE
      u.department_id = $1 
      AND s.status = 'paid'
      ${startDate && endDate ? `AND s.paid_at BETWEEN $2 AND $3` : ''}
  `;

  const salaryParams = [departmentId];
  if (startDate && endDate) {
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    salaryParams.push(startDate, newEndDate.toISOString());
  }

  const salaryResult = await db.query(salaryQuery, salaryParams);
  const salaryStats = salaryResult.rows[0];

  // Об'єднуємо результати
  return {
    ...departmentStats,
    salary_count: parseInt(salaryStats.salary_count || 0),
    salary_amount: parseFloat(salaryStats.salary_amount || 0),
    salary_avg: parseFloat(salaryStats.salary_avg || 0),
    total_amount: parseFloat(departmentStats.agent_refill_amount || 0) + 
                  parseFloat(departmentStats.expense_amount || 0) + 
                  parseFloat(salaryStats.salary_amount || 0),
    total_count: parseInt(departmentStats.agent_refill_count || 0) + 
                 parseInt(departmentStats.expense_count || 0) + 
                 parseInt(salaryStats.salary_count || 0)
  };
};

/**
 * Отримує порівняльну статистику відділів (топ-5)
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата
 * @param {Date} [options.endDate] - Кінцева дата
 * @param {string} [options.metric='total_amount'] - Метрика для сортування
 * @returns {Promise<Array>} Топ-5 відділів за обраною метрикою
 */
const getTopDepartments = async ({ startDate, endDate, metric = 'total_amount' } = {}) => {
  const stats = await getDepartmentExpenseStats({ startDate, endDate });
  
  // Сортуємо за обраною метрикою
  const sortedStats = stats.sort((a, b) => {
    const valueA = a[metric] || 0;
    const valueB = b[metric] || 0;
    return valueB - valueA;
  });

  // Повертаємо топ-5
  return sortedStats.slice(0, 5);
};

module.exports = {
  getDepartmentExpenseStats,
  getDepartmentDetailStats,
  getTopDepartments,
};