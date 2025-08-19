const db = require("../config/db");

/**
 * Модель для роботи зі статистикою потоків (P/L таблиці)
 */

/**
 * Створення або оновлення статистики за день
 * @param {Object} data - Дані статистики
 * @param {number} data.flow_id - ID потоку
 * @param {number} data.day - День (1-31)
 * @param {number} data.month - Місяць (1-12)
 * @param {number} data.year - Рік
 * @param {number} [data.spend] - Витрати
 * @param {number} [data.installs] - Інстали
 * @param {number} [data.regs] - Реєстрації
 * @param {number} [data.deps] - Депозити
 * @param {number} [data.verified_deps] - Верифіковані депозити
 * @param {number} [data.cpa] - CPA
 * @param {string} [data.notes] - Примітки
 * @param {number} data.updated_by - ID користувача, що оновлює
 * @returns {Promise<Object>} Створений або оновлений запис
 */
const upsertFlowStat = async (data) => {
  const {
    flow_id,
    day,
    month,
    year,
    spend = 0,
    installs = 0,
    regs = 0,
    deps = 0,
    verified_deps = 0,
    cpa = 0,
    notes = null,
    updated_by,
  } = data;

  // Перевіряємо, що дата коректна
  const date = new Date(year, month - 1, day);
  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== year
  ) {
    throw new Error("Некоректна дата");
  }

  const query = `
    INSERT INTO flow_stats (
      flow_id, day, month, year, spend, installs, regs, deps, 
      verified_deps, cpa, notes, created_by, updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    ON CONFLICT (flow_id, day, month, year)
    DO UPDATE SET
      spend = EXCLUDED.spend,
      installs = EXCLUDED.installs,
      regs = EXCLUDED.regs,
      deps = EXCLUDED.deps,
      verified_deps = EXCLUDED.verified_deps,
      cpa = EXCLUDED.cpa,
      notes = EXCLUDED.notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *, 
      -- Обчислювані метрики
      CASE 
        WHEN spend > 0 THEN ROUND(((deps * cpa - spend) / spend * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      CASE 
        WHEN installs > 0 THEN ROUND((regs::numeric / installs * 100)::numeric, 2)
        ELSE 0 
      END as inst2reg,
      CASE 
        WHEN regs > 0 THEN ROUND((deps::numeric / regs * 100)::numeric, 2)
        ELSE 0 
      END as reg2dep
  `;

  const params = [
    flow_id,
    day,
    month,
    year,
    spend,
    installs,
    regs,
    deps,
    verified_deps,
    cpa,
    notes,
    updated_by,
  ];

  try {
    const result = await db.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error("Помилка при створенні/оновленні статистики:", error);
    throw error;
  }
};

/**
 * Отримання всіх потоків зі статистикою за певний день з фільтрацією за партнерами
 * @param {Object} options - Опції фільтрації
 * @param {number} options.year - Рік
 * @param {number} options.month - Місяць
 * @param {number} options.day - День
 * @param {number} [options.partnerId] - ID партнера
 * @param {Array<number>} [options.partnerIds] - Масив ID партнерів
 * @param {string} [options.status] - Статус потоку
 * @param {number} [options.teamId] - ID команди
 * @param {number} [options.userId] - ID користувача
 * @param {boolean} [options.onlyActive] - Тільки активні потоки
 * @param {boolean} [options.includeUsers] - Включити інформацію про користувачів
 * @param {number} [options.page] - Номер сторінки
 * @param {number} [options.limit] - Кількість елементів на сторінці
 * @param {number} [options.offset] - Зсув для пагінації
 * @returns {Promise<Object>} Об'єкт з масивом потоків та загальною кількістю
 */
