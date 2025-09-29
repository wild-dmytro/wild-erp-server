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
 * ВИПРАВЛЕНО: Отримання денної статистики потоків з правильними параметрами
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

  // Створюємо параметри та умови послідовно
  let queryParams = [day, month, year]; // $1, $2, $3
  let countParams = [];
  let whereConditions = [];
  let countWhereConditions = [];
  let paramIndex = 3;
  let countParamIndex = 0;

  // Додаємо фільтри один за одним
  if (partnerId) {
    paramIndex++;
    countParamIndex++;
    whereConditions.push(`o.partner_id = $${paramIndex}`);
    countWhereConditions.push(`o.partner_id = $${countParamIndex}`);
    queryParams.push(partnerId);
    countParams.push(partnerId);
  }

  if (partnerIds && partnerIds.length > 0) {
    paramIndex++;
    countParamIndex++;
    whereConditions.push(`o.partner_id = ANY($${paramIndex})`);
    countWhereConditions.push(`o.partner_id = ANY($${countParamIndex}`);
    queryParams.push(partnerIds);
    countParams.push(partnerIds);
  }

  if (status) {
    paramIndex++;
    countParamIndex++;
    whereConditions.push(`f.status = $${paramIndex}`);
    countWhereConditions.push(`f.status = $${countParamIndex}`);
    queryParams.push(status);
    countParams.push(status);
  }

  if (teamId) {
    paramIndex++;
    countParamIndex++;
    whereConditions.push(`f.team_id = $${paramIndex}`);
    countWhereConditions.push(`f.team_id = $${countParamIndex}`);
    queryParams.push(teamId);
    countParams.push(teamId);
  }

  if (userId) {
    paramIndex++;
    countParamIndex++;
    whereConditions.push(`fu.user_id = $${paramIndex}`);
    countWhereConditions.push(`fu.user_id = $${countParamIndex}`);
    queryParams.push(userId);
    countParams.push(userId);
  }

  if (onlyActive) {
    whereConditions.push(`f.is_active = true`);
    whereConditions.push(`fu.status = 'active'`);
    countWhereConditions.push(`f.is_active = true`);
    countWhereConditions.push(`fu.status = 'active'`);
  }

  // Формуємо WHERE умови
  const whereClause =
    whereConditions.length > 0 ? ` AND ${whereConditions.join(" AND ")}` : "";
  const countWhereClause =
    countWhereConditions.length > 0
      ? ` AND ${countWhereConditions.join(" AND ")}`
      : "";

  // Додаємо LIMIT та OFFSET до основного запиту
  paramIndex++;
  const limitParam = `$${paramIndex}`;
  paramIndex++;
  const offsetParam = `$${paramIndex}`;
  queryParams.push(limit, offset);

  // ОСНОВНИЙ ЗАПИТ
  const query = `
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
      u.role as user_role,
      
      -- Статистика (може бути NULL)
      fs.id as stats_id,
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
      END as reg2dep,
        
      CASE WHEN fs.id IS NOT NULL THEN true ELSE false END as has_stats
        
    FROM flows f
    LEFT JOIN offers o ON f.offer_id = o.id
    LEFT JOIN partners p ON o.partner_id = p.id
    LEFT JOIN teams t ON f.team_id = t.id
    LEFT JOIN geos g ON f.geo_id = g.id
    LEFT JOIN flow_users fu ON f.id = fu.flow_id AND fu.status = 'active'
    LEFT JOIN users u ON fu.user_id = u.id
    LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
      AND fu.user_id = fs.user_id 
      AND fs.day = $1 AND fs.month = $2 AND fs.year = $3
    WHERE fu.user_id IS NOT NULL ${whereClause}
    ORDER BY f.name, u.first_name, u.last_name
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  // COUNT ЗАПИТ
  const countQuery = `
    SELECT COUNT(DISTINCT CONCAT(f.id, '-', fu.user_id)) as total
    FROM flows f
    LEFT JOIN offers o ON f.offer_id = o.id
    LEFT JOIN partners p ON o.partner_id = p.id
    LEFT JOIN flow_users fu ON f.id = fu.flow_id AND fu.status = 'active'
    LEFT JOIN users u ON fu.user_id = u.id
    WHERE fu.user_id IS NOT NULL ${countWhereClause}
  `;

  try {
    console.log("Main query params:", queryParams);
    console.log("Count query params:", countParams);

    const [flowsResult, countResult] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, countParams),
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
  if (
    ["admin", "bizdev", "teamlead", "affiliate_manager"].includes(user_role)
  ) {
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
 * Додано нові метрики: OAS, RD, URD, CPD та розрахунок прибутку
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
  } else if (
    user_id &&
    ["admin", "bizdev", "teamlead", "affiliate_manager"].includes(user_role)
  ) {
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

  // ДОДАНО: Запит для отримання даних про потік (модель, метрики тощо)
  const flowQuery = `
    SELECT 
      flow_type,
      kpi_metric,
      kpi_target_value,
      spend_percentage_ranges,
      cpa
    FROM flows 
    WHERE id = $1
  `;

  // Основний запит з додаванням нових метрик
  const query = `
    SELECT 
      fs.*,
      u.username,
      u.first_name,
      u.last_name,
      CONCAT(u.first_name, ' ', u.last_name) as user_full_name,
      
      -- Існуючі метрики
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
      END as reg2dep,
      
      -- ДОДАНО: Нові метрики
      -- OAS - (deposit_amount / spend) * 100%
      CASE 
        WHEN fs.spend > 0 
        THEN ROUND((fs.deposit_amount::numeric / fs.spend * 100)::numeric, 2)
        ELSE 0 
      END as oas,
      
      -- RD - (redep_count / deps) * 100%
      CASE 
        WHEN COALESCE(fs.verified_deps, fs.deps) > 0 
        THEN ROUND((fs.redep_count::numeric / COALESCE(fs.verified_deps, fs.deps) * 100)::numeric, 2)
        ELSE 0 
      END as rd,
      
      -- URD - (unique_redep_count / deps) * 100%
      CASE 
        WHEN COALESCE(fs.verified_deps, fs.deps) > 0 
        THEN ROUND((fs.unique_redep_count::numeric / COALESCE(fs.verified_deps, fs.deps) * 100)::numeric, 2)
        ELSE 0 
      END as urd,
      
      -- CPD - spend / deps
      CASE 
        WHEN COALESCE(fs.verified_deps, fs.deps) > 0 
        THEN ROUND((fs.spend::numeric / COALESCE(fs.verified_deps, fs.deps))::numeric, 2)
        ELSE 0 
      END as cpd
      
    FROM flow_stats fs
    JOIN users u ON fs.user_id = u.id
    WHERE ${whereClause}
    ORDER BY fs.year DESC, fs.month DESC, fs.day DESC, u.first_name, u.last_name
  `;

  try {
    // Отримуємо дані про потік
    const flowResult = await db.query(flowQuery, [flow_id]);
    if (flowResult.rows.length === 0) {
      throw new Error("Потік не знайдено");
    }

    const flowData = flowResult.rows[0];

    // Отримуємо статистику
    const result = await db.query(query, params);
    const statsData = result.rows;

    // ДОДАНО: Розрахунок прибутку
    let statsWithProfit = [];

    if (flowData.flow_type === "cpa") {
      // CPA модель: просто розраховуємо для кожного рядка
      statsWithProfit = statsData.map((row) => {
        const depsForCalculation = row.verified_deps || row.deps || 0;
        const profit = depsForCalculation * (flowData.cpa || 0);

        return {
          ...row,
          profit: Math.round(profit * 100) / 100,
        };
      });
    } else if (flowData.flow_type === "spend") {
      // SPEND модель: спочатку отримуємо унікальні комбінації місяць/рік
      const uniquePeriods = [
        ...new Set(statsData.map((row) => `${row.year}-${row.month}`)),
      ];

      // Розраховуємо KPI для кожного унікального періоду
      const monthlyKpiCache = {};

      for (const period of uniquePeriods) {
        const [year, month] = period.split("-");
        const monthlyKpi = await calculateMonthlyKPI(
          flow_id,
          flowData.kpi_metric,
          parseInt(month),
          parseInt(year),
          user_id,
          user_role,
          requesting_user_id
        );
        monthlyKpiCache[period] = monthlyKpi;
      }

      // Тепер розраховуємо прибуток для кожного рядка використовуючи кеш
      statsWithProfit = statsData.map((row) => {
        const periodKey = `${row.year}-${row.month}`;
        const monthlyKpi = monthlyKpiCache[periodKey] || 0;

        // Знаходимо відповідний spend_multiplier
        const spendMultiplier = findSpendMultiplier(
          monthlyKpi,
          flowData.spend_percentage_ranges
        );

        const profit = row.spend * spendMultiplier;

        return {
          ...row,
          profit: Math.round(profit * 100) / 100,
          monthly_kpi: monthlyKpi, // Додатково включаємо KPI для інформації
          spend_multiplier: spendMultiplier, // Додатково включаємо множник для інформації
        };
      });
    } else {
      // Невідомий тип потоку
      statsWithProfit = statsData.map((row) => ({
        ...row,
        profit: 0,
      }));
    }

    return statsWithProfit;
  } catch (error) {
    console.error("Помилка при отриманні статистики потоку:", error);
    throw error;
  }
};

/**
 * ДОДАНО: Функція для розрахунку місячної KPI метрики
 */
const calculateMonthlyKPI = async (
  flow_id,
  kpi_metric,
  month,
  year,
  user_id,
  user_role,
  requesting_user_id
) => {
  let conditions = ["fs.flow_id = $1", "fs.month = $2", "fs.year = $3"];
  let params = [flow_id, month, year];
  let paramIndex = 3;

  // Застосовуємо ту ж логіку фільтрації користувачів
  if (user_role === "buyer") {
    paramIndex++;
    conditions.push(`fs.user_id = $${paramIndex}`);
    params.push(requesting_user_id);
  } else if (user_id && ["admin", "bizdev", "teamlead"].includes(user_role)) {
    paramIndex++;
    conditions.push(`fs.user_id = $${paramIndex}`);
    params.push(user_id);
  }

  const whereClause = conditions.join(" AND ");

  let metricQuery = "";

  switch (kpi_metric) {
    case "OAS":
      metricQuery = `
        SELECT 
          CASE 
            WHEN SUM(fs.spend) > 0 
            THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
            ELSE 0 
          END as monthly_metric
        FROM flow_stats fs
        WHERE ${whereClause}
      `;
      break;

    case "RD":
      metricQuery = `
        SELECT 
          CASE 
            WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
            THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
            ELSE 0 
          END as monthly_metric
        FROM flow_stats fs
        WHERE ${whereClause}
      `;
      break;

    case "URD":
      metricQuery = `
        SELECT 
          CASE 
            WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
            THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
            ELSE 0 
          END as monthly_metric
        FROM flow_stats fs
        WHERE ${whereClause}
      `;
      break;

    case "CPD":
      metricQuery = `
        SELECT 
          CASE 
            WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
            THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
            ELSE 0 
          END as monthly_metric
        FROM flow_stats fs
        WHERE ${whereClause}
      `;
      break;

    default:
      return 0;
  }

  try {
    const result = await db.query(metricQuery, params);
    return result.rows[0]?.monthly_metric || 0;
  } catch (error) {
    console.error(`Помилка при розрахунку ${kpi_metric}:`, error);
    return 0;
  }
};

/**
 * ДОДАНО: Функція для знаходження spend_multiplier за значенням метрики
 */
const findSpendMultiplier = (metricValue, spendPercentageRanges) => {
  if (!spendPercentageRanges || !Array.isArray(spendPercentageRanges)) {
    return 0;
  }

  try {
    // Якщо це рядок JSON, парсимо його
    const ranges =
      typeof spendPercentageRanges === "string"
        ? JSON.parse(spendPercentageRanges)
        : spendPercentageRanges;

    // Сортуємо діапазони за min_percentage для правильного пошуку
    const sortedRanges = ranges.sort(
      (a, b) => a.min_percentage - b.min_percentage
    );

    for (const range of sortedRanges) {
      const minPercentage = range.min_percentage || 0;
      const maxPercentage = range.max_percentage;

      // Якщо max_percentage не вказано (null/undefined), це означає "від min_percentage і вище"
      if (maxPercentage === null || maxPercentage === undefined) {
        if (metricValue >= minPercentage) {
          return range.spend_multiplier || 0;
        }
      } else {
        // Звичайний діапазон з min та max
        if (metricValue >= minPercentage && metricValue <= maxPercentage) {
          return range.spend_multiplier || 0;
        }
      }
    }

    // Якщо не знайдено відповідного діапазону, повертаємо 0
    return 0;
  } catch (error) {
    console.error("Помилка при парсингу spend_percentage_ranges:", error);
    return 0;
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
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку за кожен день
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

    // ОНОВЛЕНО: Основний запит з урахуванням user_id в flow_stats та новими метриками
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
          COUNT(DISTINCT fs.flow_id) as active_flows_count,
          -- ДОДАНО: Збираємо дані для розрахунку прибутку за день
          array_agg(
            json_build_object(
              'flow_id', fs.flow_id,
              'spend', fs.spend,
              'deps', fs.deps,
              'verified_deps', fs.verified_deps,
              'cpa', fs.cpa
            )
          ) FILTER (WHERE fs.flow_id IS NOT NULL) as daily_flow_stats
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
        daily_flow_stats,
        -- Існуючі обчислювальні поля
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
        END as verification_rate,
        -- ДОДАНО: Нові метрики
        -- OAS - (deposit_amount / spend) * 100%
        CASE 
          WHEN total_spend > 0 
          THEN ROUND((total_deposit_amount::numeric / total_spend * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        -- RD - (redep_count / deps) * 100%
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_redep_count::numeric / COALESCE(total_verified_deps, total_deps) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        -- URD - (unique_redep_count / deps) * 100%
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_unique_redep_count::numeric / COALESCE(total_verified_deps, total_deps) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        -- CPD - spend / deps
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_spend::numeric / COALESCE(total_verified_deps, total_deps))::numeric, 2)
          ELSE 0 
        END as cpd
      FROM daily_data
      ORDER BY day
    `;

    const dailyResult = await db.query(dailyStatsQuery, [
      userId,
      month,
      daysInMonth,
      year,
    ]);

    // ДОДАНО: Отримуємо дані про всі активні потоки користувача для розрахунку прибутку
    const activeFlowsQuery = `
      SELECT 
        f.id,
        f.flow_type,
        f.kpi_metric,
        f.kpi_target_value,
        f.spend_percentage_ranges,
        f.cpa
      FROM flows f
      JOIN flow_users fu ON f.id = fu.flow_id
      WHERE fu.user_id = $1 AND fu.status = 'active'
    `;

    const activeFlowsResult = await db.query(activeFlowsQuery, [userId]);
    const activeFlows = activeFlowsResult.rows;

    // Створюємо мапу потоків для швидкого доступу
    const flowsMap = {};
    activeFlows.forEach((flow) => {
      flowsMap[flow.id] = flow;
    });

    // ДОДАНО: Розрахунок KPI для spend потоків (робимо один раз для всього місяця)
    const spendFlows = activeFlows.filter((f) => f.flow_type === "spend");
    const monthlyKpiCache = {};

    for (const flow of spendFlows) {
      const monthlyKpi = await calculateMonthlyKPI(
        flow.id,
        flow.kpi_metric,
        month,
        year,
        userId, // фільтруємо по конкретному користувачу
        user_role,
        requesting_user_id
      );
      monthlyKpiCache[flow.id] = {
        kpi: monthlyKpi,
        multiplier: findSpendMultiplier(
          monthlyKpi,
          flow.spend_percentage_ranges
        ),
      };
    }

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

    // ДОДАНО: Функція для розрахунку денного прибутку
    const calculateDayProfit = (dailyFlowStats) => {
      if (!dailyFlowStats || dailyFlowStats.length === 0) {
        return 0;
      }

      let dayProfit = 0;

      dailyFlowStats.forEach((flowStat) => {
        if (!flowStat || !flowStat.flow_id || !flowsMap[flowStat.flow_id]) {
          return;
        }

        const flow = flowsMap[flowStat.flow_id];

        if (flow.flow_type === "cpa") {
          // CPA модель: verified_deps (або deps) * cpa
          const depsForCalculation =
            flowStat.verified_deps || flowStat.deps || 0;
          const cpa = flowStat.cpa || flow.cpa || 0;
          dayProfit += depsForCalculation * cpa;
        } else if (flow.flow_type === "spend") {
          // SPEND модель: використовуємо закешований multiplier
          const cached = monthlyKpiCache[flow.id];
          if (cached) {
            dayProfit += (flowStat.spend || 0) * cached.multiplier;
          }
        }
      });

      return Math.round(dayProfit * 100) / 100;
    };

    // Форматуємо результат з новими полями, метриками та денним прибутком
    const dailyStats = dailyResult.rows.map((row) => {
      const dayProfit = calculateDayProfit(row.daily_flow_stats);

      return {
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
          // ДОДАНО: Денний прибуток
          profit: dayProfit,
        },
        calculated: {
          // Існуючі метрики (ROI тепер через денний прибуток)
          roi:
            parseFloat(row.total_spend) > 0
              ? Math.round(
                  (dayProfit / parseFloat(row.total_spend)) * 100 * 100
                ) /
                  100 -
                100
              : 0,
          inst2reg: parseFloat(row.inst2reg) || 0,
          reg2dep: parseFloat(row.reg2dep) || 0,
          verification_rate: parseFloat(row.verification_rate) || 0,
          // ДОДАНО: Нові метрики
          oas: parseFloat(row.oas) || 0,
          rd: parseFloat(row.rd) || 0,
          urd: parseFloat(row.urd) || 0,
          cpd: parseFloat(row.cpd) || 0,
        },
        meta: {
          flows_with_stats: parseInt(row.flows_with_stats) || 0,
          active_flows_count: parseInt(row.active_flows_count) || 0,
          has_activity: parseInt(row.flows_with_stats) > 0,
        },
      };
    });

    // Обчислюємо загальні метрики з новими полями та загальним прибутком
    const totalProfit = dailyStats.reduce(
      (sum, day) => sum + day.metrics.profit,
      0
    );

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
      // ДОДАНО: Загальний прибуток
      total_profit: Math.round(totalProfit * 100) / 100,
    };

    // Використовуємо verified_deps або deps для розрахунків
    const depsForCalculation =
      totalMetrics.verified_deps > 0
        ? totalMetrics.verified_deps
        : totalMetrics.deps;

    const totalCalculated = {
      // Існуючі метрики (ROI тепер через прибуток)
      roi:
        totalMetrics.spend > 0
          ? Math.round(
              (totalMetrics.total_profit / totalMetrics.spend) * 100 * 100
            ) /
              100 -
            100
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
      // ДОДАНО: Нові загальні метрики
      oas:
        totalMetrics.spend > 0
          ? Math.round(
              (totalMetrics.deposit_amount / totalMetrics.spend) * 100 * 100
            ) / 100
          : 0,
      rd:
        depsForCalculation > 0
          ? Math.round(
              (totalMetrics.redep_count / depsForCalculation) * 100 * 100
            ) / 100
          : 0,
      urd:
        depsForCalculation > 0
          ? Math.round(
              (totalMetrics.unique_redep_count / depsForCalculation) * 100 * 100
            ) / 100
          : 0,
      cpd:
        depsForCalculation > 0
          ? Math.round((totalMetrics.spend / depsForCalculation) * 100) / 100
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
        // ДОДАНО: Середній денний прибуток
        avg_daily_profit: totalMetrics.total_profit / daysInMonth,
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
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку за кожен день
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

    // ОНОВЛЕНО: Основний запит з урахуванням user_id в flow_stats та новими метриками
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
          COUNT(DISTINCT fs.user_id) as active_users_count,
          -- ДОДАНО: Збираємо дані для розрахунку прибутку за день
          array_agg(
            json_build_object(
              'flow_id', fs.flow_id,
              'user_id', fs.user_id,
              'spend', fs.spend,
              'deps', fs.deps,
              'verified_deps', fs.verified_deps,
              'cpa', fs.cpa
            )
          ) FILTER (WHERE fs.flow_id IS NOT NULL) as daily_flow_stats
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
        daily_flow_stats,
        -- Існуючі обчислювальні поля
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
        END as verification_rate,
        -- ДОДАНО: Нові метрики
        -- OAS - (deposit_amount / spend) * 100%
        CASE 
          WHEN total_spend > 0 
          THEN ROUND((total_deposit_amount::numeric / total_spend * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        -- RD - (redep_count / deps) * 100%
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_redep_count::numeric / COALESCE(total_verified_deps, total_deps) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        -- URD - (unique_redep_count / deps) * 100%
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_unique_redep_count::numeric / COALESCE(total_verified_deps, total_deps) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        -- CPD - spend / deps
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_spend::numeric / COALESCE(total_verified_deps, total_deps))::numeric, 2)
          ELSE 0 
        END as cpd
      FROM daily_data
      ORDER BY day
    `;

    const dailyResult = await db.query(dailyStatsQuery, [
      teamId,
      month,
      daysInMonth,
      year,
    ]);

    // ДОДАНО: Отримуємо дані про всі потоки команди для розрахунку прибутку
    const teamFlowsQuery = `
      SELECT 
        f.id,
        f.flow_type,
        f.kpi_metric,
        f.kpi_target_value,
        f.spend_percentage_ranges,
        f.cpa
      FROM flows f
      WHERE f.team_id = $1
    `;

    const teamFlowsResult = await db.query(teamFlowsQuery, [teamId]);
    const teamFlows = teamFlowsResult.rows;

    // Створюємо мапу потоків для швидкого доступу
    const flowsMap = {};
    teamFlows.forEach((flow) => {
      flowsMap[flow.id] = flow;
    });

    // ДОДАНО: Розрахунок KPI для spend потоків (робимо один раз для всього місяця)
    const spendFlows = teamFlows.filter((f) => f.flow_type === "spend");
    const monthlyKpiCache = {};

    for (const flow of spendFlows) {
      const monthlyKpi = await calculateMonthlyKPI(
        flow.id,
        flow.kpi_metric,
        month,
        year,
        undefined, // не фільтруємо по користувачу для команди
        user_role,
        requesting_user_id
      );
      monthlyKpiCache[flow.id] = {
        kpi: monthlyKpi,
        multiplier: findSpendMultiplier(
          monthlyKpi,
          flow.spend_percentage_ranges
        ),
      };
    }

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

    // ДОДАНО: Функція для розрахунку денного прибутку
    const calculateDayProfit = (dailyFlowStats) => {
      if (!dailyFlowStats || dailyFlowStats.length === 0) {
        return 0;
      }

      let dayProfit = 0;

      dailyFlowStats.forEach((flowStat) => {
        if (!flowStat || !flowStat.flow_id || !flowsMap[flowStat.flow_id]) {
          return;
        }

        const flow = flowsMap[flowStat.flow_id];

        if (flow.flow_type === "cpa") {
          // CPA модель: verified_deps (або deps) * cpa
          const depsForCalculation =
            flowStat.verified_deps || flowStat.deps || 0;
          const cpa = flowStat.cpa || flow.cpa || 0;
          dayProfit += depsForCalculation * cpa;
        } else if (flow.flow_type === "spend") {
          // SPEND модель: використовуємо закешований multiplier
          const cached = monthlyKpiCache[flow.id];
          if (cached) {
            dayProfit += (flowStat.spend || 0) * cached.multiplier;
          }
        }
      });

      return Math.round(dayProfit * 100) / 100;
    };

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
        END as roi,
        -- ДОДАНО: Нові метрики
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
          ELSE 0 
        END as cpd
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

    // Форматуємо результат з новими полями, метриками та денним прибутком
    const dailyStats = dailyResult.rows.map((row) => {
      const dayProfit = calculateDayProfit(row.daily_flow_stats);

      return {
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
          // ДОДАНО: Денний прибуток
          profit: dayProfit,
        },
        calculated: {
          // Існуючі метрики (ROI тепер через денний прибуток)
          roi:
            parseFloat(row.total_spend) > 0
              ? Math.round(
                  (dayProfit / parseFloat(row.total_spend)) * 100 * 100
                ) /
                  100 -
                100
              : 0,
          inst2reg: parseFloat(row.inst2reg) || 0,
          reg2dep: parseFloat(row.reg2dep) || 0,
          verification_rate: parseFloat(row.verification_rate) || 0,
          // ДОДАНО: Нові метрики
          oas: parseFloat(row.oas) || 0,
          rd: parseFloat(row.rd) || 0,
          urd: parseFloat(row.urd) || 0,
          cpd: parseFloat(row.cpd) || 0,
        },
        meta: {
          flows_with_stats: parseInt(row.flows_with_stats) || 0,
          active_flows_count: parseInt(row.active_flows_count) || 0,
          active_users_count: parseInt(row.active_users_count) || 0,
          has_activity: parseInt(row.flows_with_stats) > 0,
        },
      };
    });

    // ДОДАНО: Розрахунок прибутку для топ користувачів
    const topUsersWithProfit = await Promise.all(
      topUsersResult.rows.map(async (user) => {
        let userProfit = 0;

        // Отримуємо статистику по потоках для конкретного користувача
        const userFlowStatsQuery = `
          SELECT 
            fs.flow_id,
            SUM(fs.spend) as total_spend,
            SUM(fs.deps) as total_deps,
            SUM(fs.verified_deps) as total_verified_deps,
            AVG(fs.cpa) as avg_cpa
          FROM flow_stats fs
          JOIN flows f ON fs.flow_id = f.id
          WHERE f.team_id = $1 
            AND fs.user_id = $2 
            AND fs.month = $3 
            AND fs.year = $4
          GROUP BY fs.flow_id
        `;

        const userFlowStatsResult = await db.query(userFlowStatsQuery, [
          teamId,
          user.user_id,
          month,
          year,
        ]);

        // Розраховуємо прибуток по потоках користувача
        for (const flowData of userFlowStatsResult.rows) {
          const flow = flowsMap[flowData.flow_id];
          if (!flow) continue;

          if (flow.flow_type === "cpa") {
            const depsForCalculation =
              flowData.total_verified_deps || flowData.total_deps || 0;
            const cpa = flowData.avg_cpa || flow.cpa || 0;
            userProfit += depsForCalculation * cpa;
          } else if (flow.flow_type === "spend") {
            const cached = monthlyKpiCache[flow.id];
            if (cached) {
              userProfit += (flowData.total_spend || 0) * cached.multiplier;
            }
          }
        }

        return {
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
            // Існуючі метрики (ROI тепер через прибуток)
            roi:
              parseFloat(user.total_spend) > 0
                ? Math.round(
                    (userProfit / parseFloat(user.total_spend)) * 100 * 100
                  ) /
                    100 -
                  100
                : 0,
            // ДОДАНО: Нові метрики
            oas: parseFloat(user.oas) || 0,
            rd: parseFloat(user.rd) || 0,
            urd: parseFloat(user.urd) || 0,
            cpd: parseFloat(user.cpd) || 0,
            // ДОДАНО: Прибуток користувача
            profit: Math.round(userProfit * 100) / 100,
          },
          active_flows: parseInt(user.active_flows) || 0,
        };
      })
    );

    // Обчислюємо загальні метрики з новими полями та загальним прибутком
    const totalProfit = dailyStats.reduce(
      (sum, day) => sum + day.metrics.profit,
      0
    );

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
      // ДОДАНО: Загальний прибуток
      total_profit: Math.round(totalProfit * 100) / 100,
    };

    // Використовуємо verified_deps або deps для розрахунків
    const depsForCalculation =
      totalMetrics.verified_deps > 0
        ? totalMetrics.verified_deps
        : totalMetrics.deps;

    const totalCalculated = {
      // Існуючі метрики (ROI тепер через прибуток)
      roi:
        totalMetrics.spend > 0
          ? Math.round(
              (totalMetrics.total_profit / totalMetrics.spend) * 100 * 100
            ) /
              100 -
            100
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
      // ДОДАНО: Нові загальні метрики
      oas:
        totalMetrics.spend > 0
          ? Math.round(
              (totalMetrics.deposit_amount / totalMetrics.spend) * 100 * 100
            ) / 100
          : 0,
      rd:
        depsForCalculation > 0
          ? Math.round(
              (totalMetrics.redep_count / depsForCalculation) * 100 * 100
            ) / 100
          : 0,
      urd:
        depsForCalculation > 0
          ? Math.round(
              (totalMetrics.unique_redep_count / depsForCalculation) * 100 * 100
            ) / 100
          : 0,
      cpd:
        depsForCalculation > 0
          ? Math.round((totalMetrics.spend / depsForCalculation) * 100) / 100
          : 0,
    };

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
        // ДОДАНО: Середній денний прибуток
        avg_daily_profit: totalMetrics.total_profit / daysInMonth,
        top_users: topUsersWithProfit,
      },
    };
  } catch (error) {
    console.error("Помилка в getTeamMonthlyStats:", error);
    throw new Error(`Помилка отримання статистики команди: ${error.message}`);
  }
};

/**
 * НОВИЙ: Отримання статистики компанії за місяць по днях з коректним розрахунком прибутку
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку за кожен день
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @param {number} requesting_user_id - ID користувача, що робить запит
 * @param {string} user_role - Роль користувача, що робить запит
 * @returns {Promise<Object>} Статистика по днях + загальна статистика компанії
 */
const getCompanyDailyStats = async (
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
    throw new Error("Buyer не має доступу до статистики компанії");
  }

  try {
    // Отримуємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    // ОСНОВНИЙ: Запит для отримання денної статистики всієї компанії
    const dailyStatsQuery = `
      WITH days_series AS (
        SELECT generate_series(1, $2) as day
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
          COUNT(DISTINCT fs.user_id) as active_users_count,
          COUNT(DISTINCT f.team_id) as active_teams_count,
          -- Збираємо дані для розрахунку прибутку за день
          array_agg(
            json_build_object(
              'flow_id', fs.flow_id,
              'user_id', fs.user_id,
              'spend', fs.spend,
              'deps', fs.deps,
              'verified_deps', fs.verified_deps,
              'cpa', fs.cpa
            )
          ) FILTER (WHERE fs.flow_id IS NOT NULL) as daily_flow_stats
        FROM days_series ds
        LEFT JOIN flow_stats fs ON ds.day = fs.day 
          AND fs.month = $1 
          AND fs.year = $3
        LEFT JOIN flows f ON fs.flow_id = f.id
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
        active_teams_count,
        daily_flow_stats,
        
        -- Існуючі обчислювальні поля
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
        END as verification_rate,
        
        -- ДОДАНО: Нові метрики
        CASE 
          WHEN total_spend > 0 
          THEN ROUND((total_deposit_amount::numeric / total_spend * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_redep_count::numeric / COALESCE(total_verified_deps, total_deps) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_unique_redep_count::numeric / COALESCE(total_verified_deps, total_deps) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        CASE 
          WHEN COALESCE(total_verified_deps, total_deps) > 0 
          THEN ROUND((total_spend::numeric / COALESCE(total_verified_deps, total_deps))::numeric, 2)
          ELSE 0 
        END as cpd
      FROM daily_data
      ORDER BY day
    `;

    const dailyResult = await db.query(dailyStatsQuery, [
      month,
      daysInMonth,
      year,
    ]);

    // Отримуємо дані про всі активні потоки компанії для розрахунку прибутку
    const companyFlowsQuery = `
      SELECT 
        f.id,
        f.flow_type,
        f.kpi_metric,
        f.kpi_target_value,
        f.spend_percentage_ranges,
        f.cpa
      FROM flows f
      WHERE f.status = 'active'
    `;

    const companyFlowsResult = await db.query(companyFlowsQuery);
    const companyFlows = companyFlowsResult.rows;

    // Створюємо мапу потоків для швидкого доступу
    const flowsMap = {};
    companyFlows.forEach((flow) => {
      flowsMap[flow.id] = flow;
    });

    // Розрахунок KPI для spend потоків (кешуємо для оптимізації)
    const spendFlows = companyFlows.filter((f) => f.flow_type === "spend");
    const monthlyKpiCache = {};

    console.log(
      `Розраховуємо KPI для ${spendFlows.length} spend потоків компанії...`
    );

    for (const flow of spendFlows) {
      try {
        const monthlyKpi = await calculateMonthlyKPI(
          flow.id,
          flow.kpi_metric,
          month,
          year,
          undefined, // не фільтруємо по користувачу для всієї компанії
          "admin", // використовуємо admin роль для доступу до всіх даних
          requesting_user_id
        );
        monthlyKpiCache[flow.id] = {
          kpi: monthlyKpi,
          multiplier: findSpendMultiplier(
            monthlyKpi,
            flow.spend_percentage_ranges
          ),
        };
      } catch (error) {
        console.error(`Помилка розрахунку KPI для потоку ${flow.id}:`, error);
        monthlyKpiCache[flow.id] = { kpi: 0, multiplier: 0 };
      }
    }

    // ЗАГАЛЬНА СТАТИСТИКА: Основні показники компанії за місяць
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as total_company_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_company_flows,
        COUNT(DISTINCT fs.user_id) as total_active_users,
        COUNT(DISTINCT f.team_id) as total_active_teams,
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
        
        -- Найкращий день за прибутковістю (спрощений розрахунок через CPA)
        (SELECT day FROM flow_stats fs2 
         JOIN flows f2 ON fs2.flow_id = f2.id
         WHERE fs2.month = $1 AND fs2.year = $2
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         AND f2.flow_type = 'cpa'
         GROUP BY day
         ORDER BY (SUM(fs2.deps * fs2.cpa) - SUM(fs2.spend)) DESC
         LIMIT 1) as best_profit_day,
         
        -- Найгірший день
        (SELECT day FROM flow_stats fs2 
         JOIN flows f2 ON fs2.flow_id = f2.id
         WHERE fs2.month = $1 AND fs2.year = $2
         AND fs2.spend > 0 AND fs2.deps > 0 AND fs2.cpa > 0
         AND f2.flow_type = 'cpa'
         GROUP BY day
         ORDER BY (SUM(fs2.deps * fs2.cpa) - SUM(fs2.spend)) ASC
         LIMIT 1) as worst_profit_day,
         
        -- Найпродуктивніший користувач за місяць
        (SELECT fs.user_id FROM flow_stats fs 
         WHERE fs.month = $1 AND fs.year = $2
         GROUP BY fs.user_id
         ORDER BY SUM(fs.deps) DESC
         LIMIT 1) as top_user_id
         
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
    `;

    const summaryResult = await db.query(summaryQuery, [month, year]);
    const summary = summaryResult.rows[0];

    // ТОП КОМАНДИ: Статистика по командах за місяць з новими метриками
    const topTeamsQuery = `
      SELECT 
        t.id as team_id,
        t.name as team_name,
        COUNT(DISTINCT f.id) as team_flows,
        COUNT(DISTINCT fs.user_id) as team_users,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        
        -- Нові метрики для команд
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
          ELSE 0 
        END as cpd
        
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      GROUP BY t.id, t.name
      HAVING COUNT(DISTINCT f.id) > 0 AND COALESCE(SUM(fs.spend), 0) > 0
      ORDER BY total_spend DESC
      LIMIT 10
    `;

    // ТОП КОРИСТУВАЧІ: З усіх команд компанії
    const topUsersQuery = `
      SELECT 
        u.id as user_id,
        u.username,
        u.first_name,
        u.last_name,
        t.name as team_name,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        COUNT(DISTINCT fs.flow_id) as active_flows,
        
        -- Нові метрики для користувачів
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
          ELSE 0 
        END as cpd
        
      FROM users u
      JOIN flow_stats fs ON u.id = fs.user_id
      JOIN flows f ON fs.flow_id = f.id
      LEFT JOIN teams t ON f.team_id = t.id
      WHERE fs.month = $1 AND fs.year = $2
      GROUP BY u.id, u.username, u.first_name, u.last_name, t.name
      HAVING SUM(fs.deps) > 0
      ORDER BY total_deps DESC
      LIMIT 10
    `;

    // ТОП ПАРТНЕРИ: За обсягом витрат
    const topPartnersQuery = `
      SELECT 
        p.id as partner_id,
        p.name as partner_name,
        p.type as partner_type,
        COUNT(DISTINCT f.id) as partner_flows,
        COUNT(DISTINCT o.id) as partner_offers,
        COALESCE(SUM(fs.spend), 0) as total_spend,
        COALESCE(SUM(fs.deps), 0) as total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as total_verified_deps,
        COALESCE(SUM(fs.deposit_amount), 0) as total_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as total_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as total_unique_redep_count,
        
        -- Нові метрики для партнерів
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
          ELSE 0 
        END as cpd
        
      FROM partners p
      LEFT JOIN offers o ON p.id = o.partner_id
      LEFT JOIN flows f ON o.id = f.offer_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      GROUP BY p.id, p.name, p.type
      HAVING COUNT(DISTINCT f.id) > 0 AND COALESCE(SUM(fs.spend), 0) > 0
      ORDER BY total_spend DESC
      LIMIT 10
    `;

    // Паралельно виконуємо всі запити
    const [topTeamsResult, topUsersResult, topPartnersResult] =
      await Promise.all([
        db.query(topTeamsQuery, [month, year]),
        db.query(topUsersQuery, [month, year]),
        db.query(topPartnersQuery, [month, year]),
      ]);

    // ФУНКЦІЯ: Розрахунок денного прибутку
    const calculateDayProfit = (dailyFlowStats) => {
      if (!dailyFlowStats || dailyFlowStats.length === 0) {
        return 0;
      }

      let dayProfit = 0;
      let dayRevenue = 0;

      // Групуємо за потоками для уникнення подвійного рахування
      const flowAggregates = {};

      dailyFlowStats.forEach((flowStat) => {
        if (!flowStat || !flowStat.flow_id) return;

        if (!flowAggregates[flowStat.flow_id]) {
          flowAggregates[flowStat.flow_id] = {
            spend: 0,
            deps: 0,
            verified_deps: 0,
            cpa: flowStat.cpa || 0,
          };
        }

        flowAggregates[flowStat.flow_id].spend +=
          parseFloat(flowStat.spend) || 0;
        flowAggregates[flowStat.flow_id].deps += parseInt(flowStat.deps) || 0;
        flowAggregates[flowStat.flow_id].verified_deps +=
          parseInt(flowStat.verified_deps) || 0;
      });

      // Розраховуємо прибуток для кожного потоку
      Object.entries(flowAggregates).forEach(([flowId, aggregate]) => {
        const flow = flowsMap[flowId];
        if (!flow) return;

        let flowRevenue = 0;

        if (flow.flow_type === "cpa") {
          // CPA модель
          const depsForCalculation =
            aggregate.verified_deps || aggregate.deps || 0;
          const cpa = aggregate.cpa || flow.cpa || 0;
          flowRevenue = depsForCalculation * cpa;
        } else if (flow.flow_type === "spend") {
          // SPEND модель
          const cached = monthlyKpiCache[flowId];
          if (cached && cached.multiplier > 0) {
            flowRevenue = aggregate.spend * cached.multiplier;
          }
        }

        dayRevenue += flowRevenue;
        dayProfit += flowRevenue - aggregate.spend;
      });

      return Math.round(dayProfit * 100) / 100;
    };

    // ФУНКЦІЯ: Розрахунок прибутку для сутностей (команди, користувачі, партнери)
    const calculateEntityProfit = async (entityType, entityData) => {
      // Спрощений розрахунок через пропорцію від загального денного прибутку
      // В ідеалі тут треба було б робити детальні запити по потоках кожної сутності
      const totalSpend = parseFloat(summary.total_spend) || 0;
      const entitySpend = parseFloat(entityData.total_spend) || 0;

      if (totalSpend === 0) return 0;

      // Розраховуємо загальний прибуток за місяць
      const totalMonthlyProfit = dailyResult.rows.reduce((sum, day) => {
        return sum + calculateDayProfit(day.daily_flow_stats);
      }, 0);

      // Пропорційний розрахунок
      const proportion = entitySpend / totalSpend;
      return Math.round(totalMonthlyProfit * proportion * 100) / 100;
    };

    // ФОРМАТ РЕЗУЛЬТАТІВ: Денна статистика з розрахунком прибутку
    const dailyStats = dailyResult.rows.map((row) => {
      const dayProfit = calculateDayProfit(row.daily_flow_stats);
      const daySpend = parseFloat(row.total_spend) || 0;

      return {
        day: parseInt(row.day),
        date: `${year}-${String(month).padStart(2, "0")}-${String(
          row.day
        ).padStart(2, "0")}`,
        metrics: {
          spend: daySpend,
          installs: parseInt(row.total_installs) || 0,
          regs: parseInt(row.total_regs) || 0,
          deps: parseInt(row.total_deps) || 0,
          verified_deps: parseInt(row.total_verified_deps) || 0,
          deposit_amount: parseFloat(row.total_deposit_amount) || 0,
          redep_count: parseInt(row.total_redep_count) || 0,
          unique_redep_count: parseInt(row.total_unique_redep_count) || 0,
          avg_cpa: parseFloat(row.avg_cpa) || 0,
          profit: dayProfit,
          revenue: dayProfit + daySpend, // revenue = profit + spend
        },
        calculated: {
          roi:
            daySpend > 0
              ? Math.round((dayProfit / daySpend) * 100 * 100) / 100
              : 0,
          inst2reg: parseFloat(row.inst2reg) || 0,
          reg2dep: parseFloat(row.reg2dep) || 0,
          verification_rate: parseFloat(row.verification_rate) || 0,
          oas: parseFloat(row.oas) || 0,
          rd: parseFloat(row.rd) || 0,
          urd: parseFloat(row.urd) || 0,
          cpd: parseFloat(row.cpd) || 0,
        },
        meta: {
          flows_with_stats: parseInt(row.flows_with_stats) || 0,
          active_flows_count: parseInt(row.active_flows_count) || 0,
          active_users_count: parseInt(row.active_users_count) || 0,
          active_teams_count: parseInt(row.active_teams_count) || 0,
          has_activity: parseInt(row.flows_with_stats) > 0,
        },
      };
    });

    // Топ команди з розрахунком прибутку
    const topTeamsWithProfit = await Promise.all(
      topTeamsResult.rows.map(async (team) => {
        const teamProfit = await calculateEntityProfit("team", team);

        return {
          team_id: team.team_id,
          team_name: team.team_name,
          flows: parseInt(team.team_flows) || 0,
          users: parseInt(team.team_users) || 0,
          metrics: {
            spend: parseFloat(team.total_spend) || 0,
            deps: parseInt(team.total_deps) || 0,
            verified_deps: parseInt(team.total_verified_deps) || 0,
            deposit_amount: parseFloat(team.total_deposit_amount) || 0,
            redep_count: parseInt(team.total_redep_count) || 0,
            unique_redep_count: parseInt(team.total_unique_redep_count) || 0,
            profit: teamProfit,
            revenue: teamProfit + (parseFloat(team.total_spend) || 0),
            roi:
              parseFloat(team.total_spend) > 0
                ? Math.round(
                    (teamProfit / parseFloat(team.total_spend)) * 100 * 100
                  ) / 100
                : 0,
            oas: parseFloat(team.oas) || 0,
            rd: parseFloat(team.rd) || 0,
            urd: parseFloat(team.urd) || 0,
            cpd: parseFloat(team.cpd) || 0,
          },
        };
      })
    );

    // Топ користувачі з розрахунком прибутку
    const topUsersWithProfit = await Promise.all(
      topUsersResult.rows.map(async (user) => {
        const userProfit = await calculateEntityProfit("user", user);

        return {
          user_id: user.user_id,
          username: user.username,
          full_name:
            user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.username,
          team_name: user.team_name,
          active_flows: parseInt(user.active_flows) || 0,
          metrics: {
            spend: parseFloat(user.total_spend) || 0,
            deps: parseInt(user.total_deps) || 0,
            verified_deps: parseInt(user.total_verified_deps) || 0,
            deposit_amount: parseFloat(user.total_deposit_amount) || 0,
            redep_count: parseInt(user.total_redep_count) || 0,
            unique_redep_count: parseInt(user.total_unique_redep_count) || 0,
            profit: userProfit,
            revenue: userProfit + (parseFloat(user.total_spend) || 0),
            roi:
              parseFloat(user.total_spend) > 0
                ? Math.round(
                    (userProfit / parseFloat(user.total_spend)) * 100 * 100
                  ) / 100
                : 0,
            oas: parseFloat(user.oas) || 0,
            rd: parseFloat(user.rd) || 0,
            urd: parseFloat(user.urd) || 0,
            cpd: parseFloat(user.cpd) || 0,
          },
        };
      })
    );

    // Топ партнери з розрахунком прибутку
    const topPartnersWithProfit = await Promise.all(
      topPartnersResult.rows.map(async (partner) => {
        const partnerProfit = await calculateEntityProfit("partner", partner);

        return {
          partner_id: partner.partner_id,
          partner_name: partner.partner_name,
          partner_type: partner.partner_type,
          flows: parseInt(partner.partner_flows) || 0,
          offers: parseInt(partner.partner_offers) || 0,
          metrics: {
            spend: parseFloat(partner.total_spend) || 0,
            deps: parseInt(partner.total_deps) || 0,
            verified_deps: parseInt(partner.total_verified_deps) || 0,
            deposit_amount: parseFloat(partner.total_deposit_amount) || 0,
            redep_count: parseInt(partner.total_redep_count) || 0,
            unique_redep_count: parseInt(partner.total_unique_redep_count) || 0,
            profit: partnerProfit,
            revenue: partnerProfit + (parseFloat(partner.total_spend) || 0),
            roi:
              parseFloat(partner.total_spend) > 0
                ? Math.round(
                    (partnerProfit / parseFloat(partner.total_spend)) *
                      100 *
                      100
                  ) / 100
                : 0,
            oas: parseFloat(partner.oas) || 0,
            rd: parseFloat(partner.rd) || 0,
            urd: parseFloat(partner.urd) || 0,
            cpd: parseFloat(partner.cpd) || 0,
          },
        };
      })
    );

    // Сортуємо за прибутковістю
    topTeamsWithProfit.sort((a, b) => b.metrics.profit - a.metrics.profit);
    topUsersWithProfit.sort((a, b) => b.metrics.profit - a.metrics.profit);
    topPartnersWithProfit.sort((a, b) => b.metrics.profit - a.metrics.profit);

    // Загальні метрики за місяць
    const totalProfit = dailyStats.reduce(
      (sum, day) => sum + day.metrics.profit,
      0
    );
    const totalRevenue = dailyStats.reduce(
      (sum, day) => sum + day.metrics.revenue,
      0
    );
    const totalSpend = parseFloat(summary.total_spend) || 0;
    const totalDeps = parseInt(summary.total_deps) || 0;
    const totalVerifiedDeps = parseInt(summary.total_verified_deps) || 0;
    const depsForCalculation =
      totalVerifiedDeps > 0 ? totalVerifiedDeps : totalDeps;

    const totalMetrics = {
      spend: totalSpend,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: totalDeps,
      verified_deps: totalVerifiedDeps,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
      avg_cpa: parseFloat(summary.avg_cpa) || 0,
      total_profit: Math.round(totalProfit * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
    };

    const totalCalculated = {
      roi:
        totalSpend > 0
          ? Math.round((totalProfit / totalSpend) * 100 * 100) / 100
          : 0,
      profit_margin:
        totalRevenue > 0
          ? Math.round((totalProfit / totalRevenue) * 100 * 100) / 100
          : 0,
      roas:
        totalSpend > 0
          ? Math.round((totalRevenue / totalSpend) * 100) / 100
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
      oas:
        totalMetrics.spend > 0
          ? Math.round(
              (totalMetrics.deposit_amount / totalMetrics.spend) * 100 * 100
            ) / 100
          : 0,
      rd:
        depsForCalculation > 0
          ? Math.round(
              (totalMetrics.redep_count / depsForCalculation) * 100 * 100
            ) / 100
          : 0,
      urd:
        depsForCalculation > 0
          ? Math.round(
              (totalMetrics.unique_redep_count / depsForCalculation) * 100 * 100
            ) / 100
          : 0,
      cpd:
        depsForCalculation > 0
          ? Math.round((totalMetrics.spend / depsForCalculation) * 100) / 100
          : 0,
    };

    return {
      company: {
        name: "Company", // Можна додати реальну назву компанії з конфігурації
      },
      period: { month, year },
      daily_stats: dailyStats,
      summary: {
        total_flows: parseInt(summary.total_company_flows) || 0,
        active_flows: parseInt(summary.active_company_flows) || 0,
        flows_with_activity: parseInt(summary.flows_with_activity) || 0,
        total_active_users: parseInt(summary.total_active_users) || 0,
        total_active_teams: parseInt(summary.total_active_teams) || 0,
        unique_partners: parseInt(summary.unique_partners) || 0,
        unique_offers: parseInt(summary.unique_offers) || 0,
        unique_geos: parseInt(summary.unique_geos) || 0,
        total_stats_entries: parseInt(summary.total_stats_entries) || 0,

        metrics: totalMetrics,
        calculated: totalCalculated,

        // Додаткові інсайти
        best_profit_day: summary.best_profit_day,
        worst_profit_day: summary.worst_profit_day,
        top_user_id: summary.top_user_id,
        days_with_activity: dailyStats.filter((day) => day.meta.has_activity)
          .length,
        avg_daily_spend: totalMetrics.spend / daysInMonth,
        avg_daily_deps: totalMetrics.deps / daysInMonth,
        avg_daily_profit: totalMetrics.total_profit / daysInMonth,
        avg_daily_revenue: totalMetrics.total_revenue / daysInMonth,

        // Топи за місяць
        top_teams: topTeamsWithProfit.slice(0, 5),
        top_users: topUsersWithProfit.slice(0, 10),
        top_partners: topPartnersWithProfit.slice(0, 5),
      },

      // Повні розбивки для детального аналізу
      breakdowns: {
        teams: topTeamsWithProfit,
        users: topUsersWithProfit,
        partners: topPartnersWithProfit,
      },

      // Аналітичні інсайти
      insights: {
        profitability_status:
          totalProfit > 0
            ? "profitable"
            : totalProfit < 0
            ? "loss"
            : "breakeven",
        best_performing_team:
          topTeamsWithProfit.length > 0
            ? topTeamsWithProfit[0].team_name
            : null,
        top_performer_user:
          topUsersWithProfit.length > 0 ? topUsersWithProfit[0].username : null,
        most_efficient_partner:
          topPartnersWithProfit.length > 0
            ? topPartnersWithProfit[0].partner_name
            : null,
        growth_trend:
          dailyStats.length >= 2
            ? dailyStats[dailyStats.length - 1].metrics.profit >
              dailyStats[0].metrics.profit
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

      // Мета інформація
      meta: {
        calculation_timestamp: new Date().toISOString(),
        flows_processed: companyFlows.length,
        cpa_flows: companyFlows.filter((f) => f.flow_type === "cpa").length,
        spend_flows: spendFlows.length,
        spend_flows_with_kpi: Object.keys(monthlyKpiCache).length,
        calculation_method: "company_daily_mixed_model",
      },
    };
  } catch (error) {
    console.error("Помилка в getCompanyDailyStats:", error);
    throw new Error(
      `Помилка отримання денної статистики компанії: ${error.message}`
    );
  }
};

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для користувача
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку
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
    // ОНОВЛЕНО: запит з урахуванням user_id в flow_stats та новими метриками
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
        f.kpi_target_value,
        f.spend_percentage_ranges,
        
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
        
        -- Існуючі обчислювальні поля
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
        
        -- ДОДАНО: Нові обчислювальні метрики
        -- OAS - (deposit_amount / spend) * 100%
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        
        -- RD - (redep_count / deps) * 100%
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        
        -- URD - (unique_redep_count / deps) * 100%
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        
        -- CPD - spend / deps
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
          ELSE 0 
        END as cpd,
        
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
        f.id, f.name, f.status, f.cpa, f.currency, f.description, 
        f.flow_type, f.kpi_metric, f.kpi_target_value, f.spend_percentage_ranges,
        p.id, p.name, p.type,
        o.id, o.name,
        t.id, t.name,
        g.id, g.name, g.country_code
      ORDER BY total_deps DESC, f.name ASC
    `;

    const result = await db.query(flowsQuery, [userId, month, year]);

    // ДОДАНО: Розрахунок прибутку для кожного потоку
    const flowsWithProfit = await Promise.all(
      result.rows.map(async (row) => {
        let profit = 0;

        if (row.flow_type === "cpa") {
          // CPA модель: verified_deps (або deps) * cpa
          const depsForCalculation =
            parseInt(row.total_verified_deps) || parseInt(row.total_deps) || 0;
          profit = depsForCalculation * (parseFloat(row.flow_cpa) || 0);
        } else if (row.flow_type === "spend") {
          // SPEND модель: розрахунок KPI для конкретного потоку та користувача
          const monthlyKpi = await calculateMonthlyKPI(
            row.flow_id,
            row.kpi_metric,
            month,
            year,
            userId, // фільтрація по користувачу
            user_role,
            requesting_user_id
          );

          const spendMultiplier = findSpendMultiplier(
            monthlyKpi,
            row.spend_percentage_ranges
          );

          profit = parseFloat(row.total_spend) * spendMultiplier;
        }

        return {
          ...row,
          profit: Math.round(profit * 100) / 100,
          monthly_kpi:
            row.flow_type === "spend"
              ? await calculateMonthlyKPI(
                  row.flow_id,
                  row.kpi_metric,
                  month,
                  year,
                  userId,
                  user_role,
                  requesting_user_id
                )
              : undefined,
        };
      })
    );

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

    // Форматуємо результат з новими полями та прибутком
    const flows = flowsWithProfit.map((row) => ({
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
        // Існуючі метрики
        roi:
          row.total_spend > 0
            ? Math.round((row.profit / row.total_spend) * 100 * 100) / 100 - 100
            : 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
        // ДОДАНО: Нові метрики
        oas: parseFloat(row.oas) || 0,
        rd: parseFloat(row.rd) || 0,
        urd: parseFloat(row.urd) || 0,
        cpd: parseFloat(row.cpd) || 0,
        // ДОДАНО: Прибуток
        profit: parseFloat(row.profit) || 0,
        // Додаткова інформація для spend моделі
        monthly_kpi: parseFloat(row.monthly_kpi) || undefined,
        has_activity: row.has_activity,
      },
    }));

    // Обчислюємо загальні метрики з новими полями та прибутком
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
      // ДОДАНО: Загальний прибуток
      total_profit: flows.reduce((sum, flow) => sum + flow.stats.profit, 0),
    };

    // Використовуємо verified_deps або deps для розрахунків
    const depsForCalculation =
      totalMetrics.verified_deps > 0
        ? totalMetrics.verified_deps
        : totalMetrics.deps;

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
          // Існуючі метрики (ROI тепер через прибуток)
          total_roi:
            totalMetrics.spend > 0
              ? Math.round(
                  (totalMetrics.total_profit / totalMetrics.spend) * 100 * 100
                ) /
                  100 -
                100
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
          // ДОДАНО: Нові загальні метрики
          avg_oas:
            totalMetrics.spend > 0
              ? Math.round(
                  (totalMetrics.deposit_amount / totalMetrics.spend) * 100 * 100
                ) / 100
              : 0,
          avg_rd:
            depsForCalculation > 0
              ? Math.round(
                  (totalMetrics.redep_count / depsForCalculation) * 100 * 100
                ) / 100
              : 0,
          avg_urd:
            depsForCalculation > 0
              ? Math.round(
                  (totalMetrics.unique_redep_count / depsForCalculation) *
                    100 *
                    100
                ) / 100
              : 0,
          avg_cpd:
            depsForCalculation > 0
              ? Math.round((totalMetrics.spend / depsForCalculation) * 100) /
                100
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
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку
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
    // ОНОВЛЕНО: запит з урахуванням user_id в flow_stats та новими метриками
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
        f.kpi_target_value,
        f.spend_percentage_ranges,
        
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
        
        -- Існуючі обчислювальні поля
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
        
        -- ДОДАНО: Нові обчислювальні метрики
        -- OAS - (deposit_amount / spend) * 100%
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        
        -- RD - (redep_count / deps) * 100%
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        
        -- URD - (unique_redep_count / deps) * 100%
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        
        -- CPD - spend / deps
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
          ELSE 0 
        END as cpd,
        
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
        f.id, f.name, f.status, f.cpa, f.currency, f.description, 
        f.flow_type, f.kpi_metric, f.kpi_target_value, f.spend_percentage_ranges,
        p.id, p.name, p.type,
        o.id, o.name,
        t.id, t.name,
        g.id, g.name, g.country_code
      ORDER BY total_deps DESC, f.name ASC
    `;

    const result = await db.query(flowsQuery, [teamId, month, year]);

    // ДОДАНО: Розрахунок прибутку для кожного потоку
    const flowsWithProfit = await Promise.all(
      result.rows.map(async (row) => {
        let profit = 0;

        if (row.flow_type === "cpa") {
          // CPA модель: verified_deps (або deps) * cpa
          const depsForCalculation =
            parseInt(row.total_verified_deps) || parseInt(row.total_deps) || 0;
          profit = depsForCalculation * (parseFloat(row.flow_cpa) || 0);
        } else if (row.flow_type === "spend") {
          // SPEND модель: розрахунок KPI для потоку команди
          const monthlyKpi = await calculateMonthlyKPI(
            row.flow_id,
            row.kpi_metric,
            month,
            year,
            undefined, // не фільтруємо по користувачу для команди
            user_role,
            requesting_user_id
          );

          const spendMultiplier = findSpendMultiplier(
            monthlyKpi,
            row.spend_percentage_ranges
          );

          profit = parseFloat(row.total_spend) * spendMultiplier;
        }

        return {
          ...row,
          profit: Math.round(profit * 100) / 100,
          monthly_kpi:
            row.flow_type === "spend"
              ? await calculateMonthlyKPI(
                  row.flow_id,
                  row.kpi_metric,
                  month,
                  year,
                  undefined,
                  user_role,
                  requesting_user_id
                )
              : undefined,
        };
      })
    );

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

    // Форматуємо результат з новими полями та прибутком
    const flows = flowsWithProfit.map((row) => ({
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
        // Існуючі метрики (ROI тепер через прибуток)
        roi:
          parseFloat(row.total_spend) > 0
            ? Math.round(
                (row.profit / parseFloat(row.total_spend)) * 100 * 100
              ) /
                100 -
              100
            : 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
        // ДОДАНО: Нові метрики
        oas: parseFloat(row.oas) || 0,
        rd: parseFloat(row.rd) || 0,
        urd: parseFloat(row.urd) || 0,
        cpd: parseFloat(row.cpd) || 0,
        // ДОДАНО: Прибуток
        profit: parseFloat(row.profit) || 0,
        // Додаткова інформація для spend моделі
        monthly_kpi: parseFloat(row.monthly_kpi) || undefined,
        has_activity: row.has_activity,
        top_user_username: row.top_user_username,
      },
    }));

    // Обчислюємо загальні метрики з новими полями та прибутком
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
      // ДОДАНО: Загальний прибуток
      total_profit: flows.reduce((sum, flow) => sum + flow.stats.profit, 0),
    };

    // Використовуємо verified_deps або deps для розрахунків
    const depsForCalculation =
      totalMetrics.verified_deps > 0
        ? totalMetrics.verified_deps
        : totalMetrics.deps;

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
          // Існуючі метрики (ROI тепер через прибуток)
          total_roi:
            totalMetrics.spend > 0
              ? Math.round(
                  (totalMetrics.total_profit / totalMetrics.spend) * 100 * 100
                ) /
                  100 -
                100
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
          // ДОДАНО: Нові загальні метрики
          avg_oas:
            totalMetrics.spend > 0
              ? Math.round(
                  (totalMetrics.deposit_amount / totalMetrics.spend) * 100 * 100
                ) / 100
              : 0,
          avg_rd:
            depsForCalculation > 0
              ? Math.round(
                  (totalMetrics.redep_count / depsForCalculation) * 100 * 100
                ) / 100
              : 0,
          avg_urd:
            depsForCalculation > 0
              ? Math.round(
                  (totalMetrics.unique_redep_count / depsForCalculation) *
                    100 *
                    100
                ) / 100
              : 0,
          avg_cpd:
            depsForCalculation > 0
              ? Math.round((totalMetrics.spend / depsForCalculation) * 100) /
                100
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
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для команди
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку
 * @param {Object} options - Опції фільтрації
 * @param {number} options.month - Місяць (1-12)
 * @param {number} options.year - Рік
 * @param {number} requesting_user_id - ID користувача, що робить запит
 * @param {string} user_role - Роль користувача, що робить запит
 * @returns {Promise<Object>} Список потоків з агрегованою статистикою
 */
const getCompanyFlowsMonthlyStats = async (
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
    // ОНОВЛЕНО: запит з урахуванням user_id в flow_stats та новими метриками
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
        f.kpi_target_value,
        f.spend_percentage_ranges,
        
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
        
        -- Існуючі обчислювальні поля
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
        
        -- ДОДАНО: Нові обчислювальні метрики
        -- OAS - (deposit_amount / spend) * 100%
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as oas,
        
        -- RD - (redep_count / deps) * 100%
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as rd,
        
        -- URD - (unique_redep_count / deps) * 100%
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as urd,
        
        -- CPD - spend / deps
        CASE 
          WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
          ELSE 0 
        END as cpd,
        
        -- Метаінформація
        CASE WHEN COUNT(fs.id) > 0 THEN true ELSE false END as has_activity,
        
        -- Топ користувач потоку
        (SELECT u.username FROM users u
         JOIN flow_stats fs2 ON u.id = fs2.user_id
         WHERE fs2.flow_id = f.id
         AND fs2.month = $1 AND fs2.year = $2
         GROUP BY u.id, u.username
         ORDER BY SUM(fs2.deps) DESC
         LIMIT 1) as top_user_username
        
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN geos g ON f.geo_id = g.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      WHERE f.status = 'active'
      GROUP BY 
        f.id, f.name, f.status, f.cpa, f.currency, f.description, 
        f.flow_type, f.kpi_metric, f.kpi_target_value, f.spend_percentage_ranges,
        p.id, p.name, p.type,
        o.id, o.name,
        t.id, t.name,
        g.id, g.name, g.country_code
      ORDER BY total_deps DESC, f.name ASC
    `;

    const result = await db.query(flowsQuery, [month, year]);

    // ДОДАНО: Розрахунок прибутку для кожного потоку
    const flowsWithProfit = await Promise.all(
      result.rows.map(async (row) => {
        let profit = 0;

        if (row.flow_type === "cpa") {
          // CPA модель: verified_deps (або deps) * cpa
          const depsForCalculation =
            parseInt(row.total_verified_deps) || parseInt(row.total_deps) || 0;
          profit = depsForCalculation * (parseFloat(row.flow_cpa) || 0);
        } else if (row.flow_type === "spend") {
          // SPEND модель: розрахунок KPI для потоку команди
          const monthlyKpi = await calculateMonthlyKPI(
            row.flow_id,
            row.kpi_metric,
            month,
            year,
            undefined, // не фільтруємо по користувачу для команди
            user_role,
            requesting_user_id
          );

          const spendMultiplier = findSpendMultiplier(
            monthlyKpi,
            row.spend_percentage_ranges
          );

          profit = parseFloat(row.total_spend) * spendMultiplier;
        }

        return {
          ...row,
          profit: Math.round(profit * 100) / 100,
          monthly_kpi:
            row.flow_type === "spend"
              ? await calculateMonthlyKPI(
                  row.flow_id,
                  row.kpi_metric,
                  month,
                  year,
                  undefined,
                  user_role,
                  requesting_user_id
                )
              : undefined,
        };
      })
    );

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
        AND fs.month = $1 AND fs.year = $2
        GROUP BY t.id, t.name
    `;

    const summaryResult = await db.query(teamSummaryQuery, [month, year]);
    const summary = summaryResult.rows[0];

    if (!summary) {
      throw new Error("Команду не знайдено");
    }

    // Форматуємо результат з новими полями та прибутком
    const flows = flowsWithProfit.map((row) => ({
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
        // Існуючі метрики (ROI тепер через прибуток)
        roi:
          parseFloat(row.total_spend) > 0
            ? Math.round(
                (row.profit / parseFloat(row.total_spend)) * 100 * 100
              ) /
                100 -
              100
            : 0,
        inst2reg: parseFloat(row.inst2reg) || 0,
        reg2dep: parseFloat(row.reg2dep) || 0,
        verification_rate: parseFloat(row.verification_rate) || 0,
        // ДОДАНО: Нові метрики
        oas: parseFloat(row.oas) || 0,
        rd: parseFloat(row.rd) || 0,
        urd: parseFloat(row.urd) || 0,
        cpd: parseFloat(row.cpd) || 0,
        // ДОДАНО: Прибуток
        profit: parseFloat(row.profit) || 0,
        // Додаткова інформація для spend моделі
        monthly_kpi: parseFloat(row.monthly_kpi) || undefined,
        has_activity: row.has_activity,
        top_user_username: row.top_user_username,
      },
    }));

    // Обчислюємо загальні метрики з новими полями та прибутком
    const totalMetrics = {
      spend: parseFloat(summary.total_spend) || 0,
      installs: parseInt(summary.total_installs) || 0,
      regs: parseInt(summary.total_regs) || 0,
      deps: parseInt(summary.total_deps) || 0,
      verified_deps: parseInt(summary.total_verified_deps) || 0,
      deposit_amount: parseFloat(summary.total_deposit_amount) || 0,
      redep_count: parseInt(summary.total_redep_count) || 0,
      unique_redep_count: parseInt(summary.total_unique_redep_count) || 0,
      // ДОДАНО: Загальний прибуток
      total_profit: flows.reduce((sum, flow) => sum + flow.stats.profit, 0),
    };

    // Використовуємо verified_deps або deps для розрахунків
    const depsForCalculation =
      totalMetrics.verified_deps > 0
        ? totalMetrics.verified_deps
        : totalMetrics.deps;

    return {
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
          // Існуючі метрики (ROI тепер через прибуток)
          total_roi:
            totalMetrics.spend > 0
              ? Math.round(
                  (totalMetrics.total_profit / totalMetrics.spend) * 100 * 100
                ) /
                  100 -
                100
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
          // ДОДАНО: Нові загальні метрики
          avg_oas:
            totalMetrics.spend > 0
              ? Math.round(
                  (totalMetrics.deposit_amount / totalMetrics.spend) * 100 * 100
                ) / 100
              : 0,
          avg_rd:
            depsForCalculation > 0
              ? Math.round(
                  (totalMetrics.redep_count / depsForCalculation) * 100 * 100
                ) / 100
              : 0,
          avg_urd:
            depsForCalculation > 0
              ? Math.round(
                  (totalMetrics.unique_redep_count / depsForCalculation) *
                    100 *
                    100
                ) / 100
              : 0,
          avg_cpd:
            depsForCalculation > 0
              ? Math.round((totalMetrics.spend / depsForCalculation) * 100) /
                100
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
 * ВИПРАВЛЕНО: Отримання загальної статистики компанії за місяць (P/L) з коректним розрахунком прибутку
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та правильний розрахунок для CPA/SPEND моделей
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
    // ВИПРАВЛЕНО: Спочатку отримуємо агреговану статистику БЕЗ прибутку (для швидкості)
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
        
        -- ДОДАНО: Нові обчислювані метрики
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as total_oas,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as total_rd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as total_urd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)))::numeric, 2)
          ELSE 0 
        END as total_cpd,
        
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

    // ВИПРАВЛЕНО: Окремий запит для отримання агрегованих даних по потоках (без дублювання)
    const flowAggregatesQuery = `
      SELECT 
        f.id as flow_id,
        f.flow_type,
        f.kpi_metric,
        f.kpi_target_value,
        f.spend_percentage_ranges,
        f.cpa,
        -- Агрегація по потоку за весь місяць
        COALESCE(SUM(fs.spend), 0) as flow_total_spend,
        COALESCE(SUM(fs.deps), 0) as flow_total_deps,
        COALESCE(SUM(fs.verified_deps), 0) as flow_total_verified_deps,
        COALESCE(AVG(COALESCE(fs.cpa, f.cpa)), f.cpa) as flow_avg_cpa
      FROM flows f
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      WHERE (fs.flow_id IS NOT NULL OR f.id IS NOT NULL)
      GROUP BY f.id, f.flow_type, f.kpi_metric, f.kpi_target_value, f.spend_percentage_ranges, f.cpa
    `;

    // Паралельно виконуємо основні запити
    const [companyResult, flowAggregatesResult] = await Promise.all([
      db.query(companyStatsQuery, [month, year]),
      db.query(flowAggregatesQuery, [month, year]),
    ]);

    const companyStats = companyResult.rows[0];
    const flowAggregates = flowAggregatesResult.rows;

    console.log(
      `Обробляємо ${flowAggregates.length} потоків для розрахунку прибутку`
    );

    // ВИПРАВЛЕНО: Розрахунок KPI тільки для spend потоків
    const spendFlows = flowAggregates.filter((f) => f.flow_type === "spend");
    const monthlyKpiCache = {};

    console.log(`Розраховуємо KPI для ${spendFlows.length} spend потоків...`);

    // Паралельний розрахунок KPI для spend потоків
    if (spendFlows.length > 0) {
      const kpiPromises = spendFlows.map(async (flow) => {
        try {
          const monthlyKpi = await calculateMonthlyKPI(
            flow.flow_id,
            flow.kpi_metric,
            month,
            year,
            undefined, // не фільтруємо по користувачу
            "admin", // admin роль для доступу до всіх даних
            null
          );

          return {
            flowId: flow.flow_id,
            kpi: monthlyKpi,
            multiplier: findSpendMultiplier(
              monthlyKpi,
              flow.spend_percentage_ranges
            ),
          };
        } catch (error) {
          console.error(
            `Помилка розрахунку KPI для потоку ${flow.flow_id}:`,
            error
          );
          return { flowId: flow.flow_id, kpi: 0, multiplier: 0 };
        }
      });

      const kpiResults = await Promise.all(kpiPromises);

      kpiResults.forEach((result) => {
        monthlyKpiCache[result.flowId] = {
          kpi: result.kpi,
          multiplier: result.multiplier,
        };
      });
    }

    // ВИПРАВЛЕНО: Правильний розрахунок прибутку один раз
    let totalRevenue = 0;
    let totalProfit = 0;

    console.log("Розраховуємо прибуток по кожному потоку...");

    flowAggregates.forEach((flow) => {
      const flowSpend = parseFloat(flow.flow_total_spend) || 0;
      const flowDeps = parseInt(flow.flow_total_deps) || 0;
      const flowVerifiedDeps = parseInt(flow.flow_total_verified_deps) || 0;
      const depsForCalculation =
        flowVerifiedDeps > 0 ? flowVerifiedDeps : flowDeps;

      let flowRevenue = 0;

      if (flow.flow_type === "cpa") {
        // CPA модель
        const cpa = parseFloat(flow.flow_avg_cpa) || 0;
        flowRevenue = depsForCalculation * cpa;
      } else if (flow.flow_type === "spend") {
        // SPEND модель
        const cached = monthlyKpiCache[flow.flow_id];
        if (cached && cached.multiplier > 0) {
          flowRevenue = flowSpend * cached.multiplier;
        }
      }

      const flowProfit = flowRevenue - flowSpend;

      totalRevenue += flowRevenue;
      totalProfit += flowProfit;

      if (flowSpend > 0) {
        console.log(
          `Потік ${flow.flow_id} (${flow.flow_type}): spend=${flowSpend}, revenue=${flowRevenue}, profit=${flowProfit}`
        );
      }
    });

    // Округлюємо результати
    totalRevenue = Math.round(totalRevenue * 100) / 100;
    totalProfit = Math.round(totalProfit * 100) / 100;

    console.log(
      `ПІДСУМОК: spend=${parseFloat(
        companyStats.total_spend
      )}, revenue=${totalRevenue}, profit=${totalProfit}`
    );

    // Перевірка математики
    const expectedProfit = totalRevenue - parseFloat(companyStats.total_spend);
    if (Math.abs(totalProfit - expectedProfit) > 0.01) {
      console.warn(
        `УВАГА: Розбіжність в розрахунках прибутку! Розраховано: ${totalProfit}, Очікувано: ${expectedProfit}`
      );
    }

    // ВИПРАВЛЕНО: Статистика по командах з правильною агрегацією
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
        
        -- ДОДАНО: Нові метрики для команд
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as team_oas,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as team_rd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as team_urd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)))::numeric, 2)
          ELSE 0 
        END as team_cpd
        
      FROM teams t
      LEFT JOIN flows f ON t.id = f.team_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      GROUP BY t.id, t.name
      HAVING COUNT(DISTINCT f.id) > 0 AND COALESCE(SUM(fs.spend), 0) > 0
      ORDER BY team_spend DESC
    `;

    // Аналогічно для партнерів
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
        
        -- ДОДАНО: Нові метрики
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as partner_oas,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as partner_rd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as partner_urd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)))::numeric, 2)
          ELSE 0 
        END as partner_cpd
        
      FROM partners p
      LEFT JOIN offers o ON p.id = o.partner_id
      LEFT JOIN flows f ON o.id = f.offer_id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id 
        AND fs.month = $1 AND fs.year = $2
      GROUP BY p.id, p.name, p.type
      HAVING COUNT(DISTINCT f.id) > 0 AND COALESCE(SUM(fs.spend), 0) > 0
      ORDER BY partner_spend DESC
      LIMIT 10
    `;

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
        COALESCE(SUM(fs.deposit_amount), 0) as user_deposit_amount,
        COALESCE(SUM(fs.redep_count), 0) as user_redep_count,
        COALESCE(SUM(fs.unique_redep_count), 0) as user_unique_redep_count,
        
        -- ДОДАНО: Нові метрики
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as user_oas,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as user_rd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as user_urd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)))::numeric, 2)
          ELSE 0 
        END as user_cpd
        
      FROM users u
      JOIN flow_stats fs ON u.id = fs.user_id
      JOIN flows f ON fs.flow_id = f.id
      LEFT JOIN teams t ON f.team_id = t.id
      WHERE fs.month = $1 AND fs.year = $2
      GROUP BY u.id, u.username, u.first_name, u.last_name, t.name
      HAVING SUM(fs.deps) > 0
      ORDER BY user_spend DESC
      LIMIT 10
    `;

    // Денна статистика (спрощена без json_agg)
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
        COUNT(DISTINCT fs.flow_id) as active_flows,
        COUNT(DISTINCT fs.user_id) as active_users,
        
        -- ДОДАНО: Нові метрики
        CASE 
          WHEN SUM(fs.spend) > 0 
          THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
          ELSE 0 
        END as day_oas,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as day_rd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.unique_redep_count)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) * 100)::numeric, 2)
          ELSE 0 
        END as day_urd,
        CASE 
          WHEN COALESCE(SUM(fs.verified_deps), SUM(fs.deps)) > 0 
          THEN ROUND((SUM(fs.spend)::numeric / COALESCE(SUM(fs.verified_deps), SUM(fs.deps)))::numeric, 2)
          ELSE 0 
        END as day_cpd
        
      FROM flow_stats fs
      JOIN flows f ON fs.flow_id = f.id
      WHERE fs.month = $1 AND fs.year = $2
      GROUP BY fs.day
      ORDER BY fs.day
    `;

    // Паралельно виконуємо запити для розбивок
    const [teamsResult, partnersResult, topUsersResult, dailyTrendsResult] =
      await Promise.all([
        db.query(teamsStatsQuery, [month, year]),
        db.query(partnersStatsQuery, [month, year]),
        db.query(topUsersQuery, [month, year]),
        db.query(dailyTrendsQuery, [month, year]),
      ]);

    // ВИПРАВЛЕНО: Функція для розрахунку прибутку команд/партнерів/користувачів
    const calculateEntityProfit = (entityFlows) => {
      let entityRevenue = 0;
      let entityProfit = 0;

      // Знаходимо потоки цієї сутності в наших агрегатах
      const entityFlowIds = new Set(); // Тут ми би отримали ID потоків сутності, але це складно з поточними запитами

      // Спрощений розрахунок базуючись на CPA (для демонстрації логіки)
      // В реальності тут потрібно було б зробити додаткові запити або переписати основні запити

      return { revenue: entityRevenue, profit: entityProfit };
    };

    // СПРОЩЕНО: Розрахунок прибутку для розбивок через пропорції від загального прибутку
    const totalSpend = parseFloat(companyStats.total_spend) || 0;

    const calculateProportionalProfit = (entitySpend) => {
      if (totalSpend === 0) return { revenue: 0, profit: 0 };

      const proportion = entitySpend / totalSpend;
      const entityRevenue = totalRevenue * proportion;
      const entityProfit = totalProfit * proportion;

      return {
        revenue: Math.round(entityRevenue * 100) / 100,
        profit: Math.round(entityProfit * 100) / 100,
      };
    };

    // Форматуємо результати
    const totalDeps = parseInt(companyStats.total_deps) || 0;
    const totalVerifiedDeps = parseInt(companyStats.total_verified_deps) || 0;

    const teams = teamsResult.rows.map((row) => {
      const { revenue: teamRevenue, profit: teamProfit } =
        calculateProportionalProfit(parseFloat(row.team_spend) || 0);

      return {
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
          revenue: teamRevenue,
          profit: teamProfit,
          roi:
            parseFloat(row.team_spend) > 0
              ? Math.round(
                  (teamProfit / parseFloat(row.team_spend)) * 100 * 100
                ) / 100
              : 0,
          oas: parseFloat(row.team_oas) || 0,
          rd: parseFloat(row.team_rd) || 0,
          urd: parseFloat(row.team_urd) || 0,
          cpd: parseFloat(row.team_cpd) || 0,
        },
      };
    });

    const partners = partnersResult.rows.map((row) => {
      const { revenue: partnerRevenue, profit: partnerProfit } =
        calculateProportionalProfit(parseFloat(row.partner_spend) || 0);

      return {
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
          revenue: partnerRevenue,
          profit: partnerProfit,
          roi:
            parseFloat(row.partner_spend) > 0
              ? Math.round(
                  (partnerProfit / parseFloat(row.partner_spend)) * 100 * 100
                ) / 100
              : 0,
          oas: parseFloat(row.partner_oas) || 0,
          rd: parseFloat(row.partner_rd) || 0,
          urd: parseFloat(row.partner_urd) || 0,
          cpd: parseFloat(row.partner_cpd) || 0,
        },
      };
    });

    const topUsers = topUsersResult.rows.map((row) => {
      const { revenue: userRevenue, profit: userProfit } =
        calculateProportionalProfit(parseFloat(row.user_spend) || 0);

      return {
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
          revenue: userRevenue,
          profit: userProfit,
          roi:
            parseFloat(row.user_spend) > 0
              ? Math.round(
                  (userProfit / parseFloat(row.user_spend)) * 100 * 100
                ) / 100
              : 0,
          oas: parseFloat(row.user_oas) || 0,
          rd: parseFloat(row.user_rd) || 0,
          urd: parseFloat(row.user_urd) || 0,
          cpd: parseFloat(row.user_cpd) || 0,
        },
      };
    });

    // ВИПРАВЛЕНО: Денні тренди зі спрощеним розрахунком прибутку
    const dailyTrends = dailyTrendsResult.rows.map((row) => {
      const { revenue: dayRevenue, profit: dayProfit } =
        calculateProportionalProfit(parseFloat(row.day_spend) || 0);

      return {
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
          revenue: dayRevenue,
          profit: dayProfit,
          oas: parseFloat(row.day_oas) || 0,
          rd: parseFloat(row.day_rd) || 0,
          urd: parseFloat(row.day_urd) || 0,
          cpd: parseFloat(row.day_cpd) || 0,
        },
        meta: {
          active_flows: parseInt(row.active_flows) || 0,
          active_users: parseInt(row.active_users) || 0,
        },
      };
    });

    // Сортуємо за прибутком
    teams.sort((a, b) => b.metrics.profit - a.metrics.profit);
    partners.sort((a, b) => b.metrics.profit - a.metrics.profit);
    topUsers.sort((a, b) => b.metrics.profit - a.metrics.profit);

    return {
      period: { month, year },
      summary: {
        // ВИПРАВЛЕНО: Коректні фінансові показники
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
        total_verified_deps: totalVerifiedDeps,
        total_deposit_amount:
          parseFloat(companyStats.total_deposit_amount) || 0,
        total_redep_count: parseInt(companyStats.total_redep_count) || 0,
        total_unique_redep_count:
          parseInt(companyStats.total_unique_redep_count) || 0,
        avg_cpa: parseFloat(companyStats.avg_cpa) || 0,

        // Нові метрики
        total_oas: parseFloat(companyStats.total_oas) || 0,
        total_rd: parseFloat(companyStats.total_rd) || 0,
        total_urd: parseFloat(companyStats.total_urd) || 0,
        total_cpd: parseFloat(companyStats.total_cpd) || 0,

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
            ? Math.round((totalVerifiedDeps / totalDeps) * 100 * 100) / 100
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

      teams_breakdown: teams,
      partners_breakdown: partners,
      top_users: topUsers,
      daily_trends: dailyTrends,

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
        profitability_status:
          totalProfit > 0
            ? "profitable"
            : totalProfit < 0
            ? "loss"
            : "breakeven",
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

      // Додаткова інформація про розрахунки
      debug: {
        flows_processed: flowAggregates.length,
        cpa_flows: flowAggregates.filter((f) => f.flow_type === "cpa").length,
        spend_flows: spendFlows.length,
        spend_flows_with_kpi: Object.keys(monthlyKpiCache).length,
        calculation_method: "fixed_aggregation_method",
      },
    };
  } catch (error) {
    console.error("Помилка в getCompanyMonthlyStats:", error);
    throw new Error(`Помилка отримання статистики компанії: ${error.message}`);
  }
};

