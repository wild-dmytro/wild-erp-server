/**
 * Маршрути для роботи з запитами користувачів
 * Включає валідацію, авторизацію та контроль доступу
 */
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

// Middleware
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Контролери
const requestsController = require('../controllers/bizdev.requests.controller.js');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

// Валідатори
const createRequestValidators = [
  body('name')
    .notEmpty()
    .withMessage('Назва запиту є обов\'язковою')
    .isLength({ min: 3, max: 255 })
    .withMessage('Назва має бути від 3 до 255 символів'),
  
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Опис не може перевищувати 2000 символів'),
  
  body('type')
    .isIn(['INFO', 'OFFER'])
    .withMessage('Тип має бути INFO або OFFER'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Недійсний пріоритет'),
  
  body('deadline')
    .optional()
    .isISO8601()
    .withMessage('Недійсний формат дедлайну')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Дедлайн має бути в майбутньому');
      }
      return true;
    }),
  
  body('assigned_to')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Недійсний ID призначеного користувача'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Теги мають бути масивом')
];

const updateRequestValidators = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Недійсний ID запиту'),
  
  body('name')
    .optional()
    .isLength({ min: 3, max: 255 })
    .withMessage('Назва має бути від 3 до 255 символів'),
  
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Опис не може перевищувати 2000 символів'),
  
  body('type')
    .optional()
    .isIn(['INFO', 'OFFER'])
    .withMessage('Тип має бути INFO або OFFER'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Недійсний пріоритет'),
  
  body('deadline')
    .optional()
    .isISO8601()
    .withMessage('Недійсний формат дедлайну'),
  
  body('assigned_to')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Недійсний ID призначеного користувача')
];

const updateStatusValidators = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Недійсний ID запиту'),
  
  body('status')
    .isIn(['pending', 'in_progress', 'completed', 'cancelled', 'on_hold'])
    .withMessage('Недійсний статус'),
  
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Причина не може перевищувати 500 символів')
];

// МАРШРУТИ ДЛЯ ЗАПИТІВ

/**
 * @route   GET /api/requests/stats
 * @desc    Отримання статистики запитів
 * @access  Private (All authenticated users)
 */
router.get('/stats', requestsController.getStats);

/**
 * @route   GET /api/requests/my
 * @desc    Отримання запитів поточного користувача
 * @access  Private (All authenticated users)
 */
router.get('/my', requestsController.getMyRequests);

/**
 * @route   GET /api/requests
 * @desc    Отримання списку всіх запитів з фільтрацією
 * @access  Private (All authenticated users, but filtered by role)
 */
router.get('/', requestsController.getAllRequests);

/**
 * @route   POST /api/requests
 * @desc    Створення нового запиту
 * @access  Private (All authenticated users)
 */
router.post('/', createRequestValidators, requestsController.createRequest);

/**
 * @route   GET /api/requests/:id
 * @desc    Отримання деталей запиту за ID
 * @access  Private (Creator, Assignee, Admin, TeamLead)
 */
router.get('/:id', 
  param('id').isInt({ min: 1 }).withMessage('Недійсний ID запиту'),
  requestsController.getRequestDetails
);

/**
 * @route   PUT /api/requests/:id
 * @desc    Оновлення запиту
 * @access  Private (Creator, Admin, TeamLead)
 */
router.put('/:id', updateRequestValidators, requestsController.updateRequestDetails);

/**
 * @route   PATCH /api/requests/:id/status
 * @desc    Оновлення статусу запиту
 * @access  Private (Creator, Assignee, Admin, TeamLead)
 */
router.patch('/:id/status', updateStatusValidators, requestsController.updateStatus);

/**
 * @route   DELETE /api/requests/:id
 * @desc    Видалення запиту
 * @access  Private (Creator, Admin, TeamLead)
 */
router.delete('/:id', 
  param('id').isInt({ min: 1 }).withMessage('Недійсний ID запиту'),
  requestsController.deleteRequestById
);

// Middleware для обробки загальних помилок
router.use((error, req, res, next) => {
  console.error('Помилка в маршрутах requests:', error);
  res.status(500).json({
    success: false,
    message: 'Внутрішня помилка сервера',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;