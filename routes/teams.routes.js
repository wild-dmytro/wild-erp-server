const express = require('express');
const router = express.Router();
const teamsController = require('../controllers/teams.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/teams
 * @desc    Отримання списку всіх команд
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/',
  roleMiddleware('admin', 'teamlead', 'bizdev'),
  teamsController.getAllTeams
);

/**
 * @route   GET /api/teams/:id
 * @desc    Отримання детальної інформації про команду за ID
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/:id',
  roleMiddleware('admin', 'teamlead'),
  teamsController.getTeamById
);

/**
 * @route   POST /api/teams
 * @desc    Створення нової команди
 * @access  Private/Admin
 */
router.post(
  '/',
  roleMiddleware('admin'),
  [
    check('name', 'Назва команди є обов\'язковою').notEmpty(),
    check('name', 'Назва команди має бути рядком').isString()
  ],
  teamsController.createTeam
);

/**
 * @route   PUT /api/teams/:id
 * @desc    Оновлення назви команди
 * @access  Private/Admin
 */
router.put(
  '/:id',
  roleMiddleware('admin'),
  [
    check('name', 'Назва команди є обов\'язковою').notEmpty(),
    check('name', 'Назва команди має бути рядком').isString()
  ],
  teamsController.updateTeam
);

/**
 * @route   DELETE /api/teams/:id
 * @desc    Видалення команди
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin'),
  teamsController.deleteTeam
);

/**
 * @route   GET /api/teams/:id/stats
 * @desc    Отримання статистики команди за період
 * @access  Private/Admin/TeamLead
 */
router.get(
  '/:id/stats',
  roleMiddleware('admin', 'teamlead'),
  [
    check('startDate', 'Початкова дата має бути у форматі ISO').optional().isISO8601(),
    check('endDate', 'Кінцева дата має бути у форматі ISO').optional().isISO8601()
  ],
  teamsController.getTeamStats
);

/**
 * @route   GET /api/teams/details
 * @desc    Отримання всіх команд з детальною інформацією
 * @access  Private/Admin
 */
router.get(
  '/details',
  roleMiddleware('admin'),
  teamsController.getTeamsWithDetails
);

module.exports = router;