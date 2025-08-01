/**
 * Маршрути для роботи з потоками
 * Включає всі ендпоінти для CRUD операцій, роботи з користувачами, комунікаціями та статистикою
 */

const express = require("express");
const router = express.Router();
const flowController = require("../controllers/flows.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check, query } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * ОСНОВНІ CRUD ОПЕРАЦІЇ З ПОТОКАМИ
 */

router.get(
  "/",
  [
    query("page", "Номер сторінки має бути числом")
      .optional()
      .isInt({ min: 1 }),
    query("limit", "Ліміт має бути числом від 1 до 100")
      .optional()
      .isInt({ min: 1, max: 100 }),
    query("offerId", "ID оффера має бути числом").optional().isInt(),
    query("userId", "ID користувача має бути числом").optional().isInt(),
    query("geoId", "ID гео має бути числом").optional().isInt(),
    query("teamId", "ID команди має бути числом").optional().isInt(), // ДОДАНО
    query("partnerId", "ID партнера має бути числом").optional().isInt(),
    query("status", "Недійсний статус")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    query("currency", "Недійсна валюта")
      .optional()
      .isIn(["USD", "EUR", "GBP", "UAH"]),
    query("sortBy", "Недійсне поле сортування")
      .optional()
      .isIn(["created_at", "updated_at", "name", "cpa"]),
    query("sortOrder", "Недійсний порядок сортування")
      .optional()
      .isIn(["asc", "desc"]),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.getAllFlows
);

/**
 * @route   GET /api/flows/stats/overview
 * @desc    Отримання загальної статистики всіх потоків
 * @access  Private/Admin/TeamLead
 */
router.get(
  "/stats/overview",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    query("dateFrom", "Недійсна дата початку").optional().isDate(),
    query("dateTo", "Недійсна дата завершення").optional().isDate(),
    query("status", "Недійсний статус")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    query("partnerId", "ID партнера має бути числом").optional().isInt(),
    query("userIds", "userIds має бути масивом чисел")
      .optional()
      .custom((value) => {
        if (typeof value === 'string') {
          // Якщо передано як рядок, розбиваємо по комах
          const ids = value.split(',').map(id => parseInt(id.trim()));
          return ids.every(id => Number.isInteger(id) && id > 0);
        }
        if (Array.isArray(value)) {
          return value.every(id => Number.isInteger(parseInt(id)) && parseInt(id) > 0);
        }
        return false;
      }),
    query("teamIds", "teamIds має бути масивом чисел")
      .optional()
      .custom((value) => {
        if (typeof value === 'string') {
          // Якщо передано як рядок, розбиваємо по комах
          const ids = value.split(',').map(id => parseInt(id.trim()));
          return ids.every(id => Number.isInteger(id) && id > 0);
        }
        if (Array.isArray(value)) {
          return value.every(id => Number.isInteger(parseInt(id)) && parseInt(id) > 0);
        }
        return false;
      }),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.getAllFlowsStats
);

/**
 * @route   GET /api/flows/stats/by-partners
 * @desc    Отримання статистики потоків за партнерами
 * @access  Private/Admin/TeamLead/BizDev
 */
router.get(
  "/stats/by-partners",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    query("dateFrom", "Недійсна дата початку").optional().isDate(),
    query("dateTo", "Недійсна дата завершення").optional().isDate(),
    query("limit", "Ліміт має бути числом від 1 до 50")
      .optional()
      .isInt({ min: 1, max: 50 }),
  ],
  flowController.getFlowStatsByPartners
);

/**
 * @route   GET /api/flows/unread-count
 * @desc    Отримання кількості непрочитаних повідомлень користувача
 * @access  Private
 */
router.get(
  "/unread-count",
  [query("flowId", "ID потоку має бути числом").optional().isInt()],
  flowController.getUnreadMessagesCount
);

/**
 * @route   GET /api/flows/user/:userId
 * @desc    Отримання потоків користувача
 * @access  Private
 */
router.get(
  "/user/:userId",
  [
    check("userId", "ID користувача має бути числом").isInt(),
    query("status", "Недійсний статус")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
    query("limit", "Ліміт має бути числом від 1 до 100")
      .optional()
      .isInt({ min: 1, max: 100 }),
    query("offset", "Offset має бути числом").optional().isInt({ min: 0 }),
  ],
  flowController.getUserFlows
);

/**
 * @route   GET /api/flows/:id
 * @desc    Отримання детальної інформації про потік за ID
 * @access  Private
 */
router.get(
  "/:id",
  [check("id", "ID потоку має бути числом").isInt()],
  flowController.getFlowById
);

// Оновлена валідація для створення потоку
router.post(
  "/",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("name", "Назва потоку є обов'язковою").notEmpty().trim(),
    check("name", "Назва потоку має бути від 3 до 255 символів").isLength({
      min: 3,
      max: 255,
    }),
    check("offer_id", "ID оффера є обов'язковим").isInt(),
    check("geo_id", "ID гео має бути числом").optional().isInt(),
    check("team_id", "ID команди має бути числом").optional().isInt(),
    check("status", "Недійсний статус потоку")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    check("cpa", "CPA має бути числом").optional().isFloat({ min: 0 }),
    check("currency", "Недійсна валюта")
      .optional()
      .isIn(["USD", "EUR", "GBP", "UAH"]),
    check("is_active", "is_active має бути булевим значенням")
      .optional()
      .isBoolean(),
    check("start_date", "Недійсна дата початку").optional().isISO8601(),
    check("stop_date", "Недійсна дата завершення").optional().isISO8601(),
    check("conditions", "Умови мають бути рядком").optional().isString(),
    check("description", "Опис має бути рядком").optional().isString(),
    check("notes", "Нотатки мають бути рядком").optional().isString(),
    check("cap", "Cap має бути рядком").optional().isString(),
    check("kpi", "KPI має бути рядком").optional().isString(),
    check("landings", "Landings має бути рядком").optional().isString(), // ДОДАНО
  ],
  flowController.createFlow
);

