const db = require("../config/db");

/**
 * Отримує загальну статистику для біздевів
 * @param {Object} options - Опції для фільтрації
 * @param {Date} [options.startDate] - Початкова дата для фільтрації
 * @param {Date} [options.endDate] - Кінцева дата для фільтрації
 * @returns {Promise<Object>} Об'єкт зі статистикою
 */
const getBizdevStatistics = async ({ startDate, endDate } = {}) => {
  const params = [];
  let paramIndex = 1;

  // Умови фільтрації за датами
  let dateCondition = "";
  if (startDate && endDate) {
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    dateCondition = `WHERE created_at BETWEEN ${paramIndex++} AND ${paramIndex++}`;
    params.push(startDate, newEndDate.toISOString());
  } else if (startDate) {
    dateCondition = `WHERE created_at >= ${paramIndex++}`;
    params.push(startDate);
  } else if (endDate) {
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 1);
    dateCondition = `WHERE created_at <= ${paramIndex++}`;
    params.push(newEndDate.toISOString());
  }

  try {
    // Запит для статистики потоків
    const flowsQuery = `
      SELECT 
        COUNT(DISTINCT f.id) as total_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as active_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'paused') as paused_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'stopped') as stopped_flows,
        COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'archived') as archived_flows
      FROM flows f
      ${dateCondition}
    `;

    // Запит для статистики брендів
    const brandsQuery = `
      SELECT 
        COUNT(DISTINCT b.id) as total_brands,
        COUNT(DISTINCT b.id) FILTER (WHERE b.is_active = true) as active_brands
      FROM brands b
      ${dateCondition}
    `;

    // Запит для статистики гео
    const geosQuery = `
      SELECT 
        COUNT(DISTINCT g.id) as total_geos,
        COUNT(DISTINCT g.id) FILTER (WHERE g.is_active = true) as active_geos
      FROM geos g
      ${dateCondition}
    `;

    // Запит для статистики офферів
    const offersQuery = `
      SELECT 
        COUNT(DISTINCT o.id) as total_offers,
        COUNT(DISTINCT o.id) FILTER (WHERE o.is_active = true) as active_offers
      FROM offers o
      ${dateCondition}
    `;

    // Запит для статистики партнерів
    const partnersQuery = `
      SELECT 
        COUNT(DISTINCT p.id) as total_partners,
        COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = true) as active_partners,
        COUNT(DISTINCT p.id) FILTER (WHERE p.type = 'Brand') as brand_partners,
        COUNT(DISTINCT p.id) FILTER (WHERE p.type = 'PP') as pp_partners,
        COUNT(DISTINCT p.id) FILTER (WHERE p.type = 'NET') as network_partners,
        COUNT(DISTINCT p.id) FILTER (WHERE p.type = 'DIRECT ADV') as direct_partners
      FROM partners p
      ${dateCondition}
    `;

    // Запит для розподілу потоків за статусом
    const flowDistributionQuery = `
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0), 2) as percentage
      FROM flows
      ${dateCondition}
      GROUP BY status
      ORDER BY count DESC
    `;

    // Виконуємо всі запити паралельно
    const [
      flowsResult,
      brandsResult,
      geosResult,
      offersResult,
      partnersResult,
      flowDistributionResult,
    ] = await Promise.all([
      db.query(flowsQuery, params),
      db.query(brandsQuery, params),
      db.query(geosQuery, params),
      db.query(offersQuery, params),
      db.query(partnersQuery, params),
      db.query(flowDistributionQuery, params),
    ]);

    // Формуємо результат
    const stats = {
      flows: {
        total: parseInt(flowsResult.rows[0].total_flows) || 0,
        active: parseInt(flowsResult.rows[0].active_flows) || 0,
        paused: parseInt(flowsResult.rows[0].paused_flows) || 0,
        stopped: parseInt(flowsResult.rows[0].stopped_flows) || 0,
        archived: parseInt(flowsResult.rows[0].archived_flows) || 0,
      },
      brands: {
        total: parseInt(brandsResult.rows[0].total_brands) || 0,
        active: parseInt(brandsResult.rows[0].active_brands) || 0,
      },
      geos: {
        total: parseInt(geosResult.rows[0].total_geos) || 0,
        active: parseInt(geosResult.rows[0].active_geos) || 0,
      },
      offers: {
        total: parseInt(offersResult.rows[0].total_offers) || 0,
        active: parseInt(offersResult.rows[0].active_offers) || 0,
      },
      partners: {
        total: parseInt(partnersResult.rows[0].total_partners) || 0,
        active: parseInt(partnersResult.rows[0].active_partners) || 0,
        byType: {
          direct: parseInt(partnersResult.rows[0].direct_partners) || 0,
          affiliate: parseInt(partnersResult.rows[0].affiliate_partners) || 0,
          network: parseInt(partnersResult.rows[0].network_partners) || 0,
        },
      },
      flowsDistribution: flowDistributionResult.rows.map((row) => ({
        status: row.status,
        count: parseInt(row.count),
        percentage: parseFloat(row.percentage),
      })),
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    };

    // Розраховуємо відсотки активних елементів
    stats.flows.activePercentage =
      stats.flows.total > 0
        ? Math.round((stats.flows.active / stats.flows.total) * 100)
        : 0;

    stats.brands.activePercentage =
      stats.brands.total > 0
        ? Math.round((stats.brands.active / stats.brands.total) * 100)
        : 0;

    stats.geos.activePercentage =
      stats.geos.total > 0
        ? Math.round((stats.geos.active / stats.geos.total) * 100)
        : 0;

    stats.offers.activePercentage =
      stats.offers.total > 0
        ? Math.round((stats.offers.active / stats.offers.total) * 100)
        : 0;

    stats.partners.activePercentage =
      stats.partners.total > 0
        ? Math.round((stats.partners.active / stats.partners.total) * 100)
        : 0;

    return stats;
  } catch (error) {
    console.error("Помилка отримання статистики для біздевів:", error);
    throw error;
  }
};

/**
 * Отримання статистики для користувача
 * @param {number} userId - ID користувача
 * @param {Object} options - Опції фільтрації
 * @param {Date} [options.startDate] - Початкова дата
 * @param {Date} [options.endDate] - Кінцева дата
 * @returns {Promise<Object>} Статистика користувача
 */
