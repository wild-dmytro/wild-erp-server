const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/reports/stats/finance-managers
 * @desc    Отримання статистики заявок за фінансовими менеджерами
 * @access  Private/Admin/Finance
 */
router.get(
  '/stats/finance-managers',
  roleMiddleware('admin', 'finance_manager'),
  reportsController.getFinanceManagerStats
);

/**
 * @route   GET /api/reports/summary/monthly-expenses
 * @desc    Отримання сумарних витрат по місяцях
 * @access  Private
 */
router.get('/summary/monthly-expenses', reportsController.getMonthlyExpenseSummary);

/**
 * @route   GET /api/reports/statistics
 * @desc    Отримання агрегованих даних для статистичних карток
 * @access  Private
 */
router.get('/statistics', reportsController.getStatistics);

/**
 * @route   GET /api/reports/stats/request-type-summary
 * @desc    Отримання кількості та сум заявок по типах
 * @access  Private
 */
router.get('/stats/request-type-summary', reportsController.getRequestTypeSummary);

/**
 * @route   GET /api/reports/stats/departments
 * @desc    Отримання статистики витрат за відділами
 * @access  Private
 */
router.get('/stats/departments', reportsController.getDepartmentExpenseStats);

module.exports = router;