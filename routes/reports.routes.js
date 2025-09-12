const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reports.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/reports/stats/finance-managers
 * @desc    Отримання статистики заявок за фінансовими менеджерами
 * @access  Private/Admin/Finance
 */
router.get(
  "/stats/finance-managers",
  roleMiddleware("admin", "finance_manager"),
  reportsController.getFinanceManagerStats
);

/**
 * @route   GET /api/reports/stats/user/:userId
 * @desc    Отримання статистики для певного користувача
 * @access  Private
 */
router.get(
  "/stats/user/:userId",
  roleMiddleware("admin", "teamlead", "buyer", "finance_manager"),
  reportsController.getUserStats
);

/**
 * @route   GET /api/reports/stats/team/:teamId
 * @desc    Отримання статистики для команди
 * @access  Private/Admin/Teamlead
 */
router.get(
  "/stats/team/:teamId",
  roleMiddleware("admin", "teamlead", "finance_manager"),
  reportsController.getTeamStats
);

/**
 * @route   GET /api/reports/monthly/user/:userId
 * @desc    Отримання місячної статистики користувача за рік
 * @access  Private
 * @params  userId - ID користувача
 * @query   year - рік для аналізу
 */
router.get(
  "/monthly/user/:userId",
  roleMiddleware("admin", "teamlead", "buyer", "finance_manager"),
  reportsController.getUserMonthlyStatistics
);

/**
 * @route   GET /api/reports/monthly/team/:teamId
 * @desc    Отримання місячної статистики команди за рік
 * @access  Private
 * @params  teamId - ID команди
 * @query   year - рік для аналізу
 */
router.get(
  "/monthly/team/:teamId",
  roleMiddleware("admin", "teamlead", "finance_manager"),
  reportsController.getTeamMonthlyStatistics
);

/**
 * @route   GET /api/reports/calendar/user/:userId
 * @desc    Отримання календарної статистики користувача по витратах за місяць
 * @access  Private
 * @params  userId - ID користувача
 * @query   month - місяць (1-12), year - рік
 */
router.get(
  "/calendar/user/:userId",
  roleMiddleware("admin", "teamlead", "buyer", "finance_manager"),
  reportsController.getUserCalendarStats
);

/**
 * @route   GET /api/reports/calendar/team/:teamId
 * @desc    Отримання календарної статистики команди по витратах за місяць
 * @access  Private
 * @params  teamId - ID команди
 * @query   month - місяць (1-12), year - рік
 */
router.get(
  "/calendar/team/:teamId",
  roleMiddleware("admin", "teamlead", "finance_manager"),
  reportsController.getTeamCalendarStats
);

/**
 * @route   GET /api/reports/summary/monthly-expenses
 * @desc    Отримання сумарних витрат по місяцях
 * @access  Private
 */
router.get(
  "/summary/monthly-expenses",
  reportsController.getMonthlyExpenseSummary
);

/**
 * @route   GET /api/reports/statistics
 * @desc    Отримання агрегованих даних для статистичних карток
 * @access  Private
 */
router.get("/statistics", reportsController.getStatistics);

/**
 * @route   GET /api/reports/stats/request-type-summary
 * @desc    Отримання кількості та сум заявок по типах
 * @access  Private
 */
router.get(
  "/stats/request-type-summary",
  reportsController.getRequestTypeSummary
);

/**
 * @route   GET /api/reports/stats/departments
 * @desc    Отримання статистики витрат за відділами
 * @access  Private
 */
router.get("/stats/departments", reportsController.getDepartmentExpenseStats);

/**
 * @route   GET /api/reports/overview/bizdev
 * @desc    Отримання загальної статистики для біздевів
 * @access  Private/Admin/Bizdev
 */
router.get(
  "/overview/bizdev",
  roleMiddleware("admin", "bizdev"),
  reportsController.getBizdevOverview
);

module.exports = router;
