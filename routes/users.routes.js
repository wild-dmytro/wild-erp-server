const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/users
 * @desc    Отримання списку всіх користувачів з фільтрацією та пагінацією
 * @access  Private/Admin/TeamLead
 */
router.get(
  "/",
  roleMiddleware(
    "admin",
    "teamlead",
    "bizdev",
    "affiliate_manager",
    "buyer",
    "integrator"
  ),
  usersController.getAllUsers
);

/**
 * @route   GET /api/users/:id
 * @desc    Отримання детальної інформації про користувача за ID
 * @access  Private/Admin/TeamLead/Self
 */
router.get(
  "/:id",
  roleMiddleware("admin", "teamlead", "bizdev", "affiliate_manager"),
  usersController.getUserById
);

/**
 * @route   POST /api/users
 * @desc    Створення нового користувача
 * @access  Private/Admin
 */
router.post(
  "/",
  roleMiddleware("admin"),
  [
    check("telegram_id", "Telegram ID є обов'язковим").notEmpty(),
    check("telegram_id", "Telegram ID має бути числом").isNumeric(),
    check("role", "Роль користувача є обов'язковою").notEmpty(),
    check("role", "Недійсна роль").isIn([
      "user",
      "teamlead",
      "finance_manager",
      "admin",
    ]),
  ],
  usersController.createUser
);

/**
 * @route   PUT /api/users/:id
 * @desc    Оновлення даних користувача
 * @access  Private/Admin/Self
 */
router.put("/:id", usersController.updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Деактивація користувача (встановлення is_active = false)
 * @access  Private/Admin
 */
router.delete("/:id", roleMiddleware("admin"), usersController.deactivateUser);

/**
 * @route   POST /api/users/:id/activate
 * @desc    Активація користувача (встановлення is_active = true)
 * @access  Private/Admin
 */
router.post(
  "/:id/activate",
  roleMiddleware("admin"),
  usersController.activateUser
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Зміна ролі користувача
 * @access  Private/Admin
 */
router.put(
  "/:id/role",
  roleMiddleware("admin"),
  [
    check("role", "Роль є обов'язковою").notEmpty(),
    check("role", "Недійсна роль").isIn([
      "user",
      "teamlead",
      "finance_manager",
      "admin",
    ]),
  ],
  usersController.updateUserRole
);

module.exports = router;
