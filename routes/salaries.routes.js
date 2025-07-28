const express = require("express");
const router = express.Router();
const salariesController = require("../controllers/salaries.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/salaries
 * @desc    Отримання списку всіх зарплат з фільтрацією та пагінацією
 * @access  Private
 */
router.get("/", salariesController.getAllSalaries);

/**
 * @route   GET /api/salaries/stats
 * @desc    Отримання статистики зарплат
 * @access  Private/Admin/Finance/TeamLead
 */
router.get(
  "/stats",
  roleMiddleware("admin", "finance_manager", "teamlead"),
  salariesController.getSalaryStats
);

/**
 * @route   GET /api/salaries/templates
 * @desc    Отримання всіх шаблонів зарплат
 * @access  Private/Admin/Finance/TeamLead
 */
router.get(
  "/templates",
  roleMiddleware("admin", "finance_manager", "teamlead"),
  salariesController.getAllSalaryTemplates
);

/**
 * @route   GET /api/salaries/templates/:id
 * @desc    Отримання шаблону зарплати для користувача
 * @access  Private
 */
router.get("/templates/:id", salariesController.getSalaryTemplate);

/**
 * @route   GET /api/salaries/:id
 * @desc    Отримання детальної інформації про зарплату за ID
 * @access  Private
 */
router.get("/:id", salariesController.getSalaryById);

/**
 * @route   POST /api/salaries
 * @desc    Створення нової зарплати
 * @access  Private/Admin/Finance
 */
router.post(
  "/",
  roleMiddleware("admin", "finance_manager"),
  [
    check("user_id", "ID користувача є обов'язковим").notEmpty().isInt(),
    check("amount", "Сума зарплати є обов'язковою")
      .notEmpty()
      .isFloat({ min: 0 }),
    check("month", "Місяць має бути числом від 1 до 12").isInt({
      min: 1,
      max: 12,
    }),
    check("year", "Рік має бути числом").isInt({ min: 2000, max: 2100 }),
    check("description", "Опис має бути рядком").optional().isString(),
  ],
  salariesController.createSalary
);

/**
 * @route   PUT /api/salaries/:id
 * @desc    Оновлення зарплати
 * @access  Private/Admin/Finance
 */
router.put(
  "/:id",
  roleMiddleware("admin", "finance_manager"),
  [
    check("amount", "Сума зарплати має бути числом")
      .optional()
      .isFloat({ min: 0 }),
    check("description", "Опис має бути рядком").optional().isString(),
  ],
  salariesController.updateSalary
);

/**
 * @route   PATCH /api/salaries/:id/status
 * @desc    Зміна статусу зарплати
 * @access  Private/Admin/Finance
 */
router.patch(
  "/:id/status",
  roleMiddleware("admin", "finance_manager"),
  [
    check("status", "Статус є обов'язковим")
      .notEmpty()
      .isIn(["pending", "approved", "rejected", "paid"]),
    check("transaction_hash", "Хеш транзакції має бути рядком")
      .optional()
      .isString(),
    check("network", "Мережа має бути рядком").optional().isString(),
  ],
  salariesController.updateSalaryStatus
);

/**
 * @route   DELETE /api/salaries/:id
 * @desc    Видалення зарплати
 * @access  Private/Admin
 */
router.delete("/:id", roleMiddleware("admin"), salariesController.deleteSalary);

/**
 * @route   POST /api/salaries/generate
 * @desc    Генерація зарплат для користувачів
 * @access  Private/Admin/Finance
 */
router.post(
  "/generate",
  roleMiddleware("admin", "finance_manager"),
  [
    check("month", "Місяць є обов'язковим")
      .notEmpty()
      .isInt({ min: 1, max: 12 }),
    check("year", "Рік є обов'язковим")
      .notEmpty()
      .isInt({ min: 2000, max: 2100 }),
    check("teamId", "ID команди має бути числом").optional().isInt(),
    check("departmentId", "ID відділу має бути числом").optional().isInt(),
  ],
  salariesController.generateSalaries
);

/**
 * @route   PUT /api/salaries/templates/:id
 * @desc    Створення або оновлення шаблону зарплати
 * @access  Private/Admin/Finance
 */
router.put(
  "/templates/:id",
  roleMiddleware("admin", "finance_manager"),
  [
    check("base_amount", "Базова сума зарплати є обов'язковою")
      .notEmpty()
      .isFloat({ min: 0 }),
  ],
  salariesController.createOrUpdateSalaryTemplate
);

/**
 * @route   PUT /api/salaries/wallet/:id
 * @desc    Оновлення адреси гаманця користувача для зарплати
 * @access  Private
 */
router.put(
  "/wallet/:id",
  [
    check("wallet_address", "Адреса гаманця є обов'язковою")
      .notEmpty()
      .isString(),
  ],
  salariesController.updateUserSalaryWallet
);

module.exports = router;
