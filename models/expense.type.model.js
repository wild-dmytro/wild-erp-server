const db = require("../config/db");

/**
 * Отримує список всіх типів витрат
 * @param {boolean} [onlyActive=false] - Повертати тільки активні типи
 * @param {number} [departmentId] - ID відділу для фільтрації
 * @returns {Promise<Array>} Масив типів витрат
 */
const getAllExpenseTypes = async (onlyActive = false, departmentId = null) => {
  try {
    let query = `
      SELECT * FROM expense_types
      WHERE 1=1
      ${onlyActive ? ' AND is_active = true' : ''}
      ${departmentId ? ' AND department_id = $1' : ''}
      ORDER BY name
    `;
    
    const params = departmentId ? [departmentId] : [];
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error("Error in getAllExpenseTypes:", error);
    throw error;
  }
};

/**
 * Отримує тип витрати за ID
 * @param {number} id - ID типу витрати
 * @returns {Promise<Object|null>} Об'єкт типу витрати або null
 */
const getExpenseTypeById = async (id) => {
  try {
    const query = `
      SELECT * FROM expense_types WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error in getExpenseTypeById:", error);
    throw error;
  }
};

/**
 * Отримує тип витрати за назвою та department_id
 * @param {string} name - Назва типу витрати
 * @param {number} departmentId - ID відділу
 * @returns {Promise<Object|null>} Об'єкт типу витрати або null
 */
const getExpenseTypeByName = async (name, departmentId) => {
  try {
    const query = `
      SELECT * FROM expense_types WHERE name = $1 AND department_id = $2
    `;
    
    const result = await db.query(query, [name, departmentId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error in getExpenseTypeByName:", error);
    throw error;
  }
};

/**
 * Створює новий тип витрати
 * @param {string} name - Назва типу витрати
 * @param {string} [description] - Опис типу витрати
 * @param {number} departmentId - ID відділу
 * @returns {Promise<Object>} Об'єкт створеного типу витрати
 */
const createExpenseType = async (name, description = '', departmentId) => {
  try {
    const query = `
      INSERT INTO expense_types (name, description, department_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const result = await db.query(query, [name, description, departmentId]);
    return result.rows[0];
  } catch (error) {
    console.error("Error in createExpenseType:", error);
    throw error;
  }
};

/**
 * Оновлює дані типу витрати
 * @param {number} id - ID типу витрати
 * @param {string} name - Нова назва типу витрати
 * @param {string} description - Новий опис типу витрати
 * @param {number} departmentId - Новий ID відділу
 * @returns {Promise<Object|null>} Оновлений об'єкт типу витрати або null
 */
const updateExpenseType = async (id, name, description, departmentId) => {
  try {
    const query = `
      UPDATE expense_types
      SET name = $1, description = $2, department_id = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    
    const result = await db.query(query, [name, description, departmentId, id]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error in updateExpenseType:", error);
    throw error;
  }
};

/**
 * Оновлює статус активності типу витрати
 * @param {number} id - ID типу витрати
 * @param {boolean} isActive - Новий статус активності
 * @returns {Promise<Object|null>} Оновлений об'єкт типу витрати або null
 */
const updateExpenseTypeStatus = async (id, isActive) => {
  try {
    const query = `
      UPDATE expense_types
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [isActive, id]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error in updateExpenseTypeStatus:", error);
    throw error;
  }
};

/**
 * Видаляє тип витрати
 * @param {number} id - ID типу витрати
 * @returns {Promise<boolean>} Результат видалення
 */
const deleteExpenseType = async (id) => {
  try {
    const query = `
      DELETE FROM expense_types
      WHERE id = $1
      RETURNING id
    `;
    
    const result = await db.query(query, [id]);
    return result.rows.length > 0;
  } catch (error) {
    console.error("Error in deleteExpenseType:", error);
    throw error;
  }
};

/**
 * Перевіряє, чи використовується тип витрати в заявках
 * @param {number} id - ID типу витрати
 * @returns {Promise<boolean>} true якщо використовується, false якщо ні
 */
const isExpenseTypeUsed = async (id) => {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM expense_requests
      WHERE expense_type_id = $1
    `;
    
    const result = await db.query(query, [id]);
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error("Error in isExpenseTypeUsed:", error);
    throw error;
  }
};

/**
 * Отримує кількість заявок для кожного типу витрати
 * @param {number} [departmentId] - ID відділу для фільтрації
 * @returns {Promise<Array>} Масив об'єктів з типами та їх кількістю
 */
const getExpenseTypeStats = async (departmentId = null) => {
  try {
    let query = `
      SELECT 
        et.id,
        et.name,
        et.department_id,
        COUNT(er.id) as request_count,
        COALESCE(SUM(er.amount), 0) as total_amount
      FROM 
        expense_types et
      LEFT JOIN 
        expense_requests er ON et.id = er.expense_type_id
      WHERE 1=1
      ${departmentId ? ' AND et.department_id = $1' : ''}
      GROUP BY 
        et.id, et.name, et.department_id
      ORDER BY 
        total_amount DESC
    `;
    
    const params = departmentId ? [departmentId] : [];
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error("Error in getExpenseTypeStats:", error);
    throw error;
  }
};

module.exports = {
  getAllExpenseTypes,
  getExpenseTypeById,
  getExpenseTypeByName,
  createExpenseType,
  updateExpenseType,
  updateExpenseTypeStatus,
  deleteExpenseType,
  isExpenseTypeUsed,
  getExpenseTypeStats,
};