// Оновлена валідація для оновлення потоку
router.put(
  "/:id",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("name", "Назва потоку має бути від 3 до 255 символів")
      .optional()
      .isLength({ min: 3, max: 255 }),
    check("offer_id", "ID оффера має бути числом").optional().isInt(),
    check("geo_id", "ID гео має бути числом").optional().isInt(),
    check("team_id", "ID команди має бути числом").optional().isInt(),
    check("status", "Недійсний статус потоку")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    check("cpa", "CPA має бути числом").optional().isFloat({ min: 0 }),
    check("currency", "Недійсна валюта")
      .optional()
      .isIn(["USD", "EUR", "GBP", "UAH"]),
    check("is_active", "is_active має бути булевим значенням")
      .optional()
      .isBoolean(),
    check("start_date", "Недійсна дата початку").optional().isISO8601(),
    check("stop_date", "Недійсна дата завершення").optional().isISO8601(),
    check("conditions", "Умови мають бути рядком").optional().isString(),
    check("description", "Опис має бути рядком").optional().isString(),
    check("notes", "Нотатки мають бути рядком").optional().isString(),
    check("cap", "Cap має бути рядком").optional().isString(),
    check("kpi", "KPI має бути рядком").optional().isString(),
    check("landings", "Landings має бути рядком").optional().isString(), // ДОДАНО
  ],
  flowController.updateFlow
);

/**
 * @route   DELETE /api/flows/:id
 * @desc    Видалення потоку
 * @access  Private/Admin/TeamLead
 */
router.delete(
  "/:id",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [check("id", "ID потоку має бути числом").isInt()],
  flowController.deleteFlow
);

/**
 * ОПЕРАЦІЇ ЗІ СТАТУСОМ ПОТОКІВ
 */

/**
 * @route   PATCH /api/flows/:id/status
 * @desc    Оновлення статусу потоку
 * @access  Private/Admin/TeamLead/BizDev
 */
router.patch(
  "/:id/status",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("status", "Статус є обов'язковим").notEmpty(),
    check("status", "Недійсний статус потоку").isIn([
      "active",
      "paused",
      "stopped",
      "pending",
    ]),
  ],
  flowController.updateFlowStatus
);

/**
 * @route   PATCH /api/flows/:id/active
 * @desc    Оновлення активності потоку
 * @access  Private/Admin/TeamLead/BizDev
 */
router.patch(
  "/:id/active",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("is_active", "is_active є обов'язковим").isBoolean(),
  ],
  flowController.updateFlowActiveStatus
);

/**
 * @route   POST /api/flows/bulk-status-update
 * @desc    Масове оновлення статусу потоків
 * @access  Private/Admin/TeamLead
 */
router.post(
  "/bulk-status-update",
  roleMiddleware("admin", "teamlead"),
  [
    check("flowIds", "Список ID потоків є обов'язковим").isArray({ min: 1 }),
    check("flowIds.*", "Кожний ID потоку має бути числом").isInt(),
    check("status", "Статус є обов'язковим").notEmpty(),
    check("status", "Недійсний статус потоку").isIn([
      "active",
      "paused",
      "stopped",
      "pending",
    ]),
  ],
  flowController.bulkUpdateFlowStatus
);

/**
 * РОБОТА З КОРИСТУВАЧАМИ ПОТОКІВ
 */

/**
 * @route   GET /api/flows/:id/users
 * @desc    Отримання користувачів потоку
 * @access  Private
 */
