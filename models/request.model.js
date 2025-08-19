const db = require("../config/db");

const getRequestTypeSummary = async ({ startDate, endDate, teamId }) => {
  const conditions = ["r.status IN ('approved_by_finance', 'completed')"];
  const params = [];
  let paramIndex = 1;

  if (startDate && endDate) {
    conditions.push(
      `r.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`
    );
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(startDate, newEndDate.toISOString());
  }

  if (teamId) {
    conditions.push(`u.team_id = $${paramIndex++}`);
    params.push(teamId);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const query = `
    SELECT 
      r.request_type,
      COUNT(*) as total_count,
      SUM(CASE 
        WHEN r.request_type = 'agent_refill' THEN ar.amount
        WHEN r.request_type = 'expenses' THEN er.amount
        ELSE 0 END) as total_amount
    FROM 
      requests r
    LEFT JOIN agent_refill_requests ar ON r.id = ar.request_id
    LEFT JOIN expense_requests er ON r.id = er.request_id
    JOIN users u ON r.user_id = u.id
    ${whereClause}
    GROUP BY r.request_type
  `;

  const result = await db.query(query, params);

  return result.rows;
};

/**
 * Отримує сумарні дані по тижнях
 * @param {Object} options - Опції для фільтрації
 * @param {number} [options.year] - Рік для фільтрації
 * @param {number} [options.month] - Місяць для фільтрації (1-12)
 * @param {number} [options.teamId] - ID команди для фільтрації
 * @param {Date} [options.startDate] - Початкова дата
 * @param {Date} [options.endDate] - Кінцева дата
 * @returns {Promise<Array>} Масив даних по тижнях
 */
const getWeeklyExpenseSummary = async ({
  year = new Date().getFullYear(),
  month = null,
  teamId,
  startDate,
  endDate,
}) => {
  // Побудова WHERE умов для requests
  const requestConditions = [
    `r.status IN ('approved_by_finance', 'completed')`,
  ];

  // Побудова WHERE умов для salaries
  const salaryConditions = [`s.status = 'paid'`];

  const params = [];
  let paramIndex = 1;

  // Фільтрування по даті
  if (startDate && endDate) {
    requestConditions.push(
      `r.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`
    );
    salaryConditions.push(
      `s.paid_at BETWEEN $${paramIndex - 2} AND $${paramIndex - 1}`
    );
    params.push(startDate, endDate);
  } else {
    // Якщо немає кастомного діапазону, використовуємо рік і місяць
    if (month) {
      requestConditions.push(
        `EXTRACT(YEAR FROM r.created_at) = $${paramIndex++}`,
        `EXTRACT(MONTH FROM r.created_at) = $${paramIndex++}`
      );
      salaryConditions.push(
        `EXTRACT(YEAR FROM s.paid_at) = $${paramIndex - 2}`,
        `EXTRACT(MONTH FROM s.paid_at) = $${paramIndex - 1}`
      );
      params.push(year, month);
    } else {
      requestConditions.push(
        `EXTRACT(YEAR FROM r.created_at) = $${paramIndex++}`
      );
      salaryConditions.push(
        `EXTRACT(YEAR FROM s.paid_at) = $${paramIndex - 1}`
      );
      params.push(year);
    }
  }

  // Додаємо фільтр за командою, якщо вказано
  if (teamId) {
    requestConditions.push(`r.team_id = $${paramIndex}`);
    salaryConditions.push(`s.team_id = $${paramIndex}`);
    params.push(teamId);
    paramIndex++;
  }

  const requestWhereClause = requestConditions.join(" AND ");
  const salaryWhereClause = salaryConditions.join(" AND ");

  // SQL-запит для агрегації даних по запитах (поповнення та витрати) по тижнях
  const requestsQuery = `
    SELECT
      EXTRACT(WEEK FROM r.created_at)::integer as week_number,
      EXTRACT(YEAR FROM r.created_at)::integer as year,
      DATE_TRUNC('week', r.created_at)::date as week_start,
      (DATE_TRUNC('week', r.created_at) + INTERVAL '6 days')::date as week_end,
      SUM(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount ELSE 0 END) as total_agent_refill,
      SUM(CASE WHEN r.request_type = 'expenses' AND d.type = 'buying' THEN er.amount ELSE 0 END) as total_buying_expenses,
      SUM(CASE WHEN r.request_type = 'expenses' AND (d.type IS NULL OR d.type != 'buying') THEN er.amount ELSE 0 END) as total_other_expenses
    FROM
      requests r
    LEFT JOIN
      agent_refill_requests ar ON r.id = ar.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN
      expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
    LEFT JOIN
      departments d ON r.department_id = d.id
    WHERE
      ${requestWhereClause}
    GROUP BY
      EXTRACT(WEEK FROM r.created_at), EXTRACT(YEAR FROM r.created_at), DATE_TRUNC('week', r.created_at)
    ORDER BY
      year, week_number
  `;

  // SQL-запит для сум зарплат по тижнях
  const salariesQuery = `
    SELECT
      EXTRACT(WEEK FROM s.paid_at)::integer as week_number,
      EXTRACT(YEAR FROM s.paid_at)::integer as year,
      DATE_TRUNC('week', s.paid_at)::date as week_start,
      SUM(amount) as total_salaries
    FROM
      salaries s
    WHERE
      ${salaryWhereClause}
    GROUP BY
      EXTRACT(WEEK FROM s.paid_at), EXTRACT(YEAR FROM s.paid_at), DATE_TRUNC('week', s.paid_at)
    ORDER BY
      year, week_number
  `;

  // Виконуємо обидва запити
  const [requestsResult, salariesResult] = await Promise.all([
    db.query(requestsQuery, params),
    db.query(salariesQuery, params.length > 0 ? params : []),
  ]);

  // Об'єднуємо дані по тижнях
  const weeklyData = new Map();

  // Додаємо дані запитів
  requestsResult.rows.forEach((row) => {
    const weekKey = `${row.year}-${row.week_number}`;
    weeklyData.set(weekKey, {
      weekNumber: row.week_number,
      year: row.year,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      weekName: `Тиждень ${row.week_number}, ${row.year}`,
      weekRange: `${new Date(row.week_start).toLocaleDateString("uk-UA", {
        day: "2-digit",
        month: "2-digit",
      })} - ${new Date(row.week_end).toLocaleDateString("uk-UA", {
        day: "2-digit",
        month: "2-digit",
      })}`,
      totalAgentRefill: parseFloat(row.total_agent_refill || 0).toFixed(2),
      totalBuyingExpenses: parseFloat(row.total_buying_expenses || 0).toFixed(
        2
      ),
      totalOtherExpenses: parseFloat(row.total_other_expenses || 0).toFixed(2),
      totalSalaries: "0.00",
    });
  });

  // Додаємо дані зарплат
  salariesResult.rows.forEach((row) => {
    const weekKey = `${row.year}-${row.week_number}`;
    if (weeklyData.has(weekKey)) {
      const weekData = weeklyData.get(weekKey);
      weekData.totalSalaries = parseFloat(row.total_salaries || 0).toFixed(2);
    } else {
      // Якщо немає даних запитів для цього тижня, створюємо новий запис
      weeklyData.set(weekKey, {
        weekNumber: row.week_number,
        year: row.year,
        weekStart: row.week_start,
        weekEnd: new Date(
          new Date(row.week_start).getTime() + 6 * 24 * 60 * 60 * 1000
        ),
        weekName: `Тиждень ${row.week_number}, ${row.year}`,
        weekRange: `${new Date(row.week_start).toLocaleDateString("uk-UA", {
          day: "2-digit",
          month: "2-digit",
        })} - ${new Date(
          new Date(row.week_start).getTime() + 6 * 24 * 60 * 60 * 1000
        ).toLocaleDateString("uk-UA", {
          day: "2-digit",
          month: "2-digit",
        })}`,
        totalAgentRefill: "0.00",
        totalBuyingExpenses: "0.00",
        totalOtherExpenses: "0.00",
        totalSalaries: parseFloat(row.total_salaries || 0).toFixed(2),
      });
    }
  });

  // Конвертуємо Map в масив і додаємо загальну суму
  const formattedData = Array.from(weeklyData.values()).map((weekData) => {
    const totalAgentRefill = parseFloat(weekData.totalAgentRefill);
    const totalBuyingExpenses = parseFloat(weekData.totalBuyingExpenses);
    const totalOtherExpenses = parseFloat(weekData.totalOtherExpenses);
    const totalSalaries = parseFloat(weekData.totalSalaries);

    const totalAmount =
      totalAgentRefill +
      totalBuyingExpenses +
      totalOtherExpenses +
      totalSalaries;

    return {
      ...weekData,
      totalAmount: totalAmount.toFixed(2),
    };
  });

  // Сортуємо по року і номеру тижня
  formattedData.sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }
    return a.weekNumber - b.weekNumber;
  });

  return formattedData;
};

