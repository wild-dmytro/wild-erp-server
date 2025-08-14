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
  roleMiddleware('admin', 'teamlead', 'bizdev', 'buyer'),
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

module.exports = router;