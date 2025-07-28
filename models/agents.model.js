const db = require("../config/db");

/**
 * Модель для роботи з агентами в базі даних
 */
const agentsModel = {
  /**
   * Отримання списку всіх агентів з фільтрацією та пагінацією
   * @param {Object} options - Опції фільтрації та пагінації
   * @param {boolean} [options.onlyActive] - Фільтр за активними агентами
   * @param {string} [options.search] - Пошук за назвою
   * @param {number} [options.page=1] - Номер сторінки
   * @param {number} [options.limit=100] - Кількість записів на сторінці
   * @returns {Promise<Object>} Список агентів та метадані пагінації
   */
  getAllAgents: async (options = {}) => {
    const { onlyActive, page = 1, limit = 100, search } = options;
    const offset = (page - 1) * limit;

    // Базовий запит
    let query = "SELECT * FROM agents WHERE 1=1";
    const queryParams = [];
    let paramIndex = 1;

    // Додаємо умову для активних агентів, якщо вказано
    if (onlyActive === "true") {
      query += ` AND is_active = $${paramIndex++}`;
      queryParams.push(true);
    }

    // Додаємо пошук за назвою, якщо вказано
    if (search) {
      query += ` AND LOWER(name) LIKE LOWER($${paramIndex++})`;
      queryParams.push(`%${search}%`);
    }

    // Додаємо сортування та пагінацію
    query += ` ORDER BY name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(parseInt(limit), parseInt(offset));

    // Виконуємо запит
    const { rows: agents } = await db.query(query, queryParams);

    // Запит для отримання загальної кількості агентів (для пагінації)
    let countQuery = "SELECT COUNT(*) FROM agents WHERE 1=1";
    paramIndex = 1;
    const countParams = [];

    if (onlyActive === "true") {
      countQuery += ` AND is_active = $${paramIndex++}`;
      countParams.push(true);
    }

    if (search) {
      countQuery += ` AND LOWER(name) LIKE LOWER($${paramIndex++})`;
      countParams.push(`%${search}%`);
    }

    const { rows: countResult } = await db.query(countQuery, countParams);
    const total = parseInt(countResult[0].count);

    return {
      agents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Отримання агента за ID
   * @param {number} id - ID агента
   * @returns {Promise<Object|null>} Дані агента або null, якщо не знайдено
   */
  getAgentById: async (id) => {
    // Отримання агента з бази даних
    console.log(`ID: ${id}`);
    const { rows } = await db.query("SELECT * FROM agents WHERE id = $1", [id]);

    // Якщо агента не знайдено, повертаємо null
    if (rows.length === 0) {
      return null;
    }

    // Отримання статистики використання агента
    const { rows: statsRows } = await db.query(
      `
      SELECT 
        COUNT(*) as refill_count,
        COALESCE(SUM(ar.amount), 0) as total_amount
      FROM 
        agent_refill_requests ar
      JOIN
        requests r ON ar.request_id = r.id
      WHERE 
        ar.agent_id = $1
    `,
      [id]
    );

    // Формування відповіді
    const agent = rows[0];
    const stats = statsRows[0];

    return {
      ...agent,
      stats: {
        refill_count: stats.refill_count ? parseInt(stats.refill_count) : 0,
        total_amount: stats.total_amount ? parseFloat(stats.total_amount) : 0,
      },
    };
  },

  /**
   * Перевірка наявності агента з вказаною назвою
   * @param {string} name - Назва агента
   * @param {number} [excludeId] - ID агента, який потрібно виключити з перевірки
   * @returns {Promise<boolean>} true якщо агент існує, false якщо не існує
   */
  agentExistsByName: async (name, excludeId = null) => {
    if (excludeId) {
      const { rows } = await db.query(
        "SELECT * FROM agents WHERE name = $1 AND id != $2",
        [name, excludeId]
      );
      return rows.length > 0;
    } else {
      const { rows } = await db.query("SELECT * FROM agents WHERE name = $1", [
        name,
      ]);
      return rows.length > 0;
    }
  },

  /**
   * Створення нового агента
   * @param {Object} agentData - Дані нового агента
   * @param {string} agentData.name - Назва агента
   * @param {number} [agentData.fee] - Комісія агента
   * @param {boolean} [agentData.is_active=true] - Активність агента
   * @returns {Promise<Object>} Створений агент
   */
  createAgent: async (agentData) => {
    const { name, fee, is_active = true } = agentData;

    const { rows } = await db.query(
      "INSERT INTO agents (name, fee, is_active) VALUES ($1, $2, $3) RETURNING *",
      [name, fee, is_active]
    );

    return rows[0];
  },

  /**
   * Оновлення даних агента
   * @param {number} id - ID агента
   * @param {Object} agentData - Нові дані агента
   * @param {string} [agentData.name] - Назва агента
   * @param {number} [agentData.fee] - Комісія агента
   * @param {boolean} [agentData.is_active] - Активність агента
   * @returns {Promise<Object|null>} Оновлений агент або null, якщо агента не знайдено
   */
  updateAgent: async (id, agentData) => {
    const { name, fee, is_active } = agentData;

    // Формування запиту оновлення
    let query = "UPDATE agents SET updated_at = NOW()";
    const queryParams = [];
    let paramIndex = 1;

    if (name !== undefined) {
      query += `, name = $${paramIndex++}`;
      queryParams.push(name);
    }

    if (fee !== undefined) {
      query += `, fee = $${paramIndex++}`;
      queryParams.push(fee);
    }

    if (is_active !== undefined) {
      query += `, is_active = $${paramIndex++}`;
      queryParams.push(is_active);
    }

    query += ` WHERE id = $${paramIndex++} RETURNING *`;
    queryParams.push(id);

    // Виконання запиту
    const { rows } = await db.query(query, queryParams);

    // Повертаємо агента або null, якщо не знайдено
    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Оновлення статусу агента
   * @param {number} id - ID агента
   * @param {boolean} is_active - Новий статус активності
   * @returns {Promise<Object|null>} Оновлений агент або null, якщо агента не знайдено
   */
  updateAgentStatus: async (id, is_active) => {
    const { rows } = await db.query(
      "UPDATE agents SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [is_active, id]
    );

    return rows.length > 0 ? rows[0] : null;
  },

  /**
   * Перевірка використання агента в заявках
   * @param {number} id - ID агента
   * @returns {Promise<number>} Кількість заявок, що використовують агента
   */
  getAgentUsageCount: async (id) => {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM agent_refill_requests WHERE agent_id = $1",
      [id]
    );

    return parseInt(rows[0].count);
  },

  /**
   * Видалення агента
   * @param {number} id - ID агента
   * @returns {Promise<boolean>} true якщо агент видалений, false якщо не знайдено
   */
  deleteAgent: async (id) => {
    const { rowCount } = await db.query("DELETE FROM agents WHERE id = $1", [
      id,
    ]);
    return rowCount > 0;
  },

  /**
   * Отримання статистики використання агентів
   * @param {Object} options - Опції фільтрації
   * @param {string} [options.startDate] - Початкова дата
   * @param {string} [options.endDate] - Кінцева дата
   * @param {number} [options.teamId] - ID команди (для тімлідів)
   * @returns {Promise<Array>} Масив з статистикою агентів
   */
  getAgentsStats: async (options = {}) => {
    const { startDate, endDate, teamId } = options;

    // Базовий запит з JOIN для команди якщо потрібно
    let query = `
    SELECT 
      a.id,
      a.name,
      COUNT(ar.id) as refill_count,
      COALESCE(SUM(ar.amount), 0) as total_amount,
      AVG(ar.amount) as avg_amount,
      MAX(ar.amount) as max_amount,
      MIN(ar.amount) as min_amount,
      a.is_active
    FROM 
      agents a
    LEFT JOIN 
      agent_refill_requests ar ON a.id = ar.agent_id
    LEFT JOIN
      requests r ON ar.request_id = r.id
    ${teamId ? "LEFT JOIN users u ON r.user_id = u.id" : ""}
    WHERE r.status = 'completed'
  `;

    console.log(teamId)

    const queryParams = [];
    let paramIndex = 1;

    // Додаємо фільтр за командою, якщо вказано (для тімлідів)
    if (teamId) {
      query += ` AND u.team_id = $${paramIndex++}`;
      queryParams.push(teamId);
    }

    // Додаємо фільтр за датою, якщо вказано
    if (startDate) {
      query += ` AND r.created_at >= $${paramIndex++}`;
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ` AND r.created_at <= $${paramIndex++}`;
      queryParams.push(endDate);
    }

    // Групування та сортування
    query += `
    GROUP BY a.id, a.name
    ORDER BY total_amount DESC, refill_count DESC
  `;

    // Виконання запиту
    const { rows: stats } = await db.query(query, queryParams);

    return stats;
  },
};

module.exports = agentsModel;
