/**
 * Маршрути авторизації
 * Обробляє запити для реєстрації, логіну та управління користувачами
 */
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

/**
 * @route   POST /api/auth/register
 * @desc    Реєстрація нового користувача
 * @access  Public
 */
router.post(
  '/register',
  [
    body('username', 'Ім\'я користувача обов\'язкове').notEmpty().trim(),
    body('email', 'Введіть коректний email').isEmail().normalizeEmail(),
    body('password', 'Пароль повинен містити не менше 6 символів').isLength({ min: 6 })
  ],
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Вхід користувача
 * @access  Public
 */
router.post(
  '/login',
  [
    body('username', 'Ім\'я користувача або email обов\'язкові').notEmpty().trim(),
    body('password', 'Пароль обов\'язковий').notEmpty()
  ],
  authController.login
);

/**
 * @route   GET /api/auth/me
 * @desc    Отримання інформації про поточного користувача
 * @access  Private
 */
router.get('/me', authMiddleware, authController.getCurrentUser);

/**
 * @route   PUT /api/auth/password
 * @desc    Зміна пароля
 * @access  Private
 */
router.put(
  '/password',
  [
    authMiddleware,
    body('currentPassword', 'Поточний пароль обов\'язковий').notEmpty(),
    body('newPassword', 'Новий пароль повинен містити не менше 6 символів').isLength({ min: 6 })
  ],
  authController.changePassword
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Оновлення профілю
 * @access  Private
 */
router.put(
  '/profile',
  [
    authMiddleware,
    body('email', 'Введіть коректний email').optional().isEmail().normalizeEmail(),
    body('first_name').optional().trim(),
    body('last_name').optional().trim()
  ],
  authController.updateProfile
);

/**
 * @route   GET /api/auth/users
 * @desc    Отримання списку всіх користувачів (тільки для адміністраторів)
 * @access  Private/Admin
 */
router.get(
  '/users',
  [
    authMiddleware,
    roleMiddleware('admin')
  ],
  authController.getAllUsers
);

/**
 * @route   DELETE /api/auth/users/:id
 * @desc    Видалення користувача (тільки для адміністраторів)
 * @access  Private/Admin
 */
router.delete(
  '/users/:id',
  [
    authMiddleware,
    roleMiddleware('admin')
  ],
  authController.deleteUser
);

module.exports = router;