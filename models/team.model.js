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

module.exports = {
  getAllTeams,
  getTeamById,
  getTeamByName,
  createTeam,
  updateTeam,
  deleteTeam,
  getUserCountInTeam,
  getTeamLead
};