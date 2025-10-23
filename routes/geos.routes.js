const express = require("express");
const router = express.Router();
const geosController = require("../controllers/geo.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/geos
 * @desc    Отримання списку всіх гео
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
  geosController.getAll
);

/**
 * @route   GET /api/geos/:id
 * @desc    Отримання детальної інформації про гео за ID
 * @access  Private/Admin/BizDev
 */
router.get("/:id", roleMiddleware("admin", "bizdev"), geosController.getById);

/**
 * @route   POST /api/geos
 * @desc    Створення нового гео
 * @access  Private/Admin/BizDev
 */
router.post(
  "/",
  roleMiddleware("admin", "bizdev"),
  [
    check("name", "Назва гео є обов'язковою").notEmpty(),
    check("name", "Назва гео має бути рядком").isString(),
    check("country_code", "Код країни має бути рядком довжиною 2 символи")
      .optional()
      .isLength({ min: 2, max: 2 }),
    check("region", "Регіон має бути рядком").optional().isString(),
  ],
  geosController.create
);

/**
 * @route   PUT /api/geos/:id
 * @desc    Оновлення даних гео
 * @access  Private/Admin/BizDev
 */
router.put(
  "/:id",
  roleMiddleware("admin", "bizdev"),
  [
    check("name", "Назва гео має бути рядком").optional().isString(),
    check("country_code", "Код країни має бути рядком довжиною 2 символи")
      .optional()
      .isLength({ min: 2, max: 2 }),
    check("region", "Регіон має бути рядком").optional().isString(),
  ],
  geosController.update
);

/**
 * @route   PATCH /api/geos/:id/status
 * @desc    Оновлення статусу гео (активний/неактивний)
 * @access  Private/Admin/BizDev
 */
router.patch(
  "/:id/status",
  roleMiddleware("admin", "bizdev"),
  [check("is_active", "Статус є обов'язковим").isBoolean()],
  geosController.updateStatus
);

/**
 * @route   DELETE /api/geos/:id
 * @desc    Видалення гео
 * @access  Private/Admin
 */
router.delete("/:id", roleMiddleware("admin"), geosController.delete);

module.exports = router;
