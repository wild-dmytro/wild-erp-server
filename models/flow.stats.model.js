const db = require("../config/db");

/**
 * Модель для роботи зі статистикою потоків (P/L таблиці)
 */

/**
 * Створення або оновлення статистики за день
 * @param {Object} data - Дані статистики
 * @param {number} data.flow_id - ID потоку
 * @param {number} data.user_id - ID користувача (ОБОВ'ЯЗКОВО)
 * @param {number} data.day - День (1-31)
 * @param {number} data.month - Місяць (1-12)
 * @param {number} data.year - Рік
 * @param {number} [data.spend] - Витрати
 * @param {number} [data.installs] - Інстали
 * @param {number} [data.regs] - Реєстрації
 * @param {number} [data.deps] - Депозити
 * @param {number} [data.verified_deps] - Верифіковані депозити
 * @param {number} [data.deposit_amount] - Сума депозитів (НОВИЙ)
 * @param {number} [data.redep_count] - Кількість редепозитів (НОВИЙ)
 * @param {number} [data.unique_redep_count] - Кількість унікальних редепозитів (НОВИЙ)
 * @param {string} [data.notes] - Примітки
 * @param {number} data.updated_by - ID користувача, що оновлює
 * @returns {Promise<Object>} Створений або оновлений запис
 */
const upsertFlowStat = async (data) => {
  const {
    flow_id,
    user_id, // НОВИЙ ОБОВ'ЯЗКОВИЙ ПАРАМЕТР
    day,
    month,
    year,
    spend = 0,
    installs = 0,
    regs = 0,
    deps = 0,
    verified_deps = 0,
    deposit_amount = 0, // НОВИЙ
    redep_count = 0, // НОВИЙ
    unique_redep_count = 0, // НОВИЙ
    notes = null,
    updated_by,
  } = data;

  // ОНОВЛЕНО: перевіряємо обов'язкові поля включно з user_id
  if (!flow_id || !user_id || !day || !month || !year) {
    throw new Error("Обов'язкові поля: flow_id, user_id, day, month, year");
  }

  // Перевіряємо, що дата коректна
  const date = new Date(year, month - 1, day);
  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== year
  ) {
    throw new Error("Некоректна дата");
  }

  // Перевіряємо, що користувач належить до потоку
  const userFlowCheck = await db.query(
    `SELECT 1 FROM flow_users 
     WHERE flow_id = $1 AND user_id = $2 AND status = 'active'`,
    [flow_id, user_id]
  );

  if (userFlowCheck.rows.length === 0) {
    throw new Error("Користувач не належить до цього потоку або неактивний");
  }

  // ОНОВЛЕНО: отримуємо CPA з потоку, якщо тип потоку - cpa
  let cpa_value = 0;
  const flowQuery = await db.query(
    `SELECT flow_type, cpa FROM flows WHERE id = $1`,
    [flow_id]
  );

  if (flowQuery.rows.length > 0 && flowQuery.rows[0].flow_type === "cpa") {
    cpa_value = flowQuery.rows[0].cpa || 0;
  }

  // ОНОВЛЕНО: запит з новими полями та логікою CPA
  const query = `
    INSERT INTO flow_stats (
      flow_id, user_id, day, month, year, spend, installs, regs, deps, 
      verified_deps, cpa, deposit_amount, redep_count, unique_redep_count,
      notes, created_by, updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
    ON CONFLICT (flow_id, user_id, day, month, year)
    DO UPDATE SET
      spend = EXCLUDED.spend,
      installs = EXCLUDED.installs,
      regs = EXCLUDED.regs,
      deps = EXCLUDED.deps,
      verified_deps = EXCLUDED.verified_deps,
      deposit_amount = EXCLUDED.deposit_amount,
      redep_count = EXCLUDED.redep_count,
      unique_redep_count = EXCLUDED.unique_redep_count,
      notes = EXCLUDED.notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING *, 
      CASE 
        WHEN spend > 0 AND deps > 0 AND cpa > 0
        THEN ROUND(((deps * cpa - spend) / spend * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      CASE 
        WHEN installs > 0 
        THEN ROUND((regs::numeric / installs * 100)::numeric, 2)
        ELSE 0 
      END as inst2reg,
      CASE 
        WHEN regs > 0 
        THEN ROUND((deps::numeric / regs * 100)::numeric, 2)
        ELSE 0 
      END as reg2dep
  `;

  try {
    const result = await db.query(query, [
      flow_id,
      user_id,
      day,
      month,
      year,
      spend,
      installs,
      regs,
      deps,
      verified_deps,
      cpa_value,
      deposit_amount,
      redep_count,
      unique_redep_count,
      notes,
      updated_by,
    ]);
    return result.rows[0];
  } catch (error) {
    console.error("Помилка при збереженні статистики:", error);
    throw error;
  }
};

/**
 * ОНОВЛЕНО: Отримання денної статистики потоків з урахуванням користувачів
 */
const getDailyFlowsStats = async (options) => {
  const {
    year,
    month,
    day,
    partnerId,
    partnerIds,
    status,
    teamId,
    userId,
    onlyActive,
    includeUsers,
    page = 1,
    limit = 20,
    offset = 0,
  } = options;

  let conditions = [];
  let params = [year, month, day];
  let paramIndex = 3;

  // Базові фільтри
  if (partnerId) {
    paramIndex++;
    conditions.push(`o.partner_id = $${paramIndex}`);
    params.push(partnerId);
  }

  if (partnerIds && partnerIds.length > 0) {
    paramIndex++;
    conditions.push(`o.partner_id = ANY($${paramIndex})`);
    params.push(partnerIds);
  }

  if (status) {
    paramIndex++;
    conditions.push(`f.status = $${paramIndex}`);
    params.push(status);
  }

  if (teamId) {
    paramIndex++;
    conditions.push(`f.team_id = $${paramIndex}`);
    params.push(teamId);
  }

  if (userId) {
    paramIndex++;
    conditions.push(`fu.user_id = $${paramIndex}`);
    params.push(userId);
  }

  if (onlyActive) {
    conditions.push(`f.is_active = true`);
    conditions.push(`fu.status = 'active'`);
  }

  const whereClause =
    conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  // ОНОВЛЕНО: основний запит з врахуванням user_id в статистиці
  const query = `
    WITH flow_users_data AS (
      SELECT DISTINCT 
        f.id as flow_id,
        f.name as flow_name,
        f.status as flow_status,
        f.cpa as flow_cpa,
        f.currency as flow_currency,
        f.description as flow_description,
        f.flow_type,
        f.kpi_metric,
        
        -- Дані партнера
        p.id as partner_id,
        p.name as partner_name,
        p.type as partner_type,
        p.is_active as partner_is_active,
        p.contact_telegram as partner_telegram,
        p.contact_email as partner_email,
        
        -- Дані офферу
        o.id as offer_id,
        o.name as offer_name,
        o.description as offer_description,
        
        -- Дані команди
        t.id as team_id_full,
        t.name as team_name,
        
        -- Дані гео
        g.id as geo_id,
        g.name as geo_name,
        g.country_code as geo_country_code,
        
        -- Дані користувачів потоку
        fu.user_id,
        u.username,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) as user_full_name,
        u.role as user_role
        
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN geos g ON f.geo_id = g.id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id AND fu.status = 'active'
      LEFT JOIN users u ON fu.user_id = u.id
      WHERE 1=1 ${whereClause}
    ),
    
    stats_data AS (
      SELECT 
        fud.*,
        -- ОНОВЛЕНО: статистика за користувачем
        fs.id as stats_id,
        fs.user_id as stats_user_id,
        fs.spend,
        fs.installs,
        fs.regs,
        fs.deps,
        fs.verified_deps,
        fs.cpa as stats_cpa,
        fs.deposit_amount,
        fs.redep_count,
        fs.unique_redep_count,
        fs.notes as stats_notes,
        fs.created_at as stats_created_at,
        fs.updated_at as stats_updated_at,
        
        -- Обчислювальні поля
        CASE 
          WHEN fs.id IS NOT NULL AND fs.spend > 0 AND fs.deps > 0 AND fs.cpa > 0
          THEN ROUND(((fs.deps * fs.cpa - fs.spend) / fs.spend * 100)::numeric, 2)
          ELSE NULL 
        END as roi,
        CASE 
          WHEN fs.id IS NOT NULL AND fs.installs > 0 
          THEN ROUND((fs.regs::numeric / fs.installs * 100)::numeric, 2)
          ELSE NULL 
        END as inst2reg,
        CASE 
          WHEN fs.id IS NOT NULL AND fs.regs > 0 
          THEN ROUND((fs.deps::numeric / fs.regs * 100)::numeric, 2)
          ELSE NULL 
        END as reg2dep
        
      FROM flow_users_data fud
      LEFT JOIN flow_stats fs ON fud.flow_id = fs.flow_id 
        AND fud.user_id = fs.user_id 
        AND fs.day = $1 AND fs.month = $2 AND fs.year = $3
    )
    
    SELECT 
      sd.*,
      CASE WHEN sd.stats_id IS NOT NULL THEN true ELSE false END as has_stats
    FROM stats_data sd
    ORDER BY sd.flow_name, sd.user_full_name
    LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
  `;

  params.push(limit, offset);

  // Запит для підрахунку загальної кількості
  const countQuery = `
    SELECT COUNT(DISTINCT CONCAT(f.id, '-', fu.user_id)) as total
    FROM flows f
    LEFT JOIN offers o ON f.offer_id = o.id
    LEFT JOIN partners p ON o.partner_id = p.id
    LEFT JOIN flow_users fu ON f.id = fu.flow_id AND fu.status = 'active'
    WHERE 1=1 ${whereClause}
  `;

  try {
    const [flowsResult, countResult] = await Promise.all([
      db.query(query, params.slice(0, -2).concat([limit, offset])),
      db.query(countQuery, params.slice(0, params.length - 2)),
    ]);

    // Групуємо результати по потоках та користувачах
    const flowsMap = new Map();

    flowsResult.rows.forEach((row) => {
      const flowKey = `${row.flow_id}-${row.user_id}`;

      if (!flowsMap.has(flowKey)) {
        flowsMap.set(flowKey, {
          flow_id: row.flow_id,
          flow_name: row.flow_name,
          flow_status: row.flow_status,
          flow_cpa: row.flow_cpa,
          flow_currency: row.flow_currency,
          flow_description: row.flow_description,
          flow_type: row.flow_type,
          kpi_metric: row.kpi_metric,

          partner: {
            id: row.partner_id,
            name: row.partner_name,
            type: row.partner_type,
            is_active: row.partner_is_active,
            telegram: row.partner_telegram,
            email: row.partner_email,
          },

          offer: {
            id: row.offer_id,
            name: row.offer_name,
            description: row.offer_description,
          },

          team: {
            id: row.team_id_full,
            name: row.team_name,
          },

          geo: {
            id: row.geo_id,
            name: row.geo_name,
            country_code: row.geo_country_code,
          },

          user: {
            id: row.user_id,
            username: row.username,
            first_name: row.first_name,
            last_name: row.last_name,
            full_name: row.user_full_name,
            role: row.user_role,
          },

          stats: row.has_stats
            ? {
                id: row.stats_id,
                spend: parseFloat(row.spend) || 0,
                installs: parseInt(row.installs) || 0,
                regs: parseInt(row.regs) || 0,
                deps: parseInt(row.deps) || 0,
                verified_deps: parseInt(row.verified_deps) || 0,
                cpa: parseFloat(row.stats_cpa) || 0,
                deposit_amount: parseFloat(row.deposit_amount) || 0,
                redep_count: parseInt(row.redep_count) || 0,
                unique_redep_count: parseInt(row.unique_redep_count) || 0,
                roi: parseFloat(row.roi) || 0,
                inst2reg: parseFloat(row.inst2reg) || 0,
                reg2dep: parseFloat(row.reg2dep) || 0,
                notes: row.stats_notes,
                created_at: row.stats_created_at,
                updated_at: row.stats_updated_at,
              }
            : null,

          has_stats: row.has_stats,
        });
      }
    });

    return {
      flows: Array.from(flowsMap.values()),
      totalCount: parseInt(countResult.rows[0].total) || 0,
    };
  } catch (error) {
    console.error("Помилка при отриманні денної статистики:", error);
    throw error;
  }
};