async function getUserStatistics(userId, { startDate, endDate } = {}) {
  const params = [userId];
  let paramIndex = 2;

  // Умови для фільтрації за датою
  let dateFilterRequests = "";
  let dateFilterFlowStats = "";
  let dateFilterPayouts = "";

  if (startDate && endDate) {
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);

    // Для requests (created_at)
    dateFilterRequests = `AND r.created_at >= $${paramIndex} AND r.created_at < $${
      paramIndex + 1
    }`;
    // Для flow_stats (year, month, day)
    dateFilterFlowStats = `AND (
      fs.year > EXTRACT(YEAR FROM $${paramIndex}::date) OR
      (fs.year = EXTRACT(YEAR FROM $${paramIndex}::date) AND fs.month > EXTRACT(MONTH FROM $${paramIndex}::date)) OR
      (fs.year = EXTRACT(YEAR FROM $${paramIndex}::date) AND fs.month = EXTRACT(MONTH FROM $${paramIndex}::date) AND fs.day >= EXTRACT(DAY FROM $${paramIndex}::date))
    ) AND (
      fs.year < EXTRACT(YEAR FROM $${paramIndex + 1}::date) OR
      (fs.year = EXTRACT(YEAR FROM $${
        paramIndex + 1
      }::date) AND fs.month < EXTRACT(MONTH FROM $${paramIndex + 1}::date)) OR
      (fs.year = EXTRACT(YEAR FROM $${
        paramIndex + 1
      }::date) AND fs.month = EXTRACT(MONTH FROM $${
      paramIndex + 1
    }::date) AND fs.day <= EXTRACT(DAY FROM $${paramIndex + 1}::date))
    )`;
    // Для payout allocations (використовуємо дату заявки)
    dateFilterPayouts = `AND pr.period_start >= $${paramIndex} AND pr.period_end <= $${
      paramIndex + 1
    }`;

    params.push(startDate, endDatePlusOne);
    paramIndex += 2;
  }

  const query = `
    WITH user_refills AS (
      SELECT 
        COALESCE(SUM(arr.amount), 0) as total_refills,
        COALESCE(SUM(arr.fee_amount), 0) as total_fees
      FROM requests r
      JOIN agent_refill_requests arr ON r.id = arr.request_id
      WHERE r.user_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'agent_refill'
        ${dateFilterRequests}
    ),
    user_expenses AS (
      SELECT 
        COALESCE(SUM(er.amount), 0) as total_expenses
      FROM requests r
      JOIN expense_requests er ON r.id = er.request_id
      WHERE r.user_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'expenses'
        ${dateFilterRequests}
    ),
    user_spend AS (
      SELECT 
        COALESCE(SUM(fs.spend), 0) as total_spend
      FROM flow_stats fs
      WHERE fs.user_id = $1
        ${dateFilterFlowStats}
    ),
    user_active_flows AS (
      SELECT 
        COUNT(DISTINCT fu.flow_id) as active_flows_count
      FROM flow_users fu
      JOIN flows f ON fu.flow_id = f.id
      WHERE fu.user_id = $1 
        AND fu.status = 'active'
        AND f.status = 'active'
    ),
    user_payouts AS (
      SELECT 
        COALESCE(SUM(pra.allocated_amount), 0) as total_payouts
      FROM payout_request_allocations pra
      JOIN partner_payout_requests pr ON pra.payout_request_id = pr.id
      WHERE pra.user_id = $1 
        ${dateFilterPayouts}
    )
    SELECT 
      -- Основні суми
      ur.total_refills,
      ur.total_fees,
      ue.total_expenses,
      us.total_spend,
      uaf.active_flows_count,
      up.total_payouts,
      
      -- Розрахункові метрики
      (ur.total_refills + ue.total_expenses) as total_costs,
      (up.total_payouts - us.total_spend - ur.total_fees - ue.total_expenses) as profit,
      
      -- ROI = (виплати / (спенд + комісії + розхідники)) * 100
      CASE 
        WHEN (us.total_spend + ur.total_fees + ue.total_expenses) > 0 
        THEN ROUND(((up.total_payouts / (us.total_spend + ur.total_fees + ue.total_expenses)) * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      
      -- Баланс = поповнення - комісії - спенд
      (ur.total_refills - ur.total_fees - us.total_spend) as balance
      
    FROM user_refills ur
    CROSS JOIN user_expenses ue
    CROSS JOIN user_spend us
    CROSS JOIN user_active_flows uaf
    CROSS JOIN user_payouts up
  `;

  const result = await db.query(query, params);
  const stats = result.rows[0];

  return {
    user_id: userId,
    total_costs: parseFloat(stats.total_costs || 0),
    refills: parseFloat(stats.total_refills || 0),
    fees: parseFloat(stats.total_fees || 0),
    expenses: parseFloat(stats.total_expenses || 0),
    spend: parseFloat(stats.total_spend || 0),
    active_flows_count: parseInt(stats.active_flows_count || 0),
    payouts: parseFloat(stats.total_payouts || 0),
    profit: parseFloat(stats.profit || 0),
    roi: parseFloat(stats.roi || 0),
    balance: parseFloat(stats.balance || 0),
    period:
      startDate && endDate
        ? {
            startDate: startDate.toISOString().split("T")[0],
            endDate: endDate.toISOString().split("T")[0],
          }
        : null,
  };
}

/**
 * Отримання статистики для команди
 * @param {number} teamId - ID команди
 * @param {Object} options - Опції фільтрації
 * @param {Date} [options.startDate] - Початкова дата
 * @param {Date} [options.endDate] - Кінцева дата
 * @returns {Promise<Object>} Статистика команди
 */