// Оновлення існуючої функції getMonthlyExpenseSummary для підтримки періодів
const getMonthlyExpenseSummary = async ({
  year = new Date().getFullYear(),
  teamId,
  period = "month", // 'month' або 'week'
  month = null, // для тижневого періоду в конкретному місяці
  startDate = null,
  endDate = null,
}) => {
  // Якщо period = 'week', використовуємо нову функцію
  if (period === "week") {
    return getWeeklyExpenseSummary({
      year,
      month,
      teamId,
      startDate,
      endDate,
    });
  }

  // Існуючий код для місячних даних...
  // (Весь існуючий код функції getMonthlyExpenseSummary залишається без змін)
  const requestConditions = [
    `EXTRACT(YEAR FROM r.created_at) = $1`,
    `r.status IN ('approved_by_finance', 'completed')`,
  ];

  const salaryConditions = [
    `EXTRACT(YEAR FROM s.paid_at) = $1`,
    `s.status = 'paid'`,
  ];

  const params = [year];
  let paramIndex = 2;

  if (teamId) {
    requestConditions.push(`r.team_id = $${paramIndex}`);
    salaryConditions.push(`s.team_id = $${paramIndex}`);
    params.push(teamId);
    paramIndex++;
  }

  const requestWhereClause = requestConditions.join(" AND ");
  const salaryWhereClause = salaryConditions.join(" AND ");

  const requestsQuery = `
    SELECT
      EXTRACT(MONTH FROM r.created_at)::integer as month,
      SUM(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount ELSE 0 END) as total_agent_refill,
      SUM(CASE WHEN r.request_type = 'expenses' AND d.type = 'buying' THEN er.amount ELSE 0 END) as total_buying_expenses,
      SUM(CASE WHEN r.request_type = 'expenses' AND (d.type IS NULL OR d.type != 'buying') THEN er.amount ELSE 0 END) as total_other_expenses
    FROM
      requests r
    LEFT JOIN
      agent_refill_requests ar ON r.id = ar.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN
      expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
    LEFT JOIN
      departments d ON r.department_id = d.id
    WHERE
      ${requestWhereClause}
    GROUP BY
      EXTRACT(MONTH FROM r.created_at)
    ORDER BY
      month
  `;

  const salariesQuery = `
    SELECT
      s.month as month,
      SUM(amount) as total_salaries
    FROM
      salaries s
    WHERE
      ${salaryWhereClause}
    GROUP BY
      s.month
    ORDER BY
      month
  `;

  const [requestsResult, salariesResult] = await Promise.all([
    db.query(requestsQuery, params),
    db.query(salariesQuery, params),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const formattedData = months.map((month) => {
    const monthRequestsData = requestsResult.rows.find(
      (row) => row.month === month
    ) || {
      total_agent_refill: 0,
      total_buying_expenses: 0,
      total_other_expenses: 0,
    };

    const monthSalariesData = salariesResult.rows.find(
      (row) => row.month === month
    ) || {
      total_salaries: 0,
    };

    const totalAgentRefill = parseFloat(
      monthRequestsData.total_agent_refill || 0
    );
    const totalBuyingExpenses = parseFloat(
      monthRequestsData.total_buying_expenses || 0
    );
    const totalOtherExpenses = parseFloat(
      monthRequestsData.total_other_expenses || 0
    );
    const totalSalaries = parseFloat(monthSalariesData.total_salaries || 0);

    const totalAmount =
      totalAgentRefill +
      totalBuyingExpenses +
      totalOtherExpenses +
      totalSalaries;

    return {
      month,
      monthName: new Date(year, month - 1, 1).toLocaleString("uk-UA", {
        month: "long",
      }),
      totalAgentRefill: totalAgentRefill.toFixed(2),
      totalBuyingExpenses: totalBuyingExpenses.toFixed(2),
      totalOtherExpenses: totalOtherExpenses.toFixed(2),
      totalSalaries: totalSalaries.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
    };
  });

  return formattedData;
};

/**
 * Отримує статистику заявок за фінансовими менеджерами
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата (ISO формат)
 * @param {Date} [options.endDate] - Кінцева дата (ISO формат)
 * @param {string} [options.requestType] - Тип заявки (agent_refill, expenses)
 * @returns {Promise<Array>} Масив даних по фінансових менеджерах
 */
const getFinanceManagerStats = async ({ startDate, endDate, teamId }) => {
  const requestConditions = [
    "r.status IN ('approved_by_finance', 'completed')",
  ];
  const salaryConditions = ["s.status = 'paid'"];
  const params = [];
  let paramIndex = 1;

  // Умови для заявок (requests)
  if (startDate && endDate) {
    requestConditions.push(
      `r.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`
    );
    // Для зарплат використовуємо поле paid_at замість created_at
    salaryConditions.push(
      `s.paid_at BETWEEN $${paramIndex - 2} AND $${paramIndex - 1}`
    );

    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    params.push(startDate, newEndDate.toISOString());
  }

  if (teamId) {
    requestConditions.push(`u.team_id = $${paramIndex++}`);
    // Для зарплат також перевіряємо команду користувача через таблицю users
    salaryConditions.push(`su.team_id = $${paramIndex - 1}`);
    params.push(teamId);
  }

  const requestWhereClause =
    requestConditions.length > 0
      ? `WHERE ${requestConditions.join(" AND ")}`
      : "";

  const salaryWhereClause =
    salaryConditions.length > 0
      ? `WHERE ${salaryConditions.join(" AND ")}`
      : "";

  console.log("finance manager request conditions:", requestWhereClause);
  console.log("finance manager salary conditions:", salaryWhereClause);

  const query = `
    WITH request_stats AS (
      SELECT
        fm.id,
        fm.username,
        fm.first_name,
        fm.last_name,
        COALESCE(SUM(CASE WHEN r.request_type = 'expenses' THEN er.amount ELSE 0 END), 0) as expense_amount,
        COALESCE(COUNT(CASE WHEN r.request_type = 'expenses' THEN r.id END), 0) as expense_count,
        COALESCE(SUM(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount ELSE 0 END), 0) as agent_refill_amount,
        COALESCE(COUNT(CASE WHEN r.request_type = 'agent_refill' THEN r.id END), 0) as agent_refill_count
      FROM
        requests r
      LEFT JOIN
        agent_refill_requests ar ON r.id = ar.request_id AND r.request_type = 'agent_refill'
      LEFT JOIN
        expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
      JOIN
        users u ON r.user_id = u.id
      RIGHT JOIN
        users fm ON r.finance_manager_id = fm.id
      ${requestWhereClause}
      GROUP BY
        fm.id, fm.username, fm.first_name, fm.last_name
    ),
    salary_stats AS (
      SELECT
        fm.id,
        COALESCE(SUM(s.amount), 0) as salary_amount,
        COALESCE(COUNT(s.id), 0) as salary_count
      FROM
        users fm
      LEFT JOIN
        salaries s ON fm.id = s.finance_manager_id
      LEFT JOIN
        users su ON s.user_id = su.id
      ${salaryWhereClause}
      GROUP BY
        fm.id
    )
    SELECT
      COALESCE(rs.id, ss.id) as id,
      COALESCE(rs.username, (SELECT username FROM users WHERE id = COALESCE(rs.id, ss.id))) as username,
      COALESCE(rs.first_name, (SELECT first_name FROM users WHERE id = COALESCE(rs.id, ss.id))) as first_name,
      COALESCE(rs.last_name, (SELECT last_name FROM users WHERE id = COALESCE(rs.id, ss.id))) as last_name,
      COALESCE(rs.expense_amount, 0) as expense_amount,
      COALESCE(rs.expense_count, 0) as expense_count,
      COALESCE(rs.agent_refill_amount, 0) as agent_refill_amount,
      COALESCE(rs.agent_refill_count, 0) as agent_refill_count,
      COALESCE(ss.salary_amount, 0) as salary_amount,
      COALESCE(ss.salary_count, 0) as salary_count
    FROM
      request_stats rs
    FULL OUTER JOIN
      salary_stats ss ON rs.id = ss.id
    WHERE
      COALESCE(rs.id, ss.id) IN (
        SELECT id FROM users WHERE role = 'finance_manager' AND is_active = true
      )
    ORDER BY
      (COALESCE(rs.expense_amount, 0) + 
       COALESCE(rs.agent_refill_amount, 0) + 
       COALESCE(ss.salary_amount, 0)) DESC
  `;

  const result = await db.query(query, params);

  return result.rows.map((row) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    username: row.username,
    expenseAmount: parseFloat(row.expense_amount || 0).toFixed(2),
    expenseCount: parseInt(row.expense_count || 0),
    agentRefillAmount: parseFloat(row.agent_refill_amount || 0).toFixed(2),
    agentRefillCount: parseInt(row.agent_refill_count || 0),
    salaryAmount: parseFloat(row.salary_amount || 0).toFixed(2),
    salaryCount: parseInt(row.salary_count || 0),
  }));
};

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
    const departmentKey = row.department_id || "null";
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
    const departmentKey = row.department_id || "null";
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
    const total_amount =
      dept.agent_refill_amount + dept.expense_amount + dept.salary_amount;
    const total_count =
      dept.agent_refill_count + dept.expense_count + dept.salary_count;

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
 * Отримує один запит за ідентифікатором з усіма деталями
 * @param {number} id - Ідентифікатор запиту
 * @returns {Promise<Object|null>} Детальна інформація про запит або null
 */
