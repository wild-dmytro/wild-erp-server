const express = require('express');
const router = express.Router();
const agentsController = require('../controllers/agents.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/agents
 * @desc    Отримання списку всіх агентів з фільтрацією та пагінацією
 * @access  Private
 */
router.get(
  '/',
  agentsController.getAllAgents
);

/**
 * @route   GET /api/agents/stats
 * @desc    Отримання статистики використання агентів
 * @access  Private/Admin/Finance
 */
router.get(
  '/stats',
  roleMiddleware('admin', 'finance_manager', 'teamlead'),
  agentsController.getAgentsStats
);

/**
 * @route   GET /api/agents/:id
 * @desc    Отримання детальної інформації про агента за ID
 * @access  Private
 */
router.get(
  '/:id',
  agentsController.getAgentById
);

/**
 * @route   POST /api/agents
 * @desc    Створення нового агента
 * @access  Private/Admin/Finance
 */
router.post(
  '/',
  roleMiddleware('admin', 'finance_manager'),
  [
    check('name', 'Назва агента є обов\'язковою').notEmpty(),
    check('name', 'Назва агента має бути рядком').isString(),
    check('fee', 'Комісія має бути числом').optional().isNumeric(),
    check('is_active', 'Активність має бути булевим значенням').optional().isBoolean()
  ],
  agentsController.createAgent
);

/**
 * @route   PUT /api/agents/:id
 * @desc    Оновлення даних агента
 * @access  Private/Admin/Finance
 */
router.put(
  '/:id',
  roleMiddleware('admin', 'finance_manager'),
  [
    check('name', 'Назва агента має бути рядком').optional().isString(),
    check('fee', 'Комісія має бути числом').optional().isNumeric(),
    check('is_active', 'Активність має бути булевим значенням').optional().isBoolean()
  ],
  agentsController.updateAgent
);

/**
 * @route   PATCH /api/agents/:id/status
 * @desc    Оновлення статусу агента (активний/неактивний)
 * @access  Private/Admin/Finance
 */
router.patch(
  '/:id/status',
  roleMiddleware('admin', 'finance_manager'),
  [
    check('is_active', 'Статус є обов\'язковим').isBoolean()
  ],
  agentsController.updateAgentStatus
);

/**
 * @route   DELETE /api/agents/:id
 * @desc    Видалення агента
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin'),
  agentsController.deleteAgent
);

module.exports = router;