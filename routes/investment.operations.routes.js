const express = require("express");
const router = express.Router();
const investmentOperationsController = require("../controllers/investment.operations.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/investment-operations
 * @desc    Отримання списку всіх інвестиційних операцій з фільтрацією та пагінацією
 * @access  Private/Admin/Finance
 */
router.get(
  "/",
  roleMiddleware("admin", "finance_manager"),
  investmentOperationsController.getAllOperations
);

/**
 * @route   GET /api/investment-operations/stats
 * @desc    Отримання статистики інвестиційних операцій
 * @access  Private/Admin/Finance
 */
router.get(
  "/stats",
  roleMiddleware("admin", "finance_manager"),
  investmentOperationsController.getOperationsStats
);

/**
 * @route   GET /api/investment-operations/stats/monthly
 * @desc    Отримання місячної статистики інвестиційних операцій
 * @access  Private/Admin/Finance
 */
router.get(
  "/stats/monthly",
  roleMiddleware("admin", "finance_manager"),
  investmentOperationsController.getMonthlyStats
);

/**
 * @route   GET /api/investment-operations/:id
 * @desc    Отримання детальної інформації про операцію за ID
 * @access  Private/Admin/Finance
 */
router.get(
  "/:id",
  roleMiddleware("admin", "finance_manager"),
  investmentOperationsController.getOperationById
);

/**
 * @route   POST /api/investment-operations
 * @desc    Створення нової інвестиційної операції
 * @access  Private/Admin/Finance
 */
router.post(
  "/",
  roleMiddleware("admin", "finance_manager"),
  [
    check("operation_date", "Дата операції є обов'язковою")
      .notEmpty()
      .isDate()
      .withMessage("Дата операції має бути у форматі YYYY-MM-DD"),
    check("amount", "Сума операції є обов'язковою")
      .notEmpty()
      .isFloat({ min: 0.01 })
      .withMessage("Сума операції має бути позитивним числом"),
    check("operation_type", "Тип операції є обов'язковим")
      .notEmpty()
      .isIn(["incoming", "outgoing"])
      .withMessage("Тип операції має бути incoming або outgoing"),
    check("operator", "Оператор є обов'язковим")
      .notEmpty()
      .isIn(["maks_founder", "ivan_partner"])
      .withMessage("Оператор має бути maks_founder або ivan_partner"),
    check("network", "Недійсна мережа")
      .optional()
      .isIn(["TRC-20", "ERC-20", "BEP-20", "Bitcoin", "Polygon", "Arbitrum"]),
    check("token", "Недійсний токен")
      .optional()
      .isIn(["USDT", "USDC", "ETH", "BTC", "BNB", "MATIC", "TRX"]),
    check("transaction_hash", "Хеш транзакції має бути рядком")
      .optional()
      .isString()
      .isLength({ min: 10, max: 255 })
      .withMessage("Хеш транзакції має бути від 10 до 255 символів"),
    check("wallet_address", "Адреса гаманця має бути рядком")
      .optional()
      .isString()
      .isLength({ min: 10, max: 255 })
      .withMessage("Адреса гаманця має бути від 10 до 255 символів"),
    check("additional_fees", "Додаткові комісії мають бути числом")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Додаткові комісії мають бути невід'ємним числом"),
    check("notes", "Примітки мають бути рядком")
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage("Примітки не можуть перевищувати 1000 символів"),
  ],
  investmentOperationsController.createOperation
);

/**
 * @route   PUT /api/investment-operations/:id
 * @desc    Оновлення інвестиційної операції
 * @access  Private/Admin/Finance
 */
router.put(
  "/:id",
  roleMiddleware("admin", "finance_manager"),
  [
    check("operation_date", "Дата операції має бути валідною")
      .optional()
      .isDate()
      .withMessage("Дата операції має бути у форматі YYYY-MM-DD"),
    check("amount", "Сума операції має бути позитивним числом")
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage("Сума операції має бути позитивним числом"),
    check("operation_type", "Недійсний тип операції")
      .optional()
      .isIn(["incoming", "outgoing"])
      .withMessage("Тип операції має бути incoming або outgoing"),
    check("operator", "Недійсний оператор")
      .optional()
      .isIn(["maks_founder", "ivan_partner"])
      .withMessage("Оператор має бути maks_founder або ivan_partner"),
    check("network", "Недійсна мережа")
      .optional()
      .isIn(["TRC-20", "ERC-20", "BEP-20", "Bitcoin", "Polygon", "Arbitrum"]),
    check("token", "Недійсний токен")
      .optional()
      .isIn(["USDT", "USDC", "ETH", "BTC", "BNB", "MATIC", "TRX"]),
    check("transaction_hash", "Хеш транзакції має бути рядком")
      .optional()
      .isString()
      .isLength({ min: 10, max: 255 })
      .withMessage("Хеш транзакції має бути від 10 до 255 символів"),
    check("wallet_address", "Адреса гаманця має бути рядком")
      .optional()
      .isString()
      .isLength({ min: 10, max: 255 })
      .withMessage("Адреса гаманця має бути від 10 до 255 символів"),
    check("additional_fees", "Додаткові комісії мають бути числом")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Додаткові комісії мають бути невід'ємним числом"),
    check("notes", "Примітки мають бути рядком")
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage("Примітки не можуть перевищувати 1000 символів"),
  ],
  investmentOperationsController.updateOperation
);

/**
 * @route   DELETE /api/investment-operations/:id
 * @desc    Видалення інвестиційної операції
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  roleMiddleware("admin"),
  investmentOperationsController.deleteOperation
);

module.exports = router;
