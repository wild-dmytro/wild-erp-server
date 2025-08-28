const express = require("express");
const router = express.Router();
const flowStatsController = require("../controllers/flow.stats.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

const { check, param, body } = require("express-validator");

// Всі маршрути потребують авторизації
router.use(authMiddleware);

/**
 * ОНОВЛЕНО: Створення або оновлення статистики за день з обов'язковим user_id
 * POST /api/flow-stats
 * Body: { flow_id, user_id, day, month, year, spend, installs, regs, deps, verified_deps, deposit_amount, redep_count, unique_redep_count, notes }
 */
router.post(
  "/",
  [
    body("flow_id", "ID потоку має бути числом").isInt({ min: 1 }),
    body("user_id", "ID користувача має бути числом").isInt({ min: 1 }),
    body("day", "День має бути числом між 1 та 31").isInt({ min: 1, max: 31 }),
    body("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
    body("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    body("spend", "Витрати мають бути числом").optional().isNumeric(),
    body("installs", "Інстали мають бути числом").optional().isInt({ min: 0 }),
    body("regs", "Реєстрації мають бути числом").optional().isInt({ min: 0 }),
    body("deps", "Депозити мають бути числом").optional().isInt({ min: 0 }),
    body("verified_deps", "Верифіковані депозити мають бути числом")
      .optional()
      .isInt({ min: 0 }),
    body("deposit_amount", "Сума депозитів має бути числом")
      .optional()
      .isNumeric(),
    body("redep_count", "Кількість редепозитів має бути числом")
      .optional()
      .isInt({ min: 0 }),
    body(
      "unique_redep_count",
      "Кількість унікальних редепозитів має бути числом"
    )
      .optional()
      .isInt({ min: 0 }),
    body("notes", "Примітки мають бути рядком")
      .optional()
      .isString()
      .isLength({ max: 1000 }),
  ],
  flowStatsController.upsertFlowStat
);

/**
 * ОНОВЛЕНО: Отримання всіх потоків зі статистикою за певний день з фільтрацією користувачів
 * GET /api/flow-stats/daily/:year/:month/:day
 * Query params: partnerId, partnerIds[], status, teamId, userId, page, limit, includeUsers
 *
 * Права доступу:
 * - admin, bizdev, teamlead: можуть переглядати всю статистику та фільтрувати по користувачах
 * - buyer: бачить лише свою статистику
 */
router.get(
  "/daily/:year/:month/:day",
  [
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
    param("day", "День має бути числом між 1 та 31").isInt({ min: 1, max: 31 }),
    check("partnerId", "ID партнера має бути числом").optional().isInt(),
    check("partnerIds", "Масив ID партнерів має містити числа")
      .optional()
      .custom((value) => {
        if (typeof value === "string") {
          const ids = value.split(",").map((id) => parseInt(id.trim()));
          return ids.every((id) => Number.isInteger(id) && id > 0);
        }
        if (Array.isArray(value)) {
          return value.every(
            (id) => Number.isInteger(parseInt(id)) && parseInt(id) > 0
          );
        }
        return false;
      }),
    check("status", "Недійсний статус потоку")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    check("teamId", "ID команди має бути числом").optional().isInt(),
    check("userId", "ID користувача має бути числом").optional().isInt(),
    check("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
    check("page", "Номер сторінки має бути числом більше 0")
      .optional()
      .isInt({ min: 1 }),
    check("limit", "Ліміт має бути числом від 1 до 100")
      .optional()
      .isInt({ min: 1, max: 100 }),
    check("includeUsers", "includeUsers має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowStatsController.getDailyFlowsStats
);

/**
 * ОНОВЛЕНО: Отримання статистики користувача за місяць по днях
 * GET /api/flow-stats/user/:userId/monthly/:year/:month
 * @access Private/Admin/TeamLead/Bizdev/Own
 */
router.get(
  "/user/:userId/monthly/:year/:month",
  [
    param("userId", "ID користувача має бути числом").isInt({ min: 1 }),
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
  ],
  flowStatsController.getUserMonthlyStats
);

/**
 * ОНОВЛЕНО: Отримання статистики команди за місяць по днях
 * GET /api/flow-stats/team/:teamId/monthly/:year/:month
 * @access Private/Admin/TeamLead/Bizdev
 */
router.get(
  "/team/:teamId/monthly/:year/:month",
  [
    param("teamId", "ID команди має бути числом").isInt({ min: 1 }),
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
  ],
  flowStatsController.getTeamMonthlyStats
);

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для користувача
 * GET /api/flow-stats/user/:userId/flows/monthly/:year/:month
 * @access Private/Admin/TeamLead/Bizdev/Own
 */
router.get(
  "/user/:userId/flows/monthly/:year/:month",
  [
    param("userId", "ID користувача має бути числом").isInt({ min: 1 }),
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
  ],
  flowStatsController.getUserFlowsMonthlyStats
);

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для команди
 * GET /api/flow-stats/team/:teamId/flows/monthly/:year/:month
 * @access Private/Admin/TeamLead/Bizdev
 */
router.get(
  "/team/:teamId/flows/monthly/:year/:month",
  [
    param("teamId", "ID команди має бути числом").isInt({ min: 1 }),
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
  ],
  flowStatsController.getTeamFlowsMonthlyStats
);

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для команди
 * GET /api/flow-stats/team/:teamId/flows/monthly/:year/:month
 * @access Private/Admin/TeamLead/Bizdev
 */
router.get(
  "/company/flows/monthly/:year/:month",
  [
    param("teamId", "ID команди має бути числом").isInt({ min: 1 }),
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
  ],
  flowStatsController.getCompanyFlowsMonthlyStats
);

/**
 * ОНОВЛЕНО: Отримання загальної статистики компанії за місяць (P/L)
 * GET /api/flow-stats/company/monthly/:year/:month
 * @access Private/Admin
 */
router.get(
  "/company/monthly/:year/:month",
  [
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
  ],
  roleMiddleware("admin"),
  flowStatsController.getCompanyMonthlyStats
);

/**
 * @route   GET /api/company/daily-stats
 * @desc    Отримання денної статистики компанії за місяць
 * @access  Admin, Bizdev, Teamlead
 * @query   {number} month - Місяць (1-12)
 * @query   {number} year - Рік
 * @query   {string} [format=detailed] - Формат відповіді (detailed|summary)
 *
 * @example
 * GET /api/company/daily-stats?month=1&year=2024&format=detailed
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "company": { "name": "Company" },
 *     "period": { "month": 1, "year": 2024 },
 *     "daily_stats": [...],
 *     "summary": {...},
 *     "breakdowns": {...},
 *     "insights": {...}
 *   }
 * }
 */
router.get(
  "/company/daily-stats",
  roleMiddleware("admin", "bizdev"),
  flowStatsController.getCompanyDailyStats
);

/**
 * ОНОВЛЕНО: Отримання статистики потоку з фільтрацією по користувачах
 * GET /api/flow-stats/:flow_id
 * Query params: month, year, dateFrom, dateTo, user_id
 *
 * Права доступу:
 * - admin, bizdev, teamlead: можуть переглядати статистику всіх користувачів потоку
 * - buyer: бачить лише свою статистику
 */
router.get(
  "/:flow_id",
  [
    param("flow_id", "ID потоку має бути числом").isInt({ min: 1 }),
    check("month", "Місяць має бути числом між 1 та 12")
      .optional()
      .isInt({ min: 1, max: 12 }),
    check("year", "Рік має бути числом між 2020 та 2030")
      .optional()
      .isInt({ min: 2020, max: 2030 }),
    check("dateFrom", "Недійсна дата початку").optional().isDate(),
    check("dateTo", "Недійсна дата завершення").optional().isDate(),
    check("user_id", "ID користувача має бути числом")
      .optional()
      .isInt({ min: 1 }),
  ],
  flowStatsController.getFlowStats
);

/**
 * ОНОВЛЕНО: Отримання агрегованої статистики за період з фільтрацією по користувачах
 * GET /api/flow-stats/:flow_id/aggregated
 * Query params: month, year, dateFrom, dateTo, user_id
 */
router.get(
  "/:flow_id/aggregated",
  [
    param("flow_id", "ID потоку має бути числом").isInt({ min: 1 }),
    check("month", "Місяць має бути числом між 1 та 12")
      .optional()
      .isInt({ min: 1, max: 12 }),
    check("year", "Рік має бути числом між 2020 та 2030")
      .optional()
      .isInt({ min: 2020, max: 2030 }),
    check("dateFrom", "Недійсна дата початку").optional().isDate(),
    check("dateTo", "Недійсна дата завершення").optional().isDate(),
    check("user_id", "ID користувача має бути числом")
      .optional()
      .isInt({ min: 1 }),
  ],
  flowStatsController.getAggregatedStats
);

/**
 * ОНОВЛЕНО: Отримання календарної статистики за місяць з фільтрацією по користувачах
 * GET /api/flow-stats/:flow_id/calendar/:year/:month
 * Query params: user_id
 * Повертає всі дні місяця з даними або порожніми значеннями
 */
router.get(
  "/:flow_id/calendar/:year/:month",
  [
    param("flow_id", "ID потоку має бути числом").isInt({ min: 1 }),
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
    check("user_id", "ID користувача має бути числом")
      .optional()
      .isInt({ min: 1 }),
  ],
  flowStatsController.getMonthlyCalendarStats
);

/**
 * ОНОВЛЕНО: Видалення статистики за конкретний день з урахуванням user_id
 * DELETE /api/flow-stats/:flow_id/:user_id/:year/:month/:day
 *
 * Права доступу:
 * - admin, bizdev, teamlead: можуть видаляти статистику будь-якого користувача
 * - buyer: може видаляти лише свою статистику
 */
router.delete(
  "/:flow_id/:user_id/:year/:month/:day",
  [
    param("flow_id", "ID потоку має бути числом").isInt({ min: 1 }),
    param("user_id", "ID користувача має бути числом").isInt({ min: 1 }),
    param("year", "Рік має бути числом між 2020 та 2030").isInt({
      min: 2020,
      max: 2030,
    }),
    param("month", "Місяць має бути числом між 1 та 12").isInt({
      min: 1,
      max: 12,
    }),
    param("day", "День має бути числом між 1 та 31").isInt({ min: 1, max: 31 }),
  ],
  flowStatsController.deleteFlowStat
);

module.exports = router;
