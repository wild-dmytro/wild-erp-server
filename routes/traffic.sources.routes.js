const express = require('express');
const router = express.Router();
const trafficSourcesController = require('../controllers/traffic.sources.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/traffic-sources
 * @desc    Отримання списку всіх джерел трафіку
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/',
  roleMiddleware('admin', 'teamlead', 'bizdev'),
  trafficSourcesController.getAll
);

/**
 * @route   GET /api/traffic-sources/:id
 * @desc    Отримання детальної інформації про джерело трафіку за ID
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/:id',
  roleMiddleware('admin', 'teamlead', 'bizdev'),
  trafficSourcesController.getById
);

/**
 * @route   POST /api/traffic-sources
 * @desc    Створення нового джерела трафіку
 * @access  Private/Admin
 */
router.post(
  '/',
  roleMiddleware('admin', 'bizdev'),
  [
    check('name', 'Назва джерела трафіку є обов\'язковою').notEmpty(),
    check('name', 'Назва джерела трафіку має бути рядком').isString(),
    check('description', 'Опис має бути рядком').optional().isString()
  ],
  trafficSourcesController.create
);

/**
 * @route   PUT /api/traffic-sources/:id
 * @desc    Оновлення даних джерела трафіку
 * @access  Private/Admin
 */
router.put(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  [
    check('name', 'Назва джерела трафіку має бути рядком').optional().isString(),
    check('description', 'Опис має бути рядком').optional().isString()
  ],
  trafficSourcesController.update
);

/**
 * @route   PATCH /api/traffic-sources/:id/status
 * @desc    Оновлення статусу джерела трафіку (активний/неактивний)
 * @access  Private/Admin
 */
router.patch(
  '/:id/status',
  roleMiddleware('admin', 'bizdev'),
  [
    check('is_active', 'Статус є обов\'язковим').isBoolean()
  ],
  trafficSourcesController.updateStatus
);

/**
 * @route   DELETE /api/traffic-sources/:id
 * @desc    Видалення джерела трафіку
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  trafficSourcesController.delete
);

module.exports = router;