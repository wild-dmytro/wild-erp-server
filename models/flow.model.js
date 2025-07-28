/**
 * Модель для роботи з потоками (flows)
 * Включає всі CRUD операції, роботу з користувачами, комунікації та статистику
 * Додано підтримку team_id
 */

const db = require("../config/db");

/**
 * Основні CRUD операції з потоками
 */

/**
 * Отримання всіх потоків з пагінацією та фільтрацією
 * @param {Object} options - Опції фільтрації та пагінації
 * @returns {Promise<Object>} Список потоків з метаданими та даними користувачів
 */
const getAllFlows = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    // Масиви ID
    offerIds,
    userIds,
    geoIds,
    teamIds,
    partnerIds,
    brandIds,
    // Одиночні ID (для сумісності)
    offerId,
    userId,
    geoId,
    teamId,
    partnerId,
    // Інші фільтри
    status,
    onlyActive,
    search,
    currency,
    sortBy = "created_at",
    sortOrder = "desc",
    startDate,
    endDate,
  } = options;

  const offset = (page - 1) * limit;

  // Базовий запит з додаванням join для teams
  let baseQuery = `
    FROM flows f
    LEFT JOIN offers o ON f.offer_id = o.id
    LEFT JOIN geos g ON f.geo_id = g.id
    LEFT JOIN teams tm ON f.team_id = tm.id
    LEFT JOIN partners p ON o.partner_id = p.id
    LEFT JOIN brands b ON o.brand_id = b.id
    LEFT JOIN users creator ON f.created_by = creator.id
    LEFT JOIN users updater ON f.updated_by = updater.id
  `;

  // Умови фільтрації
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Функція для додавання умов IN для масивів ID
  const addArrayCondition = (arrayIds, singleId, column) => {
    let ids = arrayIds;

    // Якщо немає масиву, але є одиночний ID, використовуємо його
    if (!ids && singleId) {
      ids = [singleId];
    }

    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => `$${paramIndex++}`).join(", ");
      conditions.push(`${column} IN (${placeholders})`);
      params.push(...ids);
    }
  };

  // Додаємо умови для масивів ID
  addArrayCondition(offerIds, offerId, "f.offer_id");
  addArrayCondition(geoIds, geoId, "f.geo_id");
  addArrayCondition(teamIds, teamId, "f.team_id");
  addArrayCondition(partnerIds, partnerId, "o.partner_id");
  addArrayCondition(brandIds, null, "o.brand_id");

  // Для користувачів потрібен підзапит
  if ((userIds && userIds.length > 0) || userId) {
    let ids = userIds;
    if (!ids && userId) {
      ids = [userId];
    }

    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => `$${paramIndex++}`).join(", ");
      conditions.push(`EXISTS (
        SELECT 1 FROM flow_users fu 
        WHERE fu.flow_id = f.id AND fu.user_id IN (${placeholders})
      )`);
      params.push(...ids);
    }
  }

  // Інші умови
  if (status) {
    conditions.push(`f.status = $${paramIndex++}`);
    params.push(status);
  }

  if (onlyActive) {
    conditions.push(`f.is_active = true`);
  }

  if (currency) {
    conditions.push(`f.currency = $${paramIndex++}`);
    params.push(currency);
  }

  if (startDate) {
    conditions.push(`f.created_at >= $${paramIndex++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`f.created_at <= $${paramIndex++}`);
    params.push(endDate);
  }

  // ВИПРАВЛЕНО: Пошук - використовуємо один параметр для всіх умов
  if (search) {
    const searchParam = `%${search}%`;
    conditions.push(`(
      f.name ILIKE $${paramIndex} OR 
      f.description ILIKE $${paramIndex} OR 
      o.name ILIKE $${paramIndex} OR
      g.name ILIKE $${paramIndex} OR
      tm.name ILIKE $${paramIndex} OR
      b.name ILIKE $${paramIndex}
    )`);
    params.push(searchParam);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Зберігаємо базові параметри для count запиту
  const baseParams = [...params];

  // Запит для отримання даних з додаванням team і brand інформації
  const dataQuery = `
    SELECT 
      f.id,
      f.name,
      f.offer_id,
      f.geo_id,
      f.team_id,
      f.status,
      f.cpa,
      f.currency,
      f.is_active,
      f.start_date,
      f.stop_date,
      f.conditions,
      f.description,
      f.notes,
      f.cap,
      f.kpi,
      f.landings,
      f.created_at,
      f.updated_at,
      f.created_by,
      f.updated_by,
      
      -- Інформація про офер
      o.name as offer_name,
      o.description as offer_description,
      o.partner_id,
      o.brand_id,
      
      -- Інформація про гео
      g.name as geo_name,
      g.country_code as geo_code,
      
      -- Інформація про команду
      tm.id as team_id,
      tm.name as team_name,
      
      -- Інформація про партнера
      p.name as partner_name,
      p.type as partner_type,
      
      -- Інформація про бренд
      b.name as brand_name,
      
      -- Інформація про користувачів
      creator.username as created_by_username,
      creator.first_name as created_by_first_name,
      creator.last_name as created_by_last_name,
      updater.username as updated_by_username,
      updater.first_name as updated_by_first_name,
      updater.last_name as updated_by_last_name,
      
      -- Кількість активних користувачів
      (SELECT COUNT(*) FROM flow_users fu WHERE fu.flow_id = f.id AND fu.status = 'active') as active_users_count
      
    ${baseQuery}
    ${whereClause}
    ORDER BY f.${sortBy} ${sortOrder.toUpperCase()}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  // Додаємо параметри пагінації для data запиту
  const dataParams = [...params, limit, offset];

  // Запит для підрахунку загальної кількості (використовуємо базові параметри)
  const countQuery = `
    SELECT COUNT(*) as total
    ${baseQuery}
    ${whereClause}
  `;

  try {
    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, dataParams),
      db.query(countQuery, baseParams), // Використовуємо базові параметри без limit/offset
    ]);

    const flows = dataResult.rows;
    const total = parseInt(countResult.rows[0].total);

    // Отримуємо користувачів для кожного потоку
    const flowsWithUsers = await Promise.all(
      flows.map(async (flow) => {
        const usersQuery = `
          SELECT 
            u.id,
            u.username,
            u.first_name,
            u.last_name,
            u.email,
            fu.status as flow_user_status,
            fu.notes as flow_user_notes,
            fu.created_at as flow_user_created_at
          FROM flow_users fu
          JOIN users u ON fu.user_id = u.id
          WHERE fu.flow_id = $1
          ORDER BY fu.created_at ASC
        `;

        const usersResult = await db.query(usersQuery, [flow.id]);
        return {
          ...flow,
          users: usersResult.rows,
        };
      })
    );

    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    };

    return {
      flows: flowsWithUsers,
      pagination,
    };
  } catch (error) {
    console.error("Помилка при отриманні потоків:", error);
    throw new Error("Помилка бази даних при отриманні потоків");
  }
};

