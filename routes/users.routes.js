const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/users
 * @desc    Отримання списку всіх користувачів з фільтрацією та пагінацією
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/',
  roleMiddleware('admin', 'teamlead', 'bizdev'),
  usersController.getAllUsers
);

/**
 * @route   GET /api/users/:id
 * @desc    Отримання детальної інформації про користувача за ID
 * @access  Private/Admin/TeamLead/Self
 */
router.get(
  '/:id',
  usersController.getUserById
);

/**
 * @route   POST /api/users
 * @desc    Створення нового користувача
 * @access  Private/Admin
 */
router.post(
  '/',
  roleMiddleware('admin'),
  [
    check('telegram_id', 'Telegram ID є обов\'язковим').notEmpty(),
    check('telegram_id', 'Telegram ID має бути числом').isNumeric(),
    check('role', 'Роль користувача є обов\'язковою').notEmpty(),
    check('role', 'Недійсна роль').isIn(['user', 'teamlead', 'finance_manager', 'admin'])
  ],
  usersController.createUser
);

/**
 * @route   PUT /api/users/:id
 * @desc    Оновлення даних користувача
 * @access  Private/Admin/Self
 */
router.put(
  '/:id',
  usersController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Деактивація користувача (встановлення is_active = false)
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin'),
  usersController.deactivateUser
);

/**
 * @route   POST /api/users/:id/activate
 * @desc    Активація користувача (встановлення is_active = true)
 * @access  Private/Admin
 */
router.post(
  '/:id/activate',
  roleMiddleware('admin'),
  usersController.activateUser
);

/**
 * @route   PUT /api/users/:id/team
 * @desc    Призначення користувача до команди
 * @access  Private/Admin
 */
router.put(
  '/:id/team',
  roleMiddleware('admin'),
  [
    check('team_id', 'ID команди є обов\'язковим').notEmpty(),
    check('team_id', 'ID команди має бути числом').isNumeric()
  ],
  usersController.assignUserToTeam
);

/**
 * @route   PUT /api/users/:id/department
 * @desc    Призначення користувача до відділу
 * @access  Private/Admin
 */
router.put(
  '/:id/department',
  roleMiddleware('admin'),
  [
    check('department_id', 'ID відділу є обов\'язковим').notEmpty(),
    check('department_id', 'ID відділу має бути числом').isNumeric()
  ],
  usersController.assignUserToDepartment
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Зміна ролі користувача
 * @access  Private/Admin
 */
router.put(
  '/:id/role',
  roleMiddleware('admin'),
  [
    check('role', 'Роль є обов\'язковою').notEmpty(),
    check('role', 'Недійсна роль').isIn(['user', 'teamlead', 'finance_manager', 'admin'])
  ],
  usersController.updateUserRole
);

/**
 * @route   GET /api/users/team/:teamId
 * @desc    Отримання всіх користувачів команди
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/team/:teamId',
  roleMiddleware('admin', 'teamlead'),
  usersController.getUsersByTeam
);

/**
 * @route   GET /api/users/department/:departmentId
 * @desc    Отримання всіх користувачів відділу
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/department/:departmentId',
  roleMiddleware('admin', 'teamlead'),
  usersController.getUsersByDepartment
);

/**
 * @route   GET /api/users/role/:role
 * @desc    Отримання всіх користувачів з певною роллю
 * @access  Private/Admin
 */
router.get(
  '/role/:role',
  roleMiddleware('admin'),
  usersController.getUsersByRole
);

/**
 * @route   GET /api/users/search
 * @desc    Пошук користувачів за іменем, прізвищем або username
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/search',
  roleMiddleware('admin', 'teamlead'),
  usersController.searchUsers
);

/**
 * @route   GET /api/users/stats
 * @desc    Отримання статистики користувачів (кількість за ролями, активних/неактивних)
 * @access  Private/Admin
 */
router.get(
  '/stats/summary',
  roleMiddleware('admin'),
  usersController.getUserStats
);

module.exports = router;