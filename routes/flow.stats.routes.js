const express = require('express');
const router = express.Router();
const flowStatsController = require('../controllers/flow.stats.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { check } = require('express-validator');

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
 * Отримання всіх потоків зі статистикою за певний день з фільтрацією за партнерами
 * GET /api/flow-stats/daily/:year/:month/:day
 * Query params: partnerId, partnerIds[], status, teamId, userId
 */
router.get('/daily/:year/:month/:day', [
  check('year', 'Рік має бути числом між 2020 та 2030')
    .isInt({ min: 2020, max: 2030 }),
  check('month', 'Місяць має бути числом між 1 та 12')
    .isInt({ min: 1, max: 12 }),
  check('day', 'День має бути числом між 1 та 31')
    .isInt({ min: 1, max: 31 }),
  check('partnerId', 'ID партнера має бути числом')
    .optional()
    .isInt(),
  check('partnerIds', 'Масив ID партнерів має містити числа')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        const ids = value.split(',').map(id => parseInt(id.trim()));
        return ids.every(id => Number.isInteger(id) && id > 0);
      }
      if (Array.isArray(value)) {
        return value.every(id => Number.isInteger(parseInt(id)) && parseInt(id) > 0);
      }
      return false;
    }),
  check('status', 'Недійсний статус потоку')
    .optional()
    .isIn(['active', 'paused', 'stopped', 'pending']),
  check('teamId', 'ID команди має бути числом')
    .optional()
    .isInt(),
  check('userId', 'ID користувача має бути числом')
    .optional()
    .isInt(),
  check('onlyActive', 'onlyActive має бути булевим значенням')
    .optional()
    .isBoolean()
], flowStatsController.getDailyFlowsStats);

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