const express = require('express');
const router = express.Router();
const flowStatsController = require('../controllers/flow.stats.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Всі маршрути потребують авторизації
router.use(authMiddleware);

/**
 * Створення або оновлення статистики за день
 * POST /api/flow-stats
 * Body: { flow_id, day, month, year, spend, installs, regs, deps, verified_deps, cpa, notes }
 */
router.post('/', flowStatsController.upsertFlowStat);

/**
 * Масове оновлення статистики
 * POST /api/flow-stats/bulk
 * Body: { 
 *   flow_id, 
 *   stats: [
 *     { day, month, year, spend, installs, regs, deps, verified_deps, cpa, notes },
 *     ...
 *   ]
 * }
 */
router.post('/bulk', flowStatsController.bulkUpsertFlowStats);

/**
 * Отримання статистики потоку з фільтрацією
 * GET /api/flow-stats/:flow_id
 * Query params: month, year, dateFrom, dateTo
 */
router.get('/:flow_id', flowStatsController.getFlowStats);

/**
 * Отримання агрегованої статистики за період
 * GET /api/flow-stats/:flow_id/aggregated
 * Query params: month, year, dateFrom, dateTo
 */
router.get('/:flow_id/aggregated', flowStatsController.getAggregatedStats);

/**
 * Отримання календарної статистики за місяць
 * GET /api/flow-stats/:flow_id/calendar/:year/:month
 * Повертає всі дні місяця з даними або порожніми значеннями
 */
router.get('/:flow_id/calendar/:year/:month', flowStatsController.getMonthlyCalendarStats);

/**
 * Видалення статистики за конкретний день
 * DELETE /api/flow-stats/:flow_id/:year/:month/:day
 */
router.delete('/:flow_id/:year/:month/:day', flowStatsController.deleteFlowStat);

module.exports = router;