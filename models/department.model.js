const db = require("../config/db");

/**
 * Отримує список всіх відділів
 * @param {boolean} [onlyActive=false] - Повертати тільки активні відділи
 * @returns {Promise<Array>} Масив відділів
 */
const getAllDepartments = async (onlyActive = false) => {
  let query = `
    SELECT * FROM departments
  `;
  
  if (onlyActive) {
    query += ` WHERE is_active = true`;
  }
  
  query += ` ORDER BY name`;
  
  const result = await db.query(query);
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
const createDepartment = async ({ name, description = '' }) => {
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
 * Отримує структуру відділів та користувачів (ієрархію)
 * @param {boolean} [onlyActive=true] - Включати тільки активні відділи та користувачів
 * @returns {Promise<Array>} Масив з ієрархією відділів та користувачів
 */
const getDepartmentsStructure = async (onlyActive = true) => {
  let query = `
    SELECT 
      d.id as department_id,
      d.name as department_name,
      d.description as department_description,
      d.is_active as department_is_active,
      u.id as user_id,
      u.username,
      u.first_name,
      u.last_name,
      u.role,
      u.is_active as user_is_active
    FROM 
      departments d
    LEFT JOIN 
      users u ON d.id = u.department_id
  `;
  
  if (onlyActive) {
    query += ` WHERE d.is_active = true`;
    if (onlyActive) {
      query += ` AND (u.id IS NULL OR u.is_active = true)`;
    }
  }
  
  query += ` ORDER BY d.name, u.role DESC, u.first_name, u.last_name`;
  
  const result = await db.query(query);
  
  // Структуруємо дані в ієрархічний формат
  const structure = [];
  const departmentsMap = {};
  
  result.rows.forEach(row => {
    const departmentId = row.department_id;
    
    // Якщо відділ ще не додано в структуру
    if (!departmentsMap[departmentId]) {
      departmentsMap[departmentId] = {
        id: departmentId,
        name: row.department_name,
        description: row.department_description,
        is_active: row.department_is_active,
        users: []
      };
      
      structure.push(departmentsMap[departmentId]);
    }
    
    // Додаємо користувача до відділу, якщо він є
    if (row.user_id) {
      departmentsMap[departmentId].users.push({
        id: row.user_id,
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
        is_active: row.user_is_active
      });
    }
  });
  
  return structure;
};

/**
 * Отримує статистику по відділах
 * @returns {Promise<Object>} Статистика відділів
 */
const getDepartmentsStats = async () => {
  const query = `
    SELECT
      COUNT(*) as total_departments,
      SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_departments,
      SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END) as inactive_departments
    FROM 
      departments
  `;
  
  const userDistributionQuery = `
    SELECT 
      d.id,
      d.name,
      COUNT(u.id) as user_count
    FROM 
      departments d
    LEFT JOIN 
      users u ON d.id = u.department_id
    GROUP BY 
      d.id, d.name
    ORDER BY 
      user_count DESC
  `;
  
  const result = await db.query(query);
  const userDistribution = await db.query(userDistributionQuery);
  
  return {
    summary: result.rows[0],
    userDistribution: userDistribution.rows
  };
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
        message: "Неможливо видалити відділ, оскільки до нього призначені користувачі"
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
      message: result.rows.length > 0 ? "Відділ успішно видалено" : "Відділ не знайдено"
    };
  } catch (error) {
    console.error("Error deleting department:", error);
    return {
      success: false,
      message: "Помилка при видаленні відділу",
      error: error.message
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
  getDepartmentsStructure,
  getDepartmentsStats,
  deleteDepartment
};