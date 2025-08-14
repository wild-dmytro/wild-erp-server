const express = require("express");
const router = express.Router();
const partnerPayoutController = require("../controllers/partner.payout.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/partner-payouts
 * @desc    Отримання списку всіх заявок на виплату з фільтрацією та пагінацією
 * @access  Private/Admin/BizDev/Finance
 */
router.get(
  "/",
  roleMiddleware("admin", "bizdev", "teamlead", "finance_manager"),
  partnerPayoutController.getAllPayoutRequests
);

/**
 * @route   GET /api/partner-payouts/stats
 * @desc    Отримання статистики заявок на виплату
 * @access  Private/Admin/BizDev/Finance
 */
router.get(
  "/stats",
  roleMiddleware("admin", "bizdev", "teamlead", "finance_manager"),
  partnerPayoutController.getPayoutRequestsStats
);

/**
 * @route   GET /api/partner-payouts/:id
 * @desc    Отримання детальної інформації про заявку за ID
 * @access  Private/Admin/BizDev/Finance
 */
router.get(
  "/:id",
  roleMiddleware("admin", "bizdev", "finance_manager"),
  partnerPayoutController.getPayoutRequestById
);

/**
 * @route   POST /api/partner-payouts
 * @desc    Створення нової заявки на виплату
 * @access  Private/Admin/BizDev
 */
router.post(
  "/",
  roleMiddleware("admin", "bizdev"),
  [
    check("partner_id", "ID партнера є обов'язковим").notEmpty().isInt(),
    check("team_id", "ID команди має бути числом").optional().isInt(),
    check("period_start", "Дата початку періоду є обов'язковою")
      .notEmpty()
      .isISO8601(),
    check("period_end", "Дата закінчення періоду є обов'язковою")
      .notEmpty()
      .isISO8601(),
    check("currency", "Недійсна валюта").optional().isIn(["USD", "EUR", "GBP"]),
    check("description", "Опис має бути рядком").optional().isString(),
    check("notes", "Примітки мають бути рядком").optional().isString(),
    check("total_amount", "Сума заявки має бути числом").optional().isNumeric(),
    check("wallet_address", "Адреса гаманця має бути рядком")
      .optional()
      .isString(),
    check("network", "Недійсна мережа")
      .optional()
      .isIn(["TRC-20", "ERC-20", "BEP-20", "Polygon", "Arbitrum"]),
    check("flows", "Потоки мають бути масивом").optional().isArray(),
    check("flows.*.flow_id", "ID потоку має бути числом").optional().isInt(),
    check("flows.*.flow_amount", "Сума потоку має бути числом")
      .optional()
      .isNumeric(),
    check("flows.*.conversion_count", "Кількість конверсій має бути числом")
      .optional()
      .isInt(),
    check("flows.*.notes", "Примітки до потоку мають бути рядком")
      .optional()
      .isString(),
  ],
  partnerPayoutController.createPayoutRequest
);

/**
 * @route   PUT /api/partner-payouts/:id
 * @desc    Оновлення даних заявки на виплату
 * @access  Private/Admin/BizDev
 */
router.put(
  "/:id",
  roleMiddleware("admin", "bizdev"),
  [
    check("team_id", "ID команди має бути числом").optional().isInt(),
    check("period_start", "Дата початку періоду має бути валідною")
      .optional()
      .isISO8601(),
    check("period_end", "Дата закінчення періоду має бути валідною")
      .optional()
      .isISO8601(),
    check("currency", "Недійсна валюта").optional().isIn(["USD", "EUR", "GBP"]),
    check("description", "Опис має бути рядком").optional().isString(),
    check("notes", "Примітки мають бути рядком").optional().isString(),
    check("wallet_address", "Адреса гаманця має бути рядком")
      .optional()
      .isString(),
    check("total_amount", "Сума заявки має бути числом").optional().isNumeric(),
    check("network", "Недійсна мережа")
      .optional()
      .isIn(["TRC-20", "ERC-20", "BEP-20", "Polygon", "Arbitrum"]),
    check("flows", "Потоки мають бути масивом").optional().isArray(),
    check("flows.*.flow_id", "ID потоку має бути числом").optional().isInt(),
    check("flows.*.flow_amount", "Сума потоку має бути числом")
      .optional()
      .isNumeric(),
    check("flows.*.conversion_count", "Кількість конверсій має бути числом")
      .optional()
      .isInt(),
    check("flows.*.notes", "Примітки до потоку мають бути рядком")
      .optional()
      .isString(),
  ],
  partnerPayoutController.updatePayoutRequest
);

/**
 * @route   PATCH /api/partner-payouts/:id/status
 * @desc    Оновлення статусу заявки на виплату
 * @access  Private/Admin/BizDev/Finance
 */
router.patch(
  "/:id/status",
  roleMiddleware("admin", "bizdev", "finance_manager"),
  [
    check("status", "Статус є обов'язковим").notEmpty(),
    check("status", "Недійсний статус заявки").isIn([
      "draft",
      "pending",
      "approved",
      "in_payment",
      "completed",
      "rejected",
      "cancelled",
    ]),
  ],
  partnerPayoutController.updatePayoutRequestStatus
);

/**
 * @route   DELETE /api/partner-payouts/:id
 * @desc    Видалення заявки на виплату
 * @access  Private/Admin/BizDev
 */
router.delete(
  "/:id",
  roleMiddleware("admin", "bizdev"),
  partnerPayoutController.deletePayoutRequest
);

/**
 * @route   GET /api/partner-payouts/stats/monthly
 * @desc    Отримання помісячної статистики заявок на виплату
 * @access  Private/Admin/BizDev/Finance
 */
router.get(
  "/stats/monthly",
  roleMiddleware("admin", "bizdev", "finance_manager"),
  [
    check("year", "Рік має бути числом між 2020 та 2030")
      .optional()
      .isInt({ min: 2020, max: 2030 }),
    check("teamId", "ID команди має бути позитивним числом")
      .optional()
      .isInt({ min: 1 }),
    check("partnerId", "ID партнера має бути позитивним числом")
      .optional()
      .isInt({ min: 1 }),
    check("status", "Недійсний статус заявки")
      .optional()
      .isIn([
        "draft",
        "pending",
        "approved",
        "in_payment",
        "completed",
        "rejected",
        "cancelled",
      ]),
  ],
  partnerPayoutController.getMonthlyPayoutStats
);

module.exports = router;