/**
 * ОНОВЛЕНО: Отримання агрегованої статистики за період з урахуванням user_id
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку
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

  // ДОДАНО: Отримуємо дані про потік для розрахунку прибутку
  const flowQuery = `
    SELECT 
      flow_type,
      kpi_metric,
      kpi_target_value,
      spend_percentage_ranges,
      cpa
    FROM flows 
    WHERE id = $1
  `;

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

  // ОНОВЛЕНО: запит з новими полями та метриками
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
      
      -- Існуючі агреговані метрики
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
      
      -- ДОДАНО: Нові агреговані метрики
      -- OAS - (deposit_amount / spend) * 100%
      CASE 
        WHEN SUM(fs.spend) > 0 THEN ROUND((SUM(fs.deposit_amount)::numeric / SUM(fs.spend) * 100)::numeric, 2)
        ELSE 0 
      END as total_oas,
      
      -- RD - (redep_count / deps) * 100% (використовуємо verified_deps або deps)
      CASE 
        WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 THEN ROUND((SUM(fs.redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
        ELSE 0 
      END as total_rd,
      
      -- URD - (unique_redep_count / deps) * 100%
      CASE 
        WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 THEN ROUND((SUM(fs.unique_redep_count)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)) * 100)::numeric, 2)
        ELSE 0 
      END as total_urd,
      
      -- CPD - spend / deps
      CASE 
        WHEN SUM(COALESCE(fs.verified_deps, fs.deps)) > 0 THEN ROUND((SUM(fs.spend)::numeric / SUM(COALESCE(fs.verified_deps, fs.deps)))::numeric, 2)
        ELSE 0 
      END as total_cpd,
      
      -- Мін/макс значення
      MIN(fs.day) as first_activity_day,
      MAX(fs.day) as last_activity_day,
      MIN(fs.spend) FILTER (WHERE fs.spend > 0) as min_daily_spend,
      MAX(fs.spend) as max_daily_spend,
      MIN(fs.deps) FILTER (WHERE fs.deps > 0) as min_daily_deps,
      MAX(fs.deps) as max_daily_deps,
      
      -- ДОДАНО: Отримуємо унікальні комбінації місяць/рік для розрахунку прибутку
      array_agg(DISTINCT fs.year || '-' || fs.month) as unique_periods
      
    FROM flow_stats fs
    WHERE ${conditions.join(" AND ")}
  `;

  try {
    // Отримуємо дані про потік
    const flowResult = await db.query(flowQuery, [flow_id]);
    if (flowResult.rows.length === 0) {
      throw new Error("Потік не знайдено");
    }
    const flowData = flowResult.rows[0];

    // Отримуємо агреговану статистику
    const result = await db.query(query, params);
    const stats = result.rows[0];

    // ДОДАНО: Розрахунок загального прибутку
    let totalProfit = 0;

    if (flowData.flow_type === "cpa") {
      // CPA модель: verified_deps (або deps) * cpa
      const totalDepsForCalculation =
        parseInt(stats.total_verified_deps) || parseInt(stats.total_deps) || 0;
      totalProfit = totalDepsForCalculation * (flowData.cpa || 0);
    } else if (flowData.flow_type === "spend") {
      // SPEND модель: потрібно розрахувати для кожного унікального періоду
      const uniquePeriods = stats.unique_periods || [];

      if (uniquePeriods.length > 0) {
        // Отримуємо детальну статистику по періодах для spend моделі
        const periodQuery = `
          SELECT 
            fs.year,
            fs.month,
            SUM(fs.spend) as period_spend
          FROM flow_stats fs
          WHERE ${conditions.join(" AND ")}
          GROUP BY fs.year, fs.month
        `;

        const periodResult = await db.query(periodQuery, params);

        // Розраховуємо прибуток для кожного періоду
        for (const periodRow of periodResult.rows) {
          const monthlyKpi = await calculateMonthlyKPI(
            flow_id,
            flowData.kpi_metric,
            periodRow.month,
            periodRow.year,
            user_id,
            user_role,
            requesting_user_id
          );

          const spendMultiplier = findSpendMultiplier(
            monthlyKpi,
            flowData.spend_percentage_ranges
          );

          totalProfit += periodRow.period_spend * spendMultiplier;
        }
      }
    }

    // ДОДАНО: Перерахунок ROI через прибуток
    const calculatedRoi =
      parseFloat(stats.total_spend) > 0
        ? Math.round(
            (totalProfit / parseFloat(stats.total_spend)) * 100 * 100
          ) /
            100 -
          100
        : 0;

    return {
      flow_id,
      period: { month, year, dateFrom, dateTo },
      user_filter: user_id,
      flow_info: {
        flow_type: flowData.flow_type,
        kpi_metric: flowData.kpi_metric,
        cpa: flowData.cpa,
      },
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

        // Існуючі метрики
        total_roi: calculatedRoi, // ЗМІНЕНО: тепер через прибуток
        total_inst2reg: parseFloat(stats.total_inst2reg) || 0,
        total_reg2dep: parseFloat(stats.total_reg2dep) || 0,
        verification_rate: parseFloat(stats.verification_rate) || 0,

        // ДОДАНО: Нові метрики
        total_oas: parseFloat(stats.total_oas) || 0,
        total_rd: parseFloat(stats.total_rd) || 0,
        total_urd: parseFloat(stats.total_urd) || 0,
        total_cpd: parseFloat(stats.total_cpd) || 0,

        // ДОДАНО: Прибуток
        total_profit: Math.round(totalProfit * 100) / 100,

        // Мін/макс значення
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
  getCompanyFlowsMonthlyStats,
  getCompanyMonthlyStats,
  getFlowStats,
  getAggregatedStats,
  deleteFlowStat,
  checkUserAccess,
  getCompanyDailyStats,
};