router.get(
  "/:id/users",
  [
    check("id", "ID потоку має бути числом").isInt(),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.getFlowUsers
);

// Оновлена валідація для додавання користувача до потоку
router.post(
  '/:id/users',
  roleMiddleware('admin', 'teamlead', 'bizdev'),
  [
    check('id', 'ID потоку має бути числом').isInt(),
    check('user_id', 'ID користувача є обов\'язковим').isInt(),
    check('status', 'Недійсний статус користувача').optional().isIn(['active', 'inactive', 'suspended']),
    check('notes', 'Нотатки мають бути рядком').optional().isString()
    // ВИДАЛЕНО валідацію percentage та individual_cpa
  ],
  flowController.addUserToFlow
);

// Оновлена валідація для оновлення користувача в потоці
router.put(
  '/:id/users/:userId',
  roleMiddleware('admin', 'teamlead', 'bizdev'),
  [
    check('id', 'ID потоку має бути числом').isInt(),
    check('userId', 'ID користувача має бути числом').isInt(),
    check('status', 'Недійсний статус користувача').optional().isIn(['active', 'inactive', 'suspended']),
    check('notes', 'Нотатки мають бути рядком').optional().isString()
    // ВИДАЛЕНО валідацію percentage та individual_cpa
  ],
  flowController.updateUserInFlow
);

/**
 * @route   DELETE /api/flows/:id/users/:userId
 * @desc    Видалення користувача з потоку
 * @access  Private/Admin/TeamLead/BizDev
 */
router.delete(
  "/:id/users/:userId",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("userId", "ID користувача має бути числом").isInt(),
  ],
  flowController.removeUserFromFlow
);

/**
 * @route   GET /api/flows/:id/access-check
 * @desc    Перевірка доступу користувача до потоку
 * @access  Private
 */
router.get(
  "/:id/access-check",
  [
    check("id", "ID потоку має бути числом").isInt(),
    query("userId", "ID користувача має бути числом").optional().isInt(),
  ],
  flowController.checkUserFlowAccess
);

/**
 * КОМУНІКАЦІЇ В ПОТОКАХ
 */

/**
 * @route   GET /api/flows/:id/communications
 * @desc    Отримання комунікацій потоку
 * @access  Private
 */
router.get(
  "/:id/communications",
  [
    check("id", "ID потоку має бути числом").isInt(),
    query("limit", "Ліміт має бути числом від 1 до 100")
      .optional()
      .isInt({ min: 1, max: 100 }),
    query("offset", "Offset має бути числом").optional().isInt({ min: 0 }),
    query("messageType", "Недійсний тип повідомлення")
      .optional()
      .isIn(["message", "notification", "announcement", "alert"]),
    query("unreadOnly", "unreadOnly має бути булевим значенням")
      .optional()
      .isBoolean(),
    query("recipientId", "ID отримувача має бути числом").optional().isInt(),
  ],
  flowController.getFlowCommunications
);

/**
 * @route   POST /api/flows/:id/messages
 * @desc    Надсилання повідомлення користувачеві в потоці
 * @access  Private/Admin/TeamLead/BizDev
 */
router.post(
  "/:id/messages",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("recipient_id", "ID отримувача є обов'язковим").isInt(),
    check("message_type", "Недійсний тип повідомлення")
      .optional()
      .isIn(["message", "notification", "announcement", "alert"]),
    check("subject", "Тема має бути рядком")
      .optional()
      .isString()
      .isLength({ max: 255 }),
    check("message", "Повідомлення є обов'язковим").notEmpty().isString(),
    // check("priority", "Недійсний пріоритет")
    //   .optional()
    //   .isIn(["low", "normal", "high", "urgent"]),
    check("is_urgent", "is_urgent має бути булевим значенням")
      .optional()
      .isBoolean(),
    check("attachments", "Вкладення мають бути об'єктом").optional().isObject(),
  ],
  flowController.sendMessageToUser
);

/**
 * @route   POST /api/flows/:id/notifications
 * @desc    Надсилання оповіщення всім користувачам потоку
 * @access  Private/Admin/TeamLead/BizDev
 */
