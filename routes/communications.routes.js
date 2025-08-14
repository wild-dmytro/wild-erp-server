// =====================================
// routes/communications.routes.js
// Основні маршрути для комунікацій
// =====================================

const express = require('express');
const router = express.Router();
const communicationsController = require('../controllers/communications.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { body, param, query } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * Валідація для створення комунікації
 */
const validateCreateCommunication = [
  param('contextType')
    .isIn(['flow', 'bizdev_request'])
    .withMessage('Тип контексту повинен бути flow або bizdev_request'),
  param('contextId')
    .isInt({ min: 1 })
    .withMessage('ID контексту повинен бути позитивним числом'),
  body('message')
    .notEmpty()
    .withMessage('Повідомлення є обов\'язковим')
    .isLength({ max: 4000 })
    .withMessage('Повідомлення не може перевищувати 4000 символів'),
  body('message_type')
    .optional()
    .isIn(['message', 'comment', 'system', 'notification'])
    .withMessage('Недійсний тип повідомлення'),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Недійсний пріоритет'),
  body('subject')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Тема не може перевищувати 255 символів'),
  body('recipient_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ID отримувача повинен бути позитивним числом'),
  body('is_urgent')
    .optional()
    .isBoolean()
    .withMessage('is_urgent повинен бути булевим значенням'),
  body('is_internal')
    .optional()
    .isBoolean()
    .withMessage('is_internal повинен бути булевим значенням')
];

/**
 * Валідація для редагування комунікації
 */
const validateEditCommunication = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID комунікації повинен бути позитивним числом'),
  body('message')
    .notEmpty()
    .withMessage('Повідомлення є обов\'язковим')
    .isLength({ max: 4000 })
    .withMessage('Повідомлення не може перевищувати 4000 символів')
];

/**
 * Валідація для отримання комунікацій за контекстом
 */
const validateGetByContext = [
  param('contextType')
    .isIn(['flow', 'bizdev_request'])
    .withMessage('Тип контексту повинен бути flow або bizdev_request'),
  param('contextId')
    .isInt({ min: 1 })
    .withMessage('ID контексту повинен бути позитивним числом'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Номер сторінки повинен бути позитивним числом'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт повинен бути від 1 до 100'),
  query('sort_by')
    .optional()
    .isIn(['created_at', 'updated_at', 'priority', 'message_type'])
    .withMessage('Недійсне поле для сортування'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC'])
    .withMessage('Порядок сортування повинен бути ASC або DESC')
];

/**
 * Валідація для пошуку
 */
const validateSearch = [
  query('q')
    .notEmpty()
    .withMessage('Пошуковий запит є обов\'язковим')
    .isLength({ min: 2 })
    .withMessage('Пошуковий запит повинен містити мінімум 2 символи'),
  query('context_type')
    .optional()
    .isIn(['flow', 'bizdev_request'])
    .withMessage('Тип контексту повинен бути flow або bizdev_request'),
  query('context_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ID контексту повинен бути позитивним числом')
];

/**
 * Валідація для масового позначення як прочитаних
 */
const validateMarkMultipleAsRead = [
  body('communication_ids')
    .isArray({ min: 1 })
    .withMessage('Необхідно вказати масив ID комунікацій'),
  body('communication_ids.*')
    .isInt({ min: 1 })
    .withMessage('Кожен ID комунікації повинен бути позитивним числом')
];

// =====================================
// ОСНОВНІ МАРШРУТИ
// =====================================

/**
 * @route   GET /api/communications/search
 * @desc    Пошук комунікацій
 * @access  Private
 */
router.get(
  '/search',
  validateSearch,
  communicationsController.searchCommunications
);

/**
 * @route   PATCH /api/communications/mark-read
 * @desc    Масове позначення комунікацій як прочитаних
 * @access  Private
 */
router.patch(
  '/mark-read',
  validateMarkMultipleAsRead,
  communicationsController.markMultipleAsRead
);

/**
 * @route   POST /api/communications/:contextType/:contextId
 * @desc    Створення нової комунікації
 * @access  Private
 */
router.post(
  '/:contextType/:contextId',
  validateCreateCommunication,
  communicationsController.addCommunication
);

/**
 * @route   GET /api/communications/:contextType/:contextId
 * @desc    Отримання комунікацій за контекстом
 * @access  Private
 */
router.get(
  '/:contextType/:contextId',
  validateGetByContext,
  communicationsController.getCommunicationsByContext
);

/**
 * @route   GET /api/communications/:contextType/:contextId/stats
 * @desc    Отримання статистики комунікацій
 * @access  Private
 */
router.get(
  '/:contextType/:contextId/stats',
  [
    param('contextType').isIn(['flow', 'bizdev_request']),
    param('contextId').isInt({ min: 1 })
  ],
  communicationsController.getCommunicationStats
);

/**
 * @route   GET /api/communications/:id
 * @desc    Отримання комунікації за ID
 * @access  Private
 */
router.get(
  '/:id',
  [param('id').isInt({ min: 1 })],
  communicationsController.getCommunicationById
);

/**
 * @route   PUT /api/communications/:id
 * @desc    Редагування комунікації
 * @access  Private
 */
router.put(
  '/:id',
  validateEditCommunication,
  communicationsController.editCommunication
);

/**
 * @route   DELETE /api/communications/:id
 * @desc    Видалення комунікації
 * @access  Private
 */
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 })],
  communicationsController.deleteCommunication
);

/**
 * @route   PATCH /api/communications/:id/read
 * @desc    Позначення комунікації як прочитаної
 * @access  Private
 */
router.patch(
  '/:id/read',
  [param('id').isInt({ min: 1 })],
  communicationsController.markAsRead
);

module.exports = router;