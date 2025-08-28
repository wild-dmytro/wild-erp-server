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

// Не забудьте додати експорт нового методу в кінець файлу models/request.model.js:
module.exports = {
  // ... інші експорти
  getBizdevStatistics,
  // ... інші експорти
};