const getRequestById = async (id) => {
  // Отримання базової інформації про запит
  const requestResult = await db.query(
    `
    SELECT 
      r.*,
      u.username as created_by_username,
      CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
      t.name as team_name,
      tl.username as teamlead_username,
      CONCAT(tl.first_name, ' ', tl.last_name) as teamlead_name,
      fm.username as finance_manager_username,
      CONCAT(fm.first_name, ' ', fm.last_name) as finance_manager_name
    FROM 
      requests r
    JOIN 
      users u ON r.user_id = u.id
    JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      users tl ON r.teamlead_id = tl.id
    LEFT JOIN 
      users fm ON r.finance_manager_id = fm.id
    WHERE 
      r.id = $1
  `,
    [id]
  );

  if (requestResult.rows.length === 0) {
    return null;
  }

  const request = requestResult.rows[0];

  // Отримання деталей залежно від типу запиту
  if (request.request_type === "agent_refill") {
    const agentRefillResult = await db.query(
      `
      SELECT 
        ar.*,
        a.name as agent_name
      FROM 
        agent_refill_requests ar
      JOIN 
        agents a ON ar.agent_id = a.id
      WHERE 
        ar.request_id = $1
    `,
      [id]
    );

    if (agentRefillResult.rows.length > 0) {
      request.details = agentRefillResult.rows[0];
    }
  } else if (request.request_type === "expenses") {
    const expenseResult = await db.query(
      `
      SELECT * FROM expense_requests WHERE request_id = $1
    `,
      [id]
    );

    if (expenseResult.rows.length > 0) {
      request.details = expenseResult.rows[0];
    }
  }

  return request;
};

