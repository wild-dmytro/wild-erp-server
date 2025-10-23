/**
 * Модель для роботи з потоками (flows)
 * Оновлено для підтримки типів потоків (cpa/spend) та KPI метрик
 * Адаптовано наявні методи під нову логіку
 */

const db = require("../config/db");

/**
 * Константи для типів потоків та метрик
 */
const FLOW_TYPES = {
  CPA: "cpa",
  SPEND: "spend",
};

const KPI_METRICS = {
  OAS: "OAS",
  CPD: "CPD",
  RD: "RD",
  URD: "URD",
};

/**
 * Отримання всіх потоків з пагінацією та фільтрацією
 * ОНОВЛЕНО: додано поля flow_type, kpi_metric, kpi_target_value, spend_percentage_ranges,
 * integration_status, integration_tasks, ready_at
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
    flow_type,
    kpi_metric,
    integration_status,
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

  if (flow_type) {
    conditions.push(`f.flow_type = $${paramIndex++}`);
    params.push(flow_type);
  }

  if (kpi_metric) {
    conditions.push(`f.kpi_metric = $${paramIndex++}`);
    params.push(kpi_metric);
  }

  // ДОДАНО: фільтр за integration_status
  if (integration_status) {
    conditions.push(`f.integration_status = $${paramIndex++}`);
    params.push(integration_status);
  }

  if (startDate) {
    conditions.push(`f.created_at >= $${paramIndex++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`f.created_at <= $${paramIndex++}`);
    params.push(endDate);
  }

  // Пошук - використовуємо один параметр для всіх умов
  if (search) {
    const searchParam = `%${search}%`;
    conditions.push(
      `(f.name ILIKE $${paramIndex} OR f.description ILIKE $${paramIndex} OR o.name ILIKE $${paramIndex} OR g.name ILIKE $${paramIndex} OR tm.name ILIKE $${paramIndex} OR b.name ILIKE $${paramIndex})`
    );
    params.push(searchParam);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Зберігаємо базові параметри для count запиту
  const baseParams = [...params];

  // ОНОВЛЕНО: Запит для отримання даних з новими полями
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
      f.flow_type,
      f.kpi_metric,
      f.kpi_target_value,
      f.spend_percentage_ranges,
      f.integration_status,
      f.integration_tasks,
      f.ready_at,
      
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
      db.query(countQuery, baseParams),
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
 * ОНОВЛЕНО: Отримання потоку за ID з повною інформацією включно з новими полями
 * (integration_status, integration_tasks, ready_at)
 */
