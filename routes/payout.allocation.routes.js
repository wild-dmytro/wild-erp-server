/**
 * Маршрути для роботи з розподілом коштів заявок на виплату
 * routes/payout.allocation.routes.js
 */

const express = require("express");
const router = express.Router();
const { body } = require("express-validator");

const payoutAllocationController = require("../controllers/payout.allocation.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

// Валідація для створення розподілу
const createAllocationValidation = [
  body("user_id")
    .isInt({ min: 1 })
    .withMessage("ID користувача має бути позитивним числом"),
  body("flow_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("ID потоку має бути позитивним числом"),
  body("allocated_amount")
    .isFloat({ min: 0.01 })
    .withMessage("Сума розподілу має бути більше 0"),
  body("percentage")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Відсоток має бути від 0 до 100"),
  body("description")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Опис не може перевищувати 500 символів"),
  body("notes")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Нотатки не можуть перевищувати 1000 символів"),
];

// Валідація для масового створення розподілів
const bulkAllocationValidation = [
  body("allocations")
    .isArray({ min: 1 })
    .withMessage("Розподіли мають бути передані як непустий масив"),
  body("allocations.*.user_id")
    .isInt({ min: 1 })
    .withMessage("ID користувача має бути позитивним числом"),
  body("allocations.*.flow_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("ID потоку має бути позитивним числом"),
  body("allocations.*.allocated_amount")
    .isFloat({ min: 0.01 })
    .withMessage("Сума розподілу має бути більше 0"),
  body("allocations.*.percentage")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Відсоток має бути від 0 до 100"),
];

// Отримання користувачів для розподілу коштів
// GET /api/payout-allocations/:payoutRequestId/users
router.get(
  "/:payoutRequestId/users",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  payoutAllocationController.getUsersForAllocation
);

// Отримання всіх розподілів для заявки
// GET /api/payout-allocations/:payoutRequestId
router.get(
  "/:payoutRequestId",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  payoutAllocationController.getAllocationsByPayoutRequest
);

// Створення розподілу коштів
// POST /api/payout-allocations/:payoutRequestId
router.post(
  "/:payoutRequestId",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  createAllocationValidation,
  payoutAllocationController.createAllocation
);

// Масове створення/оновлення розподілів
// POST /api/payout-allocations/:payoutRequestId/bulk
router.post(
  "/:payoutRequestId/bulk",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  bulkAllocationValidation,
  payoutAllocationController.bulkUpsertAllocations
);

// Оновлення розподілу коштів
// PUT /api/payout-allocations/allocation/:allocationId
router.put(
  "/allocation/:allocationId",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  payoutAllocationController.updateAllocation
);

// Видалення розподілу коштів
// DELETE /api/payout-allocations/allocation/:allocationId
router.delete(
  "/allocation/:allocationId",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  payoutAllocationController.deleteAllocation
);

// Підтвердження всіх розподілів для заявки
// POST /api/payout-allocations/:payoutRequestId/confirm
router.post(
  "/:payoutRequestId/confirm",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  payoutAllocationController.confirmAllAllocations
);

// Отримання статистики розподілів для заявки
// GET /api/payout-allocations/:payoutRequestId/stats
router.get(
  "/:payoutRequestId/stats",
  authMiddleware,
  roleMiddleware("admin", "teamlead", "bizdev"),
  payoutAllocationController.getAllocationStats
);

module.exports = router;