/**
 * ОНОВЛЕНО: Перевірка доступу користувача до редагування статистики потоку
 */
const checkUserAccess = async (flow_id, user_id, user_role) => {
  // Admin, bizdev, teamlead можуть переглядати та редагувати всю статистику
  if (["admin", "bizdev", "teamlead"].includes(user_role)) {
    const query = `SELECT 1 FROM flows WHERE id = $1 LIMIT 1`;
    const result = await db.query(query, [flow_id]);
    return result.rows.length > 0;
  }

  // Buyer може переглядати та редагувати лише свою статистику
  if (user_role === "buyer") {
    const query = `
      SELECT 1 FROM flow_users fu
      WHERE fu.flow_id = $1 AND fu.user_id = $2 AND fu.status = 'active'
      LIMIT 1
    `;
    const result = await db.query(query, [flow_id, user_id]);
    return result.rows.length > 0;
  }

  return false;
};

/**
 * ОНОВЛЕНО: Отримання статистики потоку з фільтрацією по користувачах
 */
const getFlowStats = async (
  flow_id,
  options = {},
  requesting_user_id,
  user_role
) => {
  const { month, year, dateFrom, dateTo, user_id } = options;

  let conditions = ["fs.flow_id = $1"];
  let params = [flow_id];
  let paramIndex = 1;

  // Фільтрація по користувачах в залежності від ролі
  if (user_role === "buyer") {
    // Buyer бачить лише свою статистику
    paramIndex++;
    conditions.push(`fs.user_id = $${paramIndex}`);
    params.push(requesting_user_id);
  } else if (user_id && ["admin", "bizdev", "teamlead"].includes(user_role)) {
    // Інші ролі можуть фільтрувати по конкретному користувачу
    paramIndex++;
    conditions.push(`fs.user_id = $${paramIndex}`);
    params.push(user_id);
  }

  // Фільтри по даті
  if (month && year) {
    paramIndex++;
    conditions.push(`fs.month = $${paramIndex}`);
    params.push(month);

    paramIndex++;
    conditions.push(`fs.year = $${paramIndex}`);
    params.push(year);
  }

  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    paramIndex++;
    conditions.push(
      `DATE(fs.year || '-' || fs.month || '-' || fs.day) >= $${paramIndex}`
    );
    params.push(fromDate.toISOString().split("T")[0]);
  }

  if (dateTo) {
    const toDate = new Date(dateTo);
    paramIndex++;
    conditions.push(
      `DATE(fs.year || '-' || fs.month || '-' || fs.day) <= $${paramIndex}`
    );
    params.push(toDate.toISOString().split("T")[0]);
  }

  const whereClause = conditions.join(" AND ");

  const query = `
    SELECT 
      fs.*,
      u.username,
      u.first_name,
      u.last_name,
      CONCAT(u.first_name, ' ', u.last_name) as user_full_name,
      
      CASE 
        WHEN fs.spend > 0 AND fs.deps > 0 AND fs.cpa > 0
        THEN ROUND(((fs.deps * fs.cpa - fs.spend) / fs.spend * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      CASE 
        WHEN fs.installs > 0 
        THEN ROUND((fs.regs::numeric / fs.installs * 100)::numeric, 2)
        ELSE 0 
      END as inst2reg,
      CASE 
        WHEN fs.regs > 0 
        THEN ROUND((fs.deps::numeric / fs.regs * 100)::numeric, 2)
        ELSE 0 
      END as reg2dep
    FROM flow_stats fs
    JOIN users u ON fs.user_id = u.id
    WHERE ${whereClause}
    ORDER BY fs.year DESC, fs.month DESC, fs.day DESC, u.first_name, u.last_name
  `;

  try {
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error("Помилка при отриманні статистики потоку:", error);
    throw error;
  }
};

/**
 * Видалення статистики за день (ОНОВЛЕНО з урахуванням user_id)
 */
const deleteFlowStat = async (flow_id, user_id, day, month, year) => {
  const query = `
    DELETE FROM flow_stats 
    WHERE flow_id = $1 AND user_id = $2 AND day = $3 AND month = $4 AND year = $5
  `;

  try {
    const result = await db.query(query, [flow_id, user_id, day, month, year]);
    return result.rowCount > 0;
  } catch (error) {
    console.error("Помилка при видаленні статистики:", error);
    throw error;
  }
};

/**
 * ОНОВЛЕНО: Отримання статистики користувача за місяць по днях з урахуванням user_id
 * @param {number} userId - ID користувача
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @param {number} requesting_user_id - ID користувача, що робить запит
 * @param {string} user_role - Роль користувача, що робить запит
 * @returns {Promise<Object>} Статистика по днях + загальна статистика
 */