const getFlowById = async (id) => {
  const query = `
    SELECT 
      f.*,
      f.flow_type,
      f.kpi_metric,
      f.kpi_target_value,
      f.spend_percentage_ranges,
      f.integration_status,
      f.integration_tasks,
      f.ready_at,
      
      o.name as offer_name,
      o.conditions as offer_conditions,
      o.kpi as offer_kpi,
      g.name as geo_name,
      g.country_code as geo_code,
      tm.name as team_name,
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

  return {
    ...flow,
    users: usersResult.rows,
  };
};

/**
 * ОНОВЛЕНО: Створення нового потоку з підтримкою типів та KPI
 */
const createFlow = async (flowData) => {
  const {
    offer_id,
    geo_id,
    team_id,
    flow_type,
    kpi_metric,
    kpi_target_value,
    spend_percentage_ranges,
    status = "draft",
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
    integration_status = "to_do",
    integration_tasks = [],
  } = flowData;

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // 1. Отримуємо назву команди
    const teamQuery = await client.query(
      "SELECT name FROM teams WHERE id = $1",
      [team_id]
    );

    if (teamQuery.rows.length === 0) {
      throw new Error("Команда не знайдена");
    }

    const teamName = teamQuery.rows[0].name;

    // 2. Отримуємо назву офферу
    const offerQuery = await client.query(
      "SELECT name FROM offers WHERE id = $1",
      [offer_id]
    );

    if (offerQuery.rows.length === 0) {
      throw new Error("Офер не знайдений");
    }

    const offerName = offerQuery.rows[0].name;

    // 3. Отримуємо наступний послідовний ID для потоку
    const maxIdQuery = await client.query(
      "SELECT MAX(id) as max_id FROM flows"
    );

    const nextId = (maxIdQuery.rows[0].max_id || 0) + 1;

    // 4. Генеруємо назву у форматі: Команда-Офер-ID
    // Замінюємо всі пробіли на дефіси
    const generatedName = `${teamName}-${offerName}-${nextId}`
      .replace(/\s+/g, "-") // Замінюємо пробіли на дефіси
      .replace(/-+/g, "-"); // Видаляємо подвійні дефіси

    // 5. Перевіряємо унікальність генерованої назви (на випадок)
    const nameCheck = await client.query(
      "SELECT id FROM flows WHERE name = $1",
      [generatedName]
    );

    if (nameCheck.rows.length > 0) {
      throw new Error(`Потік з назвою "${generatedName}" уже існує`);
    }

    // 6. Валідуємо integration_status
    const validIntegrationStatuses = ["to_do", "pending", "completed"];
    if (!validIntegrationStatuses.includes(integration_status)) {
      throw new Error(`Невалідний integration_status: ${integration_status}`);
    }

    // 7. Встановлюємо ready_at якщо integration_status = completed
    const readyAt = integration_status === "completed" ? new Date() : null;

    // 8. Створюємо потік з генерованою назвою
    const flowQuery = `
      INSERT INTO flows (
        name, offer_id, geo_id, team_id, flow_type, kpi_metric,
        kpi_target_value, spend_percentage_ranges, status, cpa, currency, is_active,
        start_date, stop_date, conditions, description, notes, cap, kpi, landings, 
        integration_status, integration_tasks, ready_at, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $24)
      RETURNING *
    `;

    const flowResult = await client.query(flowQuery, [
      generatedName,
      offer_id,
      geo_id,
      team_id,
      flow_type,
      kpi_metric,
      kpi_target_value || null,
      spend_percentage_ranges ? JSON.stringify(spend_percentage_ranges) : null,
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
      integration_status,
      integration_tasks && integration_tasks.length > 0
        ? JSON.stringify(integration_tasks)
        : null,
      readyAt,
      created_by,
    ]);

    const newFlow = flowResult.rows[0];

    // 7. Додаємо користувачів до потоку
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
 * ОНОВЛЕНО: Оновлення потоку з підтримкою нових полів
 */
const updateFlow = async (id, flowData) => {
  const {
    name,
    offer_id,
    geo_id,
    team_id,
    flow_type,
    kpi_metric,
    kpi_target_value,
    spend_percentage_ranges,
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
    integration_status,
    integration_tasks,
    updated_by,
    users,
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

  if (flow_type !== undefined) {
    setClauses.push(`flow_type = $${paramIndex++}`);
    values.push(flow_type);
  }

  if (kpi_metric !== undefined) {
    setClauses.push(`kpi_metric = $${paramIndex++}`);
    values.push(kpi_metric);
  }

  if (kpi_target_value !== undefined) {
    setClauses.push(`kpi_target_value = $${paramIndex++}`);
    values.push(kpi_target_value);
  }

  if (spend_percentage_ranges !== undefined) {
    setClauses.push(`spend_percentage_ranges = $${paramIndex++}`);
    values.push(
      spend_percentage_ranges ? JSON.stringify(spend_percentage_ranges) : null
    );
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

  // ДОДАНО: підтримка нових полів
  if (integration_status !== undefined) {
    const validIntegrationStatuses = ["to_do", "pending", "completed"];
    if (!validIntegrationStatuses.includes(integration_status)) {
      throw new Error(`Невалідний integration_status: ${integration_status}`);
    }

    setClauses.push(`integration_status = $${paramIndex++}`);
    values.push(integration_status);

    // Встановлюємо ready_at якщо integration_status = completed
    if (integration_status === "completed") {
      setClauses.push(`ready_at = $${paramIndex++}`);
      values.push(new Date());
    }
  }

  if (integration_tasks !== undefined) {
    setClauses.push(`integration_tasks = $${paramIndex++}`);
    values.push(
      integration_tasks && integration_tasks.length > 0
        ? JSON.stringify(integration_tasks)
        : null
    );
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

  // Оновлюємо зв'язки, якщо вони передані
  if (users !== undefined) {
    if (users.length > 0) {
      const userIds = users.map((elem) => elem.user_id);

      // Отримуємо ID користувачів, які вже існують
      const existingResult = await db.query(
        `SELECT user_id FROM flow_users WHERE flow_id = $1 AND user_id = ANY($2)`,
        [id, userIds]
      );

      const existingUserIds = new Set(
        existingResult.rows.map((row) => row.user_id)
      );

      // Фільтруємо тільки нових користувачів
      const newUserIds = userIds.filter(
        (userId) => !existingUserIds.has(userId)
      );

      if (newUserIds.length > 0) {
        const userValues = newUserIds
          .map((userId, index) => `($1, $${index + 2})`)
          .join(", ");
        const userParams = [id, ...newUserIds];

        await db.query(
          `INSERT INTO flow_users (flow_id, user_id) VALUES ${userValues}`,
          userParams
        );
      }
    }
  }

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Видалення потоку (без змін)
 */
const deleteFlow = async (id) => {
  try {
    // Перевіряємо наявність пов'язаних записів
    const [statsResult, payoutFlowsResult] = await Promise.all([
      db.query("SELECT COUNT(*) as count FROM flow_stats WHERE flow_id = $1", [
        id,
      ]),
      db.query(
        "SELECT COUNT(*) as count FROM partner_payout_flows WHERE flow_id = $1",
        [id]
      ),
    ]);

    const hasStats = parseInt(statsResult.rows[0]?.count) > 0;
    const hasPayoutFlows = parseInt(payoutFlowsResult.rows[0]?.count) > 0;

    if (hasStats || hasPayoutFlows) {
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
      success: result.rows?.length > 0,
      message:
        result.rows?.length > 0
          ? "Потік успішно видалено"
          : "Потік не знайдено",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Помилка при видаленні потоку",
      error: error.message,
    };
  }
};

/**
 * Отримання користувачів потоку (без змін)
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
 * ОНОВЛЕНО: Отримання загальної статистики всіх потоків з урахуванням типів
 */
const getAllFlowsStats = async (options = {}) => {
  const {
    dateFrom,
    dateTo,
    status,
    partnerId,
    userIds,
    teamIds,
    onlyActive,
    // ДОДАНО: фільтри за типом
    flow_type,
    kpi_metric,
  } = options;

  // Будуємо умови фільтрації
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  console.log(onlyActive);

  // Фільтр за активністю
  if (onlyActive) {
    conditions.push("f.is_active = true");
  }

  console.log(conditions);

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

  // ДОДАНО: фільтри за типом потоку та метрикою
  if (flow_type) {
    conditions.push(`f.flow_type = $${paramIndex++}`);
    params.push(flow_type);
  }

  if (kpi_metric) {
    conditions.push(`f.kpi_metric = $${paramIndex++}`);
    params.push(kpi_metric);
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
    // ОНОВЛЕНО: Основний запит для отримання всіх метрик включно з типами
    const statsQuery = `
      SELECT 
        -- Загальна кількість потоків
        COUNT(DISTINCT f.id) as total_flows,
        
        -- Потоки за статусами
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'paused') as paused_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'stopped') as stopped_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'archived') as archived_flows,
        
        -- ДОДАНО: Потоки за типами
        COUNT(DISTINCT f.id) FILTER (WHERE f.flow_type = 'cpa') as cpa_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.flow_type = 'spend') as spend_flows,
        
        -- ДОДАНО: Потоки за метриками KPI
        COUNT(DISTINCT f.id) FILTER (WHERE f.kpi_metric = 'OAS') as oas_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.kpi_metric = 'CPD') as cpd_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.kpi_metric = 'RD') as rd_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.kpi_metric = 'URD') as urd_flows,
        
        -- Унікальні значення
        COUNT(DISTINCT f.offer_id) FILTER (WHERE f.offer_id IS NOT NULL) as unique_offers,
        COUNT(DISTINCT f.geo_id) FILTER (WHERE f.geo_id IS NOT NULL) as unique_geos,
        COUNT(DISTINCT o.brand_id) FILTER (WHERE o.brand_id IS NOT NULL) as unique_brands,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.user_id IS NOT NULL AND fu.status = 'active') as total_users,
        
        COUNT(DISTINCT f.team_id) FILTER (WHERE f.team_id IS NOT NULL) as unique_teams
        
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
      ${whereClause}
    `;

    console.log("Запит статистики з параметрами:", { options, params });

    const result = await db.query(statsQuery, params);
    const stats = result.rows[0];

    // ОНОВЛЕНО: Форматуємо результат з новими полями
    const formattedStats = {
      // Загальна кількість
      totalFlows: parseInt(stats.total_flows) || 0,

      // Потоки за статусами
      activeFlows: parseInt(stats.active_flows) || 0,
      pausedFlows: parseInt(stats.paused_flows) || 0,
      stoppedFlows: parseInt(stats.stopped_flows) || 0,
      archivedFlows: parseInt(stats.archived_flows) || 0,

      // ДОДАНО: Потоки за типами
      cpaFlows: parseInt(stats.cpa_flows) || 0,
      spendFlows: parseInt(stats.spend_flows) || 0,

      // ДОДАНО: Потоки за метриками KPI
      kpiMetricsUsage: {
        OAS: parseInt(stats.oas_flows) || 0,
        CPD: parseInt(stats.cpd_flows) || 0,
        RD: parseInt(stats.rd_flows) || 0,
        URD: parseInt(stats.urd_flows) || 0,
      },

      // Унікальні значення
      uniqueOffers: parseInt(stats.unique_offers) || 0,
      uniqueGeos: parseInt(stats.unique_geos) || 0,
      uniqueBrands: parseInt(stats.unique_brands) || 0,
      totalUsers: parseInt(stats.total_users) || 0,
      uniqueTeams: parseInt(stats.unique_teams) || 0,
    };

    console.log("Статистика потоків з БД:", formattedStats);
    return formattedStats;
  } catch (error) {
    console.error("Помилка при отриманні статистики потоків:", error);
    throw new Error("Помилка бази даних при отриманні статистики потоків");
  }
};

/**
 * Оновлення статусу потоку (без змін)
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
 * Оновлення активності потоку (без змін)
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

module.exports = {
  // Константи
  FLOW_TYPES,
  KPI_METRICS,

  // Основні CRUD операції
  getAllFlows,
  getFlowById,
  createFlow,
  updateFlow,
  deleteFlow,
  getFlowUsers,

  // Статистика
  getAllFlowsStats,
  updateFlowStatus,
  updateFlowActiveStatus,
};
