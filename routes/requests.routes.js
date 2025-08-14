const express = require("express");
const router = express.Router();
const requestsController = require("../controllers/requests.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/requests
 * @desc    Отримання списку всіх заявок з фільтрацією та пагінацією
 * @access  Private
 */
router.get(
  "/",
  roleMiddleware("admin", "finance_manager", "teamlead", "buyer"),
  requestsController.getAllRequests
);

/**
 * @route   GET /api/requests/expenses
 * @desc    Отримання всіх витрат (розхідники) з фільтрацією та пагінацією
 * @access  Private/Admin/Finance/Teamlead
 */
router.get(
  "/expenses",
  roleMiddleware("admin", "finance_manager", "teamlead"),
  requestsController.getAllExpenses
);

/**
 * @route   GET /api/requests/agent-refills
 * @desc    Отримання всіх поповнень агентів з фільтрацією та пагінацією
 * @access  Private/Admin/Finance/Teamlead
 */
router.get(
  "/agent-refills",
  roleMiddleware("admin", "finance_manager", "teamlead"),
  requestsController.getAllAgentRefills
);

/**
 * @route   PUT /api/requests/:id/agent-refill
 * @desc    Оновлення деталей заявки на поповнення агента
 * @access  Private
 */
router.put(
  "/:id/agent-refill",
  [
    check("amount", "Сума має бути числом").optional().isNumeric(),
    check("server", "Сервер має бути рядком").optional().isString(),
    check("wallet_address", "Адреса гаманця має бути рядком")
      .optional()
      .isString(),
    check("network", "Мережа має бути рядком").optional().isString(),
    check("transaction_hash", "Хеш транзакції має бути рядком")
      .optional()
      .isString(),
    check("fee", "Комісія має бути числом").optional().isNumeric(),
  ],
  requestsController.updateAgentRefillRequest
);

/**
 * @route   PUT /api/requests/:id/expense
 * @desc    Оновлення деталей заявки на витрати
 * @access  Private
 */
router.put(
  "/:id/expense",
  [
    check("purpose", "Призначення платежу має бути рядком")
      .optional()
      .isString(),
    check("seller_service", "Продавець/сервіс має бути рядком")
      .optional()
      .isString(),
    check("amount", "Сума має бути числом").optional().isNumeric(),
    check("network", "Мережа має бути рядком").optional().isString(),
    check("wallet_address", "Адреса гаманця має бути рядком")
      .optional()
      .isString(),
    check(
      "need_transaction_time",
      "Потреба у часі транзакції має бути логічним значенням"
    )
      .optional()
      .isBoolean(),
    check("transaction_time", "Час транзакції має бути рядком")
      .optional()
      .isString(),
    check(
      "need_transaction_hash",
      "Потреба у хеші транзакції має бути логічним значенням"
    )
      .optional()
      .isBoolean(),
    check("transaction_hash", "Хеш транзакції має бути рядком")
      .optional()
      .isString(),
    check("expense_type_id", "ID типу витрати має бути числом")
      .optional()
      .isNumeric(),
  ],
  requestsController.updateExpenseRequest
);

/**
 * @route   PATCH /api/requests/:id/status
 * @desc    Оновлення статусу заявки
 * @access  Private
 */
router.patch(
  "/:id/status",
  [
    check("status", "Статус є обов'язковим").notEmpty(),
    check("status", "Недійсний статус").isIn([
      "pending",
      "approved_by_teamlead",
      "rejected_by_teamlead",
      "approved_by_finance",
      "rejected_by_finance",
      "completed",
      "cancelled",
    ]),
  ],
  requestsController.updateRequestStatus
);

/**
 * @route   DELETE /api/requests/:id
 * @desc    Скасування (видалення) заявки
 * @access  Private
 */
router.delete("/:id", requestsController.deleteRequest);

/**
 * @route   GET /api/requests/:id
 * @desc    Отримання детальної інформації про заявку за ID
 * @access  Private
 */
router.get("/:id", requestsController.getRequestById);

module.exports = router;