router.post(
  "/:id/notifications",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("message_type", "Недійсний тип повідомлення")
      .optional()
      .isIn(["notification", "announcement", "alert"]),
    check("subject", "Тема має бути рядком")
      .optional()
      .isString()
      .isLength({ max: 255 }),
    check("message", "Повідомлення є обов'язковим").notEmpty().isString(),
    // check("priority", "Недійсний пріоритет")
    //   .optional()
    //   .isIn(["low", "normal", "high", "urgent"]),
    check("is_urgent", "is_urgent має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.sendNotificationToAllUsers
);

/**
 * @route   PATCH /api/flows/messages/:messageId/read
 * @desc    Позначення повідомлення як прочитаного
 * @access  Private
 */
router.patch(
  "/messages/:messageId/read",
  [check("messageId", "ID повідомлення має бути числом").isInt()],
  flowController.markMessageAsRead
);

/**
 * СТАТИСТИКА ПОТОКІВ
 */

/**
 * @route   GET /api/flows/:id/stats
 * @desc    Отримання статистики потоку за період
 * @access  Private
 */
router.get(
  "/:id/stats",
  [
    check("id", "ID потоку має бути числом").isInt(),
    query("dateFrom", "Недійсна дата початку").optional().isDate(),
    query("dateTo", "Недійсна дата завершення").optional().isDate(),
    query("userId", "ID користувача має бути числом").optional().isInt(),
    query("groupBy", "Недійсне групування")
      .optional()
      .isIn(["day", "week", "month"]),
  ],
  flowController.getFlowStats
);

/**
 * @route   POST /api/flows/:id/stats
 * @desc    Додавання/оновлення статистики потоку
 * @access  Private/Admin/TeamLead/BizDev
 */
router.post(
  "/:id/stats",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("user_id", "ID користувача має бути числом").optional().isInt(),
    check("date_from", "Дата початку є обов'язковою").isDate(),
    check("date_to", "Дата завершення є обов'язковою").isDate(),
    check("clicks", "Кліки мають бути числом").optional().isInt({ min: 0 }),
    check("conversions", "Конверсії мають бути числом")
      .optional()
      .isInt({ min: 0 }),
    check("revenue", "Дохід має бути числом").optional().isFloat({ min: 0 }),
    check("impressions", "Покази мають бути числом")
      .optional()
      .isInt({ min: 0 }),
    check("leads", "Ліди мають бути числом").optional().isInt({ min: 0 }),
  ],
  flowController.upsertFlowStats
);

/**
 * @route   GET /api/flows/:id/top-users
 * @desc    Отримання топ користувачів потоку за метрикою
 * @access  Private/Admin/TeamLead/BizDev
 */
router.get(
  "/:id/top-users",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    query("metric", "Недійсна метрика")
      .optional()
      .isIn(["revenue", "conversions", "clicks", "leads"]),
    query("dateFrom", "Недійсна дата початку").optional().isDate(),
    query("dateTo", "Недійсна дата завершення").optional().isDate(),
    query("limit", "Ліміт має бути числом від 1 до 50")
      .optional()
      .isInt({ min: 1, max: 50 }),
  ],
  flowController.getTopUsersByMetric
);

/**
 * ДОДАТКОВІ МАРШРУТИ ДЛЯ РОБОТИ З КОМАНДАМИ
 * Додати ці маршрути до flows.routes.js
 */

/**
 * @route   GET /api/flows/team/:teamId
 * @desc    Отримання потоків команди
 * @access  Private/Admin/TeamLead
 */
router.get(
  "/team/:teamId",
  roleMiddleware("admin", "teamlead"),
  [
    check("teamId", "ID команди має бути числом").isInt(),
    query("status", "Недійсний статус")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
    query("limit", "Ліміт має бути числом від 1 до 100")
      .optional()
      .isInt({ min: 1, max: 100 }),
    query("offset", "Offset має бути числом").optional().isInt({ min: 0 }),
  ],
  flowController.getFlowsByTeam
);

/**
 * @route   GET /api/flows/stats/by-teams
 * @desc    Отримання статистики потоків по командах
 * @access  Private/Admin/TeamLead
 */
router.get(
  "/stats/by-teams",
  roleMiddleware("admin", "teamlead"),
  [
    query("dateFrom", "Недійсна дата початку").optional().isDate(),
    query("dateTo", "Недійсна дата завершення").optional().isDate(),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.getFlowStatsByTeams
);

/**
 * @route   PATCH /api/flows/:id/transfer-team
 * @desc    Перенесення потоку до іншої команди
 * @access  Private/Admin/TeamLead
 */
router.patch(
  "/:id/transfer-team",
  roleMiddleware("admin", "teamlead"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("team_id", "ID команди є обов'язковим").isInt(),
  ],
  flowController.transferFlowToTeam
);

/**
 * @route   POST /api/flows/bulk-transfer-team
 * @desc    Масове перенесення потоків до команди
 * @access  Private/Admin/TeamLead
 */
router.post(
  "/bulk-transfer-team",
  roleMiddleware("admin", "teamlead"),
  [
    check("flowIds", "Список ID потоків є обов'язковим").isArray({ min: 1 }),
    check("flowIds.*", "Кожний ID потоку має бути числом").isInt(),
    check("team_id", "ID команди є обов'язковим").isInt(),
  ],
  flowController.bulkTransferFlowsToTeam
);

module.exports = router;