/**
 * Отримання потоку за ID з повною інформацією
 * @param {number} id - ID потоку
 * @returns {Promise<Object|null>} Дані потоку або null
 */
const getFlowById = async (id) => {
  const query = `
    SELECT 
      f.*,
      o.name as offer_name,
      o.conditions as offer_conditions,
      o.kpi as offer_kpi,
      g.name as geo_name,
      g.country_code as geo_code,
      tm.name as team_name,
      tm.is_active as team_is_active,
      p.name as partner_name,
      p.type as partner_type,
      p.contact_email as partner_email,
      p.contact_telegram as partner_telegram,
      creator.username as created_by_username,
      CONCAT(creator.first_name, ' ', creator.last_name) as created_by_name,
      updater.username as updated_by_username,
      CONCAT(updater.first_name, ' ', updater.last_name) as updated_by_name
    FROM flows f
    LEFT JOIN offers o ON f.offer_id = o.id
    LEFT JOIN partners p ON o.partner_id = p.id
    LEFT JOIN geos g ON f.geo_id = g.id
    LEFT JOIN teams tm ON f.team_id = tm.id
    LEFT JOIN users creator ON f.created_by = creator.id
    LEFT JOIN users updater ON f.updated_by = updater.id
    WHERE f.id = $1
  `;

  const result = await db.query(query, [id]);
  if (result.rows.length === 0) return null;

  const flow = result.rows[0];

  // Отримуємо користувачів потоку
  const usersQuery = `
    SELECT 
      fu.*,
      u.username,
      u.first_name,
      u.last_name,
      u.role,
      u.is_active as user_is_active,
      creator.username as added_by_username,
      CONCAT(creator.first_name, ' ', creator.last_name) as added_by_name,
      t.name as user_team_name
    FROM flow_users fu
    JOIN users u ON fu.user_id = u.id
    LEFT JOIN teams t ON u.team_id = t.id
    LEFT JOIN users creator ON fu.created_by = creator.id
    WHERE fu.flow_id = $1
    ORDER BY fu.joined_at DESC
  `;

  const usersResult = await db.query(usersQuery, [id]);

  // Отримуємо останні комунікації
  const communicationsQuery = `
    SELECT 
      fc.*,
      sender.username as sender_username,
      CONCAT(sender.first_name, ' ', sender.last_name) as sender_name,
      recipient.username as recipient_username,
      CONCAT(recipient.first_name, ' ', recipient.last_name) as recipient_name
    FROM flow_communications fc
    JOIN users sender ON fc.sender_id = sender.id
    LEFT JOIN users recipient ON fc.recipient_id = recipient.id
    WHERE fc.flow_id = $1
    ORDER BY fc.created_at DESC
    LIMIT 10
  `;

  const communicationsResult = await db.query(communicationsQuery, [id]);

  return {
    ...flow,
    users: usersResult.rows,
    recent_communications: communicationsResult.rows,
  };
};

/**
 * Створення нового потоку (ВИПРАВЛЕНО - додано landings, видалено percentage та individual_cpa з users)
 * @param {Object} flowData - Дані потоку
 * @returns {Promise<Object>} Створений потік
 */
const createFlow = async (flowData) => {
  const {
    name,
    offer_id,
    geo_id,
    team_id,
    status = "active",
    cpa = 0,
    currency = "USD",
    is_active = true,
    start_date,
    stop_date,
    conditions,
    description,
    notes,
    cap,
    kpi,
    landings,
    created_by,
    users = [],
  } = flowData;

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Перевіряємо унікальність назви
    const nameCheck = await client.query(
      "SELECT id FROM flows WHERE name = $1",
      [name]
    );

    if (nameCheck.rows.length > 0) {
      throw new Error("Потік з такою назвою вже існує");
    }

    // Створюємо потік з полем landings
    const flowQuery = `
      INSERT INTO flows (
        name, offer_id, geo_id, team_id, status, cpa, currency, is_active,
        start_date, stop_date, conditions, description, notes, cap, kpi, landings, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const flowResult = await client.query(flowQuery, [
      name,
      offer_id,
      geo_id,
      team_id,
      status,
      cpa,
      currency,
      is_active,
      start_date,
      stop_date,
      conditions,
      description,
      notes,
      cap,
      kpi,
      landings,
      created_by,
    ]);

    const newFlow = flowResult.rows[0];

    // Додаємо користувачів до потоку БЕЗ percentage та individual_cpa
    if (users.length > 0) {
      for (const user of users) {
        await client.query(
          `INSERT INTO flow_users (
            flow_id, user_id, status, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            newFlow.id,
            user.user_id,
            user.status || "active",
            user.notes,
            created_by,
          ]
        );
      }
    }

    await client.query("COMMIT");
    return newFlow;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Оновлення потоку (ВИПРАВЛЕНО - додано landings)
 * @param {number} id - ID потоку
 * @param {Object} flowData - Дані для оновлення
 * @returns {Promise<Object|null>} Оновлений потік або null
 */
