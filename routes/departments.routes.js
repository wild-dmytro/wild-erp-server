const express = require("express");
const router = express.Router();
const departmentsController = require("../controllers/departments.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/departments
 * @desc    Отримання списку всіх відділів
 * @access  Private/Admin/TeamLead
 */
router.get(
  "/",
  roleMiddleware("admin", "bizdev", "teamlead", "affiliate_manager"),
  departmentsController.getAllDepartments
);

/**
 * @route   GET /api/departments/:id
 * @desc    Отримання детальної інформації про відділ за ID
 * @access  Private/Admin/TeamLead
 */
router.get(
  "/:id",
  roleMiddleware("admin", "teamlead"),
  departmentsController.getDepartmentById
);

/**
 * @route   POST /api/departments
 * @desc    Створення нового відділу
 * @access  Private/Admin
 */
router.post(
  "/",
  roleMiddleware("admin"),
  [
    check("name", "Назва відділу є обов'язковою").notEmpty(),
    check("name", "Назва відділу має бути рядком").isString(),
    check("description", "Опис має бути рядком").optional().isString(),
  ],
  departmentsController.createDepartment
);

/**
 * @route   PUT /api/departments/:id
 * @desc    Оновлення даних відділу
 * @access  Private/Admin
 */
router.put(
  "/:id",
  roleMiddleware("admin"),
  [
    check("name", "Назва відділу має бути рядком").optional().isString(),
    check("description", "Опис має бути рядком").optional().isString(),
  ],
  departmentsController.updateDepartment
);

/**
 * @route   PATCH /api/departments/:id/status
 * @desc    Оновлення статусу відділу (активний/неактивний)
 * @access  Private/Admin
 */
router.patch(
  "/:id/status",
  roleMiddleware("admin"),
  [check("is_active", "Статус є обов'язковим").isBoolean()],
  departmentsController.updateDepartmentStatus
);

/**
 * @route   DELETE /api/departments/:id
 * @desc    Видалення відділу
 * @access  Private/Admin
 */
router.delete(
  "/:id",
  roleMiddleware("admin"),
  departmentsController.deleteDepartment
);

module.exports = router;