async function getTeamStatistics(teamId, { startDate, endDate } = {}) {
  const params = [teamId];
  let paramIndex = 2;

  // Умови для фільтрації за датою
  let dateFilterRequests = "";
  let dateFilterFlowStats = "";
  let dateFilterPayouts = "";

  if (startDate && endDate) {
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);

    dateFilterRequests = `AND r.created_at >= $${paramIndex} AND r.created_at < $${
      paramIndex + 1
    }`;
    dateFilterFlowStats = `AND (
      fs.year > EXTRACT(YEAR FROM $${paramIndex}::date) OR
      (fs.year = EXTRACT(YEAR FROM $${paramIndex}::date) AND fs.month > EXTRACT(MONTH FROM $${paramIndex}::date)) OR
      (fs.year = EXTRACT(YEAR FROM $${paramIndex}::date) AND fs.month = EXTRACT(MONTH FROM $${paramIndex}::date) AND fs.day >= EXTRACT(DAY FROM $${paramIndex}::date))
    ) AND (
      fs.year < EXTRACT(YEAR FROM $${paramIndex + 1}::date) OR
      (fs.year = EXTRACT(YEAR FROM $${
        paramIndex + 1
      }::date) AND fs.month < EXTRACT(MONTH FROM $${paramIndex + 1}::date)) OR
      (fs.year = EXTRACT(YEAR FROM $${
        paramIndex + 1
      }::date) AND fs.month = EXTRACT(MONTH FROM $${
      paramIndex + 1
    }::date) AND fs.day <= EXTRACT(DAY FROM $${paramIndex + 1}::date))
    )`;
    dateFilterPayouts = `AND pr.period_start >= $${paramIndex} AND pr.period_end <= $${
      paramIndex + 1
    }`;

    params.push(startDate, endDatePlusOne);
    paramIndex += 2;
  }

  const query = `
    WITH team_refills AS (
      SELECT 
        COALESCE(SUM(arr.amount), 0) as total_refills,
        COALESCE(SUM(arr.fee_amount), 0) as total_fees
      FROM requests r
      JOIN agent_refill_requests arr ON r.id = arr.request_id
      JOIN users u ON r.user_id = u.id
      WHERE u.team_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'agent_refill'
        ${dateFilterRequests}
    ),
    team_expenses AS (
      SELECT 
        COALESCE(SUM(er.amount), 0) as total_expenses
      FROM requests r
      JOIN expense_requests er ON r.id = er.request_id
      JOIN users u ON r.user_id = u.id
      WHERE u.team_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'expenses'
        ${dateFilterRequests}
    ),
    team_spend AS (
      SELECT 
        COALESCE(SUM(fs.spend), 0) as total_spend
      FROM flow_stats fs
      JOIN users u ON fs.user_id = u.id
      WHERE u.team_id = $1
        ${dateFilterFlowStats}
    ),
    team_active_flows AS (
      SELECT 
        COUNT(DISTINCT f.id) as active_flows_count
      FROM flows f
      WHERE f.team_id = $1 
        AND f.status = 'active'
    ),
    team_payouts AS (
      SELECT 
        COALESCE(SUM(pra.allocated_amount), 0) as total_payouts
      FROM payout_request_allocations pra
      JOIN partner_payout_requests pr ON pra.payout_request_id = pr.id
      JOIN users u ON pra.user_id = u.id
      WHERE u.team_id = $1 
        ${dateFilterPayouts}
    )
    SELECT 
      -- Основні суми
      tr.total_refills,
      tr.total_fees,
      te.total_expenses,
      ts.total_spend,
      taf.active_flows_count,
      tp.total_payouts,
      
      -- Розрахункові метрики
      (tr.total_refills + te.total_expenses) as total_costs,
      (tp.total_payouts - ts.total_spend - tr.total_fees - te.total_expenses) as profit,
      
      -- ROI = (виплати / (спенд + комісії + розхідники)) * 100
      CASE 
        WHEN (ts.total_spend + tr.total_fees + te.total_expenses) > 0 
        THEN ROUND(((tp.total_payouts / (ts.total_spend + tr.total_fees + te.total_expenses)) * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      
      -- Баланс = поповнення - комісії - спенд
      (tr.total_refills - tr.total_fees - ts.total_spend) as balance
      
    FROM team_refills tr
    CROSS JOIN team_expenses te
    CROSS JOIN team_spend ts
    CROSS JOIN team_active_flows taf
    CROSS JOIN team_payouts tp
  `;

  const result = await db.query(query, params);
  const stats = result.rows[0];

  return {
    team_id: teamId,
    total_costs: parseFloat(stats.total_costs || 0),
    refills: parseFloat(stats.total_refills || 0),
    fees: parseFloat(stats.total_fees || 0),
    expenses: parseFloat(stats.total_expenses || 0),
    spend: parseFloat(stats.total_spend || 0),
    active_flows_count: parseInt(stats.active_flows_count || 0),
    payouts: parseFloat(stats.total_payouts || 0),
    profit: parseFloat(stats.profit || 0),
    roi: parseFloat(stats.roi || 0),
    balance: parseFloat(stats.balance || 0),
    period:
      startDate && endDate
        ? {
            startDate: startDate.toISOString().split("T")[0],
            endDate: endDate.toISOString().split("T")[0],
          }
        : null,
  };
}

/**
 * Отримання календарної статистики користувача по витратах за місяць
 * @param {Object} params - Параметри запиту
 * @param {number} params.userId - ID користувача
 * @param {number} params.month - Місяць (1-12)
 * @param {number} params.year - Рік
 * @returns {Promise<Array>} Масив даних по днях місяця
 */