const updateFlow = async (id, flowData) => {
  const {
    name,
    offer_id,
    geo_id,
    team_id,
    status,
    cpa,
    currency,
    is_active,
    start_date,
    stop_date,
    conditions,
    description,
    notes,
    cap,
    kpi,
    landings,
    updated_by,
  } = flowData;

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  if (name !== undefined) {
    // Перевіряємо унікальність назви
    const nameCheck = await db.query(
      "SELECT id FROM flows WHERE name = $1 AND id != $2",
      [name, id]
    );

    if (nameCheck.rows.length > 0) {
      throw new Error("Потік з такою назвою вже існує");
    }

    setClauses.push(`name = $${paramIndex++}`);
    values.push(name);
  }

  if (offer_id !== undefined) {
    setClauses.push(`offer_id = $${paramIndex++}`);
    values.push(offer_id);
  }

  if (geo_id !== undefined) {
    setClauses.push(`geo_id = $${paramIndex++}`);
    values.push(geo_id);
  }

  if (team_id !== undefined) {
    setClauses.push(`team_id = $${paramIndex++}`);
    values.push(team_id);
  }

  if (status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (cpa !== undefined) {
    setClauses.push(`cpa = $${paramIndex++}`);
    values.push(cpa);
  }

  if (currency !== undefined) {
    setClauses.push(`currency = $${paramIndex++}`);
    values.push(currency);
  }

  if (is_active !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(is_active);
  }

  if (start_date !== undefined) {
    setClauses.push(`start_date = $${paramIndex++}`);
    values.push(start_date);
  }

  if (stop_date !== undefined) {
    setClauses.push(`stop_date = $${paramIndex++}`);
    values.push(stop_date);
  }

  if (conditions !== undefined) {
    setClauses.push(`conditions = $${paramIndex++}`);
    values.push(conditions);
  }

  if (description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(description);
  }

  if (notes !== undefined) {
    setClauses.push(`notes = $${paramIndex++}`);
    values.push(notes);
  }

  if (cap !== undefined) {
    setClauses.push(`cap = $${paramIndex++}`);
    values.push(cap);
  }

  if (kpi !== undefined) {
    setClauses.push(`kpi = $${paramIndex++}`);
    values.push(kpi);
  }

  if (landings !== undefined) {
    setClauses.push(`landings = $${paramIndex++}`);
    values.push(landings);
  }

  if (updated_by !== undefined) {
    setClauses.push(`updated_by = $${paramIndex++}`);
    values.push(updated_by);
  }

  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 1) {
    return null; // Немає даних для оновлення
  }

  const query = `
    UPDATE flows
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  values.push(id);

  const result = await db.query(query, values);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Видалення потоку
 * @param {number} id - ID потоку
 * @returns {Promise<Object>} Результат видалення
 */
const deleteFlow = async (id) => {
  try {
    // Перевіряємо наявність пов'язаних записів
    const [statsResult, communicationsResult, payoutFlowsResult] =
      await Promise.all([
        db.query(
          "SELECT COUNT(*) as count FROM flow_stats WHERE flow_id = $1",
          [id]
        ),
        db.query(
          "SELECT COUNT(*) as count FROM flow_communications WHERE flow_id = $1",
          [id]
        ),
        db.query(
          "SELECT COUNT(*) as count FROM partner_payout_flows WHERE flow_id = $1",
          [id]
        ),
      ]);

    const hasStats = parseInt(statsResult.rows[0].count) > 0;
    const hasCommunications = parseInt(communicationsResult.rows[0].count) > 0;
    const hasPayoutFlows = parseInt(payoutFlowsResult.rows[0].count) > 0;

    if (hasStats || hasCommunications || hasPayoutFlows) {
      return {
        success: false,
        message:
          "Неможливо видалити потік, оскільки з ним пов'язані дані (статистика, комунікації або виплати)",
      };
    }

    // Видаляємо потік (каскадне видалення користувачів відбудеться автоматично)
    const result = await db.query(
      "DELETE FROM flows WHERE id = $1 RETURNING id",
      [id]
    );

    return {
      success: result.rows.length > 0,
      message:
        result.rows.length > 0 ? "Потік успішно видалено" : "Потік не знайдено",
    };
  } catch (error) {
    return {
      success: false,
      message: "Помилка при видаленні потоку",
      error: error.message,
    };
  }
};

/**
 * Робота з командами потоків
 */

/**
 * Отримання потоків команди
 * @param {number} teamId - ID команди
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Array>} Список потоків команди
 */
const getFlowsByTeam = async (teamId, options = {}) => {
  const { status, onlyActive = true, limit = 50, offset = 0 } = options;

  const conditions = ["f.team_id = $1"];
  const params = [teamId];
  let paramIndex = 2;

  if (onlyActive) {
    conditions.push("f.is_active = true");
  }

  if (status) {
    conditions.push(`f.status = $${paramIndex++}`);
    params.push(status);
  }

  const query = `
    SELECT 
      f.*,
      o.name as offer_name,
      g.name as geo_name,
      p.name as partner_name,
      tm.name as team_name,
      (SELECT COUNT(*) FROM flow_users fu WHERE fu.flow_id = f.id AND fu.status = 'active') as active_users_count
    FROM flows f
    LEFT JOIN offers o ON f.offer_id = o.id
    LEFT JOIN geos g ON f.geo_id = g.id
    LEFT JOIN partners p ON o.partner_id = p.id
    LEFT JOIN teams tm ON f.team_id = tm.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY f.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  params.push(limit, offset);

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Перенесення потоку до іншої команди
 * @param {number} flowId - ID потоку
 * @param {number} newTeamId - ID нової команди
 * @param {number} updatedBy - ID користувача
 * @returns {Promise<Object|null>} Оновлений потік або null
 */
const transferFlowToTeam = async (flowId, newTeamId, updatedBy) => {
  const query = `
    UPDATE flows
    SET team_id = $1, updated_by = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `;

  const result = await db.query(query, [newTeamId, updatedBy, flowId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Отримання статистики потоків по командах
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Array>} Статистика по командах
 */
const getFlowStatsByTeams = async (options = {}) => {
  const { dateFrom, dateTo, onlyActive = true } = options;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (onlyActive) {
    conditions.push("f.is_active = true");
  }

  if (dateFrom) {
    conditions.push(`fs.date_from >= $${paramIndex++}`);
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(`fs.date_to <= $${paramIndex++}`);
    params.push(dateTo);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT 
      t.id as team_id,
      t.name as team_name,
      t.description as team_description,
      COUNT(DISTINCT f.id) as flows_count,
      COUNT(DISTINCT CASE WHEN f.status = 'active' THEN f.id END) as active_flows_count,
      COUNT(DISTINCT fu.user_id) as total_users,
      COALESCE(SUM(fs.clicks), 0) as total_clicks,
      COALESCE(SUM(fs.conversions), 0) as total_conversions,
      COALESCE(SUM(fs.revenue), 0) as total_revenue,
      COALESCE(SUM(fs.leads), 0) as total_leads,
      CASE 
        WHEN SUM(fs.impressions) > 0 
        THEN ROUND((SUM(fs.clicks)::numeric / SUM(fs.impressions)::numeric), 4)
        ELSE 0 
      END as avg_ctr,
      CASE 
        WHEN SUM(fs.clicks) > 0 
        THEN ROUND((SUM(fs.conversions)::numeric / SUM(fs.clicks)::numeric), 4)
        ELSE 0 
      END as avg_cr,
      AVG(f.cpa) as avg_cpa
    FROM teams t
    LEFT JOIN flows f ON t.id = f.team_id
    LEFT JOIN flow_users fu ON f.id = fu.flow_id AND fu.status = 'active'
    LEFT JOIN flow_stats fs ON f.id = fs.flow_id
    ${whereClause}
    GROUP BY t.id, t.name, t.description
    HAVING COUNT(DISTINCT f.id) > 0
    ORDER BY total_revenue DESC
  `;

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Робота з користувачами потоку
 */

/**
 * Додавання користувача до потоку (ВИПРАВЛЕНО - без percentage та individual_cpa)
 * @param {number} flowId - ID потоку
 * @param {Object} userData - Дані користувача
 * @returns {Promise<Object>} Доданий користувач
 */
const addUserToFlow = async (flowId, userData) => {
  const { user_id, status = "active", notes, created_by } = userData;

  // Перевіряємо чи користувач вже є в потоці
  const existingUser = await db.query(
    "SELECT id FROM flow_users WHERE flow_id = $1 AND user_id = $2",
    [flowId, user_id]
  );

  if (existingUser.rows.length > 0) {
    throw new Error("Користувач вже доданий до цього потоку");
  }

  const query = `
    INSERT INTO flow_users (
      flow_id, user_id, status, notes, created_by
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const result = await db.query(query, [
    flowId,
    user_id,
    status,
    notes,
    created_by,
  ]);

  // Отримуємо повну інформацію про доданого користувача
  const userInfoQuery = `
    SELECT 
      fu.*,
      u.username,
      u.first_name,
      u.last_name,
      u.role,
      u.is_active as user_is_active,
      creator.username as added_by_username,
      t.name as team_name,
      CONCAT(creator.first_name, ' ', creator.last_name) as added_by_name
    FROM flow_users fu
    JOIN users u ON fu.user_id = u.id
    LEFT JOIN teams t ON u.team_id = t.id
    LEFT JOIN users creator ON fu.created_by = creator.id
    WHERE fu.id = $1
  `;

  const userInfoResult = await db.query(userInfoQuery, [result.rows[0].id]);
  return userInfoResult.rows[0];
};

/**
 * Оновлення користувача в потоці (ВИПРАВЛЕНО - без percentage та individual_cpa)
 * @param {number} flowId - ID потоку
 * @param {number} userId - ID користувача
 * @param {Object} userData - Дані для оновлення
 * @returns {Promise<Object|null>} Оновлений користувач або null
 */
const updateUserInFlow = async (flowId, userId, userData) => {
  const { status, notes, updated_by } = userData;

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  if (status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (notes !== undefined) {
    setClauses.push(`notes = $${paramIndex++}`);
    values.push(notes);
  }

  if (updated_by !== undefined) {
    setClauses.push(`updated_by = $${paramIndex++}`);
    values.push(updated_by);
  }

  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 1) {
    return null; // Немає даних для оновлення
  }

  const query = `
    UPDATE flow_users
    SET ${setClauses.join(", ")}
    WHERE flow_id = $${paramIndex++} AND user_id = $${paramIndex}
    RETURNING *
  `;

  values.push(flowId, userId);

  const result = await db.query(query, values);

  if (result.rows.length === 0) {
    return null;
  }

  // Отримуємо повну інформацію про оновленого користувача
  const userInfoQuery = `
    SELECT 
      fu.*,
      u.username,
      u.first_name,
      u.last_name,
      u.role,
      u.is_active as user_is_active,
      creator.username as added_by_username,
      updater.username as updated_by_username,
      t.name as team_name,
      CONCAT(creator.first_name, ' ', creator.last_name) as added_by_name,
      CONCAT(updater.first_name, ' ', updater.last_name) as updated_by_name
    FROM flow_users fu
    JOIN users u ON fu.user_id = u.id
    LEFT JOIN teams t ON u.team_id = t.id
    LEFT JOIN users creator ON fu.created_by = creator.id
    LEFT JOIN users updater ON fu.updated_by = updater.id
    WHERE fu.id = $1
  `;

  const userInfoResult = await db.query(userInfoQuery, [result.rows[0].id]);
  return userInfoResult.rows[0];
};

/**
 * Видалення користувача з потоку
 * @param {number} flowId - ID потоку
 * @param {number} userId - ID користувача
 * @returns {Promise<Object>} Результат видалення
 */
const removeUserFromFlow = async (flowId, userId) => {
  const query = `
    UPDATE flow_users
    SET status = 'inactive', left_at = NOW(), updated_at = NOW()
    WHERE flow_id = $1 AND user_id = $2
    RETURNING *
  `;

  const result = await db.query(query, [flowId, userId]);

  return {
    success: result.rows.length > 0,
    message:
      result.rows.length > 0
        ? "Користувача видалено з потоку"
        : "Користувач не знайдений в потоці",
  };
};

/**
 * Отримання користувачів потоку
 * @param {number} flowId - ID потоку
 * @param {boolean} onlyActive - Тільки активні користувачі
 * @returns {Promise<Array>} Список користувачів
 */
const getFlowUsers = async (flowId, onlyActive = false) => {
  const query = `
    SELECT 
      fu.*,
      u.username,
      u.first_name,
      u.last_name,
      u.role,
      u.is_active as user_is_active,
      creator.username as added_by_username,
      t.name as team_name,
      CONCAT(creator.first_name, ' ', creator.last_name) as added_by_name
    FROM flow_users fu
    JOIN users u ON fu.user_id = u.id
    JOIN teams t ON u.team_id = t.id
    LEFT JOIN users creator ON fu.created_by = creator.id
    WHERE fu.flow_id = $1 ${onlyActive ? "AND fu.status = 'active'" : ""}
    ORDER BY fu.joined_at DESC
  `;

  const result = await db.query(query, [flowId]);
  return result.rows;
};

/**
 * Комунікації в потоці
 */

/**
 * Надсилання повідомлення користувачеві в потоці
 * @param {Object} messageData - Дані повідомлення
 * @returns {Promise<Object>} Надіслане повідомлення
 */
const sendMessageToUser = async (messageData) => {
  const {
    flow_id,
    sender_id,
    recipient_id,
    message_type = "message",
    subject,
    message,
    attachments,
    priority = "normal",
    is_urgent = false,
  } = messageData;

  const query = `
    INSERT INTO flow_communications (
      flow_id, sender_id, recipient_id, message_type, subject, 
      message, attachments, priority, is_urgent
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await db.query(query, [
    flow_id,
    sender_id,
    recipient_id,
    message_type,
    subject,
    message,
    JSON.stringify(attachments),
    priority,
    is_urgent,
  ]);

  return result.rows[0];
};

/**
 * Надсилання оповіщення всім користувачам потоку
 * @param {Object} notificationData - Дані оповіщення
 * @returns {Promise<Array>} Список надісланих повідомлень
 */
const sendNotificationToAllUsers = async (notificationData) => {
  const {
    flow_id,
    sender_id,
    message_type = "notification",
    subject,
    message,
    priority = "normal",
    is_urgent = false,
  } = notificationData;

  // Отримуємо всіх активних користувачів потоку
  const usersResult = await db.query(
    "SELECT user_id FROM flow_users WHERE flow_id = $1 AND status = 'active'",
    [flow_id]
  );

  const sentMessages = [];

  for (const user of usersResult.rows) {
    const messageResult = await db.query(
      `
      INSERT INTO flow_communications (
        flow_id, sender_id, recipient_id, message_type, subject, 
        message, priority, is_urgent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
      [
        flow_id,
        sender_id,
        user.user_id,
        message_type,
        subject,
        message,
        priority,
        is_urgent,
      ]
    );

    sentMessages.push(messageResult.rows[0]);
  }

  return sentMessages;
};

/**
 * Отримання комунікацій потоку
 * @param {number} flowId - ID потоку
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Array>} Список комунікацій
 */
const getFlowCommunications = async (flowId, options = {}) => {
  const {
    limit = 50,
    offset = 0,
    messageType,
    unreadOnly = false,
    recipientId,
  } = options;

  const conditions = ["fc.flow_id = $1"];
  const params = [flowId];
  let paramIndex = 2;

  if (messageType) {
    conditions.push(`fc.message_type = $${paramIndex++}`);
    params.push(messageType);
  }

  if (unreadOnly) {
    conditions.push(`fc.is_read = false`);
  }

  if (recipientId) {
    conditions.push(`fc.recipient_id = $${paramIndex++}`);
    params.push(recipientId);
  }

  const query = `
    SELECT 
      fc.*,
      sender.username as sender_username,
      CONCAT(sender.first_name, ' ', sender.last_name) as sender_name,
      recipient.username as recipient_username,
      CONCAT(recipient.first_name, ' ', recipient.last_name) as recipient_name
    FROM flow_communications fc
    JOIN users sender ON fc.sender_id = sender.id
    LEFT JOIN users recipient ON fc.recipient_id = recipient.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY fc.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  params.push(limit, offset);

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Позначення повідомлення як прочитаного
 * @param {number} messageId - ID повідомлення
 * @param {number} userId - ID користувача
 * @returns {Promise<Object|null>} Оновлене повідомлення або null
 */
const markMessageAsRead = async (messageId, userId) => {
  const query = `
    UPDATE flow_communications
    SET is_read = true, read_at = NOW()
    WHERE id = $1 AND recipient_id = $2
    RETURNING *
  `;

  const result = await db.query(query, [messageId, userId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Статистика потоків
 */

/**
 * Додавання/оновлення статистики потоку
 * @param {Object} statsData - Дані статистики
 * @returns {Promise<Object>} Збережена статистика
 */
const upsertFlowStats = async (statsData) => {
  const {
    flow_id,
    user_id,
    date_from,
    date_to,
    clicks = 0,
    conversions = 0,
    revenue = 0,
    impressions = 0,
    leads = 0,
  } = statsData;

  // Розраховуємо CTR та CR
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cr = clicks > 0 ? conversions / clicks : 0;

  const query = `
    INSERT INTO flow_stats (
      flow_id, user_id, date_from, date_to, clicks, conversions, 
      revenue, impressions, leads, ctr, cr
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (flow_id, user_id, date_from, date_to)
    DO UPDATE SET
      clicks = EXCLUDED.clicks,
      conversions = EXCLUDED.conversions,
      revenue = EXCLUDED.revenue,
      impressions = EXCLUDED.impressions,
      leads = EXCLUDED.leads,
      ctr = EXCLUDED.ctr,
      cr = EXCLUDED.cr,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await db.query(query, [
    flow_id,
    user_id,
    date_from,
    date_to,
    clicks,
    conversions,
    revenue,
    impressions,
    leads,
    ctr,
    cr,
  ]);

  return result.rows[0];
};

/**
 * Отримання статистики потоку за період
 * @param {number} flowId - ID потоку
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Object>} Агрегована статистика
 */
const getFlowStats = async (flowId, options = {}) => {
  const {
    dateFrom,
    dateTo,
    userId,
    groupBy = "day", // day, week, month
  } = options;

  const conditions = ["fs.flow_id = $1"];
  const params = [flowId];
  let paramIndex = 2;

  if (dateFrom) {
    conditions.push(`fs.date_from >= ${paramIndex++}`);
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(`fs.date_to <= ${paramIndex++}`);
    params.push(dateTo);
  }

  if (userId) {
    conditions.push(`fs.user_id = ${paramIndex++}`);
    params.push(userId);
  }

  let dateGrouping = "";
  switch (groupBy) {
    case "week":
      dateGrouping = "DATE_TRUNC('week', fs.date_from)";
      break;
    case "month":
      dateGrouping = "DATE_TRUNC('month', fs.date_from)";
      break;
    default:
      dateGrouping = "fs.date_from";
  }

  const query = `
    SELECT 
      ${dateGrouping} as period,
      SUM(fs.clicks) as total_clicks,
      SUM(fs.conversions) as total_conversions,
      SUM(fs.revenue) as total_revenue,
      SUM(fs.impressions) as total_impressions,
      SUM(fs.leads) as total_leads,
      CASE 
        WHEN SUM(fs.impressions) > 0 
        THEN ROUND((SUM(fs.clicks)::numeric / SUM(fs.impressions)::numeric), 4)
        ELSE 0 
      END as avg_ctr,
      CASE 
        WHEN SUM(fs.clicks) > 0 
        THEN ROUND((SUM(fs.conversions)::numeric / SUM(fs.clicks)::numeric), 4)
        ELSE 0 
      END as avg_cr
    FROM flow_stats fs
    WHERE ${conditions.join(" AND ")}
    GROUP BY ${dateGrouping}
    ORDER BY period ASC
  `;

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Отримання топ користувачів за метрикою
 * @param {number} flowId - ID потоку
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Array>} Список топ користувачів
 */
const getTopUsersByMetric = async (flowId, options = {}) => {
  const {
    metric = "revenue", // revenue, conversions, clicks
    dateFrom,
    dateTo,
    limit = 10,
  } = options;

  const conditions = ["fs.flow_id = $1", "fs.user_id IS NOT NULL"];
  const params = [flowId];
  let paramIndex = 2;

  if (dateFrom) {
    conditions.push(`fs.date_from >= ${paramIndex++}`);
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(`fs.date_to <= ${paramIndex++}`);
    params.push(dateTo);
  }

  const validMetrics = ["revenue", "conversions", "clicks", "leads"];
  const orderMetric = validMetrics.includes(metric) ? metric : "revenue";

  const query = `
    SELECT 
      u.id as user_id,
      u.username,
      u.first_name,
      u.last_name,
      SUM(fs.clicks) as total_clicks,
      SUM(fs.conversions) as total_conversions,
      SUM(fs.revenue) as total_revenue,
      SUM(fs.leads) as total_leads,
      CASE 
        WHEN SUM(fs.impressions) > 0 
        THEN ROUND((SUM(fs.clicks)::numeric / SUM(fs.impressions)::numeric), 4)
        ELSE 0 
      END as avg_ctr,
      CASE 
        WHEN SUM(fs.clicks) > 0 
        THEN ROUND((SUM(fs.conversions)::numeric / SUM(fs.clicks)::numeric), 4)
        ELSE 0 
      END as avg_cr
    FROM flow_stats fs
    JOIN users u ON fs.user_id = u.id
    JOIN flow_users fu ON fs.flow_id = fu.flow_id AND fs.user_id = fu.user_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY u.id, u.username, u.first_name, u.last_name
    ORDER BY total_${orderMetric} DESC
    LIMIT ${paramIndex}
  `;

  params.push(limit);

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Отримання загальної статистики всіх потоків
 * @param {Object} options - Опції фільтрації
 * @param {string} [options.dateFrom] - Дата початку
 * @param {string} [options.dateTo] - Дата завершення
 * @param {string} [options.status] - Статус потоків
 * @param {number} [options.partnerId] - ID партнера
 * @param {Array<number>} [options.userIds] - Масив ID користувачів
 * @param {Array<number>} [options.teamIds] - Масив ID команд
 * @param {boolean} [options.onlyActive] - Тільки активні потоки
 * @returns {Promise<Object>} Загальна статистика
 */
const getAllFlowsStats = async (options = {}) => {
  const { dateFrom, dateTo, status, partnerId, userIds, teamIds, onlyActive } =
    options;

  // Будуємо умови фільтрації
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  console.log(onlyActive)

  // Фільтр за активністю
  if (onlyActive) {
    conditions.push("f.is_active = true");
  }

  console.log(conditions)

  // Фільтр за статусом (якщо вказано)
  if (status) {
    conditions.push(`f.status = $${paramIndex++}`);
    params.push(status);
  }

  // Фільтр за партнером
  if (partnerId) {
    conditions.push(`o.partner_id = $${paramIndex++}`);
    params.push(partnerId);
  }

  // Фільтр за користувачами
  if (userIds && userIds.length > 0) {
    conditions.push(`f.id IN (
      SELECT DISTINCT fu_filter.flow_id 
      FROM flow_users fu_filter 
      WHERE fu_filter.user_id = ANY($${paramIndex++}) 
      AND fu_filter.status = 'active'
    )`);
    params.push(userIds);
  }

  // Фільтр за командами
  if (teamIds && teamIds.length > 0) {
    conditions.push(`f.team_id = ANY($${paramIndex++})`);
    params.push(teamIds);
  }

  // Фільтр за датами створення потоків
  if (dateFrom) {
    conditions.push(`f.created_at >= $${paramIndex++}`);
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(`f.created_at <= $${paramIndex++}`);
    params.push(dateTo);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    // Основний запит для отримання всіх метрик
    const statsQuery = `
      SELECT 
        -- Загальна кількість потоків
        COUNT(DISTINCT f.id) as total_flows,
        
        -- Потоки за статусами
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'paused') as paused_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'stopped') as stopped_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'archived') as archived_flows,
        
        -- Унікальні значення
        COUNT(DISTINCT f.offer_id) FILTER (WHERE f.offer_id IS NOT NULL) as unique_offers,
        COUNT(DISTINCT f.geo_id) FILTER (WHERE f.geo_id IS NOT NULL) as unique_geos,
        COUNT(DISTINCT o.brand_id) FILTER (WHERE o.brand_id IS NOT NULL) as unique_brands,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.user_id IS NOT NULL AND fu.status = 'active') as total_users,
        
        -- Додаткові метрики
        AVG(f.cpa) FILTER (WHERE f.cpa > 0) as average_cpa,
        COUNT(DISTINCT f.team_id) FILTER (WHERE f.team_id IS NOT NULL) as unique_teams
        
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
      ${whereClause}
    `;

    console.log("Запит статистики з параметрами:", { options, params });

    const result = await db.query(statsQuery, params);
    const stats = result.rows[0];

    // Форматуємо результат
    const formattedStats = {
      // Загальна кількість
      totalFlows: parseInt(stats.total_flows) || 0,

      // Потоки за статусами
      activeFlows: parseInt(stats.active_flows) || 0,
      pausedFlows: parseInt(stats.paused_flows) || 0,
      stoppedFlows: parseInt(stats.stopped_flows) || 0,
      archivedFlows: parseInt(stats.archived_flows) || 0,

      // Унікальні значення
      uniqueOffers: parseInt(stats.unique_offers) || 0,
      uniqueGeos: parseInt(stats.unique_geos) || 0,
      uniqueBrands: parseInt(stats.unique_brands) || 0,
      totalUsers: parseInt(stats.total_users) || 0,
      uniqueTeams: parseInt(stats.unique_teams) || 0,

      // Додаткові метрики
      averageCpa: parseFloat(stats.average_cpa) || 0,

      // Розрахункові метрики
      averageEfficiency: calculateAverageEfficiency(
        parseInt(stats.total_flows),
        parseInt(stats.active_flows)
      ),
      flowsGrowth: null, // Можна додати пізніше якщо потрібен розрахунок росту
    };

    console.log("Статистика потоків з БД:", formattedStats);
    return formattedStats;
  } catch (error) {
    console.error("Помилка при отриманні статистики потоків:", error);
    throw new Error("Помилка бази даних при отриманні статистики потоків");
  }
};
/**
 * Розрахунок середньої ефективності
 * @param {number} totalFlows - Загальна кількість потоків
 * @param {number} activeFlows - Кількість активних потоків
 * @returns {number} Ефективність у відсотках
 */
const calculateAverageEfficiency = (totalFlows, activeFlows) => {
  if (totalFlows === 0) return 0;

  // Базова ефективність на основі активних потоків
  const baseEfficiency = (activeFlows / totalFlows) * 100;

  // Додаємо бонус за кількість потоків (більше потоків = вища потенційна ефективність)
  const volumeBonus = Math.min(totalFlows * 2, 25); // Максимум 25% бонусу

  // Обмежуємо до 95% максимум
  return Math.min(baseEfficiency + volumeBonus, 95);
};

/**
 * Отримання статистики потоків за партнерами
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Array>} Статистика за партнерами
 */
const getFlowStatsByPartners = async (options = {}) => {
  const { dateFrom, dateTo, limit = 20 } = options;

  const conditions = ["f.is_active = true"];
  const params = [];
  let paramIndex = 1;

  if (dateFrom) {
    conditions.push(`fs.date_from >= ${paramIndex++}`);
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(`fs.date_to <= ${paramIndex++}`);
    params.push(dateTo);
  }

  const query = `
    SELECT 
      p.id as partner_id,
      p.name as partner_name,
      p.type as partner_type,
      COUNT(DISTINCT f.id) as flows_count,
      COUNT(DISTINCT o.id) as offers_count,
      SUM(COALESCE(fs.clicks, 0)) as total_clicks,
      SUM(COALESCE(fs.conversions, 0)) as total_conversions,
      SUM(COALESCE(fs.revenue, 0)) as total_revenue,
      SUM(COALESCE(fs.leads, 0)) as total_leads,
      AVG(f.cpa) as avg_cpa,
      CASE 
        WHEN SUM(COALESCE(fs.impressions, 0)) > 0 
        THEN ROUND((SUM(COALESCE(fs.clicks, 0))::numeric / SUM(COALESCE(fs.impressions, 0))::numeric), 4)
        ELSE 0 
      END as avg_ctr,
      CASE 
        WHEN SUM(COALESCE(fs.clicks, 0)) > 0 
        THEN ROUND((SUM(COALESCE(fs.conversions, 0))::numeric / SUM(COALESCE(fs.clicks, 0))::numeric), 4)
        ELSE 0 
      END as avg_cr
    FROM partners p
    LEFT JOIN offers o ON p.id = o.partner_id
    LEFT JOIN flows f ON o.id = f.offer_id
    LEFT JOIN flow_stats fs ON f.id = fs.flow_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY p.id, p.name, p.type
    HAVING COUNT(DISTINCT f.id) > 0
    ORDER BY total_revenue DESC
    LIMIT ${paramIndex}
  `;

  params.push(limit);

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Допоміжні методи
 */

/**
 * Оновлення статусу потоку
 * @param {number} id - ID потоку
 * @param {string} status - Новий статус
 * @param {number} updatedBy - ID користувача
 * @returns {Promise<Object|null>} Оновлений потік або null
 */
const updateFlowStatus = async (id, status, updatedBy) => {
  const query = `
    UPDATE flows
    SET status = $1, updated_by = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `;

  const result = await db.query(query, [status, updatedBy, id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Оновлення активності потоку
 * @param {number} id - ID потоку
 * @param {boolean} isActive - Новий статус активності
 * @param {number} updatedBy - ID користувача
 * @returns {Promise<Object|null>} Оновлений потік або null
 */
const updateFlowActiveStatus = async (id, isActive, updatedBy) => {
  const query = `
    UPDATE flows
    SET is_active = $1, updated_by = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `;

  const result = await db.query(query, [isActive, updatedBy, id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Масове оновлення статусу потоків
 * @param {Array<number>} flowIds - Масив ID потоків
 * @param {string} status - Новий статус
 * @param {number} updatedBy - ID користувача
 * @returns {Promise<Array>} Оновлені потоки
 */
const bulkUpdateFlowStatus = async (flowIds, status, updatedBy) => {
  if (!flowIds || flowIds.length === 0) {
    return [];
  }

  const placeholders = flowIds.map((_, index) => `${index + 3}`).join(",");

  const query = `
    UPDATE flows
    SET status = $1, updated_by = $2, updated_at = NOW()
    WHERE id IN (${placeholders})
    RETURNING *
  `;

  const params = [status, updatedBy, ...flowIds];
  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Перевірка доступу користувача до потоку
 * @param {number} flowId - ID потоку
 * @param {number} userId - ID користувача
 * @returns {Promise<boolean>} Чи має доступ користувач
 */
const checkUserFlowAccess = async (flowId, userId) => {
  const query = `
    SELECT 1 FROM flow_users 
    WHERE flow_id = $1 AND user_id = $2 AND status = 'active'
  `;

  const result = await db.query(query, [flowId, userId]);
  return result.rows.length > 0;
};

/**
 * Отримання потоків користувача
 * @param {number} userId - ID користувача
 * @param {Object} options - Опції фільтрації
 * @returns {Promise<Array>} Список потоків користувача
 */
const getUserFlows = async (userId, options = {}) => {
  const { status, onlyActive = true, limit = 50, offset = 0 } = options;

  const conditions = ["fu.user_id = $1"];
  const params = [userId];
  let paramIndex = 2;

  if (onlyActive) {
    conditions.push("fu.status = 'active'");
    conditions.push("f.is_active = true");
  }

  if (status) {
    conditions.push(`f.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  const query = `
    SELECT 
      f.*,
      fu.joined_at,
      o.name as offer_name,
      g.name as geo_name,
      p.name as partner_name
    FROM flow_users fu
    JOIN flows f ON fu.flow_id = f.id
    LEFT JOIN offers o ON f.offer_id = o.id
    LEFT JOIN geos g ON f.geo_id = g.id
    LEFT JOIN partners p ON o.partner_id = p.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY fu.joined_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const result = await db.query(query, params);
  return result.rows;
};

/**
 * Отримання кількості непрочитаних повідомлень користувача
 * @param {number} userId - ID користувача
 * @param {number} flowId - ID потоку (опційно)
 * @returns {Promise<number>} Кількість непрочитаних повідомлень
 */
const getUnreadMessagesCount = async (userId, flowId = null) => {
  const conditions = ["fc.recipient_id = $1", "fc.is_read = false"];
  const params = [userId];
  let paramIndex = 2;

  if (flowId) {
    conditions.push(`fc.flow_id = ${paramIndex++}`);
    params.push(flowId);
  }

  const query = `
    SELECT COUNT(*) as unread_count
    FROM flow_communications fc
    WHERE ${conditions.join(" AND ")}
  `;

  const result = await db.query(query, params);
  return parseInt(result.rows[0].unread_count);
};

/**
 * Валідація даних потоку
 * @param {Object} flowData - Дані потоку
 * @returns {Object} Результат валідації
 */
const validateFlowData = (flowData) => {
  const errors = [];

  if (!flowData.name || flowData.name.trim().length === 0) {
    errors.push("Назва потоку є обов'язковою");
  }

  if (flowData.name && flowData.name.length > 255) {
    errors.push("Назва потоку не може перевищувати 255 символів");
  }

  if (!flowData.offer_id) {
    errors.push("Оффер є обов'язковим");
  }

  if (flowData.team_id && isNaN(parseInt(flowData.team_id))) {
    errors.push("Недійсний ID команди");
  }

  if (flowData.cpa && flowData.cpa < 0) {
    errors.push("CPA не може бути від'ємним");
  }

  if (
    flowData.currency &&
    !["USD", "EUR", "GBP", "UAH"].includes(flowData.currency)
  ) {
    errors.push("Недійсна валюта");
  }

  if (
    flowData.status &&
    !["active", "paused", "stopped", "pending"].includes(flowData.status)
  ) {
    errors.push("Недійсний статус потоку");
  }

  if (flowData.start_date && flowData.stop_date) {
    const startDate = new Date(flowData.start_date);
    const stopDate = new Date(flowData.stop_date);

    if (stopDate <= startDate) {
      errors.push("Дата завершення має бути пізніше дати початку");
    }
  }

  // Валідація користувачів
  if (flowData.users && Array.isArray(flowData.users)) {
    let totalPercentage = 0;

    for (const user of flowData.users) {
      if (!user.user_id) {
        errors.push("ID користувача є обов'язковим");
      }

      if (user.percentage && (user.percentage < 0 || user.percentage > 100)) {
        errors.push("Відсоток має бути між 0 та 100");
      }

      if (user.individual_cpa && user.individual_cpa < 0) {
        errors.push("Індивідуальний CPA не може бути від'ємним");
      }

      totalPercentage += user.percentage || 0;
    }

    if (totalPercentage > 100) {
      errors.push(
        `Загальний відсоток не може перевищувати 100%. Поточна сума: ${totalPercentage}%`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  // Основні CRUD операції
  getAllFlows,
  getFlowById,
  createFlow,
  updateFlow,
  deleteFlow,

  // Робота з командами
  getFlowsByTeam,
  transferFlowToTeam,
  getFlowStatsByTeams,

  // Робота з користувачами
  addUserToFlow,
  updateUserInFlow,
  removeUserFromFlow,
  getFlowUsers,
  checkUserFlowAccess,
  getUserFlows,

  // Комунікації
  sendMessageToUser,
  sendNotificationToAllUsers,
  getFlowCommunications,
  markMessageAsRead,
  getUnreadMessagesCount,

  // Статистика
  upsertFlowStats,
  getFlowStats,
  getTopUsersByMetric,
  getAllFlowsStats,
  getFlowStatsByPartners,

  // Допоміжні методи
  updateFlowStatus,
  updateFlowActiveStatus,
  bulkUpdateFlowStatus,
  validateFlowData,
};