const getUserMonthlyStats = async (
  userId,
  options = {},
  requesting_user_id,
  user_role
) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  // Перевірка прав доступу
  if (user_role === "buyer" && userId !== requesting_user_id) {
    throw new Error("Buyer може переглядати лише свою статистику");
  }

  try {
    // Отримуємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    // ОНОВЛЕНО: Основний запит з урахуванням user_id в flow_stats
    const dailyStatsQuery = `
      WITH days_series AS (
        SELECT generate_series(1, $3) as day
      ),
      user_flows AS (
        SELECT DISTINCT f.id as flow_id
        FROM flows f
        JOIN flow_users fu ON f.id = fu.flow_id
        WHERE fu.user_id = $1 AND fu.status = 'active'
      ),
      daily_data AS (
        SELECT 
          ds.day,
          COALESCE(SUM(fs.spend), 0) as total_spend,
          COALESCE(SUM(fs.installs), 0) as total_installs,
          COALESCE(SUM(fs.regs), 0) as total_regs,
          COALESCE(SUM(fs.deps), 0) as total_deps,
          COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
          COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
          COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
          COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
          COALESCE(AVG(fs.cpa), 0) as avg_cpa,
          COUNT(fs.id) as flows_with_stats,
          COUNT(DISTINCT fs.flow_id) as active_flows_count
        FROM days_series ds
        LEFT JOIN flow_stats fs ON ds.day = fs.day 
          AND fs.month = $2 
          AND fs.year = $4
          AND fs.user_id = $1
          AND fs.flow_id IN (SELECT flow_id FROM user_flows)
        GROUP BY ds.day
      )
      SELECT 
        day,
        total_spend,
        total_installs,
        total_regs,
        total_deps,
        total_verified_deps,
        total_deposit_amount,
        total_redep_count,
        total_unique_redep_count,
        avg_cpa,
        flows_with_stats,
        active_flows_count,
        -- Обчислювальні поля
        CASE 
          WHEN total_spend > 0 AND total_deps > 0 AND avg_cpa > 0
          THEN ROUND(((total_deps * avg_cpa - total_spend) / total_spend * 100)::numeric, 2)
          ELSE 0 
        END as roi,
        CASE 
          WHEN total_installs > 0 
          THEN ROUND((total_regs::numeric / total_installs * 100)::numeric, 2)
          ELSE 0 
        END as inst2reg,
        CASE 
          WHEN total_regs > 0 
          THEN ROUND((total_deps::numeric / total_regs * 100)::numeric, 2)
          ELSE 0 
        END as reg2dep,
        CASE 
          WHEN total_deps > 0 
          THEN ROUND((total_verified_deps::numeric / total_deps * 100)::numeric, 2)
          ELSE 0 
        END as verification_rate
      FROM daily_data
      ORDER BY day
    `;

    const dailyResult = await db.query(dailyStatsQuery, [
      userId,
      month,
      daysInMonth,
      year,
    ]);

    // ОНОВЛЕНО: Загальна статистика за місяць з новими полями
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as total_user_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_user_flows,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COALESCE(AVG(fs.cpa), 0) as avg_cpa,
        COUNT(fs.id) as total_stats_entries,
        COUNT(DISTINCT fs.flow_id) as flows_with_activity,
        COUNT(DISTINCT o.partner_id) as unique_partners,
        COUNT(DISTINCT f.team_id) as unique_teams,
        -- Найкращий день за ROI
        (SELECT day FROM flow_stats fs2 
         JOIN flows f2 ON fs2.flow_id = f2.id
         JOIN flow_users fu2 ON f2.id = fu2.flow_id
         WHERE fu2.user_id = $1 AND fu2.status = 'active'
         AND fs2.user_id = $1
         AND fs2.month = $2 AND fs2.year = $3
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         ORDER BY ((fs2.deps * fs2.cpa - fs2.spend) / fs2.spend * 100) DESC
         LIMIT 1) as best_roi_day,
        -- Найгірший день за ROI
        (SELECT day FROM flow_stats fs2 
         JOIN flows f2 ON fs2.flow_id = f2.id
         JOIN flow_users fu2 ON f2.id = fu2.flow_id
         WHERE fu2.user_id = $1 AND fu2.status = 'active'
         AND fs2.user_id = $1
         AND fs2.month = $2 AND fs2.year = $3
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         ORDER BY ((fs2.deps * fs2.cpa - fs2.spend) / fs2.spend * 100) ASC
         LIMIT 1) as worst_roi_day
      FROM flows f
      JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.user_id = $1
        AND fs.month = $2 AND fs.year = $3
      WHERE fu.user_id = $1 AND fu.status = 'active'
    `;

    const summaryResult = await db.query(summaryQuery, [userId, month, year]);
    const summary = summaryResult.rows[0];

    // Форматуємо результат з новими полями
    const dailyStats = dailyResult.rows.map((row) => ({
      day: parseInt(row.day),
      date: `${year}-${String(month).padStart(2, "0")}-${String(
        row.day
      ).padStart(2, "0")}`,
      metrics: {
        spend: parseFloat(row.total_spend) || 0,
        installs: parseInt(row.total_installs) || 0,
        regs: parseInt(row.total_regs) || 0,
        deps: parseInt(row.total_deps) || 0,
        verified_deps: parseInt(row.total_verified_deps) || 0,
        deposit_amount: parseFloat(row.total_deposit_amount) || 0,
        redep_count: parseInt(row.total_redep_count) || 0,
        unique_redep_count: parseInt(row.total_unique_redep_count) || 0,
        avg_cpa: parseFloat(row.avg_cpa) || 0,
      },
      calculated: {
        roi: parseFloat(row.roi) || 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
      },
      meta: {
        flows_with_stats: parseInt(row.flows_with_stats) || 0,
        active_flows_count: parseInt(row.active_flows_count) || 0,
        has_activity: parseInt(row.flows_with_stats) > 0,
      },
    }));

    // Обчислюємо загальні метрики з новими полями
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
      avg_cpa: parseFloat(summary.avg_cpa) || 0,
    };

    const totalCalculated = {
      roi:
        totalMetrics.spend > 0 &&
        totalMetrics.deps > 0 &&
        totalMetrics.avg_cpa > 0
          ? Math.round(
              ((totalMetrics.deps * totalMetrics.avg_cpa - totalMetrics.spend) /
                totalMetrics.spend) *
                100 *
                100
            ) / 100
          : 0,
      inst2reg:
        totalMetrics.installs > 0
          ? Math.round(
              (totalMetrics.regs / totalMetrics.installs) * 100 * 100
            ) / 100
          : 0,
      reg2dep:
        totalMetrics.regs > 0
          ? Math.round((totalMetrics.deps / totalMetrics.regs) * 100 * 100) /
            100
          : 0,
      verification_rate:
        totalMetrics.deps > 0
          ? Math.round(
              (totalMetrics.verified_deps / totalMetrics.deps) * 100 * 100
            ) / 100
          : 0,
    };

    return {
      user_id: userId,
      period: { month, year },
      daily_stats: dailyStats,
      summary: {
        total_flows: parseInt(summary.total_user_flows) || 0,
        active_flows: parseInt(summary.active_user_flows) || 0,
        flows_with_activity: parseInt(summary.flows_with_activity) || 0,
        unique_partners: parseInt(summary.unique_partners) || 0,
        unique_teams: parseInt(summary.unique_teams) || 0,
        total_stats_entries: parseInt(summary.total_stats_entries) || 0,
        metrics: totalMetrics,
        calculated: totalCalculated,
        best_roi_day: summary.best_roi_day,
        worst_roi_day: summary.worst_roi_day,
        days_with_activity: dailyStats.filter((day) => day.meta.has_activity)
          .length,
        avg_daily_spend: totalMetrics.spend / daysInMonth,
        avg_daily_deps: totalMetrics.deps / daysInMonth,
      },
    };
  } catch (error) {
    console.error("Помилка в getUserMonthlyStats:", error);
    throw new Error(
      `Помилка отримання статистики користувача: ${error.message}`
    );
  }
};

/**
 * ОНОВЛЕНО: Отримання статистики команди за місяць по днях з урахуванням user_id
 * @param {number} teamId - ID команди
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @param {number} requesting_user_id - ID користувача, що робить запит
 * @param {string} user_role - Роль користувача, що робить запит
 * @returns {Promise<Object>} Статистика по днях + загальна статистика
 */
const getTeamMonthlyStats = async (
  teamId,
  options = {},
  requesting_user_id,
  user_role
) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  // Перевірка прав доступу
  if (user_role === "buyer") {
    throw new Error("Buyer не має доступу до статистики команди");
  }

  try {
    // Отримуємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    // ОНОВЛЕНО: Основний запит з урахуванням user_id в flow_stats
    const dailyStatsQuery = `
      WITH days_series AS (
        SELECT generate_series(1, $3) as day
      ),
      team_flows AS (
        SELECT id as flow_id
        FROM flows
        WHERE team_id = $1
      ),
      daily_data AS (
        SELECT 
          ds.day,
          COALESCE(SUM(fs.spend), 0) as total_spend,
          COALESCE(SUM(fs.installs), 0) as total_installs,
          COALESCE(SUM(fs.regs), 0) as total_regs,
          COALESCE(SUM(fs.deps), 0) as total_deps,
          COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
          COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
          COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
          COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
          COALESCE(AVG(fs.cpa), 0) as avg_cpa,
          COUNT(fs.id) as flows_with_stats,
          COUNT(DISTINCT fs.flow_id) as active_flows_count,
          COUNT(DISTINCT fs.user_id) as active_users_count
        FROM days_series ds
        LEFT JOIN flow_stats fs ON ds.day = fs.day 
          AND fs.month = $2 
          AND fs.year = $4
          AND fs.flow_id IN (SELECT flow_id FROM team_flows)
        GROUP BY ds.day
      )
      SELECT 
        day,
        total_spend,
        total_installs,
        total_regs,
        total_deps,
        total_verified_deps,
        total_deposit_amount,
        total_redep_count,
        total_unique_redep_count,
        avg_cpa,
        flows_with_stats,
        active_flows_count,
        active_users_count,
        -- Обчислювальні поля
        CASE 
          WHEN total_spend > 0 AND total_deps > 0 AND avg_cpa > 0
          THEN ROUND(((total_deps * avg_cpa - total_spend) / total_spend * 100)::numeric, 2)
          ELSE 0 
        END as roi,
        CASE 
          WHEN total_installs > 0 
          THEN ROUND((total_regs::numeric / total_installs * 100)::numeric, 2)
          ELSE 0 
        END as inst2reg,
        CASE 
          WHEN total_regs > 0 
          THEN ROUND((total_deps::numeric / total_regs * 100)::numeric, 2)
          ELSE 0 
        END as reg2dep,
        CASE 
          WHEN total_deps > 0 
          THEN ROUND((total_verified_deps::numeric / total_deps * 100)::numeric, 2)
          ELSE 0 
        END as verification_rate
      FROM daily_data
      ORDER BY day
    `;

    const dailyResult = await db.query(dailyStatsQuery, [
      teamId,
      month,
      daysInMonth,
      year,
    ]);

    // ОНОВЛЕНО: Загальна статистика за місяць з новими полями
    const summaryQuery = `
      SELECT 
        t.name as team_name,
        COUNT(DISTINCT f.id) as total_team_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_team_flows,
        COUNT(DISTINCT fs.user_id) as total_active_users,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COALESCE(AVG(fs.cpa), 0) as avg_cpa,
        COUNT(fs.id) as total_stats_entries,
        COUNT(DISTINCT fs.flow_id) as flows_with_activity,
        COUNT(DISTINCT o.partner_id) as unique_partners,
        COUNT(DISTINCT o.id) as unique_offers,
        COUNT(DISTINCT f.geo_id) as unique_geos,
        -- Найкращий день за ROI
        (SELECT day FROM flow_stats fs2 
         JOIN flows f2 ON fs2.flow_id = f2.id
         WHERE f2.team_id = $1
         AND fs2.month = $2 AND fs2.year = $3
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         ORDER BY ((fs2.deps * fs2.cpa - fs2.spend) / fs2.spend * 100) DESC
         LIMIT 1) as best_roi_day,
        -- Найгірший день за ROI
        (SELECT day FROM flow_stats fs2 
         JOIN flows f2 ON fs2.flow_id = f2.id
         WHERE f2.team_id = $1
         AND fs2.month = $2 AND fs2.year = $3
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         ORDER BY ((fs2.deps * fs2.cpa - fs2.spend) / fs2.spend * 100) ASC
         LIMIT 1) as worst_roi_day,
        -- Найпродуктивніший користувач
        (SELECT fs.user_id FROM flow_stats fs 
         JOIN flows f ON fs.flow_id = f.id
         WHERE f.team_id = $1
         AND fs.month = $2 AND fs.year = $3
         GROUP BY fs.user_id
         ORDER BY SUM(fs.deps) DESC
         LIMIT 1) as top_user_id
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $2 AND fs.year = $3
      WHERE t.id = $1
      GROUP BY t.id, t.name
    `;

    const summaryResult = await db.query(summaryQuery, [teamId, month, year]);
    const summary = summaryResult.rows[0];

    if (!summary) {
      throw new Error("Команду не знайдено");
    }

    // ОНОВЛЕНО: Отримуємо топ користувачів команди за місяць з новими метриками
    const topUsersQuery = `
      SELECT 
        u.id as user_id,
        u.username,
        u.first_name,
        u.last_name,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COUNT(DISTINCT fs.flow_id) as active_flows,
        CASE 
          WHEN SUM(fs.spend) > 0 AND SUM(fs.deps) > 0 AND AVG(fs.cpa) > 0
          THEN ROUND(((SUM(fs.deps) * AVG(fs.cpa) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as roi
      FROM users u
      JOIN flow_stats fs ON u.id = fs.user_id
      JOIN flows f ON fs.flow_id = f.id
      WHERE f.team_id = $1 AND fs.month = $2 AND fs.year = $3
      GROUP BY u.id, u.username, u.first_name, u.last_name
      HAVING SUM(fs.deps) > 0
      ORDER BY total_deps DESC
      LIMIT 5
    `;

    const topUsersResult = await db.query(topUsersQuery, [teamId, month, year]);

    // Форматуємо результат з новими полями
    const dailyStats = dailyResult.rows.map((row) => ({
      day: parseInt(row.day),
      date: `${year}-${String(month).padStart(2, "0")}-${String(
        row.day
      ).padStart(2, "0")}`,
      metrics: {
        spend: parseFloat(row.total_spend) || 0,
        installs: parseInt(row.total_installs) || 0,
        regs: parseInt(row.total_regs) || 0,
        deps: parseInt(row.total_deps) || 0,
        verified_deps: parseInt(row.total_verified_deps) || 0,
        deposit_amount: parseFloat(row.total_deposit_amount) || 0,
        redep_count: parseInt(row.total_redep_count) || 0,
        unique_redep_count: parseInt(row.total_unique_redep_count) || 0,
        avg_cpa: parseFloat(row.avg_cpa) || 0,
      },
      calculated: {
        roi: parseFloat(row.roi) || 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
      },
      meta: {
        flows_with_stats: parseInt(row.flows_with_stats) || 0,
        active_flows_count: parseInt(row.active_flows_count) || 0,
        active_users_count: parseInt(row.active_users_count) || 0,
        has_activity: parseInt(row.flows_with_stats) > 0,
      },
    }));

    // Обчислюємо загальні метрики з новими полями
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
      avg_cpa: parseFloat(summary.avg_cpa) || 0,
    };

    const totalCalculated = {
      roi:
        totalMetrics.spend > 0 &&
        totalMetrics.deps > 0 &&
        totalMetrics.avg_cpa > 0
          ? Math.round(
              ((totalMetrics.deps * totalMetrics.avg_cpa - totalMetrics.spend) /
                totalMetrics.spend) *
                100 *
                100
            ) / 100
          : 0,
      inst2reg:
        totalMetrics.installs > 0
          ? Math.round(
              (totalMetrics.regs / totalMetrics.installs) * 100 * 100
            ) / 100
          : 0,
      reg2dep:
        totalMetrics.regs > 0
          ? Math.round((totalMetrics.deps / totalMetrics.regs) * 100 * 100) /
            100
          : 0,
      verification_rate:
        totalMetrics.deps > 0
          ? Math.round(
              (totalMetrics.verified_deps / totalMetrics.deps) * 100 * 100
            ) / 100
          : 0,
    };

    const topUsers = topUsersResult.rows.map((user) => ({
      user_id: user.user_id,
      username: user.username,
      full_name:
        user.first_name && user.last_name
          ? `${user.first_name} ${user.last_name}`
          : user.username,
      metrics: {
        spend: parseFloat(user.total_spend) || 0,
        deps: parseInt(user.total_deps) || 0,
        verified_deps: parseInt(user.total_verified_deps) || 0,
        deposit_amount: parseFloat(user.total_deposit_amount) || 0,
        redep_count: parseInt(user.total_redep_count) || 0,
        unique_redep_count: parseInt(user.total_unique_redep_count) || 0,
        roi: parseFloat(user.roi) || 0,
      },
      active_flows: parseInt(user.active_flows) || 0,
    }));

    return {
      team: {
        id: teamId,
        name: summary.team_name,
      },
      period: { month, year },
      daily_stats: dailyStats,
      summary: {
        total_flows: parseInt(summary.total_team_flows) || 0,
        active_flows: parseInt(summary.active_team_flows) || 0,
        flows_with_activity: parseInt(summary.flows_with_activity) || 0,
        total_active_users: parseInt(summary.total_active_users) || 0,
        unique_partners: parseInt(summary.unique_partners) || 0,
        unique_offers: parseInt(summary.unique_offers) || 0,
        unique_geos: parseInt(summary.unique_geos) || 0,
        total_stats_entries: parseInt(summary.total_stats_entries) || 0,
        metrics: totalMetrics,
        calculated: totalCalculated,
        best_roi_day: summary.best_roi_day,
        worst_roi_day: summary.worst_roi_day,
        top_user_id: summary.top_user_id,
        days_with_activity: dailyStats.filter((day) => day.meta.has_activity)
          .length,
        avg_daily_spend: totalMetrics.spend / daysInMonth,
        avg_daily_deps: totalMetrics.deps / daysInMonth,
        top_users: topUsers,
      },
    };
  } catch (error) {
    console.error("Помилка в getTeamMonthlyStats:", error);
    throw new Error(`Помилка отримання статистики команди: ${error.message}`);
  }
};

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для користувача
 * @param {number} userId - ID користувача
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @param {number} requesting_user_id - ID користувача, що робить запит
 * @param {string} user_role - Роль користувача, що робить запит
 * @returns {Promise<Object>} Список потоків з агрегованою статистикою
 */
const getUserFlowsMonthlyStats = async (
  userId,
  options = {},
  requesting_user_id,
  user_role
) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  // Перевірка прав доступу
  if (user_role === "buyer" && userId !== requesting_user_id) {
    throw new Error("Buyer може переглядати лише свою статистику");
  }

  try {
    // ОНОВЛЕНО: запит з урахуванням user_id в flow_stats
    const flowsQuery = `
      SELECT 
        f.id as flow_id,
        f.name as flow_name,
        f.status as flow_status,
        f.cpa as flow_cpa,
        f.currency as flow_currency,
        f.description as flow_description,
        f.flow_type,
        f.kpi_metric,
        
        -- Дані партнера
        p.id as partner_id,
        p.name as partner_name,
        p.type as partner_type,
        
        -- Дані оффера
        o.id as offer_id,
        o.name as offer_name,
        
        -- Дані команди
        t.id as team_id,
        t.name as team_name,
        
        -- Дані гео
        g.id as geo_id,
        g.name as geo_name,
        g.country_code as geo_country_code,
        
        -- ОНОВЛЕНО: Агрегована статистика за місяць з новими полями
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COALESCE(AVG(fs.cpa), f.cpa) as avg_cpa,
        COUNT(fs.id) as days_with_stats,
        
        -- Обчислювальні поля
        CASE 
          WHEN SUM(fs.spend) > 0 AND SUM(fs.deps) > 0 AND COALESCE(AVG(fs.cpa), f.cpa) > 0
          THEN ROUND(((SUM(fs.deps) * COALESCE(AVG(fs.cpa), f.cpa) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as roi,
        CASE 
          WHEN SUM(fs.installs) > 0 
          THEN ROUND((SUM(fs.regs)::numeric / SUM(fs.installs) * 100)::numeric, 2)
          ELSE 0 
        END as inst2reg,
        CASE 
          WHEN SUM(fs.regs) > 0 
          THEN ROUND((SUM(fs.deps)::numeric / SUM(fs.regs) * 100)::numeric, 2)
          ELSE 0 
        END as reg2dep,
        CASE 
          WHEN SUM(fs.deps) > 0 
          THEN ROUND((SUM(fs.verified_deps)::numeric / SUM(fs.deps) * 100)::numeric, 2)
          ELSE 0 
        END as verification_rate,
        
        -- Метаінформація
        CASE WHEN COUNT(fs.id) > 0 THEN true ELSE false END as has_activity
        
      FROM flows f
      JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN geos g ON f.geo_id = g.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.user_id = $1
        AND fs.month = $2 AND fs.year = $3
      WHERE fu.user_id = $1 AND fu.status = 'active'
      GROUP BY 
        f.id, f.name, f.status, f.cpa, f.currency, f.description, f.flow_type, f.kpi_metric,
        p.id, p.name, p.type,
        o.id, o.name,
        t.id, t.name,
        g.id, g.name, g.country_code
      ORDER BY total_deps DESC, f.name ASC
    `;

    const result = await db.query(flowsQuery, [userId, month, year]);

    // ОНОВЛЕНО: Загальна статистика користувача за місяць з новими полями
    const userSummaryQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE fs.id IS NOT NULL) as flows_with_activity,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COUNT(DISTINCT o.partner_id) as unique_partners,
        COUNT(DISTINCT f.team_id) as unique_teams,
        COUNT(DISTINCT f.geo_id) as unique_geos
      FROM flows f
      JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.user_id = $1
        AND fs.month = $2 AND fs.year = $3
      WHERE fu.user_id = $1 AND fu.status = 'active'
    `;

    const summaryResult = await db.query(userSummaryQuery, [
      userId,
      month,
      year,
    ]);
    const summary = summaryResult.rows[0];

    const flows = result.rows.map((row) => ({
      flow: {
        id: row.flow_id,
        name: row.flow_name,
        status: row.flow_status,
        cpa: parseFloat(row.flow_cpa) || 0,
        currency: row.flow_currency,
        description: row.flow_description,
        flow_type: row.flow_type,
        kpi_metric: row.kpi_metric,
      },
      partner: row.partner_id
        ? {
            id: row.partner_id,
            name: row.partner_name,
            type: row.partner_type,
          }
        : null,
      offer: row.offer_id
        ? {
            id: row.offer_id,
            name: row.offer_name,
          }
        : null,
      team: row.team_id
        ? {
            id: row.team_id,
            name: row.team_name,
          }
        : null,
      geo: row.geo_id
        ? {
            id: row.geo_id,
            name: row.geo_name,
            country_code: row.geo_country_code,
          }
        : null,
      stats: {
        spend: parseFloat(row.total_spend) || 0,
        installs: parseInt(row.total_installs) || 0,
        regs: parseInt(row.total_regs) || 0,
        deps: parseInt(row.total_deps) || 0,
        verified_deps: parseInt(row.total_verified_deps) || 0,
        deposit_amount: parseFloat(row.total_deposit_amount) || 0,
        redep_count: parseInt(row.total_redep_count) || 0,
        unique_redep_count: parseInt(row.total_unique_redep_count) || 0,
        avg_cpa: parseFloat(row.avg_cpa) || 0,
        days_with_stats: parseInt(row.days_with_stats) || 0,
        roi: parseFloat(row.roi) || 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
        has_activity: row.has_activity,
      },
    }));

    // Обчислюємо загальні метрики з новими полями
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
    };

    return {
      user_id: userId,
      period: { month, year },
      flows,
      summary: {
        total_flows: parseInt(summary.total_flows) || 0,
        flows_with_activity: parseInt(summary.flows_with_activity) || 0,
        unique_partners: parseInt(summary.unique_partners) || 0,
        unique_teams: parseInt(summary.unique_teams) || 0,
        unique_geos: parseInt(summary.unique_geos) || 0,
        metrics: totalMetrics,
        calculated: {
          total_roi:
            totalMetrics.spend > 0 && totalMetrics.deps > 0
              ? Math.round(
                  ((flows.reduce(
                    (sum, f) => sum + f.stats.deps * f.stats.avg_cpa,
                    0
                  ) -
                    totalMetrics.spend) /
                    totalMetrics.spend) *
                    100 *
                    100
                ) / 100
              : 0,
          avg_inst2reg:
            totalMetrics.installs > 0
              ? Math.round(
                  (totalMetrics.regs / totalMetrics.installs) * 100 * 100
                ) / 100
              : 0,
          avg_reg2dep:
            totalMetrics.regs > 0
              ? Math.round(
                  (totalMetrics.deps / totalMetrics.regs) * 100 * 100
                ) / 100
              : 0,
          avg_verification_rate:
            totalMetrics.deps > 0
              ? Math.round(
                  (totalMetrics.verified_deps / totalMetrics.deps) * 100 * 100
                ) / 100
              : 0,
        },
      },
    };
  } catch (error) {
    console.error("Помилка в getUserFlowsMonthlyStats:", error);
    throw new Error(`Помилка отримання потоків користувача: ${error.message}`);
  }
};

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для команди
 * @param {number} teamId - ID команди
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @param {number} requesting_user_id - ID користувача, що робить запит
 * @param {string} user_role - Роль користувача, що робить запит
 * @returns {Promise<Object>} Список потоків з агрегованою статистикою
 */
const getTeamFlowsMonthlyStats = async (
  teamId,
  options = {},
  requesting_user_id,
  user_role
) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  // Перевірка прав доступу
  if (user_role === "buyer") {
    throw new Error("Buyer не має доступу до статистики команди");
  }

  try {
    // ОНОВЛЕНО: запит з урахуванням user_id в flow_stats
    const flowsQuery = `
      SELECT 
        f.id as flow_id,
        f.name as flow_name,
        f.status as flow_status,
        f.cpa as flow_cpa,
        f.currency as flow_currency,
        f.description as flow_description,
        f.flow_type,
        f.kpi_metric,
        
        -- Дані партнера
        p.id as partner_id,
        p.name as partner_name,
        p.type as partner_type,
        
        -- Дані оффера
        o.id as offer_id,
        o.name as offer_name,
        
        -- Дані команди
        t.id as team_id,
        t.name as team_name,
        
        -- Дані гео
        g.id as geo_id,
        g.name as geo_name,
        g.country_code as geo_country_code,
        
        -- ОНОВЛЕНО: Агрегована статистика за місяць з новими полями
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COALESCE(AVG(fs.cpa), f.cpa) as avg_cpa,
        COUNT(fs.id) as days_with_stats,
        COUNT(DISTINCT fs.user_id) as active_users_count,
        
        -- Обчислювальні поля
        CASE 
          WHEN SUM(fs.spend) > 0 AND SUM(fs.deps) > 0 AND COALESCE(AVG(fs.cpa), f.cpa) > 0
          THEN ROUND(((SUM(fs.deps) * COALESCE(AVG(fs.cpa), f.cpa) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as roi,
        CASE 
          WHEN SUM(fs.installs) > 0 
          THEN ROUND((SUM(fs.regs)::numeric / SUM(fs.installs) * 100)::numeric, 2)
          ELSE 0 
        END as inst2reg,
        CASE 
          WHEN SUM(fs.regs) > 0 
          THEN ROUND((SUM(fs.deps)::numeric / SUM(fs.regs) * 100)::numeric, 2)
          ELSE 0 
        END as reg2dep,
        CASE 
          WHEN SUM(fs.deps) > 0 
          THEN ROUND((SUM(fs.verified_deps)::numeric / SUM(fs.deps) * 100)::numeric, 2)
          ELSE 0 
        END as verification_rate,
        
        -- Метаінформація
        CASE WHEN COUNT(fs.id) > 0 THEN true ELSE false END as has_activity,
        
        -- Топ користувач потоку
        (SELECT u.username FROM users u
         JOIN flow_stats fs2 ON u.id = fs2.user_id
         WHERE fs2.flow_id = f.id
         AND fs2.month = $2 AND fs2.year = $3
         GROUP BY u.id, u.username
         ORDER BY SUM(fs2.deps) DESC
         LIMIT 1) as top_user_username
        
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN geos g ON f.geo_id = g.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $2 AND fs.year = $3
      WHERE f.team_id = $1
      GROUP BY 
        f.id, f.name, f.status, f.cpa, f.currency, f.description, f.flow_type, f.kpi_metric,
        p.id, p.name, p.type,
        o.id, o.name,
        t.id, t.name,
        g.id, g.name, g.country_code
      ORDER BY total_deps DESC, f.name ASC
    `;

    const result = await db.query(flowsQuery, [teamId, month, year]);

    // ОНОВЛЕНО: Загальна статистика команди за місяць з новими полями
    const teamSummaryQuery = `
      SELECT 
        t.name as team_name,
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE fs.id IS NOT NULL) as flows_with_activity,
        COUNT(DISTINCT fs.user_id) as total_active_users,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COUNT(DISTINCT o.partner_id) as unique_partners,
        COUNT(DISTINCT o.id) as unique_offers,
        COUNT(DISTINCT f.geo_id) as unique_geos
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $2 AND fs.year = $3
      WHERE t.id = $1
      GROUP BY t.id, t.name
    `;

    const summaryResult = await db.query(teamSummaryQuery, [
      teamId,
      month,
      year,
    ]);
    const summary = summaryResult.rows[0];

    if (!summary) {
      throw new Error("Команду не знайдено");
    }

    const flows = result.rows.map((row) => ({
      flow: {
        id: row.flow_id,
        name: row.flow_name,
        status: row.flow_status,
        cpa: parseFloat(row.flow_cpa) || 0,
        currency: row.flow_currency,
        description: row.flow_description,
        flow_type: row.flow_type,
        kpi_metric: row.kpi_metric,
      },
      partner: row.partner_id
        ? {
            id: row.partner_id,
            name: row.partner_name,
            type: row.partner_type,
          }
        : null,
      offer: row.offer_id
        ? {
            id: row.offer_id,
            name: row.offer_name,
          }
        : null,
      team: row.team_id
        ? {
            id: row.team_id,
            name: row.team_name,
          }
        : null,
      geo: row.geo_id
        ? {
            id: row.geo_id,
            name: row.geo_name,
            country_code: row.geo_country_code,
          }
        : null,
      stats: {
        spend: parseFloat(row.total_spend) || 0,
        installs: parseInt(row.total_installs) || 0,
        regs: parseInt(row.total_regs) || 0,
        deps: parseInt(row.total_deps) || 0,
        verified_deps: parseInt(row.total_verified_deps) || 0,
        deposit_amount: parseFloat(row.total_deposit_amount) || 0,
        redep_count: parseInt(row.total_redep_count) || 0,
        unique_redep_count: parseInt(row.total_unique_redep_count) || 0,
        avg_cpa: parseFloat(row.avg_cpa) || 0,
        days_with_stats: parseInt(row.days_with_stats) || 0,
        active_users_count: parseInt(row.active_users_count) || 0,
        roi: parseFloat(row.roi) || 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
        has_activity: row.has_activity,
        top_user_username: row.top_user_username,
      },
    }));

    // Обчислюємо загальні метрики з новими полями
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
    };

    return {
      team: {
        id: teamId,
        name: summary.team_name,
      },
      period: { month, year },
      flows,
      summary: {
        total_flows: parseInt(summary.total_flows) || 0,
        flows_with_activity: parseInt(summary.flows_with_activity) || 0,
        total_active_users: parseInt(summary.total_active_users) || 0,
        unique_partners: parseInt(summary.unique_partners) || 0,
        unique_offers: parseInt(summary.unique_offers) || 0,
        unique_geos: parseInt(summary.unique_geos) || 0,
        metrics: totalMetrics,
        calculated: {
          total_roi:
            totalMetrics.spend > 0 && totalMetrics.deps > 0
              ? Math.round(
                  ((flows.reduce(
                    (sum, f) => sum + f.stats.deps * f.stats.avg_cpa,
                    0
                  ) -
                    totalMetrics.spend) /
                    totalMetrics.spend) *
                    100 *
                    100
                ) / 100
              : 0,
          avg_inst2reg:
            totalMetrics.installs > 0
              ? Math.round(
                  (totalMetrics.regs / totalMetrics.installs) * 100 * 100
                ) / 100
              : 0,
          avg_reg2dep:
            totalMetrics.regs > 0
              ? Math.round(
                  (totalMetrics.deps / totalMetrics.regs) * 100 * 100
                ) / 100
              : 0,
          avg_verification_rate:
            totalMetrics.deps > 0
              ? Math.round(
                  (totalMetrics.verified_deps / totalMetrics.deps) * 100 * 100
                ) / 100
              : 0,
        },
      },
    };
  } catch (error) {
    console.error("Помилка в getTeamFlowsMonthlyStats:", error);
    throw new Error(`Помилка отримання потоків команди: ${error.message}`);
  }
};

/**
 * ОНОВЛЕНО: Отримання загальної статистики компанії за місяць (P/L) з урахуванням user_id
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @returns {Promise<Object>} Загальна статистика компанії
 */
const getCompanyMonthlyStats = async (options = {}) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  try {
    // ОНОВЛЕНО: Загальна статистика компанії з новими полями
    const companyStatsQuery = `
      SELECT 
        -- Основні метрики
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COALESCE(AVG(fs.cpa), 0) as avg_cpa,
        
        -- Загальна кількість
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_flows,
        COUNT(DISTINCT fs.flow_id) as flows_with_activity,
        COUNT(DISTINCT fs.user_id) as total_active_users,
        COUNT(DISTINCT t.id) as total_teams,
        COUNT(DISTINCT o.partner_id) as total_partners,
        COUNT(DISTINCT o.id) as total_offers,
        COUNT(DISTINCT f.geo_id) as total_geos,
        COUNT(fs.id) as total_stats_entries,
        
        -- Обчислення прибутку
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as total_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as total_profit,
        
        -- Середні метрики
        CASE 
          WHEN COUNT(fs.id) > 0 
          THEN ROUND(AVG(fs.spend)::numeric, 2)
          ELSE 0 
        END as avg_daily_spend,
        CASE 
          WHEN COUNT(fs.id) > 0 
          THEN ROUND(AVG(fs.deps)::numeric, 2)
          ELSE 0 
        END as avg_daily_deps
        
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
    `;

    const companyResult = await db.query(companyStatsQuery, [month, year]);
    const companyStats = companyResult.rows[0];

    // ОНОВЛЕНО: Статистика по командах з новими полями (продовження)
    const teamsStatsQuery = `
      SELECT 
        t.id as team_id,
        t.name as team_name,
        COUNT(DISTINCT f.id) as team_flows,
        COUNT(DISTINCT fs.user_id) as team_users,
        COALESCE(SUM(fs.spend), 0) as team_spend,
        COALESCE(SUM(fs.deps), 0) as team_deps,
        COALESCE(SUM(fs.verified_deps), 0) as team_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as team_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as team_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as team_unique_redep_count,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as team_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as team_profit,
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND(((SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as team_roi
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      GROUP BY t.id, t.name
      HAVING COUNT(DISTINCT f.id) > 0
      ORDER BY team_profit DESC
    `;

    const teamsResult = await db.query(teamsStatsQuery, [month, year]);

    // ОНОВЛЕНО: Статистика по партнерах з новими полями
    const partnersStatsQuery = `
      SELECT 
        p.id as partner_id,
        p.name as partner_name,
        p.type as partner_type,
        COUNT(DISTINCT f.id) as partner_flows,
        COUNT(DISTINCT o.id) as partner_offers,
        COALESCE(SUM(fs.spend), 0) as partner_spend,
        COALESCE(SUM(fs.deps), 0) as partner_deps,
        COALESCE(SUM(fs.verified_deps), 0) as partner_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as partner_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as partner_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as partner_unique_redep_count,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as partner_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as partner_profit,
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND(((SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as partner_roi
      FROM partners p
      LEFT JOIN offers o ON p.id = o.partner_id
      LEFT JOIN flows f ON o.id = f.offer_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      GROUP BY p.id, p.name, p.type
      HAVING COUNT(DISTINCT f.id) > 0
      ORDER BY partner_profit DESC
      LIMIT 10
    `;

    const partnersResult = await db.query(partnersStatsQuery, [month, year]);

    // ОНОВЛЕНО: Топ користувачі з новими полями
    const topUsersQuery = `
      SELECT 
        u.id as user_id,
        u.username,
        u.first_name,
        u.last_name,
        t.name as team_name,
        COUNT(DISTINCT f.id) as user_flows,
        COALESCE(SUM(fs.spend), 0) as user_spend,
        COALESCE(SUM(fs.deps), 0) as user_deps,
        COALESCE(SUM(fs.verified_deps), 0) as user_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as user_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as user_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as user_unique_redep_count,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as user_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as user_profit,
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND(((SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as user_roi
      FROM users u
      JOIN flow_stats fs ON u.id = fs.user_id
      JOIN flows f ON fs.flow_id = f.id
      LEFT JOIN teams t ON f.team_id = t.id
      WHERE fs.month = $1 AND fs.year = $2
      GROUP BY u.id, u.username, u.first_name, u.last_name, t.name
      HAVING SUM(fs.deps) > 0
      ORDER BY user_profit DESC
      LIMIT 10
    `;

    const topUsersResult = await db.query(topUsersQuery, [month, year]);

    // ОНОВЛЕНО: Денна статистика за місяць з новими полями
    const dailyTrendsQuery = `
      SELECT 
        fs.day,
        COALESCE(SUM(fs.spend), 0) as day_spend,
        COALESCE(SUM(fs.installs), 0) as day_installs,
        COALESCE(SUM(fs.regs), 0) as day_regs,
        COALESCE(SUM(fs.deps), 0) as day_deps,
        COALESCE(SUM(fs.verified_deps), 0) as day_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as day_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as day_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as day_unique_redep_count,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as day_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as day_profit,
        COUNT(DISTINCT fs.flow_id) as active_flows,
        COUNT(DISTINCT fs.user_id) as active_users
      FROM flow_stats fs
      JOIN flows f ON fs.flow_id = f.id
      WHERE fs.month = $1 AND fs.year = $2
      GROUP BY fs.day
      ORDER BY fs.day
    `;

    const dailyTrendsResult = await db.query(dailyTrendsQuery, [month, year]);

    // Форматуємо результати з новими полями
    const totalSpend = parseFloat(companyStats.total_spend) || 0;
    const totalRevenue = parseFloat(companyStats.total_revenue) || 0;
    const totalProfit = parseFloat(companyStats.total_profit) || 0;
    const totalDeps = parseInt(companyStats.total_deps) || 0;

    const teams = teamsResult.rows.map((row) => ({
      team_id: row.team_id,
      team_name: row.team_name,
      flows: parseInt(row.team_flows) || 0,
      users: parseInt(row.team_users) || 0,
      metrics: {
        spend: parseFloat(row.team_spend) || 0,
        deps: parseInt(row.team_deps) || 0,
        verified_deps: parseInt(row.team_verified_deps) || 0,
        deposit_amount: parseFloat(row.team_deposit_amount) || 0,
        redep_count: parseInt(row.team_redep_count) || 0,
        unique_redep_count: parseInt(row.team_unique_redep_count) || 0,
        revenue: parseFloat(row.team_revenue) || 0,
        profit: parseFloat(row.team_profit) || 0,
        roi: parseFloat(row.team_roi) || 0,
      },
    }));

    const partners = partnersResult.rows.map((row) => ({
      partner_id: row.partner_id,
      partner_name: row.partner_name,
      partner_type: row.partner_type,
      flows: parseInt(row.partner_flows) || 0,
      offers: parseInt(row.partner_offers) || 0,
      metrics: {
        spend: parseFloat(row.partner_spend) || 0,
        deps: parseInt(row.partner_deps) || 0,
        verified_deps: parseInt(row.partner_verified_deps) || 0,
        deposit_amount: parseFloat(row.partner_deposit_amount) || 0,
        redep_count: parseInt(row.partner_redep_count) || 0,
        unique_redep_count: parseInt(row.partner_unique_redep_count) || 0,
        revenue: parseFloat(row.partner_revenue) || 0,
        profit: parseFloat(row.partner_profit) || 0,
        roi: parseFloat(row.partner_roi) || 0,
      },
    }));

    const topUsers = topUsersResult.rows.map((row) => ({
      user_id: row.user_id,
      username: row.username,
      full_name:
        row.first_name && row.last_name
          ? `${row.first_name} ${row.last_name}`
          : row.username,
      team_name: row.team_name,
      flows: parseInt(row.user_flows) || 0,
      metrics: {
        spend: parseFloat(row.user_spend) || 0,
        deps: parseInt(row.user_deps) || 0,
        verified_deps: parseInt(row.user_verified_deps) || 0,
        deposit_amount: parseFloat(row.user_deposit_amount) || 0,
        redep_count: parseInt(row.user_redep_count) || 0,
        unique_redep_count: parseInt(row.user_unique_redep_count) || 0,
        revenue: parseFloat(row.user_revenue) || 0,
        profit: parseFloat(row.user_profit) || 0,
        roi: parseFloat(row.user_roi) || 0,
      },
    }));

    const dailyTrends = dailyTrendsResult.rows.map((row) => ({
      day: parseInt(row.day),
      date: `${year}-${String(month).padStart(2, "0")}-${String(
        row.day
      ).padStart(2, "0")}`,
      metrics: {
        spend: parseFloat(row.day_spend) || 0,
        installs: parseInt(row.day_installs) || 0,
        regs: parseInt(row.day_regs) || 0,
        deps: parseInt(row.day_deps) || 0,
        verified_deps: parseInt(row.day_verified_deps) || 0,
        deposit_amount: parseFloat(row.day_deposit_amount) || 0,
        redep_count: parseInt(row.day_redep_count) || 0,
        unique_redep_count: parseInt(row.day_unique_redep_count) || 0,
        revenue: parseFloat(row.day_revenue) || 0,
        profit: parseFloat(row.day_profit) || 0,
      },
      meta: {
        active_flows: parseInt(row.active_flows) || 0,
        active_users: parseInt(row.active_users) || 0,
      },
    }));

    return {
      period: { month, year },
      summary: {
        // Основні фінансові показники
        total_spend: totalSpend,
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        profit_margin:
          totalRevenue > 0
            ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100
            : 0,
        roas:
          totalSpend > 0
            ? Math.round((totalRevenue / totalSpend) * 100) / 100
            : 0,
        total_roi:
          totalSpend > 0
            ? Math.round((totalProfit / totalSpend) * 100 * 100) / 100
            : 0,

        // Операційні показники
        total_flows: parseInt(companyStats.total_flows) || 0,
        active_flows: parseInt(companyStats.active_flows) || 0,
        flows_with_activity: parseInt(companyStats.flows_with_activity) || 0,
        total_active_users: parseInt(companyStats.total_active_users) || 0,
        total_teams: parseInt(companyStats.total_teams) || 0,
        total_partners: parseInt(companyStats.total_partners) || 0,
        total_offers: parseInt(companyStats.total_offers) || 0,
        total_geos: parseInt(companyStats.total_geos) || 0,

        // Маркетингові показники з новими полями
        total_installs: parseInt(companyStats.total_installs) || 0,
        total_regs: parseInt(companyStats.total_regs) || 0,
        total_deps: totalDeps,
        total_verified_deps: parseInt(companyStats.total_verified_deps) || 0,
        total_deposit_amount:
          parseFloat(companyStats.total_deposit_amount) || 0,
        total_redep_count: parseInt(companyStats.total_redep_count) || 0,
        total_unique_redep_count:
          parseInt(companyStats.total_unique_redep_count) || 0,
        avg_cpa: parseFloat(companyStats.avg_cpa) || 0,

        // Конверсії
        inst2reg:
          companyStats.total_installs > 0
            ? Math.round(
                (parseInt(companyStats.total_regs) /
                  parseInt(companyStats.total_installs)) *
                  100 *
                  100
              ) / 100
            : 0,
        reg2dep:
          companyStats.total_regs > 0
            ? Math.round(
                (totalDeps / parseInt(companyStats.total_regs)) * 100 * 100
              ) / 100
            : 0,
        verification_rate:
          totalDeps > 0
            ? Math.round(
                (parseInt(companyStats.total_verified_deps) / totalDeps) *
                  100 *
                  100
              ) / 100
            : 0,

        // Середні показники
        avg_daily_spend: parseFloat(companyStats.avg_daily_spend) || 0,
        avg_daily_deps: parseFloat(companyStats.avg_daily_deps) || 0,
        avg_profit_per_flow:
          companyStats.flows_with_activity > 0
            ? Math.round(
                (totalProfit / parseInt(companyStats.flows_with_activity)) * 100
              ) / 100
            : 0,
        avg_revenue_per_user:
          companyStats.total_active_users > 0
            ? Math.round(
                (totalRevenue / parseInt(companyStats.total_active_users)) * 100
              ) / 100
            : 0,
      },

      // Розбивка по командах
      teams_breakdown: teams,

      // Розбивка по партнерах
      partners_breakdown: partners,

      // Топ користувачі
      top_users: topUsers,

      // Денні тренди
      daily_trends: dailyTrends,

      // Аналітичні інсайти
      insights: {
        most_profitable_team: teams.length > 0 ? teams[0].team_name : null,
        most_profitable_partner:
          partners.length > 0 ? partners[0].partner_name : null,
        top_performer: topUsers.length > 0 ? topUsers[0].username : null,
        best_day:
          dailyTrends.length > 0
            ? dailyTrends.reduce((best, current) =>
                current.metrics.profit > best.metrics.profit ? current : best
              ).day
            : null,
        worst_day:
          dailyTrends.length > 0
            ? dailyTrends.reduce((worst, current) =>
                current.metrics.profit < worst.metrics.profit ? current : worst
              ).day
            : null,

        // KPI статуси
        profitability_status:
          totalProfit > 0
            ? "profitable"
            : totalProfit < 0
            ? "loss"
            : "breakeven",
        growth_trend:
          dailyTrends.length >= 2
            ? dailyTrends[dailyTrends.length - 1].metrics.profit >
              dailyTrends[0].metrics.profit
              ? "growing"
              : "declining"
            : "stable",
        efficiency_rating:
          totalSpend > 0 && totalRevenue > 0
            ? totalRevenue / totalSpend >= 2
              ? "excellent"
              : totalRevenue / totalSpend >= 1.5
              ? "good"
              : totalRevenue / totalSpend >= 1.2
              ? "average"
              : "poor"
            : "no_data",
      },
    };
  } catch (error) {
    console.error("Помилка в getCompanyMonthlyStats:", error);
    throw new Error(`Помилка отримання статистики компанії: ${error.message}`);
  }
};

/**
 * ОНОВЛЕНО: Отримання агрегованої статистики за період з урахуванням user_id
 * @param {number} flow_id - ID потоку
 * @param {Object} options - Опції фільтрації та групування
 * @param {number} requesting_user_id - ID користувача, що робить запит
 * @param {string} user_role - Роль користувача, що робить запит
 * @returns {Promise<Object>} Агрегована статистика
 */
const getAggregatedStats = async (
  flow_id,
  options = {},
  requesting_user_id,
  user_role
) => {
  const { month, year, dateFrom, dateTo, user_id } = options;

  const conditions = ["fs.flow_id = $1"];
  const params = [flow_id];
  let paramIndex = 2;

  // Перевірка прав доступу та фільтрація по користувачах
  if (user_role === "buyer") {
    // Buyer бачить лише свою статистику
    conditions.push(`fs.user_id = $${paramIndex++}`);
    params.push(requesting_user_id);
  } else if (user_id && ["admin", "bizdev", "teamlead"].includes(user_role)) {
    // Інші ролі можуть фільтрувати по конкретному користувачу
    conditions.push(`fs.user_id = $${paramIndex++}`);
    params.push(user_id);
  }

  // Додаємо фільтри по даті
  if (month && year) {
    conditions.push(
      `fs.month = $${paramIndex++} AND fs.year = $${paramIndex++}`
    );
    params.push(month, year);
  } else if (year) {
    conditions.push(`fs.year = $${paramIndex++}`);
    params.push(year);
  }

  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    conditions.push(
      `DATE(fs.year || '-' || fs.month || '-' || fs.day) >= $${paramIndex++}`
    );
    params.push(fromDate.toISOString().split("T")[0]);
  }

  if (dateTo) {
    const toDate = new Date(dateTo);
    conditions.push(
      `DATE(fs.year || '-' || fs.month || '-' || fs.day) <= $${paramIndex++}`
    );
    params.push(toDate.toISOString().split("T")[0]);
  }

  // ОНОВЛЕНО: запит з новими полями
  const query = `
    SELECT 
      COUNT(*) as total_days,
      COUNT(DISTINCT fs.user_id) as unique_users,
      SUM(fs.spend) as total_spend,
      SUM(fs.installs) as total_installs,
      SUM(fs.regs) as total_regs,
      SUM(fs.deps) as total_deps,
      SUM(fs.verified_deps) as total_verified_deps,
      SUM(fs.deposit_amount) as total_deposit_amount,
      SUM(fs.redep_count) as total_redep_count,
      SUM(fs.unique_redep_count) as total_unique_redep_count,
      AVG(fs.cpa) as avg_cpa,
      
      -- Агреговані метрики
      CASE 
        WHEN SUM(fs.spend) > 0 THEN ROUND(((SUM(fs.deps * fs.cpa) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
        ELSE 0 
      END as total_roi,
      CASE 
        WHEN SUM(fs.installs) > 0 THEN ROUND((SUM(fs.regs)::numeric / SUM(fs.installs) * 100)::numeric, 2)
        ELSE 0 
      END as total_inst2reg,
      CASE 
        WHEN SUM(fs.regs) > 0 THEN ROUND((SUM(fs.deps)::numeric / SUM(fs.regs) * 100)::numeric, 2)
        ELSE 0 
      END as total_reg2dep,
      CASE 
        WHEN SUM(fs.deps) > 0 THEN ROUND((SUM(fs.verified_deps)::numeric / SUM(fs.deps) * 100)::numeric, 2)
        ELSE 0 
      END as verification_rate,
      
      -- Мін/макс значення
      MIN(fs.day) as first_activity_day,
      MAX(fs.day) as last_activity_day,
      MIN(fs.spend) FILTER (WHERE fs.spend > 0) as min_daily_spend,
      MAX(fs.spend) as max_daily_spend,
      MIN(fs.deps) FILTER (WHERE fs.deps > 0) as min_daily_deps,
      MAX(fs.deps) as max_daily_deps
      
    FROM flow_stats fs
    WHERE ${conditions.join(" AND ")}
  `;

  try {
    const result = await db.query(query, params);
    const stats = result.rows[0];

    return {
      flow_id,
      period: { month, year, dateFrom, dateTo },
      user_filter: user_id,
      aggregated: {
        total_days: parseInt(stats.total_days) || 0,
        unique_users: parseInt(stats.unique_users) || 0,
        total_spend: parseFloat(stats.total_spend) || 0,
        total_installs: parseInt(stats.total_installs) || 0,
        total_regs: parseInt(stats.total_regs) || 0,
        total_deps: parseInt(stats.total_deps) || 0,
        total_verified_deps: parseInt(stats.total_verified_deps) || 0,
        total_deposit_amount: parseFloat(stats.total_deposit_amount) || 0,
        total_redep_count: parseInt(stats.total_redep_count) || 0,
        total_unique_redep_count: parseInt(stats.total_unique_redep_count) || 0,
        avg_cpa: parseFloat(stats.avg_cpa) || 0,
        total_roi: parseFloat(stats.total_roi) || 0,
        total_inst2reg: parseFloat(stats.total_inst2reg) || 0,
        total_reg2dep: parseFloat(stats.total_reg2dep) || 0,
        verification_rate: parseFloat(stats.verification_rate) || 0,
        first_activity_day: stats.first_activity_day,
        last_activity_day: stats.last_activity_day,
        min_daily_spend: parseFloat(stats.min_daily_spend) || 0,
        max_daily_spend: parseFloat(stats.max_daily_spend) || 0,
        min_daily_deps: parseInt(stats.min_daily_deps) || 0,
        max_daily_deps: parseInt(stats.max_daily_deps) || 0,
      },
    };
  } catch (error) {
    console.error("Помилка при отриманні агрегованої статистики:", error);
    throw error;
  }
};

module.exports = {
  upsertFlowStat,
  getDailyFlowsStats,
  getUserMonthlyStats,
  getTeamMonthlyStats,
  getUserFlowsMonthlyStats,
  getTeamFlowsMonthlyStats,
  getCompanyMonthlyStats,
  getFlowStats,
  getAggregatedStats,
  deleteFlowStat,
  checkUserAccess,
};