const getDailyFlowsStats = async (options = {}) => {
  const {
    year,
    month,
    day,
    partnerId,
    partnerIds,
    status,
    teamId,
    userId,
    onlyActive = false,
    includeUsers = false,
    limit = 20,
    offset = 0,
  } = options;

  console.log("getDailyFlowsStats викликано з опціями:", options);

  try {
    // Крок 1: Будуємо WHERE умови та параметри
    const whereConditions = [];
    const queryParams = [];
    let paramCounter = 1;

    if (status && !onlyActive) {
      whereConditions.push(`f.status = $${paramCounter++}`);
      queryParams.push(status);
    }

    // Додаткові фільтри
    if (onlyActive) {
      whereConditions.push(`f.status = $${paramCounter++}`);
      queryParams.push("active");
    }

    if (teamId) {
      whereConditions.push(`f.team_id = $${paramCounter++}`);
      queryParams.push(teamId);
    }

    if (partnerId) {
      whereConditions.push(`o.partner_id = $${paramCounter++}`);
      queryParams.push(partnerId);
    }

    if (partnerIds && partnerIds.length > 0) {
      whereConditions.push(`o.partner_id = ANY($${paramCounter++})`);
      queryParams.push(partnerIds);
    }

    if (userId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM flow_users fu 
        WHERE fu.flow_id = f.id 
        AND fu.user_id = $${paramCounter++} 
        AND fu.status = 'active'
      )`);
      queryParams.push(userId);
    }

    const whereClause =
      whereConditions.length > 0 ? `AND ${whereConditions.join(" AND ")}` : "";

    console.log("WHERE умови:", { whereConditions, queryParams, whereClause });

    // Крок 2: Запит для підрахунку загальної кількості (БЕЗ статистики)
    const countQuery = `
      SELECT COUNT(DISTINCT f.id) as total_count
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      WHERE 1=1 ${whereClause}
    `;

    console.log("Count query:", countQuery);
    console.log("Count params:", queryParams);

    const countResult = await db.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total_count) || 0;

    console.log("Total count отримано:", totalCount);

    // Крок 3: Основний запит з пагінацією
    // Додаємо параметри для дати статистики
    const statsYear = paramCounter++;
    const statsMonth = paramCounter++;
    const statsDay = paramCounter++;
    const limitParam = paramCounter++;
    const offsetParam = paramCounter++;

    const mainParams = [...queryParams, year, month, day, limit, offset];

    // Будуємо умову для дати статистики в основному запиті
    const statsDateCondition = `(fs.year = $${statsYear} AND fs.month = $${statsMonth} AND fs.day = $${statsDay})`;

    const mainQuery = `
      SELECT 
        -- Основні дані потоку
        f.id as flow_id,
        f.name as flow_name,
        f.status as flow_status,
        f.is_active as flow_is_active,
        f.cpa as flow_cpa,
        f.currency as flow_currency,
        f.description as flow_description,
        f.conditions as flow_conditions,
        f.kpi as flow_kpi,
        f.created_at as flow_created_at,
        f.team_id,
        
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
        
        -- Статистика за день
        fs.id as stats_id,
        fs.spend,
        fs.installs,
        fs.regs,
        fs.deps,
        fs.verified_deps,
        fs.cpa as stats_cpa,
        fs.notes as stats_notes,
        fs.created_at as stats_created_at,
        fs.updated_at as stats_updated_at,
        
        -- Обчислювальні поля
        CASE 
          WHEN fs.id IS NOT NULL AND fs.spend > 0 
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
        END as reg2dep,
        
        -- Прапорець наявності статистики
        CASE WHEN fs.id IS NOT NULL THEN true ELSE false END as has_stats,
        
        -- Кількість активних користувачів
        (SELECT COUNT(*) 
         FROM flow_users fu 
         WHERE fu.flow_id = f.id 
         AND fu.status = 'active') as active_users_count
         
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN geos g ON f.geo_id = g.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id AND ${statsDateCondition}
      WHERE 1=1 ${whereClause}
      ORDER BY 
        CASE WHEN fs.id IS NOT NULL THEN 0 ELSE 1 END,
        p.name ASC,
        f.name ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    console.log("Main query:", mainQuery);
    console.log("Main params:", mainParams);

    const result = await db.query(mainQuery, mainParams);

    console.log(`Отримано ${result.rows.length} рядків з основного запиту`);

    // Крок 4: Отримуємо користувачів якщо потрібно
    let usersData = {};
    if (includeUsers && result.rows.length > 0) {
      const flowIds = result.rows.map((row) => row.flow_id);

      const usersQuery = `
        SELECT 
          fu.flow_id,
          u.username,
          u.first_name,
          u.last_name
        FROM flow_users fu
        JOIN users u ON fu.user_id = u.id
        WHERE fu.flow_id = ANY($1) AND fu.status = 'active'
        ORDER BY fu.joined_at DESC
      `;

      console.log("Users query для flow_ids:", flowIds);

      const usersResult = await db.query(usersQuery, [flowIds]);

      // Групуємо користувачів за flow_id
      usersData = usersResult.rows.reduce((acc, user) => {
        if (!acc[user.flow_id]) {
          acc[user.flow_id] = [];
        }
        acc[user.flow_id].push({
          id: user.user_id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          full_name:
            user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.username,
          role: user.role,
          is_active: user.user_is_active,
          avatar_url: user.avatar_url,
          telegram_username: user.telegram_username,
          last_login_at: user.last_login_at,
          flow_participation: {
            status: user.user_status,
            notes: user.user_notes,
            joined_at: user.joined_at,
            left_at: user.left_at,
          },
        });
        return acc;
      }, {});

      console.log(
        `Отримано користувачів для ${Object.keys(usersData).length} потоків`
      );
    }

    // Крок 5: Форматуємо результат
    const flows = result.rows.map((row) => ({
      flow: {
        id: row.flow_id,
        name: row.flow_name,
        status: row.flow_status,
        is_active: row.flow_is_active,
        cpa: parseFloat(row.flow_cpa) || 0,
        currency: row.flow_currency,
        description: row.flow_description,
        conditions: row.flow_conditions,
        kpi: row.flow_kpi,
        created_at: row.flow_created_at,
        team_id: row.team_id,
        active_users_count: parseInt(row.active_users_count) || 0,
      },

      partner: row.partner_id
        ? {
            id: row.partner_id,
            name: row.partner_name,
            type: row.partner_type,
            is_active: row.partner_is_active,
            contact_telegram: row.partner_telegram,
            contact_email: row.partner_email,
          }
        : null,

      offer: row.offer_id
        ? {
            id: row.offer_id,
            name: row.offer_name,
            description: row.offer_description,
          }
        : null,

      team: row.team_id
        ? {
            id: row.team_id_full,
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

      stats: row.has_stats
        ? {
            id: row.stats_id,
            spend: parseFloat(row.spend) || 0,
            installs: parseInt(row.installs) || 0,
            regs: parseInt(row.regs) || 0,
            deps: parseInt(row.deps) || 0,
            verified_deps: parseInt(row.verified_deps) || 0,
            cpa: parseFloat(row.stats_cpa) || 0,
            notes: row.stats_notes,
            roi: row.roi ? parseFloat(row.roi) : 0,
            inst2reg: row.inst2reg ? parseFloat(row.inst2reg) : 0,
            reg2dep: row.reg2dep ? parseFloat(row.reg2dep) : 0,
            created_at: row.stats_created_at,
            updated_at: row.stats_updated_at,
          }
        : null,

      users: includeUsers ? usersData[row.flow_id] || [] : undefined,
      has_stats: row.has_stats,
    }));

    console.log(`Повертаємо ${flows.length} потоків з ${totalCount} загальних`);

    return {
      flows,
      totalCount,
    };
  } catch (error) {
    console.error("Помилка в getDailyFlowsStats:", error);
    console.error("Stack trace:", error.stack);
    throw new Error(`Помилка бази даних: ${error.message}`);
  }
};

/**
 * Отримання статистики користувача за місяць по днях
 * @param {number} userId - ID користувача
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @returns {Promise<Object>} Статистика по днях + загальна статистика
 */
const getUserMonthlyStats = async (userId, options = {}) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  try {
    // Отримуємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    // Основний запит для отримання статистики по днях
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
          COALESCE(AVG(fs.cpa), 0) as avg_cpa,
          COUNT(fs.id) as flows_with_stats,
          COUNT(DISTINCT fs.flow_id) as active_flows_count
        FROM days_series ds
        LEFT JOIN flow_stats fs ON ds.day = fs.day 
          AND fs.month = $2 
          AND fs.year = $4
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

    // Загальна статистика за місяць
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as total_user_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_user_flows,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
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
         AND fs2.month = $2 AND fs2.year = $3
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         ORDER BY ((fs2.deps * fs2.cpa - fs2.spend) / fs2.spend * 100) DESC
         LIMIT 1) as best_roi_day,
        -- Найгірший день за ROI
        (SELECT day FROM flow_stats fs2 
         JOIN flows f2 ON fs2.flow_id = f2.id
         JOIN flow_users fu2 ON f2.id = fu2.flow_id
         WHERE fu2.user_id = $1 AND fu2.status = 'active'
         AND fs2.month = $2 AND fs2.year = $3
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         ORDER BY ((fs2.deps * fs2.cpa - fs2.spend) / fs2.spend * 100) ASC
         LIMIT 1) as worst_roi_day
      FROM flows f
      JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $2 AND fs.year = $3
      WHERE fu.user_id = $1 AND fu.status = 'active'
    `;

    const summaryResult = await db.query(summaryQuery, [userId, month, year]);
    const summary = summaryResult.rows[0];

    // Форматуємо результат
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

    // Обчислюємо загальні метрики
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
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
 * Отримання статистики команди за місяць по днях
 * @param {number} teamId - ID команди
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @returns {Promise<Object>} Статистика по днях + загальна статистика
 */
const getTeamMonthlyStats = async (teamId, options = {}) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  try {
    // Отримуємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    // Основний запит для отримання статистики по днях
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
          COALESCE(AVG(fs.cpa), 0) as avg_cpa,
          COUNT(fs.id) as flows_with_stats,
          COUNT(DISTINCT fs.flow_id) as active_flows_count,
          COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.status = 'active') as active_users_count
        FROM days_series ds
        LEFT JOIN flow_stats fs ON ds.day = fs.day 
          AND fs.month = $2 
          AND fs.year = $4
          AND fs.flow_id IN (SELECT flow_id FROM team_flows)
        LEFT JOIN flow_users fu ON fs.flow_id = fu.flow_id AND fu.status = 'active'
        GROUP BY ds.day
      )
      SELECT 
        day,
        total_spend,
        total_installs,
        total_regs,
        total_deps,
        total_verified_deps,
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

    // Загальна статистика за місяць
    const summaryQuery = `
      SELECT 
        t.name as team_name,
        COUNT(DISTINCT f.id) as total_team_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_team_flows,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.status = 'active') as total_active_users,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
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
        (SELECT fu.user_id FROM flow_users fu 
         JOIN flows f ON fu.flow_id = f.id
         JOIN flow_stats fs ON f.id = fs.flow_id
         WHERE f.team_id = $1 AND fu.status = 'active'
         AND fs.month = $2 AND fs.year = $3
         GROUP BY fu.user_id
         ORDER BY SUM(fs.deps) DESC
         LIMIT 1) as top_user_id
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
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

    // Отримуємо топ користувачів команди за місяць
    const topUsersQuery = `
      SELECT 
        u.id as user_id,
        u.username,
        u.first_name,
        u.last_name,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COUNT(DISTINCT fs.flow_id) as active_flows,
        CASE 
          WHEN SUM(fs.spend) > 0 AND SUM(fs.deps) > 0 AND AVG(fs.cpa) > 0
          THEN ROUND(((SUM(fs.deps) * AVG(fs.cpa) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as roi
      FROM users u
      JOIN flow_users fu ON u.id = fu.user_id
      JOIN flows f ON fu.flow_id = f.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $2 AND fs.year = $3
      WHERE f.team_id = $1 AND fu.status = 'active'
      GROUP BY u.id, u.username, u.first_name, u.last_name
      HAVING SUM(fs.deps) > 0
      ORDER BY total_deps DESC
      LIMIT 5
    `;

    const topUsersResult = await db.query(topUsersQuery, [teamId, month, year]);

    // Форматуємо результат
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

    // Обчислюємо загальні метрики
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
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
        roi: parseFloat(user.roi) || 0,
      },
      active_flows: parseInt(user.active_flows) || 0,
    }));

    return {
      team: {
        id: teamId,
        name: summary.team_name,
        description: summary.team_description,
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
 * Отримання всіх потоків із агрегованою статистикою за місяць для користувача
 * @param {number} userId - ID користувача
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @returns {Promise<Object>} Список потоків з агрегованою статистикою
 */
const getUserFlowsMonthlyStats = async (userId, options = {}) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  try {
    const flowsQuery = `
      SELECT 
        f.id as flow_id,
        f.name as flow_name,
        f.status as flow_status,
        f.cpa as flow_cpa,
        f.currency as flow_currency,
        f.description as flow_description,
        
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
        
        -- Агрегована статистика за місяць
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
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
        AND fs.month = $2 AND fs.year = $3
      WHERE fu.user_id = $1 AND fu.status = 'active'
      GROUP BY 
        f.id, f.name, f.status, f.cpa, f.currency, f.description,
        p.id, p.name, p.type,
        o.id, o.name,
        t.id, t.name,
        g.id, g.name, g.country_code
      ORDER BY total_deps DESC, f.name ASC
    `;

    const result = await db.query(flowsQuery, [userId, month, year]);

    // Загальна статистика користувача за місяць
    const userSummaryQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE fs.id IS NOT NULL) as flows_with_activity,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COUNT(DISTINCT o.partner_id) as unique_partners,
        COUNT(DISTINCT f.team_id) as unique_teams,
        COUNT(DISTINCT f.geo_id) as unique_geos
      FROM flows f
      JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
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
        avg_cpa: parseFloat(row.avg_cpa) || 0,
        days_with_stats: parseInt(row.days_with_stats) || 0,
        roi: parseFloat(row.roi) || 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
        has_activity: row.has_activity,
      },
    }));

    // Обчислюємо загальні метрики
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
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
 * Отримання всіх потоків із агрегованою статистикою за місяць для команди
 * @param {number} teamId - ID команди
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @returns {Promise<Object>} Список потоків з агрегованою статистикою
 */
