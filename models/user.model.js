const db = require("../config/db");
const bcrypt = require("bcryptjs");

/**
 * Знаходить користувача за ідентифікатором
 * @param {number} id - Ідентифікатор користувача
 * @returns {Promise<Object|null>} Користувач або null, якщо не знайдено
 */
const findById = async (id) => {
  const result = await db.query(
    `SELECT 
        u.*, d.name as department_name, t.name as team_name 
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE u.id = $1`,
    [id]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Знаходить користувача за ім'ям користувача або email
 * @param {string} usernameOrEmail - Ім'я користувача або email
 * @returns {Promise<Object|null>} Користувач або null, якщо не знайдено
 */
const findByUsernameOrEmail = async (usernameOrEmail) => {
  const result = await db.query(
    "SELECT * FROM users WHERE username = $1 OR email = $1",
    [usernameOrEmail]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Перевіряє авторизаційні дані користувача
 * @param {string} usernameOrEmail - Ім'я користувача або email
 * @param {string} password - Пароль для перевірки
 * @returns {Promise<Object|null>} Користувач без пароля або null
 */
const authenticate = async (usernameOrEmail, password) => {
  // Отримання користувача
  const user = await findByUsernameOrEmail(usernameOrEmail);

  if (!user || !user.is_active) {
    return null;
  }

  // Перевірка пароля
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return null;
  }

  // Видалення пароля з результату
  const { password: userPassword, ...userWithoutPassword } = user;

  return userWithoutPassword;
};

/**
 * Отримує список користувачів з фільтрацією та пагінацією
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {number} options.page - Номер сторінки
 * @param {number} options.limit - Кількість записів на сторінку
 * @param {string} [options.role] - Фільтр за роллю користувача
 * @param {boolean} [options.isActive] - Фільтр за статусом активності
 * @param {number} [options.teamId] - Фільтр за ID команди
 * @param {number} [options.departmentId] - Фільтр за ID відділу
 * @param {string} [options.search] - Пошуковий запит (ім'я, прізвище, username)
 * @param {string} [options.sortBy="id"] - Поле для сортування
 * @param {string} [options.sortOrder="asc"] - Порядок сортування (asc/desc)
 * @param {boolean} [options.isBuyer] - Фільтр за типом відділу
 * @returns {Promise<Object>} Об'єкт з користувачами та загальною кількістю записів
 */
const getAllUsers = async ({
  page = 1,
  limit = 10,
  role,
  isActive,
  teamId,
  departmentId,
  search,
  sortBy = "id",
  sortOrder = "asc",
  isBuyer,
}) => {
  // Побудова WHERE умов
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (role) {
    conditions.push(`u.role = $${paramIndex++}`);
    params.push(role);
  }

  if (isActive !== undefined) {
    conditions.push(`u.is_active = $${paramIndex++}`);
    params.push(isActive);
  }

  if (teamId) {
    conditions.push(`u.team_id = $${paramIndex++}`);
    params.push(teamId);
  }

  if (departmentId) {
    conditions.push(`u.department_id = $${paramIndex++}`);
    params.push(departmentId);
  }

  if (search) {
    conditions.push(`(
      u.username ILIKE $${paramIndex} OR 
      u.first_name ILIKE $${paramIndex} OR 
      u.last_name ILIKE $${paramIndex}
    )`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (isBuyer) {
    conditions.push(`d.type = 'buying'`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Визначаємо чи потрібен JOIN з departments
  const needsDepartmentJoin = isBuyer || departmentId;
  const departmentJoin = needsDepartmentJoin
    ? `LEFT JOIN departments d ON u.department_id = d.id`
    : "";

  // Валідація полів сортування
  const allowedSortFields = [
    "id",
    "username",
    "first_name",
    "last_name",
    "role",
    "created_at",
  ];
  const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : "id";
  const validSortOrder = sortOrder.toLowerCase() === "desc" ? "DESC" : "ASC";

  // Запит для отримання загальної кількості записів
  const countQuery = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE u.is_active = true) as total_active
    FROM users u
    ${departmentJoin}
    ${whereClause}
  `;

  // Запит для отримання ВСІХ користувачів без пагінації (для правильного сортування)
  const usersQuery = `
    SELECT 
      u.id,
      u.telegram_id,
      u.username,
      u.first_name,
      u.last_name,
      u.role,
      u.team_id,
      t.name as team_name,
      u.department_id,
      d.name as department_name,
      d.type as department_type,
      u.is_active,
      u.table_id,
      u.created_at,
      u.updated_at,
      u.position,
      u.email,
      u.phone,
      u.sub_id,
      u.description,
    FROM 
      users u
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      departments d ON u.department_id = d.id
    ${whereClause}
    ORDER BY 
      u.${validSortBy} ${validSortOrder}
  `;

  try {
    // Виконання запитів
    const countResult = await db.query(countQuery, params);
    const usersResult = await db.query(usersQuery, params);

    // JavaScript сортування: розділяємо на групи
    const allUsers = usersResult.rows;

    // Розділяємо на активних та неактивних
    const activeUsers = allUsers.filter((user) => user.is_active === true);
    const inactiveUsers = allUsers.filter((user) => user.is_active === false);

    // Об'єднуємо: спочатку активні, потім неактивні
    const sortedUsers = [...activeUsers, ...inactiveUsers];

    // Застосовуємо пагінацію до відсортованого списку
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = sortedUsers.slice(startIndex, endIndex);

    return {
      users: paginatedUsers,
      total: parseInt(countResult.rows[0].total),
      totalActive: parseInt(countResult.rows[0].total_active),
    };
  } catch (error) {
    console.error("Помилка при отриманні користувачів:", error);
    throw error;
  }
};

/**
 * Отримує користувача за ID
 * @param {number} id - ID користувача
 * @returns {Promise<Object|null>} Об'єкт користувача або null
 */
const getUserById = async (id) => {
  const query = `
    SELECT * FROM users WHERE id = $1
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Отримує користувача за Telegram ID
 * @param {number} telegramId - Telegram ID користувача
 * @returns {Promise<Object|null>} Об'єкт користувача або null
 */
const getUserByTelegramId = async (telegramId) => {
  const query = `
    SELECT * FROM users WHERE telegram_id = $1
  `;

  const result = await db.query(query, [telegramId]);
  return result.rows[0] || null;
};

/**
 * Отримує детальну інформацію про користувача з даними команди та відділу
 * @param {number} id - ID користувача
 * @returns {Promise<Object|null>} Об'єкт користувача з деталями або null
 */
const getUserWithDetails = async (id) => {
  const query = `
    SELECT 
      u.*,
      t.name as team_name,
      d.name as department_name,
      d.description as department_description
    FROM 
      users u
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      departments d ON u.department_id = d.id
    WHERE 
      u.id = $1
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Створює нового користувача
 * @param {Object} userData - Дані нового користувача
 * @returns {Promise<Object>} Об'єкт створеного користувача
 */
const createUser = async ({
  telegram_id,
  username,
  first_name,
  last_name,
  role,
  team_id,
  department_id,
  table_id,
  email,
  position,
  phone,
  sub_id,
  description,
}) => {
  const query = `
    INSERT INTO users (
      telegram_id, 
      username, 
      first_name, 
      last_name, 
      role, 
      team_id, 
      department_id,
      table_id,
      email,
      positio,
      phone,
      sub_id,
      description,
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;

  const values = [
    telegram_id,
    username,
    first_name,
    last_name,
    role,
    team_id,
    department_id,
    table_id,
    email,
    position,
    phone,
    sub_id,
    description,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
};

/**
 * Оновлює дані користувача
 * @param {number} id - ID користувача
 * @param {Object} userData - Дані для оновлення
 * @returns {Promise<Object|null>} Оновлений об'єкт користувача або null
 */
const updateUser = async (id, userData) => {
  // Визначення полів, які можна оновити
  const allowedFields = [
    "username",
    "first_name",
    "last_name",
    "table_id",
    "department_id",
    "team_id",
    "role",
    "is_active",
    "email",
    "position",
    "phone",
    "sub_id",
    "description",
  ];

  // Фільтрація даних
  const updateData = {};
  allowedFields.forEach((field) => {
    if (userData[field] !== undefined) {
      updateData[field] = userData[field];
    }
  });

  if (Object.keys(updateData).length === 0) {
    return null;
  }

  // Побудова запиту
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  Object.entries(updateData).forEach(([key, value]) => {
    setClauses.push(`${key} = $${paramIndex++}`);
    values.push(value);
  });

  // Додаємо updated_at
  setClauses.push(`updated_at = NOW()`);

  // Додаємо ID користувача
  values.push(id);

  const query = `
    UPDATE users
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await db.query(query, values);
  return result.rows[0] || null;
};

/**
 * Деактивує користувача (встановлює is_active = false)
 * @param {number} id - ID користувача
 * @returns {Promise<Object|null>} Оновлений об'єкт користувача або null
 */
const deactivateUser = async (id) => {
  const query = `
    UPDATE users
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Активує користувача (встановлює is_active = true)
 * @param {number} id - ID користувача
 * @returns {Promise<Object|null>} Оновлений об'єкт користувача або null
 */
const activateUser = async (id) => {
  const query = `
    UPDATE users
    SET is_active = true, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Оновлює роль користувача
 * @param {number} userId - ID користувача
 * @param {string} role - Нова роль
 * @returns {Promise<Object|null>} Оновлений об'єкт користувача або null
 */
const updateUserRole = async (userId, role) => {
  const query = `
    UPDATE users
    SET role = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await db.query(query, [role, userId]);
  return result.rows[0] || null;
};

module.exports = {
  findById,
  findByUsernameOrEmail,
  authenticate,
  getAllUsers,
  getUserById,
  getUserByTelegramId,
  getUserWithDetails,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  updateUserRole,
};
