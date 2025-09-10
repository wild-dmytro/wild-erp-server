const db = require("../config/db");

/**
 * Отримує список всіх команд з фільтрацією
 * @param {Object} options - Об'єкт з параметрами фільтрації
 * @param {boolean} options.isBuying - Фільтр для медіабаїнгових команд
 * @param {number} options.departmentId - ID відділу для фільтрації
 * @returns {Promise<Array>} Масив команд
 */
const getAllTeams = async (options = {}) => {
  // Підтримуємо як старий формат виклику (тільки з boolean), так і новий (з об'єктом)
  let isBuying, departmentId;

  if (typeof options === "boolean") {
    // Старий формат виклику: getAllTeams(true/false)
    isBuying = options;
    departmentId = null;
  } else {
    // Новий формат виклику: getAllTeams({ isBuying: true, departmentId: 1 })
    isBuying = options.isBuying;
    departmentId = options.departmentId;
  }

  let query = `
    SELECT t.*, d.name as department_name
    FROM teams t
  `;

  const conditions = [];
  const params = [];
  let paramIndex = 1;
  let needsJoin = false;

  // Якщо потрібно фільтрувати по медіабаїнговим командам або по відділу, додаємо JOIN
  if (isBuying === true || departmentId) {
    query += ` LEFT JOIN departments d ON t.department_id = d.id`;
    needsJoin = true;
  } else {
    query += ` LEFT JOIN departments d ON t.department_id = d.id`;
  }

  // Фільтр для медіабаїнгових команд
  if (isBuying === true) {
    conditions.push(`d.type = $${paramIndex++}`);
    params.push("buying");
  }

  // Фільтр по ID відділу
  if (departmentId) {
    conditions.push(`t.department_id = $${paramIndex++}`);
    params.push(departmentId);
  }

  // Додаємо WHERE clause якщо є умови
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += ` ORDER BY t.name`;

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
        message:
          "Неможливо видалити команду, оскільки до неї призначені користувачі",
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
        message: "Неможливо видалити команду, оскільки з нею пов'язані запити",
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
      message:
        result.rows.length > 0
          ? "Команду успішно видалено"
          : "Команду не знайдено",
    };
  } catch (error) {
    console.error("Error deleting team:", error);
    return {
      success: false,
      message: "Помилка при видаленні команди",
      error: error.message,
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
  getTeamLead,
};
