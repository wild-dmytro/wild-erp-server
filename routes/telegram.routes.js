// server/routes/telegram.routes.js
const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegram.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/telegram/broadcasts
 * @desc    Отримання списку всіх розсилок з пагінацією
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/broadcasts',
  roleMiddleware('admin', 'teamlead'),
  telegramController.getAllBroadcasts
);

/**
 * @route   GET /api/telegram/broadcasts/stats
 * @desc    Отримання статистики розсилок
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/broadcasts/stats',
  roleMiddleware('admin', 'teamlead'),
  telegramController.getBroadcastsStats
);

/**
 * @route   GET /api/telegram/broadcasts/:id
 * @desc    Отримання детальної інформації про розсилку за ID
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/broadcasts/:id',
  roleMiddleware('admin', 'teamlead'),
  telegramController.getBroadcastById
);

/**
 * @route   POST /api/telegram/broadcasts
 * @desc    Створення нової розсилки
 * @access  Private/Admin/TeamLead
 */
router.post(
  '/broadcasts',
  roleMiddleware('admin', 'teamlead'),
  [
    check('title', 'Назва розсилки є обов\'язковою').notEmpty().trim(),
    check('title', 'Назва розсилки має бути не більше 255 символів').isLength({ max: 255 }),
    check('message', 'Повідомлення є обов\'язковим').notEmpty().trim(),
    check('message', 'Повідомлення має бути не більше 4096 символів').isLength({ max: 4096 }),
    check('target_type', 'Тип цільової аудиторії є обов\'язковим').notEmpty(),
    check('target_type', 'Недійсний тип цільової аудиторії').isIn(['all', 'department', 'team', 'specific_users']),
    check('target_departments', 'Відділи мають бути масивом чисел').optional().isArray(),
    check('target_departments.*', 'ID відділу має бути числом').optional().isInt(),
    check('target_teams', 'Команди мають бути масивом чисел').optional().isArray(),
    check('target_teams.*', 'ID команди має бути числом').optional().isInt(),
    check('target_users', 'Користувачі мають бути масивом чисел').optional().isArray(),
    check('target_users.*', 'ID користувача має бути числом').optional().isInt()
  ],
  telegramController.createBroadcast
);

/**
 * @route   POST /api/telegram/broadcasts/:id/execute
 * @desc    Виконання розсилки
 * @access  Private/Admin/TeamLead
 */
router.post(
  '/broadcasts/:id/execute',
  roleMiddleware('admin', 'teamlead'),
  telegramController.executeBroadcast
);

/**
 * @route   POST /api/telegram/send
 * @desc    Створення та виконання розсилки одним запитом
 * @access  Private/Admin/TeamLead
 */
router.post(
  '/send',
  roleMiddleware('admin', 'teamlead'),
  [
    check('title', 'Назва розсилки є обов\'язковою').notEmpty().trim(),
    check('title', 'Назва розсилки має бути не більше 255 символів').isLength({ max: 255 }),
    check('message', 'Повідомлення є обов\'язковим').notEmpty().trim(),
    check('message', 'Повідомлення має бути не більше 4096 символів').isLength({ max: 4096 }),
    check('target_type', 'Тип цільової аудиторії є обов\'язковим').notEmpty(),
    check('target_type', 'Недійсний тип цільової аудиторії').isIn(['all', 'department', 'team', 'specific_users']),
    check('target_departments', 'Відділи мають бути масивом чисел').optional().isArray(),
    check('target_departments.*', 'ID відділу має бути числом').optional().isInt(),
    check('target_teams', 'Команди мають бути масивом чисел').optional().isArray(),
    check('target_teams.*', 'ID команди має бути числом').optional().isInt(),
    check('target_users', 'Користувачі мають бути масивом чисел').optional().isArray(),
    check('target_users.*', 'ID користувача має бути числом').optional().isInt()
  ],
  telegramController.sendBroadcast
);

/**
 * @route   POST /api/telegram/recipients/preview
 * @desc    Отримання попереднього перегляду списку отримувачів
 * @access  Private/Admin/TeamLead
 */
router.post(
  '/recipients/preview',
  roleMiddleware('admin', 'teamlead'),
  [
    check('target_type', 'Тип цільової аудиторії є обов\'язковим').notEmpty(),
    check('target_type', 'Недійсний тип цільової аудиторії').isIn(['all', 'department', 'team', 'specific_users']),
    check('target_departments', 'Відділи мають бути масивом чисел').optional().isArray(),
    check('target_departments.*', 'ID відділу має бути числом').optional().isInt(),
    check('target_teams', 'Команди мають бути масивом чисел').optional().isArray(),
    check('target_teams.*', 'ID команди має бути числом').optional().isInt(),
    check('target_users', 'Користувачі мають бути масивом чисел').optional().isArray(),
    check('target_users.*', 'ID користувача має бути числом').optional().isInt()
  ],
  telegramController.getRecipientsPreview
);

module.exports = router;