const express = require('express');
const router = express.Router();
const expenseTypesController = require('../controllers/expense.types.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/expense-types
 * @desc    Отримання списку всіх типів витрат
 * @access  Private
 */
router.get(
  '/',
  expenseTypesController.getAllExpenseTypes
);

/**
 * @route   GET /api/expense-types/:id
 * @desc    Отримання детальної інформації про тип витрати за ID
 * @access  Private
 */
router.get(
  '/:id',
  expenseTypesController.getExpenseTypeById
);

/**
 * @route   POST /api/expense-types
 * @desc    Створення нового типу витрати
 * @access  Private/Admin/Finance
 */
router.post(
  '/',
  roleMiddleware('admin', 'finance_manager'),
  [
    check('name', 'Назва типу є обов\'язковою').notEmpty(),
    check('name', 'Назва типу має бути рядком').isString(),
    check('description', 'Опис має бути рядком').optional().isString()
  ],
  expenseTypesController.createExpenseType
);

/**
 * @route   PUT /api/expense-types/:id
 * @desc    Оновлення даних типу витрати
 * @access  Private/Admin/Finance
 */
router.put(
  '/:id',
  roleMiddleware('admin', 'finance_manager'),
  [
    check('name', 'Назва типу має бути рядком').optional().isString(),
    check('description', 'Опис має бути рядком').optional().isString()
  ],
  expenseTypesController.updateExpenseType
);

/**
 * @route   PATCH /api/expense-types/:id/status
 * @desc    Оновлення статусу типу витрати (активний/неактивний)
 * @access  Private/Admin/Finance
 */
router.patch(
  '/:id/status',
  roleMiddleware('admin', 'finance_manager'),
  [
    check('is_active', 'Статус є обов\'язковим').isBoolean()
  ],
  expenseTypesController.updateExpenseTypeStatus
);

/**
 * @route   DELETE /api/expense-types/:id
 * @desc    Видалення типу витрати
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin'),
  expenseTypesController.deleteExpenseType
);

module.exports = router;