const getStatistics = async ({ startDate, endDate }) => {
  // Побудова базових умов для requests
  const requestConditions = [
    "r.status IN ('approved_by_finance', 'completed')",
  ];
  // Окремі умови для таблиці salaries
  const salaryConditions = ["s.status = 'paid'"];

  const requestParams = [];
  const salaryParams = [];
  let requestParamIndex = 1;
  let salaryParamIndex = 1;

  // Фільтр за діапазоном дат для requests
  if (startDate && endDate) {
    // Створюємо початкову дату з часом 00:00:00.000
    const startDateTime = new Date(startDate);
    startDateTime.setHours(0, 0, 0, 0);

    // Створюємо кінцеву дату з часом 23:59:59.999
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);

    // Для requests таблиці
    requestConditions.push(
      `r.created_at >= $${requestParamIndex++} AND r.created_at <= $${requestParamIndex++}`
    );
    requestParams.push(startDateTime.toISOString(), endDateTime.toISOString());

    // Для salaries таблиці - порівнюємо з полем month
    const startMonth = new Date(startDate).getMonth() + 1; // +1 оскільки getMonth() повертає 0-11
    const endMonth = new Date(endDate).getMonth() + 1;

    // Перевіряємо чи діапазон переходить через рік
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();

    if (startYear === endYear) {
      // Діапазон в межах одного року
      salaryConditions.push(
        `s.month >= $${salaryParamIndex++} AND s.month <= $${salaryParamIndex++}`
      );
      salaryParams.push(startMonth, endMonth);
    } else {
      // Діапазон переходить через рік - створюємо більш складну умову
      salaryConditions.push(
        `(s.month >= $${salaryParamIndex++} OR s.month <= $${salaryParamIndex++})`
      );
      salaryParams.push(startMonth, endMonth);
    }
  }

  const requestWhereClause =
    requestConditions.length > 0
      ? `WHERE ${requestConditions.join(" AND ")}`
      : "";

  const salaryWhereClause =
    salaryConditions.length > 0
      ? `WHERE ${salaryConditions.join(" AND ")}`
      : "";

  console.log("stats manager" + requestWhereClause);

  // SQL-запит для агрегації даних по запитах (поповнення та витрати)
  const requestsQuery = `
    SELECT
      SUM(CASE WHEN r.request_type = 'agent_refill' THEN ar.amount ELSE 0 END) as total_agent_refill,
      SUM(CASE WHEN r.request_type = 'expenses' AND d.type = 'buying' THEN er.amount ELSE 0 END) as total_buying_expenses,
      SUM(CASE WHEN r.request_type = 'expenses' AND (d.type IS NULL OR d.type != 'buying') THEN er.amount ELSE 0 END) as total_other_expenses,
      SUM(CASE WHEN r.request_type = 'agent_refill' AND ar.fee_amount IS NOT NULL THEN ar.fee_amount ELSE NULL END) as total_fee_amount
    FROM
      requests r
    LEFT JOIN
      agent_refill_requests ar ON r.id = ar.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN
      expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
    LEFT JOIN
      departments d ON r.department_id = d.id
    ${requestWhereClause}
  `;

  // SQL-запит для сум зарплат
  const salariesQuery = `
    SELECT
      SUM(amount) as total_salaries
    FROM
      salaries s
    ${salaryWhereClause}
  `;

  // Виконуємо обидва запити з різними параметрами
  const [requestsResult, salariesResult] = await Promise.all([
    db.query(requestsQuery, requestParams),
    db.query(salariesQuery, salaryParams),
  ]);

  // Форматування результату
  const requestsData = requestsResult.rows[0] || {
    total_agent_refill: 0,
    total_buying_expenses: 0,
    total_other_expenses: 0,
    average_fee_percentage: 0,
    total_fee_amount: 0,
  };

  const salariesData = salariesResult.rows[0] || {
    total_salaries: 0,
  };

  // Конвертуємо значення в числа для коректного обчислення суми
  const totalAgentRefill = parseFloat(requestsData.total_agent_refill || 0);
  const totalBuyingExpenses = parseFloat(
    requestsData.total_buying_expenses || 0
  );
  const totalOtherExpenses = parseFloat(requestsData.total_other_expenses || 0);
  const totalSalaries = parseFloat(salariesData.total_salaries || 0);

  const totalFeeAmount = parseFloat(requestsData.total_fee_amount || 0);

  let averageFeePercentage;

  if (requestsData.total_fee_amount) {
    averageFeePercentage =
      parseFloat(
        requestsData.total_fee_amount / requestsData.total_agent_refill
      ) * 100;
  }

  // Загальна сума всіх чотирьох пунктів
  const totalAmount =
    totalAgentRefill + totalBuyingExpenses + totalOtherExpenses + totalSalaries;

  return {
    totalAgentRefill: totalAgentRefill.toFixed(2),
    totalBuyingExpenses: totalBuyingExpenses.toFixed(2),
    totalOtherExpenses: totalOtherExpenses.toFixed(2),
    totalSalaries: totalSalaries.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    averageFeePercentage: averageFeePercentage
      ? averageFeePercentage.toFixed(2)
      : 0,
    totalFeeAmount: totalFeeAmount.toFixed(2),
  };
};