const getUserCalendarStats = async ({ userId, month, year }) => {
  try {
    // Визначаємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    const query = `
      WITH daily_stats AS (
        SELECT 
          gs.day,
          -- Сума поповнень агентів
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'agent_refill' AND r.status = 'completed' 
              THEN ar.amount 
              ELSE 0 
            END
          ), 0) as agent_refill_amount,
          
          -- Сума комісій поповнень
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'agent_refill' AND r.status = 'completed' 
              THEN COALESCE(ar.fee_amount, 0)
              ELSE 0 
            END
          ), 0) as refill_commission,
          
          -- Сума витрат
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'expenses' AND r.status = 'completed' 
              THEN er.amount 
              ELSE 0 
            END
          ), 0) as expenses_amount,
          
          -- Спенд з flow_stats
          COALESCE(SUM(fs.spend), 0) as flow_spend
          
        FROM (
          -- Генеруємо всі дні місяця
          SELECT generate_series(1, $3) as day
        ) gs
        LEFT JOIN requests r ON 
          EXTRACT(DAY FROM r.created_at) = gs.day 
          AND EXTRACT(MONTH FROM r.created_at) = $2 
          AND EXTRACT(YEAR FROM r.created_at) = $4
          AND r.user_id = $1
        LEFT JOIN agent_refill_requests ar ON 
          r.id = ar.request_id AND r.request_type = 'agent_refill'
        LEFT JOIN expense_requests er ON 
          r.id = er.request_id AND r.request_type = 'expenses'
        LEFT JOIN flow_stats fs ON 
          fs.user_id = $1 
          AND fs.day = gs.day 
          AND fs.month = $2 
          AND fs.year = $4
        GROUP BY gs.day
        ORDER BY gs.day
      )
      SELECT 
        day,
        agent_refill_amount,
        refill_commission,
        expenses_amount,
        flow_spend,
        -- Загальна сума витрат (поповнення + витрати)
        (agent_refill_amount + expenses_amount) as total_expenses
      FROM daily_stats;
    `;

    const result = await db.query(query, [userId, month, daysInMonth, year]);

    return result.rows.map((row) => ({
      day: parseInt(row.day),
      agent_refill_amount: parseFloat(row.agent_refill_amount) || 0,
      refill_commission: parseFloat(row.refill_commission) || 0,
      expenses_amount: parseFloat(row.expenses_amount) || 0,
      flow_spend: parseFloat(row.flow_spend) || 0,
      total_expenses: parseFloat(row.total_expenses) || 0,
    }));
  } catch (error) {
    console.error(
      "Помилка отримання календарної статистики користувача:",
      error
    );
    throw error;
  }
};

/**
 * Отримання календарної статистики команди по витратах за місяць
 * @param {Object} params - Параметри запиту
 * @param {number} params.teamId - ID команди
 * @param {number} params.month - Місяць (1-12)
 * @param {number} params.year - Рік
 * @returns {Promise<Array>} Масив даних по днях місяця
 */
const getTeamCalendarStats = async ({ teamId, month, year }) => {
  try {
    // Визначаємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    const query = `
      WITH daily_stats AS (
        SELECT 
          gs.day,
          -- Сума поповнень агентів
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'agent_refill' AND r.status = 'completed' 
              THEN ar.amount 
              ELSE 0 
            END
          ), 0) as agent_refill_amount,
          
          -- Сума комісій поповнень
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'agent_refill' AND r.status = 'completed' 
              THEN COALESCE(ar.fee_amount, 0)
              ELSE 0 
            END
          ), 0) as refill_commission,
          
          -- Сума витрат
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'expenses' AND r.status = 'completed' 
              THEN er.amount 
              ELSE 0 
            END
          ), 0) as expenses_amount,
          
          -- Спенд з flow_stats (сума всіх користувачів команди)
          COALESCE(SUM(fs.spend), 0) as flow_spend
          
        FROM (
          -- Генеруємо всі дні місяця
          SELECT generate_series(1, $2) as day
        ) gs
        LEFT JOIN requests r ON 
          EXTRACT(DAY FROM r.created_at) = gs.day 
          AND EXTRACT(MONTH FROM r.created_at) = $3 
          AND EXTRACT(YEAR FROM r.created_at) = $4
        LEFT JOIN users u ON r.user_id = u.id AND u.team_id = $1
        LEFT JOIN agent_refill_requests ar ON 
          r.id = ar.request_id AND r.request_type = 'agent_refill'
        LEFT JOIN expense_requests er ON 
          r.id = er.request_id AND r.request_type = 'expenses'
        LEFT JOIN flow_stats fs ON 
          fs.day = gs.day 
          AND fs.month = $3 
          AND fs.year = $4
        LEFT JOIN users fu ON fs.user_id = fu.id AND fu.team_id = $1
        GROUP BY gs.day
        ORDER BY gs.day
      )
      SELECT 
        day,
        agent_refill_amount,
        refill_commission,
        expenses_amount,
        flow_spend,
        -- Загальна сума витрат (поповнення + витрати)
        (agent_refill_amount + expenses_amount) as total_expenses
      FROM daily_stats;
    `;

    const result = await db.query(query, [teamId, daysInMonth, month, year]);

    return result.rows.map((row) => ({
      day: parseInt(row.day),
      agent_refill_amount: parseFloat(row.agent_refill_amount) || 0,
      refill_commission: parseFloat(row.refill_commission) || 0,
      expenses_amount: parseFloat(row.expenses_amount) || 0,
      flow_spend: parseFloat(row.flow_spend) || 0,
      total_expenses: parseFloat(row.total_expenses) || 0,
    }));
  } catch (error) {
    console.error("Помилка отримання календарної статистики команди:", error);
    throw error;
  }
};

/**
 * Отримання місячної статистики користувача за рік
 * @param {number} userId - ID користувача
 * @param {Object} options - Опції фільтрації
 * @param {number} options.year - Рік для аналізу
 * @returns {Promise<Object>} Статистика користувача по місяцях
 */
const getUserMonthlyStatistics = async (userId, { year }) => {
  const params = [userId, year];

  const query = `
    WITH months AS (
      SELECT generate_series(1, 12) as month_num
    ),
    user_refills AS (
      SELECT 
        EXTRACT(MONTH FROM r.created_at)::integer as month_num,
        COALESCE(SUM(arr.amount), 0) as total_refills,
        COALESCE(SUM(arr.fee_amount), 0) as total_fees
      FROM requests r
      JOIN agent_refill_requests arr ON r.id = arr.request_id
      WHERE r.user_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'agent_refill'
        AND EXTRACT(YEAR FROM r.created_at) = $2
      GROUP BY EXTRACT(MONTH FROM r.created_at)
    ),
    user_expenses AS (
      SELECT 
        EXTRACT(MONTH FROM r.created_at)::integer as month_num,
        COALESCE(SUM(er.amount), 0) as total_expenses
      FROM requests r
      JOIN expense_requests er ON r.id = er.request_id
      WHERE r.user_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'expenses'
        AND EXTRACT(YEAR FROM r.created_at) = $2
      GROUP BY EXTRACT(MONTH FROM r.created_at)
    ),
    user_spend AS (
      SELECT 
        fs.month as month_num,
        COALESCE(SUM(fs.spend), 0) as total_spend
      FROM flow_stats fs
      WHERE fs.user_id = $1
        AND fs.year = $2
      GROUP BY fs.month
    ),
    user_payouts AS (
      SELECT 
        EXTRACT(MONTH FROM pr.period_start)::integer as month_num,
        COALESCE(SUM(pra.allocated_amount), 0) as total_payouts
      FROM payout_request_allocations pra
      JOIN partner_payout_requests pr ON pra.payout_request_id = pr.id
      WHERE pra.user_id = $1 
        AND EXTRACT(YEAR FROM pr.period_start) = $2
      GROUP BY EXTRACT(MONTH FROM pr.period_start)
    )
    SELECT 
      m.month_num,
      
      -- Основні суми (з нулями для місяців без активності)
      COALESCE(ur.total_refills, 0) as total_refills,
      COALESCE(ur.total_fees, 0) as total_fees,
      COALESCE(ue.total_expenses, 0) as total_expenses,
      COALESCE(us.total_spend, 0) as total_spend,
      COALESCE(up.total_payouts, 0) as total_payouts,
      
      -- Розрахункові метрики
      (COALESCE(ur.total_refills, 0) + COALESCE(ue.total_expenses, 0)) as total_costs,
      (COALESCE(up.total_payouts, 0) - COALESCE(us.total_spend, 0) - COALESCE(ur.total_fees, 0) - COALESCE(ue.total_expenses, 0)) as profit,
      
      -- ROI = (виплати / (спенд + комісії + розхідники)) * 100
      CASE 
        WHEN (COALESCE(us.total_spend, 0) + COALESCE(ur.total_fees, 0) + COALESCE(ue.total_expenses, 0)) > 0 
        THEN ROUND(((COALESCE(up.total_payouts, 0) / (COALESCE(us.total_spend, 0) + COALESCE(ur.total_fees, 0) + COALESCE(ue.total_expenses, 0))) * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      
      -- Баланс = поповнення - комісії - спенд
      (COALESCE(ur.total_refills, 0) - COALESCE(ur.total_fees, 0) - COALESCE(us.total_spend, 0)) as balance
      
    FROM months m
    LEFT JOIN user_refills ur ON m.month_num = ur.month_num
    LEFT JOIN user_expenses ue ON m.month_num = ue.month_num
    LEFT JOIN user_spend us ON m.month_num = us.month_num
    LEFT JOIN user_payouts up ON m.month_num = up.month_num
    ORDER BY m.month_num
  `;

  const result = await db.query(query, params);

  // Отримуємо статистику активних потоків (окремо, так як не залежить від місяця)
  const activeFlowsQuery = `
    SELECT COUNT(DISTINCT fu.flow_id) as active_flows_count
    FROM flow_users fu
    JOIN flows f ON fu.flow_id = f.id
    WHERE fu.user_id = $1 
      AND fu.status = 'active'
      AND f.status = 'active'
  `;

  const activeFlowsResult = await db.query(activeFlowsQuery, [userId]);
  const activeFlowsCount = parseInt(
    activeFlowsResult.rows[0].active_flows_count || 0
  );

  const monthlyData = result.rows.map((row) => ({
    month: parseInt(row.month_num),
    refills: parseFloat(row.total_refills || 0),
    fees: parseFloat(row.total_fees || 0),
    expenses: parseFloat(row.total_expenses || 0),
    spend: parseFloat(row.total_spend || 0),
    payouts: parseFloat(row.total_payouts || 0),
    total_costs: parseFloat(row.total_costs || 0),
    profit: parseFloat(row.profit || 0),
    roi: parseFloat(row.roi || 0),
    balance: parseFloat(row.balance || 0),
  }));

  // Розрахунок річної статистики
  const yearlyTotals = monthlyData.reduce(
    (totals, month) => ({
      refills: totals.refills + month.refills,
      fees: totals.fees + month.fees,
      expenses: totals.expenses + month.expenses,
      spend: totals.spend + month.spend,
      payouts: totals.payouts + month.payouts,
      total_costs: totals.total_costs + month.total_costs,
      profit: totals.profit + month.profit,
    }),
    {
      refills: 0,
      fees: 0,
      expenses: 0,
      spend: 0,
      payouts: 0,
      total_costs: 0,
      profit: 0,
    }
  );

  // Розрахунок річного ROI
  const yearlyRoi =
    yearlyTotals.spend + yearlyTotals.fees + yearlyTotals.expenses > 0
      ? Math.round(
          (yearlyTotals.payouts /
            (yearlyTotals.spend + yearlyTotals.fees + yearlyTotals.expenses)) *
            100 *
            100
        ) / 100
      : 0;

  const yearlyBalance =
    yearlyTotals.refills - yearlyTotals.fees - yearlyTotals.spend;

  return {
    user_id: userId,
    year: year,
    active_flows_count: activeFlowsCount,
    monthly_data: monthlyData,
    yearly_totals: {
      ...yearlyTotals,
      roi: yearlyRoi,
      balance: yearlyBalance,
    },
  };
};

/**
 * Отримання місячної статистики команди за рік
 * @param {number} teamId - ID команди
 * @param {Object} options - Опції фільтрації
 * @param {number} options.year - Рік для аналізу
 * @returns {Promise<Object>} Статистика команди по місяцях
 */
const getTeamMonthlyStatistics = async (teamId, { year }) => {
  const params = [teamId, year];

  const query = `
    WITH months AS (
      SELECT generate_series(1, 12) as month_num
    ),
    team_refills AS (
      SELECT 
        EXTRACT(MONTH FROM r.created_at)::integer as month_num,
        COALESCE(SUM(arr.amount), 0) as total_refills,
        COALESCE(SUM(arr.fee_amount), 0) as total_fees
      FROM requests r
      JOIN agent_refill_requests arr ON r.id = arr.request_id
      JOIN users u ON r.user_id = u.id
      WHERE u.team_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'agent_refill'
        AND EXTRACT(YEAR FROM r.created_at) = $2
      GROUP BY EXTRACT(MONTH FROM r.created_at)
    ),
    team_expenses AS (
      SELECT 
        EXTRACT(MONTH FROM r.created_at)::integer as month_num,
        COALESCE(SUM(er.amount), 0) as total_expenses
      FROM requests r
      JOIN expense_requests er ON r.id = er.request_id
      JOIN users u ON r.user_id = u.id
      WHERE u.team_id = $1 
        AND r.status IN ('completed')
        AND r.request_type = 'expenses'
        AND EXTRACT(YEAR FROM r.created_at) = $2
      GROUP BY EXTRACT(MONTH FROM r.created_at)
    ),
    team_spend AS (
      SELECT 
        fs.month as month_num,
        COALESCE(SUM(fs.spend), 0) as total_spend
      FROM flow_stats fs
      JOIN users u ON fs.user_id = u.id
      WHERE u.team_id = $1
        AND fs.year = $2
      GROUP BY fs.month
    ),
    team_payouts AS (
      SELECT 
        EXTRACT(MONTH FROM pr.period_start)::integer as month_num,
        COALESCE(SUM(pra.allocated_amount), 0) as total_payouts
      FROM payout_request_allocations pra
      JOIN partner_payout_requests pr ON pra.payout_request_id = pr.id
      JOIN users u ON pra.user_id = u.id
      WHERE u.team_id = $1 
        AND EXTRACT(YEAR FROM pr.period_start) = $2
      GROUP BY EXTRACT(MONTH FROM pr.period_start)
    )
    SELECT 
      m.month_num,
      
      -- Основні суми (з нулями для місяців без активності)
      COALESCE(tr.total_refills, 0) as total_refills,
      COALESCE(tr.total_fees, 0) as total_fees,
      COALESCE(te.total_expenses, 0) as total_expenses,
      COALESCE(ts.total_spend, 0) as total_spend,
      COALESCE(tp.total_payouts, 0) as total_payouts,
      
      -- Розрахункові метрики
      (COALESCE(tr.total_refills, 0) + COALESCE(te.total_expenses, 0)) as total_costs,
      (COALESCE(tp.total_payouts, 0) - COALESCE(ts.total_spend, 0) - COALESCE(tr.total_fees, 0) - COALESCE(te.total_expenses, 0)) as profit,
      
      -- ROI = (виплати / (спенд + комісії + розхідники)) * 100
      CASE 
        WHEN (COALESCE(ts.total_spend, 0) + COALESCE(tr.total_fees, 0) + COALESCE(te.total_expenses, 0)) > 0 
        THEN ROUND(((COALESCE(tp.total_payouts, 0) / (COALESCE(ts.total_spend, 0) + COALESCE(tr.total_fees, 0) + COALESCE(te.total_expenses, 0))) * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      
      -- Баланс = поповнення - комісії - спенд
      (COALESCE(tr.total_refills, 0) - COALESCE(tr.total_fees, 0) - COALESCE(ts.total_spend, 0)) as balance
      
    FROM months m
    LEFT JOIN team_refills tr ON m.month_num = tr.month_num
    LEFT JOIN team_expenses te ON m.month_num = te.month_num
    LEFT JOIN team_spend ts ON m.month_num = ts.month_num
    LEFT JOIN team_payouts tp ON m.month_num = tp.month_num
    ORDER BY m.month_num
  `;

  const result = await db.query(query, params);

  // Отримуємо статистику активних потоків команди
  const activeFlowsQuery = `
    SELECT COUNT(DISTINCT f.id) as active_flows_count
    FROM flows f
    WHERE f.team_id = $1 
      AND f.status = 'active'
  `;

  const activeFlowsResult = await db.query(activeFlowsQuery, [teamId]);
  const activeFlowsCount = parseInt(
    activeFlowsResult.rows[0].active_flows_count || 0
  );

  const monthlyData = result.rows.map((row) => ({
    month: parseInt(row.month_num),
    refills: parseFloat(row.total_refills || 0),
    fees: parseFloat(row.total_fees || 0),
    expenses: parseFloat(row.total_expenses || 0),
    spend: parseFloat(row.total_spend || 0),
    payouts: parseFloat(row.total_payouts || 0),
    total_costs: parseFloat(row.total_costs || 0),
    profit: parseFloat(row.profit || 0),
    roi: parseFloat(row.roi || 0),
    balance: parseFloat(row.balance || 0),
  }));

  // Розрахунок річної статистики
  const yearlyTotals = monthlyData.reduce(
    (totals, month) => ({
      refills: totals.refills + month.refills,
      fees: totals.fees + month.fees,
      expenses: totals.expenses + month.expenses,
      spend: totals.spend + month.spend,
      payouts: totals.payouts + month.payouts,
      total_costs: totals.total_costs + month.total_costs,
      profit: totals.profit + month.profit,
    }),
    {
      refills: 0,
      fees: 0,
      expenses: 0,
      spend: 0,
      payouts: 0,
      total_costs: 0,
      profit: 0,
    }
  );

  // Розрахунок річного ROI
  const yearlyRoi =
    yearlyTotals.spend + yearlyTotals.fees + yearlyTotals.expenses > 0
      ? Math.round(
          (yearlyTotals.payouts /
            (yearlyTotals.spend + yearlyTotals.fees + yearlyTotals.expenses)) *
            100 *
            100
        ) / 100
      : 0;

  const yearlyBalance =
    yearlyTotals.refills - yearlyTotals.fees - yearlyTotals.spend;

  return {
    team_id: teamId,
    year: year,
    active_flows_count: activeFlowsCount,
    monthly_data: monthlyData,
    yearly_totals: {
      ...yearlyTotals,
      roi: yearlyRoi,
      balance: yearlyBalance,
    },
  };
};

/**
 * Отримання загальної статистики компанії
 * @param {Object} options - Опції фільтрації
 * @param {Date} [options.startDate] - Початкова дата
 * @param {Date} [options.endDate] - Кінцева дата
 * @returns {Promise<Object>} Статистика компанії
 */
async function getCompanyStatistics({ startDate, endDate } = {}) {
  const params = [];
  let paramIndex = 1;

  // Умови для фільтрації за датою
  let dateFilterRequests = "";
  let dateFilterFlowStats = "";
  let dateFilterPayouts = "";

  if (startDate && endDate) {
    const endDatePlusOne = new Date(endDate);
    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);

    // Для requests (created_at)
    dateFilterRequests = `AND r.created_at >= $${paramIndex} AND r.created_at < $${
      paramIndex + 1
    }`;
    // Для flow_stats (year, month, day)
    dateFilterFlowStats = `AND (
      fs.year > EXTRACT(YEAR FROM $${paramIndex}::date) OR
      (fs.year = EXTRACT(YEAR FROM $${paramIndex}::date) AND fs.month > EXTRACT(MONTH FROM $${paramIndex}::date)) OR
      (fs.year = EXTRACT(YEAR FROM $${paramIndex}::date) AND fs.month = EXTRACT(MONTH FROM $${paramIndex}::date) AND fs.day >= EXTRACT(DAY FROM $${paramIndex}::date))
    ) AND (
      fs.year < EXTRACT(YEAR FROM $${paramIndex + 1}::date) OR
      (fs.year = EXTRACT(YEAR FROM $${
        paramIndex + 1
      }::date) AND fs.month < EXTRACT(MONTH FROM $${paramIndex + 1}::date)) OR
      (fs.year = EXTRACT(YEAR FROM $${
        paramIndex + 1
      }::date) AND fs.month = EXTRACT(MONTH FROM $${
      paramIndex + 1
    }::date) AND fs.day <= EXTRACT(DAY FROM $${paramIndex + 1}::date))
    )`;
    // Для payout allocations (використовуємо дату заявки)
    dateFilterPayouts = `AND pr.period_start >= $${paramIndex} AND pr.period_end <= $${
      paramIndex + 1
    }`;

    params.push(startDate, endDatePlusOne);
    paramIndex += 2;
  }

  const query = `
    WITH company_refills AS (
      SELECT 
        COALESCE(SUM(arr.amount), 0) as total_refills,
        COALESCE(SUM(arr.fee_amount), 0) as total_fees
      FROM requests r
      JOIN agent_refill_requests arr ON r.id = arr.request_id
      WHERE r.status IN ('completed')
        AND r.request_type = 'agent_refill'
        ${dateFilterRequests}
    ),
    company_expenses AS (
      SELECT 
        COALESCE(SUM(er.amount), 0) as total_expenses
      FROM requests r
      JOIN expense_requests er ON r.id = er.request_id
      WHERE r.status IN ('completed')
        AND r.request_type = 'expenses'
        ${dateFilterRequests}
    ),
    company_spend AS (
      SELECT 
        COALESCE(SUM(fs.spend), 0) as total_spend
      FROM flow_stats fs
      WHERE 1=1
        ${dateFilterFlowStats}
    ),
    company_active_flows AS (
      SELECT 
        COUNT(DISTINCT fu.flow_id) as active_flows_count,
        COUNT(DISTINCT fu.user_id) as active_users_count
      FROM flow_users fu
      JOIN flows f ON fu.flow_id = f.id
      WHERE fu.status = 'active'
        AND f.status = 'active'
    ),
    company_payouts AS (
      SELECT 
        COALESCE(SUM(pra.allocated_amount), 0) as total_payouts
      FROM payout_request_allocations pra
      JOIN partner_payout_requests pr ON pra.payout_request_id = pr.id
      WHERE 1=1
        ${dateFilterPayouts}
    )
    SELECT 
      -- Основні суми
      cr.total_refills,
      cr.total_fees,
      ce.total_expenses,
      cs.total_spend,
      caf.active_flows_count,
      caf.active_users_count,
      cp.total_payouts,
      
      -- Розрахункові метрики
      (cr.total_refills + ce.total_expenses) as total_costs,
      (cp.total_payouts - cs.total_spend - cr.total_fees - ce.total_expenses) as profit,
      
      -- ROI = (виплати / (спенд + комісії + розхідники)) * 100
      CASE 
        WHEN (cs.total_spend + cr.total_fees + ce.total_expenses) > 0 
        THEN ROUND(((cp.total_payouts / (cs.total_spend + cr.total_fees + ce.total_expenses)) * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      
      -- Баланс = поповнення - комісії - спенд
      (cr.total_refills - cr.total_fees - cs.total_spend) as balance

    FROM company_refills cr
    CROSS JOIN company_expenses ce
    CROSS JOIN company_spend cs
    CROSS JOIN company_active_flows caf
    CROSS JOIN company_payouts cp
  `;

  const result = await db.query(query, params);
  const stats = result.rows[0];

  return {
    total_costs: parseFloat(stats.total_costs || 0),
    refills: parseFloat(stats.total_refills || 0),
    fees: parseFloat(stats.total_fees || 0),
    expenses: parseFloat(stats.total_expenses || 0),
    spend: parseFloat(stats.total_spend || 0),
    active_flows_count: parseInt(stats.active_flows_count || 0),
    active_users_count: parseInt(stats.active_users_count || 0),
    payouts: parseFloat(stats.total_payouts || 0),
    profit: parseFloat(stats.profit || 0),
    roi: parseFloat(stats.roi || 0),
    balance: parseFloat(stats.balance || 0),
    period:
      startDate && endDate
        ? {
            startDate: startDate.toISOString().split("T")[0],
            endDate: endDate.toISOString().split("T")[0],
          }
        : null,
  };
}

/**
 * Отримання місячної статистики компанії за рік
 * @param {Object} options - Опції фільтрації
 * @param {number} options.year - Рік для аналізу
 * @returns {Promise<Object>} Статистика компанії по місяцях
 */
const getCompanyMonthlyStatistics = async ({ year }) => {
  const params = [year];

  const query = `
    WITH months AS (
      SELECT generate_series(1, 12) as month_num
    ),
    company_refills AS (
      SELECT 
        EXTRACT(MONTH FROM r.created_at)::integer as month_num,
        COALESCE(SUM(arr.amount), 0) as total_refills,
        COALESCE(SUM(arr.fee_amount), 0) as total_fees
      FROM requests r
      JOIN agent_refill_requests arr ON r.id = arr.request_id
      WHERE r.status IN ('completed')
        AND r.request_type = 'agent_refill'
        AND EXTRACT(YEAR FROM r.created_at) = $1
      GROUP BY EXTRACT(MONTH FROM r.created_at)
    ),
    company_expenses AS (
      SELECT 
        EXTRACT(MONTH FROM r.created_at)::integer as month_num,
        COALESCE(SUM(er.amount), 0) as total_expenses
      FROM requests r
      JOIN expense_requests er ON r.id = er.request_id
      WHERE r.status IN ('completed')
        AND r.request_type = 'expenses'
        AND EXTRACT(YEAR FROM r.created_at) = $1
      GROUP BY EXTRACT(MONTH FROM r.created_at)
    ),
    company_spend AS (
      SELECT 
        fs.month as month_num,
        COALESCE(SUM(fs.spend), 0) as total_spend
      FROM flow_stats fs
      WHERE fs.year = $1
      GROUP BY fs.month
    ),
    company_payouts AS (
      SELECT 
        EXTRACT(MONTH FROM pr.period_start)::integer as month_num,
        COALESCE(SUM(pra.allocated_amount), 0) as total_payouts
      FROM payout_request_allocations pra
      JOIN partner_payout_requests pr ON pra.payout_request_id = pr.id
      WHERE EXTRACT(YEAR FROM pr.period_start) = $1
      GROUP BY EXTRACT(MONTH FROM pr.period_start)
    )
    SELECT 
      m.month_num,
      
      -- Основні суми (з нулями для місяців без активності)
      COALESCE(cr.total_refills, 0) as total_refills,
      COALESCE(cr.total_fees, 0) as total_fees,
      COALESCE(ce.total_expenses, 0) as total_expenses,
      COALESCE(cs.total_spend, 0) as total_spend,
      COALESCE(cp.total_payouts, 0) as total_payouts,

      -- Розрахункові метрики
      (COALESCE(cr.total_refills, 0) + COALESCE(ce.total_expenses, 0)) as total_costs,
      (COALESCE(cp.total_payouts, 0) - COALESCE(cs.total_spend, 0) - COALESCE(cr.total_fees, 0) - COALESCE(ce.total_expenses, 0)) as profit,
      
      -- ROI = (виплати / (спенд + комісії + розхідники)) * 100
      CASE 
        WHEN (COALESCE(cs.total_spend, 0) + COALESCE(cr.total_fees, 0) + COALESCE(ce.total_expenses, 0)) > 0 
        THEN ROUND(((COALESCE(cp.total_payouts, 0) / (COALESCE(cs.total_spend, 0) + COALESCE(cr.total_fees, 0) + COALESCE(ce.total_expenses, 0))) * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      
      -- Баланс = поповнення - комісії - спенд
      (COALESCE(cr.total_refills, 0) - COALESCE(cr.total_fees, 0) - COALESCE(cs.total_spend, 0)) as balance
      
    FROM months m
    LEFT JOIN company_refills cr ON m.month_num = cr.month_num
    LEFT JOIN company_expenses ce ON m.month_num = ce.month_num
    LEFT JOIN company_spend cs ON m.month_num = cs.month_num
    LEFT JOIN company_payouts cp ON m.month_num = cp.month_num
    ORDER BY m.month_num
  `;

  const result = await db.query(query, params);

  // Отримуємо статистику активних потоків (окремо, так як не залежить від місяця)
  const activeFlowsQuery = `
    SELECT 
      COUNT(DISTINCT fu.flow_id) as active_flows_count,
      COUNT(DISTINCT fu.user_id) as total_active_users_count
    FROM flow_users fu
    JOIN flows f ON fu.flow_id = f.id
    WHERE fu.status = 'active'
      AND f.status = 'active'
  `;

  const activeFlowsResult = await db.query(activeFlowsQuery);
  const activeFlowsCount = parseInt(
    activeFlowsResult.rows[0].active_flows_count || 0
  );
  const totalActiveUsersCount = parseInt(
    activeFlowsResult.rows[0].total_active_users_count || 0
  );

  const monthlyData = result.rows.map((row) => ({
    month: parseInt(row.month_num),
    refills: parseFloat(row.total_refills || 0),
    fees: parseFloat(row.total_fees || 0),
    expenses: parseFloat(row.total_expenses || 0),
    spend: parseFloat(row.total_spend || 0),
    payouts: parseFloat(row.total_payouts || 0),
    total_costs: parseFloat(row.total_costs || 0),
    profit: parseFloat(row.profit || 0),
    roi: parseFloat(row.roi || 0),
    balance: parseFloat(row.balance || 0),
  }));

  // Розрахунок річної статистики
  const yearlyTotals = monthlyData.reduce(
    (totals, month) => ({
      refills: totals.refills + month.refills,
      fees: totals.fees + month.fees,
      expenses: totals.expenses + month.expenses,
      spend: totals.spend + month.spend,
      payouts: totals.payouts + month.payouts,
      total_costs: totals.total_costs + month.total_costs,
      profit: totals.profit + month.profit,
    }),
    {
      refills: 0,
      fees: 0,
      expenses: 0,
      spend: 0,
      payouts: 0,
      total_costs: 0,
      profit: 0,
    }
  );

  // Розрахунок річного ROI
  const yearlyRoi =
    yearlyTotals.spend + yearlyTotals.fees + yearlyTotals.expenses > 0
      ? Math.round(
          (yearlyTotals.payouts /
            (yearlyTotals.spend + yearlyTotals.fees + yearlyTotals.expenses)) *
            100 *
            100
        ) / 100
      : 0;

  const yearlyBalance =
    yearlyTotals.refills - yearlyTotals.fees - yearlyTotals.spend;

  return {
    year: year,
    active_flows_count: activeFlowsCount,
    total_active_users_count: totalActiveUsersCount,
    monthly_data: monthlyData,
    yearly_totals: {
      ...yearlyTotals,
      roi: yearlyRoi,
      balance: yearlyBalance,
    },
  };
};

/**
 * Отримання календарної статистики компанії по витратах за місяць
 * @param {Object} params - Параметри запиту
 * @param {number} params.month - Місяць (1-12)
 * @param {number} params.year - Рік
 * @returns {Promise<Array>} Масив даних по днях місяця
 */
const getCompanyCalendarStats = async ({ month, year }) => {
  try {
    // Визначаємо кількість днів у місяці
    const daysInMonth = new Date(year, month, 0).getDate();

    const query = `
      WITH daily_stats AS (
        SELECT 
          gs.day,
          -- Сума поповнень агентів
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'agent_refill' AND r.status = 'completed' 
              THEN ar.amount 
              ELSE 0 
            END
          ), 0) as agent_refill_amount,
          
          -- Сума комісій поповнень
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'agent_refill' AND r.status = 'completed' 
              THEN COALESCE(ar.fee_amount, 0)
              ELSE 0 
            END
          ), 0) as refill_commission,
          
          -- Сума витрат
          COALESCE(SUM(
            CASE 
              WHEN r.request_type = 'expenses' AND r.status = 'completed' 
              THEN er.amount 
              ELSE 0 
            END
          ), 0) as expenses_amount,
          
          -- Спенд з flow_stats
          COALESCE(SUM(fs.spend), 0) as flow_spend,
          
          -- Кількість активних користувачів за день
          COUNT(DISTINCT fs.user_id) as active_users_count
          
        FROM (
          -- Генеруємо всі дні місяця
          SELECT generate_series(1, $2) as day
        ) gs
        LEFT JOIN requests r ON 
          EXTRACT(DAY FROM r.created_at) = gs.day 
          AND EXTRACT(MONTH FROM r.created_at) = $1 
          AND EXTRACT(YEAR FROM r.created_at) = $3
        LEFT JOIN agent_refill_requests ar ON 
          r.id = ar.request_id AND r.request_type = 'agent_refill'
        LEFT JOIN expense_requests er ON 
          r.id = er.request_id AND r.request_type = 'expenses'
        LEFT JOIN flow_stats fs ON 
          fs.day = gs.day 
          AND fs.month = $1 
          AND fs.year = $3
        GROUP BY gs.day
        ORDER BY gs.day
      )
      SELECT 
        day,
        agent_refill_amount,
        refill_commission,
        expenses_amount,
        flow_spend,
        active_users_count,
        -- Загальна сума витрат (поповнення + витрати)
        (agent_refill_amount + expenses_amount) as total_expenses,
        -- Середній спенд на користувача
        CASE 
          WHEN active_users_count > 0 
          THEN ROUND((flow_spend / active_users_count)::numeric, 2)
          ELSE 0 
        END as avg_spend_per_user
      FROM daily_stats;
    `;

    const result = await db.query(query, [month, daysInMonth, year]);

    return result.rows.map((row) => ({
      day: parseInt(row.day),
      agent_refill_amount: parseFloat(row.agent_refill_amount) || 0,
      refill_commission: parseFloat(row.refill_commission) || 0,
      expenses_amount: parseFloat(row.expenses_amount) || 0,
      flow_spend: parseFloat(row.flow_spend) || 0,
      total_expenses: parseFloat(row.total_expenses) || 0,
      active_users_count: parseInt(row.active_users_count) || 0,
      avg_spend_per_user: parseFloat(row.avg_spend_per_user) || 0,
    }));
  } catch (error) {
    console.error("Помилка отримання календарної статистики компанії:", error);
    throw error;
  }
};

module.exports = {
  getBizdevStatistics,
  getUserStatistics,
  getTeamStatistics,
  getUserCalendarStats,
  getTeamCalendarStats,
  getUserMonthlyStatistics,
  getTeamMonthlyStatistics,

  getCompanyStatistics,
  getCompanyMonthlyStatistics,
  getCompanyCalendarStats,
};
