const db = require("../config/db");

/**
 * Отримує список всіх відділів
 * @param {boolean} [onlyActive=false] - Повертати тільки активні відділи
 * @param {boolean} [isBuying=false] - Повертати тільки медіабаїнгові відділи
 * @returns {Promise<Array>} Масив відділів
 */
const getAllDepartments = async (onlyActive = false, isBuying = false) => {
  let query = `SELECT * FROM departments`;
  const conditions = [];
  const params = [];

  if (onlyActive) {
    params.push(true);
    conditions.push(`is_active = $${params.length}`);
  }

  if (isBuying) {
    params.push("buying");
    conditions.push(`type = $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += ` ORDER BY name`;

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Отримує відділ за ID
 * @param {number} id - ID відділу
 * @returns {Promise<Object|null>} Об'єкт відділу або null
 */
const getDepartmentById = async (id) => {
  const query = `
    SELECT * FROM departments WHERE id = $1
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Отримує відділ за назвою
 * @param {string} name - Назва відділу
 * @returns {Promise<Object|null>} Об'єкт відділу або null
 */
const getDepartmentByName = async (name) => {
  const query = `
    SELECT * FROM departments WHERE name = $1
  `;

  const result = await db.query(query, [name]);
  return result.rows[0] || null;
};

/**
 * Створює новий відділ
 * @param {Object} departmentData - Дані нового відділу
 * @param {string} departmentData.name - Назва відділу
 * @param {string} [departmentData.description] - Опис відділу
 * @returns {Promise<Object>} Об'єкт створеного відділу
 */
const createDepartment = async ({ name, description = "" }) => {
  const query = `
    INSERT INTO departments (name, description)
    VALUES ($1, $2)
    RETURNING *
  `;

  const result = await db.query(query, [name, description]);
  return result.rows[0];
};

/**
 * Оновлює дані відділу
 * @param {number} id - ID відділу
 * @param {Object} departmentData - Дані для оновлення
 * @returns {Promise<Object|null>} Оновлений об'єкт відділу або null
 */
const updateDepartment = async (id, { name, description }) => {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(name);
  }

  if (description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(description);
  }

  if (setClauses.length === 0) {
    return null;
  }

  // Додаємо updated_at
  setClauses.push(`updated_at = NOW()`);

  // Додаємо ID відділу
  values.push(id);

  const query = `
    UPDATE departments
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await db.query(query, values);
  return result.rows[0] || null;
};

/**
 * Деактивує відділ (встановлює is_active = false)
 * @param {number} id - ID відділу
 * @returns {Promise<Object|null>} Оновлений об'єкт відділу або null
 */
const deactivateDepartment = async (id) => {
  const query = `
    UPDATE departments
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Активує відділ (встановлює is_active = true)
 * @param {number} id - ID відділу
 * @returns {Promise<Object|null>} Оновлений об'єкт відділу або null
 */
const activateDepartment = async (id) => {
  const query = `
    UPDATE departments
    SET is_active = true, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Отримує кількість користувачів у відділі
 * @param {number} departmentId - ID відділу
 * @returns {Promise<number>} Кількість користувачів
 */
const getUserCountInDepartment = async (departmentId) => {
  const query = `
    SELECT COUNT(*) as user_count
    FROM users
    WHERE department_id = $1
  `;

  const result = await db.query(query, [departmentId]);
  return parseInt(result.rows[0].user_count);
};

/**
 * Видаляє відділ (якщо немає користувачів у ньому)
 * @param {number} id - ID відділу
 * @returns {Promise<boolean>} Результат видалення
 */
const deleteDepartment = async (id) => {
  try {
    // Спочатку перевіряємо наявність користувачів у відділі
    const userCount = await getUserCountInDepartment(id);

    if (userCount > 0) {
      return {
        success: false,
        message:
          "Неможливо видалити відділ, оскільки до нього призначені користувачі",
      };
    }

    // Видаляємо відділ
    const query = `
      DELETE FROM departments
      WHERE id = $1
      RETURNING id
    `;

    const result = await db.query(query, [id]);

    return {
      success: result.rows.length > 0,
      message:
        result.rows.length > 0
          ? "Відділ успішно видалено"
          : "Відділ не знайдено",
    };
  } catch (error) {
    console.error("Error deleting department:", error);
    return {
      success: false,
      message: "Помилка при видаленні відділу",
      error: error.message,
    };
  }
};

module.exports = {
  getAllDepartments,
  getDepartmentById,
  getDepartmentByName,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  activateDepartment,
  getUserCountInDepartment,
  deleteDepartment,
};