const getTeamFlowsMonthlyStats = async (teamId, options = {}) => {
  const { month, year } = options;

  if (!month || !year) {
    throw new Error("Місяць та рік є обов'язковими параметрами");
  }

  try {
    const flowsQuery = `
      SELECT 
        f.id as flow_id,
        f.name as flow_name,
        f.status as flow_status,
        f.cpa as flow_cpa,
        f.currency as flow_currency,
        f.description as flow_description,
        
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
        
        -- Агрегована статистика за місяць
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(AVG(fs.cpa), f.cpa) as avg_cpa,
        COUNT(fs.id) as days_with_stats,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.status = 'active') as active_users_count,
        
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
         JOIN flow_users fu2 ON u.id = fu2.user_id
         JOIN flow_stats fs2 ON fu2.flow_id = fs2.flow_id
         WHERE fu2.flow_id = f.id AND fu2.status = 'active'
         AND fs2.month = $2 AND fs2.year = $3
         GROUP BY u.id, u.username
         ORDER BY SUM(fs2.deps) DESC
         LIMIT 1) as top_user_username
        
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN geos g ON f.geo_id = g.id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $2 AND fs.year = $3
      WHERE f.team_id = $1
      GROUP BY 
        f.id, f.name, f.status, f.cpa, f.currency, f.description,
        p.id, p.name, p.type,
        o.id, o.name,
        t.id, t.name,
        g.id, g.name, g.country_code
      ORDER BY total_deps DESC, f.name ASC
    `;

    const result = await db.query(flowsQuery, [teamId, month, year]);

    // Загальна статистика команди за місяць
    const teamSummaryQuery = `
      SELECT 
        t.name as team_name,
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE fs.id IS NOT NULL) as flows_with_activity,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.status = 'active') as total_active_users,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COUNT(DISTINCT o.partner_id) as unique_partners,
        COUNT(DISTINCT o.id) as unique_offers,
        COUNT(DISTINCT f.geo_id) as unique_geos
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
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

    // Обчислюємо загальні метрики
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
    };

    return {
      team: {
        id: teamId,
        name: summary.team_name,
        description: summary.team_description,
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
 * Отримання загальної статистики компанії за місяць (P/L)
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
    // Загальна статистика компанії
    const companyStatsQuery = `
      SELECT 
        -- Основні метрики
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.installs), 0) as total_installs,
        COALESCE(SUM(fs.regs), 0) as total_regs,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(AVG(fs.cpa), 0) as avg_cpa,
        
        -- Загальна кількість
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_flows,
        COUNT(DISTINCT fs.flow_id) as flows_with_activity,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.status = 'active') as total_active_users,
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
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
    `;

    const companyResult = await db.query(companyStatsQuery, [month, year]);
    const companyStats = companyResult.rows[0];

    // Статистика по командах
    const teamsStatsQuery = `
      SELECT 
        t.id as team_id,
        t.name as team_name,
        COUNT(DISTINCT f.id) as team_flows,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.status = 'active') as team_users,
        COALESCE(SUM(fs.spend), 0) as team_spend,
        COALESCE(SUM(fs.deps), 0) as team_deps,
        COALESCE(SUM(fs.verified_deps), 0) as team_verified_deps,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as team_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as team_profit,
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND(((SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as team_roi
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      GROUP BY t.id, t.name
      HAVING COUNT(DISTINCT f.id) > 0
      ORDER BY team_profit DESC
    `;

    const teamsResult = await db.query(teamsStatsQuery, [month, year]);

    // Статистика по партнерах
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

    // Топ користувачі
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
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as user_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as user_profit,
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND(((SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend)) / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as user_roi
      FROM users u
      JOIN flow_users fu ON u.id = fu.user_id
      JOIN flows f ON fu.flow_id = f.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      WHERE fu.status = 'active'
      GROUP BY u.id, u.username, u.first_name, u.last_name, t.name
      HAVING SUM(fs.deps) > 0
      ORDER BY user_profit DESC
      LIMIT 10
    `;

    const topUsersResult = await db.query(topUsersQuery, [month, year]);

    // Денна статистика за місяць
    const dailyTrendsQuery = `
      SELECT 
        fs.day,
        COALESCE(SUM(fs.spend), 0) as day_spend,
        COALESCE(SUM(fs.installs), 0) as day_installs,
        COALESCE(SUM(fs.regs), 0) as day_regs,
        COALESCE(SUM(fs.deps), 0) as day_deps,
        COALESCE(SUM(fs.verified_deps), 0) as day_verified_deps,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)), 0) as day_revenue,
        COALESCE(SUM(fs.deps * COALESCE(fs.cpa, f.cpa)) - SUM(fs.spend), 0) as day_profit,
        COUNT(DISTINCT fs.flow_id) as active_flows,
        COUNT(DISTINCT fu.user_id) FILTER (WHERE fu.status = 'active') as active_users
      FROM flow_stats fs
      JOIN flows f ON fs.flow_id = f.id
      LEFT JOIN flow_users fu ON f.id = fu.flow_id
      WHERE fs.month = $1 AND fs.year = $2
      GROUP BY fs.day
      ORDER BY fs.day
    `;

    const dailyTrendsResult = await db.query(dailyTrendsQuery, [month, year]);

    // Форматуємо результати
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

        // Маркетингові показники
        total_installs: parseInt(companyStats.total_installs) || 0,
        total_regs: parseInt(companyStats.total_regs) || 0,
        total_deps: totalDeps,
        total_verified_deps: parseInt(companyStats.total_verified_deps) || 0,
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
 * Отримання статистики потоку за період
 * @param {number} flow_id - ID потоку
 * @param {Object} options - Опції фільтрації
 * @param {number} [options.month] - Місяць (1-12)
 * @param {number} [options.year] - Рік
 * @param {string} [options.dateFrom] - Дата початку (YYYY-MM-DD)
 * @param {string} [options.dateTo] - Дата кінця (YYYY-MM-DD)
 * @returns {Promise<Array>} Масив статистики з обчислюваними метриками
 */
const getFlowStats = async (flow_id, options = {}) => {
  const { month, year, dateFrom, dateTo } = options;

  const conditions = ["flow_id = $1"];
  const params = [flow_id];
  let paramIndex = 2;

  // Фільтр за місяцем та роком
  if (month && year) {
    conditions.push(`month = $${paramIndex++} AND year = $${paramIndex++}`);
    params.push(month, year);
  } else if (year) {
    conditions.push(`year = $${paramIndex++}`);
    params.push(year);
  }

  // Фільтр за діапазоном дат
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    conditions.push(
      `(year > $${paramIndex++} OR (year = $${paramIndex} AND month > $${
        paramIndex + 1
      }) OR (year = $${paramIndex} AND month = $${paramIndex + 1} AND day >= $${
        paramIndex + 2
      }))`
    );
    params.push(
      fromDate.getFullYear(),
      fromDate.getFullYear(),
      fromDate.getMonth() + 1,
      fromDate.getFullYear(),
      fromDate.getMonth() + 1,
      fromDate.getDate()
    );
    paramIndex += 3;
  }

  if (dateTo) {
    const toDate = new Date(dateTo);
    conditions.push(
      `(year < $${paramIndex++} OR (year = $${paramIndex} AND month < $${
        paramIndex + 1
      }) OR (year = $${paramIndex} AND month = $${paramIndex + 1} AND day <= $${
        paramIndex + 2
      }))`
    );
    params.push(
      toDate.getFullYear(),
      toDate.getFullYear(),
      toDate.getMonth() + 1,
      toDate.getFullYear(),
      toDate.getMonth() + 1,
      toDate.getDate()
    );
    paramIndex += 3;
  }

  const query = `
    SELECT 
      *,
      -- Обчислювані метрики
      CASE 
        WHEN spend > 0 THEN ROUND(((deps * cpa - spend) / spend * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      CASE 
        WHEN installs > 0 THEN ROUND((regs::numeric / installs * 100)::numeric, 2)
        ELSE 0 
      END as inst2reg,
      CASE 
        WHEN regs > 0 THEN ROUND((deps::numeric / regs * 100)::numeric, 2)
        ELSE 0 
      END as reg2dep,
      -- Конкатенована дата для зручності
      CONCAT(year, '-', LPAD(month::text, 2, '0'), '-', LPAD(day::text, 2, '0')) as full_date
    FROM flow_stats
    WHERE ${conditions.join(" AND ")}
    ORDER BY year, month, day
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
 * Отримання агрегованої статистики за період
 * @param {number} flow_id - ID потоку
 * @param {Object} options - Опції фільтрації та групування
 * @returns {Promise<Object>} Агрегована статистика
 */
const getAggregatedStats = async (flow_id, options = {}) => {
  const { month, year, dateFrom, dateTo } = options;

  const conditions = ["flow_id = $1"];
  const params = [flow_id];
  let paramIndex = 2;

  // Додаємо ті ж умови фільтрації, що і в getFlowStats
  if (month && year) {
    conditions.push(`month = $${paramIndex++} AND year = $${paramIndex++}`);
    params.push(month, year);
  } else if (year) {
    conditions.push(`year = $${paramIndex++}`);
    params.push(year);
  }

  const query = `
    SELECT 
      COUNT(*) as total_days,
      SUM(spend) as total_spend,
      SUM(installs) as total_installs,
      SUM(regs) as total_regs,
      SUM(deps) as total_deps,
      SUM(verified_deps) as total_verified_deps,
      AVG(cpa) as avg_cpa,
      -- Агреговані метрики
      CASE 
        WHEN SUM(spend) > 0 THEN ROUND(((SUM(deps * cpa) - SUM(spend)) / SUM(spend) * 100)::numeric, 2)
        ELSE 0 
      END as total_roi,
      CASE 
        WHEN SUM(installs) > 0 THEN ROUND((SUM(regs)::numeric / SUM(installs) * 100)::numeric, 2)
        ELSE 0 
      END as total_inst2reg,
      CASE 
        WHEN SUM(regs) > 0 THEN ROUND((SUM(deps)::numeric / SUM(regs) * 100)::numeric, 2)
        ELSE 0 
      END as total_reg2dep
    FROM flow_stats
    WHERE ${conditions.join(" AND ")}
  `;

  try {
    const result = await db.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error("Помилка при отриманні агрегованої статистики:", error);
    throw error;
  }
};

/**
 * Видалення статистики за день
 * @param {number} flow_id - ID потоку
 * @param {number} day - День
 * @param {number} month - Місяць
 * @param {number} year - Рік
 * @returns {Promise<boolean>} Успішність видалення
 */
const deleteFlowStat = async (flow_id, day, month, year) => {
  const query = `
    DELETE FROM flow_stats 
    WHERE flow_id = $1 AND day = $2 AND month = $3 AND year = $4
  `;

  try {
    const result = await db.query(query, [flow_id, day, month, year]);
    return result.rowCount > 0;
  } catch (error) {
    console.error("Помилка при видаленні статистики:", error);
    throw error;
  }
};

/**
 * Перевірка доступу користувача до редагування статистики потоку
 * @param {number} flow_id - ID потоку
 * @param {number} user_id - ID користувача
 * @returns {Promise<boolean>} Чи має користувач доступ
 */
const checkUserAccess = async (flow_id, user_id) => {
  const query = `
    SELECT 1 FROM flows f
    LEFT JOIN flow_users fu ON f.id = fu.flow_id
    WHERE f.id = $1 AND (
      f.created_by = $2 OR 
      fu.user_id = $2 AND fu.status = 'active'
    )
    LIMIT 1
  `;

  try {
    const result = await db.query(query, [flow_id, user_id]);
    return result.rows.length > 0;
  } catch (error) {
    console.error("Помилка при перевірці доступу:", error);
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
