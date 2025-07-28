const db = require("../config/db");

/**
 * Отримує список всіх команд
 * @param {boolean} isBuying - Фільтр для медіабаїнгових команд
 * @returns {Promise<Array>} Масив команд
 */
const getAllTeams = async (isBuying = null) => {
  let query = `
    SELECT t.* 
    FROM teams t
  `;
  
  const params = [];
  
  // Якщо потрібно фільтрувати по медіабаїнговим командам
  if (isBuying === true) {
    query += `
    JOIN departments d ON t.department_id = d.id
    WHERE d.type = $1
    `;
    params.push('buying');
  }
  
  query += `
    ORDER BY t.name
  `;
  
  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Отримує команду за ID
 * @param {number} id - ID команди
 * @returns {Promise<Object|null>} Об'єкт команди або null
 */
const getTeamById = async (id) => {
  const query = `
    SELECT 
      t.*, 
      d.name as department_name
    FROM teams t
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE t.id = $1
  `;
  
  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Отримує команду за назвою
 * @param {string} name - Назва команди
 * @returns {Promise<Object|null>} Об'єкт команди або null
 */
const getTeamByName = async (name) => {
  const query = `
    SELECT * FROM teams WHERE name = $1
  `;
  
  const result = await db.query(query, [name]);
  return result.rows[0] || null;
};

/**
 * Створює нову команду
 * @param {string} name - Назва команди
 * @returns {Promise<Object>} Об'єкт створеної команди
 */
const createTeam = async (name) => {
  const query = `
    INSERT INTO teams (name)
    VALUES ($1)
    RETURNING *
  `;
  
  const result = await db.query(query, [name]);
  return result.rows[0];
};

/**
 * Оновлює назву команди
 * @param {number} id - ID команди
 * @param {string} name - Нова назва команди
 * @returns {Promise<Object|null>} Оновлений об'єкт команди або null
 */
const updateTeam = async (id, name) => {
  const query = `
    UPDATE teams
    SET name = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;
  
  const result = await db.query(query, [name, id]);
  return result.rows[0] || null;
};

/**
 * Видаляє команду (якщо немає користувачів у ній)
 * @param {number} id - ID команди
 * @returns {Promise<Object>} Результат видалення
 */
const deleteTeam = async (id) => {
  try {
    // Спочатку перевіряємо наявність користувачів у команді
    const userCountQuery = `
      SELECT COUNT(*) as user_count
      FROM users
      WHERE team_id = $1
    `;
    
    const userCountResult = await db.query(userCountQuery, [id]);
    const userCount = parseInt(userCountResult.rows[0].user_count);
    
    if (userCount > 0) {
      return {
        success: false,
        message: "Неможливо видалити команду, оскільки до неї призначені користувачі"
      };
    }
    
    // Перевіряємо наявність запитів, пов'язаних з командою
    const requestCountQuery = `
      SELECT COUNT(*) as request_count
      FROM requests
      WHERE team_id = $1
    `;
    
    const requestCountResult = await db.query(requestCountQuery, [id]);
    const requestCount = parseInt(requestCountResult.rows[0].request_count);
    
    if (requestCount > 0) {
      return {
        success: false,
        message: "Неможливо видалити команду, оскільки з нею пов'язані запити"
      };
    }
    
    // Видаляємо команду
    const query = `
      DELETE FROM teams
      WHERE id = $1
      RETURNING id
    `;
    
    const result = await db.query(query, [id]);
    
    return {
      success: result.rows.length > 0,
      message: result.rows.length > 0 ? "Команду успішно видалено" : "Команду не знайдено"
    };
  } catch (error) {
    console.error("Error deleting team:", error);
    return {
      success: false,
      message: "Помилка при видаленні команди",
      error: error.message
    };
  }
};

/**
 * Отримує кількість користувачів у команді
 * @param {number} teamId - ID команди
 * @returns {Promise<number>} Кількість користувачів
 */
const getUserCountInTeam = async (teamId) => {
  const query = `
    SELECT COUNT(*) as user_count
    FROM users
    WHERE team_id = $1
  `;
  
  const result = await db.query(query, [teamId]);
  return parseInt(result.rows[0].user_count);
};

/**
 * Отримує тімліда команди
 * @param {number} teamId - ID команди
 * @returns {Promise<Object|null>} Об'єкт тімліда або null
 */
const getTeamLead = async (teamId) => {
  const query = `
    SELECT *
    FROM users
    WHERE team_id = $1 AND role = 'teamlead' AND is_active = true
    LIMIT 1
  `;
  
  const result = await db.query(query, [teamId]);
  return result.rows[0] || null;
};

/**
 * Отримує статистику команди за певний період
 * @param {number} teamId - ID команди
 * @param {Date} startDate - Початкова дата
 * @param {Date} endDate - Кінцева дата
 * @returns {Promise<Object>} Статистика команди
 */
const getTeamStats = async (teamId, startDate, endDate) => {
  // Перетворення дат у формат ISO для SQL запиту
  const startDateISO = startDate ? startDate.toISOString() : null;
  const endDateISO = endDate ? endDate.toISOString() : null;
  
  // Запит для отримання статистики по запитах
  const requestsStatsQuery = `
    SELECT
      COUNT(*) as total_requests,
      SUM(CASE WHEN r.request_type = 'agent_refill' THEN 1 ELSE 0 END) as agent_refill_count,
      SUM(CASE WHEN r.request_type = 'expenses' THEN 1 ELSE 0 END) as expenses_count,
      SUM(CASE WHEN r.status = 'approved_by_finance' OR r.status = 'completed' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN r.status = 'rejected_by_teamlead' OR r.status = 'rejected_by_finance' THEN 1 ELSE 0 END) as rejected_count
    FROM
      requests r
    JOIN
      users u ON r.user_id = u.id
    WHERE
      u.team_id = $1
      ${startDateISO ? 'AND r.created_at >= $2' : ''}
      ${endDateISO ? `AND r.created_at <= $${startDateISO ? '3' : '2'}` : ''}
  `;
  
  // Параметри для запиту
  const requestsStatsParams = [teamId];
  if (startDateISO) requestsStatsParams.push(startDateISO);
  if (endDateISO) requestsStatsParams.push(endDateISO);
  
  // Запит для отримання сум поповнень та витрат
  const amountsStatsQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN r.request_type = 'agent_refill' AND (r.status = 'approved_by_finance' OR r.status = 'completed') THEN ar.amount ELSE 0 END), 0) as total_agent_refill,
      COALESCE(SUM(CASE WHEN r.request_type = 'expenses' AND (r.status = 'approved_by_finance' OR r.status = 'completed') THEN er.amount ELSE 0 END), 0) as total_expenses
    FROM
      requests r
    JOIN
      users u ON r.user_id = u.id
    LEFT JOIN
      agent_refill_requests ar ON r.id = ar.request_id AND r.request_type = 'agent_refill'
    LEFT JOIN
      expense_requests er ON r.id = er.request_id AND r.request_type = 'expenses'
    WHERE
      u.team_id = $1
      ${startDateISO ? 'AND r.created_at >= $2' : ''}
      ${endDateISO ? `AND r.created_at <= $${startDateISO ? '3' : '2'}` : ''}
  `;
  
  // Параметри для запиту сум (ті ж самі, що і для першого запиту)
  const amountsStatsParams = [...requestsStatsParams];
  
  // Виконання запитів
  const requestsStatsResult = await db.query(requestsStatsQuery, requestsStatsParams);
  const amountsStatsResult = await db.query(amountsStatsQuery, amountsStatsParams);
  
  // Отримання кількості активних користувачів у команді
  const activeUsersCountQuery = `
    SELECT COUNT(*) as active_users_count
    FROM users
    WHERE team_id = $1 AND is_active = true
  `;
  
  const activeUsersCountResult = await db.query(activeUsersCountQuery, [teamId]);
  
  // Формування результату
  return {
    requests: requestsStatsResult.rows[0],
    amounts: amountsStatsResult.rows[0],
    activeUsersCount: parseInt(activeUsersCountResult.rows[0].active_users_count)
  };
};

/**
 * Отримує всі команди з детальною інформацією (користувачі, тімлід)
 * @returns {Promise<Array>} Масив команд з детальною інформацією
 */
const getTeamsWithDetails = async () => {
  // Спочатку отримуємо всі команди
  const teams = await getAllTeams();
  
  // Для кожної команди отримуємо додаткову інформацію
  const teamsWithDetails = await Promise.all(teams.map(async (team) => {
    // Отримуємо тімліда
    const teamLead = await getTeamLead(team.id);
    
    // Отримуємо кількість користувачів
    const userCount = await getUserCountInTeam(team.id);
    
    // Повертаємо розширені дані
    return {
      ...team,
      teamLead: teamLead ? {
        id: teamLead.id,
        username: teamLead.username,
        first_name: teamLead.first_name,
        last_name: teamLead.last_name
      } : null,
      userCount
    };
  }));
  
  return teamsWithDetails;
};

module.exports = {
  getAllTeams,
  getTeamById,
  getTeamByName,
  createTeam,
  updateTeam,
  deleteTeam,
  getUserCountInTeam,
  getTeamLead,
  getTeamStats,
  getTeamsWithDetails
};