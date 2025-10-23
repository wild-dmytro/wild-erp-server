const express = require("express");
const router = express.Router();
const brandsController = require("../controllers/brands.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/brands
 * @desc    Отримання списку всіх брендів
 * @access  Private/Admin/BizDev
 */
router.get(
  "/",
  roleMiddleware(
    "admin",
    "teamlead",
    "bizdev",
    "buyer",
    "affiliate_manager",
    "integrator"
  ),
  brandsController.getAll
);

/**
 * @route   GET /api/brands/:id
 * @desc    Отримання детальної інформації про бренд за ID
 * @access  Private/Admin/BizDev
 */
router.get("/:id", roleMiddleware("admin", "bizdev"), brandsController.getById);

/**
 * @route   POST /api/brands
 * @desc    Створення нового бренда
 * @access  Private/Admin/BizDev
 */
router.post(
  "/",
  roleMiddleware("admin", "bizdev"),
  [
    check("name", "Назва бренда є обов'язковою").notEmpty(),
    check("name", "Назва бренда має бути рядком").isString(),
    check("description", "Опис має бути рядком").optional().isString(),
  ],
  brandsController.create
);

/**
 * @route   PUT /api/brands/:id
 * @desc    Оновлення даних бренда
 * @access  Private/Admin/BizDev
 */
router.put(
  "/:id",
  roleMiddleware("admin", "bizdev"),
  [
    check("name", "Назва бренда має бути рядком").optional().isString(),
    check("description", "Опис має бути рядком").optional().isString(),
  ],
  brandsController.update
);

/**
 * @route   PATCH /api/brands/:id/status
 * @desc    Оновлення статусу бренда (активний/неактивний)
 * @access  Private/Admin/BizDev
 */
router.patch(
  "/:id/status",
  roleMiddleware("admin", "bizdev"),
  [check("is_active", "Статус є обов'язковим").isBoolean()],
  brandsController.updateStatus
);

/**
 * @route   DELETE /api/brands/:id
 * @desc    Видалення бренда
 * @access  Private/Admin
 */
router.delete("/:id", roleMiddleware("admin"), brandsController.delete);

module.exports = router;
