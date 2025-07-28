const express = require('express');
const router = express.Router();
const paymentMethodsController = require('../controllers/payment.methods.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/payment-methods
 * @desc    Отримання списку всіх способів оплати
 * @access  Private/Admin/Finance
 */
router.get(
  '/',
  roleMiddleware('admin', 'finance_manager', 'bizdev'),
  paymentMethodsController.getAll
);

/**
 * @route   GET /api/payment-methods/:id
 * @desc    Отримання детальної інформації про спосіб оплати за ID
 * @access  Private/Admin/Finance
 */
router.get(
  '/:id',
  roleMiddleware('admin', 'finance_manager', 'bizdev'),
  paymentMethodsController.getById
);

/**
 * @route   POST /api/payment-methods
 * @desc    Створення нового способу оплати
 * @access  Private/Admin/Finance
 */
router.post(
  '/',
  roleMiddleware('admin', 'finance_manager', 'bizdev'),
  [
    check('name', 'Назва способу оплати є обов\'язковою').notEmpty(),
    check('name', 'Назва способу оплати має бути рядком').isString(),
    check('description', 'Опис має бути рядком').optional().isString()
  ],
  paymentMethodsController.create
);

/**
 * @route   PUT /api/payment-methods/:id
 * @desc    Оновлення даних способу оплати
 * @access  Private/Admin/Finance
 */
router.put(
  '/:id',
  roleMiddleware('admin', 'finance_manager', 'bizdev'),
  [
    check('name', 'Назва способу оплати має бути рядком').optional().isString(),
    check('description', 'Опис має бути рядком').optional().isString()
  ],
  paymentMethodsController.update
);

/**
 * @route   PATCH /api/payment-methods/:id/status
 * @desc    Оновлення статусу способу оплати (активний/неактивний)
 * @access  Private/Admin/Finance
 */
router.patch(
  '/:id/status',
  roleMiddleware('admin', 'finance_manager', 'bizdev'),
  [
    check('is_active', 'Статус є обов\'язковим').isBoolean()
  ],
  paymentMethodsController.updateStatus
);

/**
 * @route   DELETE /api/payment-methods/:id
 * @desc    Видалення способу оплати
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  paymentMethodsController.delete
);

module.exports = router;