/**
 * Отримує всі заявки з фільтрацією та пагінацією
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {number} [options.page=1] - Номер сторінки
 * @param {number} [options.limit=10] - Кількість записів на сторінці
 * @param {string} [options.status] - Статус заявки для фільтрації
 * @param {string} [options.requestType] - Тип заявки для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @param {number} [options.userId] - ID користувача для фільтрації
 * @param {number} [options.teamId] - ID команди для фільтрації
 * @param {number} [options.teamleadId] - ID тімліда для фільтрації
 * @param {number} [options.financeManagerId] - ID фінанс менеджера для фільтрації
 * @param {number} [options.agentId] - ID агента для фільтрації
 * @param {string} [options.sortBy="created_at"] - Поле для сортування
 * @param {string} [options.sortOrder="desc"] - Порядок сортування (asc/desc)
 * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
 */
const getAllRequests = async ({
  page = 1,
  limit = 10,
  status,
  requestType,
  startDate,
  endDate,
  userId,
  teamId,
  departmentId,
  teamleadId,
  financeManagerId,
  network,
  minAmount,
  maxAmount,
  agentId, // Додано параметр agentId
  sortBy = "created_at",
  sortOrder = "desc",
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

  if (requestType) {
    conditions.push(`r.request_type = $${paramIndex++}`);
    params.push(requestType);
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

  if (userId) {
    conditions.push(`r.user_id = $${paramIndex++}`);
    params.push(userId);
  }

  if (teamId) {
    conditions.push(`r.team_id = $${paramIndex++}`);
    params.push(teamId);
  }

  if (departmentId) {
    conditions.push(`r.department_id = $${paramIndex++}`);
    params.push(departmentId);
  }

  if (teamleadId) {
    conditions.push(`r.teamlead_id = $${paramIndex++}`);
    params.push(teamleadId);
  }

  if (financeManagerId) {
    conditions.push(`r.finance_manager_id = $${paramIndex++}`);
    params.push(financeManagerId);
  }

  // Додано фільтр за агентом (тільки для agent_refill заявок)
  if (agentId) {
    conditions.push(`(
      r.request_type = 'agent_refill' AND EXISTS (
        SELECT 1 FROM agent_refill_requests ar 
        WHERE ar.request_id = r.id AND ar.agent_id = $${paramIndex}
      )
    )`);
    params.push(agentId);
    paramIndex++;
  }

  if (network) {
    conditions.push(`(
      (r.request_type = 'agent_refill' AND EXISTS (
        SELECT 1 FROM agent_refill_requests ar 
        WHERE ar.request_id = r.id AND ar.network = $${paramIndex}
      )) 
      OR 
      (r.request_type = 'expenses' AND EXISTS (
        SELECT 1 FROM expense_requests er 
        WHERE er.request_id = r.id AND er.network = $${paramIndex}
      ))
    )`);
    params.push(network);
    paramIndex++;
  }

  if (minAmount) {
    conditions.push(`(
      (r.request_type = 'agent_refill' AND EXISTS (
        SELECT 1 FROM agent_refill_requests ar 
        WHERE ar.request_id = r.id AND ar.amount >= $${paramIndex}
      )) 
      OR 
      (r.request_type = 'expenses' AND EXISTS (
        SELECT 1 FROM expense_requests er 
        WHERE er.request_id = r.id AND er.amount >= $${paramIndex}
      ))
    )`);
    params.push(minAmount);
    paramIndex++;
  }

  if (maxAmount) {
    conditions.push(`(
      (r.request_type = 'agent_refill' AND EXISTS (
        SELECT 1 FROM agent_refill_requests ar 
        WHERE ar.request_id = r.id AND ar.amount <= $${paramIndex}
      )) 
      OR 
      (r.request_type = 'expenses' AND EXISTS (
        SELECT 1 FROM expense_requests er 
        WHERE er.request_id = r.id AND er.amount <= $${paramIndex}
      ))
    )`);
    params.push(maxAmount);
    paramIndex++;
  }

  const whereClause = conditions.join(" AND ");

  // Валідація полів сортування
  const allowedSortFields = [
    "id",
    "request_type",
    "status",
    "created_at",
    "updated_at",
  ];
  const validSortBy = allowedSortFields.includes(sortBy)
    ? sortBy
    : "created_at";
  const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

  // Виконання запиту для отримання даних з пагінацією
  const query = `
    WITH user_data AS (
      SELECT 
        u.id, 
        u.username, 
        CONCAT(u.first_name, ' ', u.last_name) as full_name,
        u.team_id
      FROM users u
    ),
    team_data AS (
      SELECT 
        t.id, 
        t.name
      FROM teams t
    ),
    agent_refill_data AS (
      SELECT 
        ar.request_id,
        ar.amount,
        ar.wallet_address,
        ar.transaction_hash,
        ar.network,
        ar.token,
        ar.comment,
        a.name as agent_name,
        a.id as agent_id,
        ar.server,
        ar.fee
      FROM agent_refill_requests ar
      LEFT JOIN agents a ON ar.agent_id = a.id
    ),
    expense_data AS (
      SELECT 
        er.request_id,
        er.amount,
        er.wallet_address,
        er.transaction_hash,
        er.network,
        er.token,
        er.comment,
        er.purpose,
        er.seller_service,
        er.transaction_time,
        et.name as expense_type_name,
        et.description as expense_type_description
      FROM expense_requests er
      LEFT JOIN expense_types et ON er.expense_type_id = et.id
    )

    SELECT 
      r.id,
      r.request_type,
      r.status,
      r.created_at,
      r.updated_at,
      ud.id as user_id,
      ud.username,
      ud.full_name as user_full_name,
      td.id as team_id,
      td.name as team_name,
      d.id as department_id,
      d.name as department_name,
      tl.id as teamlead_id,
      tl.username as teamlead_username,
      CONCAT(tl.first_name, ' ', tl.last_name) as teamlead_full_name,
      fm.id as finance_manager_id,
      fm.username as finance_manager_username,
      CONCAT(fm.first_name, ' ', fm.last_name) as finance_manager_full_name,

      CASE
        WHEN r.request_type = 'agent_refill' THEN ard.amount
        WHEN r.request_type = 'expenses' THEN ed.amount
      END as amount,

      CASE
        WHEN r.request_type = 'agent_refill' THEN ard.wallet_address
        WHEN r.request_type = 'expenses' THEN ed.wallet_address
      END as wallet_address,

      CASE
        WHEN r.request_type = 'agent_refill' THEN ard.transaction_hash
        WHEN r.request_type = 'expenses' THEN ed.transaction_hash
      END as transaction_hash,

      CASE
        WHEN r.request_type = 'agent_refill' THEN ard.network
        WHEN r.request_type = 'expenses' THEN ed.network
      END as network,

      CASE
        WHEN r.request_type = 'agent_refill' THEN ard.token
        WHEN r.request_type = 'expenses' THEN ed.token
      END as token,

      CASE
        WHEN r.request_type = 'agent_refill' THEN ard.comment
        WHEN r.request_type = 'expenses' THEN ed.comment
      END as comment,

      ard.agent_name,
      ard.agent_id,
      ard.server,
      ard.fee,

      ed.purpose,
      ed.seller_service,
      ed.transaction_time,
      ed.expense_type_name,
      ed.expense_type_description
    FROM 
      requests r
    JOIN 
      user_data ud ON r.user_id = ud.id
    LEFT JOIN 
      team_data td ON ud.team_id = td.id
    LEFT JOIN 
      departments d ON r.department_id = d.id
    LEFT JOIN 
      users tl ON r.teamlead_id = tl.id
    LEFT JOIN 
      users fm ON r.finance_manager_id = fm.id
    LEFT JOIN 
      agent_refill_data ard ON r.id = ard.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN 
      expense_data ed ON r.id = ed.request_id AND r.request_type = 'expenses'
        WHERE 
      ${whereClause}
    ORDER BY 
      r.${validSortBy} ${validSortOrder}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  params.push(parseInt(limit), offset);

  // Виконання запиту для отримання загальної кількості результатів
  const countQuery = `
    SELECT 
      COUNT(*) as total,
      SUM(
        CASE 
          WHEN r.request_type = 'agent_refill' THEN arr.amount
          WHEN r.request_type = 'expenses' THEN er.amount
          ELSE 0
        END
      ) as total_amount,
      SUM(
        CASE 
          WHEN r.status = 'completed' THEN 1
          ELSE 0
        END
      ) as completed_count,
      SUM(
        CASE 
          WHEN r.status = 'rejected_by_finance' THEN 1
          ELSE 0
        END
      ) as rejected_by_finance_count,
      SUM(
        CASE 
          WHEN r.status = 'rejected_by_teamlead' THEN 1
          ELSE 0
        END
      ) as rejected_by_teamlead_count,
      SUM(
        CASE 
          WHEN r.status IN ('rejected_by_finance', 'rejected_by_teamlead') THEN 1
          ELSE 0
        END
      ) as total_rejected_count,
      SUM(
        CASE 
          WHEN r.status = 'pending' THEN 1
          ELSE 0
        END
      ) as pending_count,
      SUM(
        CASE 
          WHEN r.status = 'approved_by_teamlead' THEN 1
          ELSE 0
        END
      ) as approved_by_teamlead_count,
      SUM(
        CASE 
          WHEN r.status = 'approved_by_finance' THEN 1
          ELSE 0
        END
      ) as approved_by_finance_count,
      -- Додаткові суми для завершених та відхилених заявок
      SUM(
        CASE 
          WHEN r.status = 'completed' AND r.request_type = 'agent_refill' THEN arr.amount
          WHEN r.status = 'completed' AND r.request_type = 'expenses' THEN er.amount
          ELSE 0
        END
      ) as completed_amount,
      SUM(
        CASE 
          WHEN r.status IN ('rejected_by_finance', 'rejected_by_teamlead') AND r.request_type = 'agent_refill' THEN arr.amount
          WHEN r.status IN ('rejected_by_finance', 'rejected_by_teamlead') AND r.request_type = 'expenses' THEN er.amount
          ELSE 0
        END
      ) as rejected_amount
    FROM 
      requests r
    JOIN 
      users u ON r.user_id = u.id
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      users tl ON r.teamlead_id = tl.id
    LEFT JOIN 
      users fm ON r.finance_manager_id = fm.id
    LEFT JOIN 
      agent_refill_requests arr ON r.id = arr.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN 
      expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
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

  // Додаткові статистики
  const completedCount = parseInt(countResult.rows[0].completed_count) || 0;
  const rejectedByFinanceCount =
    parseInt(countResult.rows[0].rejected_by_finance_count) || 0;
  const rejectedByTeamleadCount =
    parseInt(countResult.rows[0].rejected_by_teamlead_count) || 0;
  const totalRejectedCount =
    parseInt(countResult.rows[0].total_rejected_count) || 0;
  const pendingCount = parseInt(countResult.rows[0].pending_count) || 0;
  const approvedByTeamleadCount =
    parseInt(countResult.rows[0].approved_by_teamlead_count) || 0;
  const approvedByFinanceCount =
    parseInt(countResult.rows[0].approved_by_finance_count) || 0;

  // Суми для конкретних статусів
  const completedAmount = parseFloat(countResult.rows[0].completed_amount) || 0;
  const rejectedAmount = parseFloat(countResult.rows[0].rejected_amount) || 0;

  return {
    data: dataResult.rows,
    pagination: {
      total,
      totalAmount,
      totalPages,
      currentPage: parseInt(page),
      perPage: parseInt(limit),
      // Додаткові статистики
      stats: {
        completed: {
          count: completedCount,
          amount: completedAmount,
          percentage:
            total > 0 ? ((completedCount / total) * 100).toFixed(1) : 0,
        },
        rejected: {
          count: totalRejectedCount,
          amount: rejectedAmount,
          percentage:
            total > 0 ? ((totalRejectedCount / total) * 100).toFixed(1) : 0,
          byFinance: rejectedByFinanceCount,
          byTeamlead: rejectedByTeamleadCount,
        },
        pending: {
          count: pendingCount,
          percentage: total > 0 ? ((pendingCount / total) * 100).toFixed(1) : 0,
        },
        approved: {
          byTeamlead: approvedByTeamleadCount,
          byFinance: approvedByFinanceCount,
          total: approvedByTeamleadCount + approvedByFinanceCount,
        },
      },
    },
  };
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
  departmentId,
}) => {
  try {
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

    console.log(query);

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
  } catch (error) {
    console.error(error);
  }
};

/**
 * Оновлює деталі заявки на поповнення агента
 * @param {number} requestId - ID запиту
 * @param {Object} updateData - Дані для оновлення
 * @returns {Promise<Object>} Оновлений запит з деталями
 */
const updateAgentRefillRequest = async (requestId, updateData) => {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Перевіряємо, чи існує запит та чи він типу agent_refill
    const requestCheck = await client.query(
      `SELECT * FROM requests WHERE id = $1 AND request_type = 'agent_refill'`,
      [requestId]
    );

    if (requestCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // Формуємо SET частину запиту
    const setClauses = [];
    const params = [requestId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updateData)) {
      if (
        [
          "amount",
          "server",
          "wallet_address",
          "network",
          "transaction_hash",
          "fee",
        ].includes(key)
      ) {
        setClauses.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    setClauses.push("updated_at = NOW()");

    // Оновлюємо деталі
    const updateQuery = `
      UPDATE agent_refill_requests
      SET ${setClauses.join(", ")}
      WHERE request_id = $1
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, params);

    // Оновлюємо updated_at у запиті
    await client.query(`UPDATE requests SET updated_at = NOW() WHERE id = $1`, [
      requestId,
    ]);

    await client.query("COMMIT");

    // Отримуємо повний запит з оновленими деталями
    return {
      ...requestCheck.rows[0],
      updated_at: new Date(),
      details: updateResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Оновлює деталі заявки на витрати
 * @param {number} requestId - ID запиту
 * @param {Object} updateData - Дані для оновлення
 * @returns {Promise<Object>} Оновлений запит з деталями
 */
const updateExpenseRequest = async (requestId, updateData) => {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Перевіряємо, чи існує запит та чи він типу expenses
    const requestCheck = await client.query(
      `SELECT * FROM requests WHERE id = $1 AND request_type = 'expenses'`,
      [requestId]
    );

    if (requestCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // Формуємо SET частину запиту
    const setClauses = [];
    const params = [requestId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updateData)) {
      if (
        [
          "purpose",
          "seller_service",
          "amount",
          "network",
          "wallet_address",
          "need_transaction_time",
          "transaction_time",
          "need_transaction_hash",
          "transaction_hash",
          "expense_type_id",
        ].includes(key)
      ) {
        setClauses.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    setClauses.push("updated_at = NOW()");

    // Оновлюємо деталі
    const updateQuery = `
      UPDATE expense_requests
      SET ${setClauses.join(", ")}
      WHERE request_id = $1
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, params);

    // Оновлюємо updated_at у запиті
    await client.query(`UPDATE requests SET updated_at = NOW() WHERE id = $1`, [
      requestId,
    ]);

    await client.query("COMMIT");

    // Отримуємо повний запит з оновленими деталями
    return {
      ...requestCheck.rows[0],
      updated_at: new Date(),
      details: updateResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Оновлює статус запиту
 * @param {number} requestId - ID запиту
 * @param {string} newStatus - Новий статус
 * @param {Object} options - Додаткові опції
 * @param {number} [options.teamleadId] - ID тімліда (при схваленні/відхиленні тімлідом)
 * @param {number} [options.financeManagerId] - ID фінанс менеджера (при схваленні/відхиленні фінансистом)
 * @returns {Promise<Object>} Оновлений запит
 */
const updateRequestStatus = async (requestId, newStatus, options = {}) => {
  const setClauses = ["status = $1", "updated_at = NOW()"];
  const params = [newStatus, requestId];
  let paramIndex = 3;

  // Додаємо ID тімліда при схваленні/відхиленні тімлідом
  if (
    ["approved_by_teamlead", "rejected_by_teamlead"].includes(newStatus) &&
    options.teamleadId
  ) {
    setClauses.push(`teamlead_id = $${paramIndex++}`);
    params.splice(2, 0, options.teamleadId);
  }

  // Додаємо ID фінанс менеджера при схваленні/відхиленні фінансистом
  if (
    ["approved_by_finance", "rejected_by_finance", "completed"].includes(
      newStatus
    ) &&
    options.financeManagerId
  ) {
    setClauses.push(`finance_manager_id = $${paramIndex++}`);
    params.splice(options.teamleadId ? 3 : 2, 0, options.financeManagerId);
  }

  const query = `
    UPDATE requests
    SET ${setClauses.join(", ")}
    WHERE id = $2
    RETURNING *
  `;

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

/**
 * Видаляє запит з бази даних разом із пов'язаними даними
 * @param {number} requestId - ID запиту
 * @returns {Promise<boolean>} Результат операції
 */
const deleteRequest = async (requestId) => {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Спочатку визначаємо тип запиту
    const requestQuery = `
      SELECT request_type FROM requests WHERE id = $1
    `;
    const requestResult = await client.query(requestQuery, [requestId]);

    if (requestResult.rows.length === 0) {
      // Запит не знайдено
      await client.query("ROLLBACK");
      return false;
    }

    const requestType = requestResult.rows[0].request_type;

    // Видаляємо деталі відповідно до типу запиту
    if (requestType === "expenses") {
      await client.query(
        `
        DELETE FROM expense_requests 
        WHERE request_id = $1
      `,
        [requestId]
      );
    } else if (requestType === "agent_refill") {
      await client.query(
        `
        DELETE FROM agent_refill_requests 
        WHERE request_id = $1
      `,
        [requestId]
      );
    }

    // Видаляємо сам запит
    const result = await client.query(
      `
      DELETE FROM requests
      WHERE id = $1
      RETURNING id
    `,
      [requestId]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  //STATISTICS
  getMonthlyExpenseSummary,
  getWeeklyExpenseSummary,
  getDepartmentExpenseStats,
  getFinanceManagerStats,
  getStatistics,
  getRequestTypeSummary,

  // GENERAL
  getAllRequests,
  getRequestById,
  getAllAgentRefills,
  getAllExpenses,
  updateAgentRefillRequest,
  updateExpenseRequest,
  updateRequestStatus,
  deleteRequest,
};
