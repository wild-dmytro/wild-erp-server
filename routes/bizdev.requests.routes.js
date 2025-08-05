/**
 * Маршрути для роботи з запитами користувачів
 * Включає валідацію, авторизацію та контроль доступу
 */
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const multer = require('multer');
const path = require('path');

// Middleware
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Контролери
const requestsController = require('../controllers/bizdev.requests.controller.js');
const communicationsController = require('../controllers/bizdev.communications.controller.js');

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/attachments/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB максимум
  },
  fileFilter: (req, file, cb) => {
    // Дозволені типи файлів
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|xlsx|xls|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Недозволений тип файлу'));
    }
  }
});

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

const addMessageValidators = [
  param('requestId')
    .isInt({ min: 1 })
    .withMessage('Недійсний ID запиту'),
  
  body('message')
    .notEmpty()
    .withMessage('Повідомлення не може бути порожнім')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Повідомлення має бути від 1 до 2000 символів'),
  
  body('message_type')
    .optional()
    .isIn(['comment', 'status_change', 'assignment', 'file_upload', 'system'])
    .withMessage('Недійсний тип повідомлення'),
  
  body('is_internal')
    .optional()
    .isBoolean()
    .withMessage('is_internal має бути булевим значенням')
];

const editMessageValidators = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Недійсний ID повідомлення'),
  
  body('message')
    .notEmpty()
    .withMessage('Повідомлення не може бути порожнім')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Повідомлення має бути від 1 до 2000 символів')
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

// МАРШРУТИ ДЛЯ КОМУНІКАЦІЇ

/**
 * @route   GET /api/requests/:requestId/communications
 * @desc    Отримання всіх повідомлень по запиту
 * @access  Private (Creator, Assignee, Admin, TeamLead)
 */
router.get('/:requestId/communications',
  param('requestId').isInt({ min: 1 }).withMessage('Недійсний ID запиту'),
  communicationsController.getMessages
);

/**
 * @route   POST /api/requests/:requestId/communications
 * @desc    Додавання нового повідомлення до запиту
 * @access  Private (All authenticated users)
 */
router.post('/:requestId/communications',
  addMessageValidators,
  communicationsController.addMessage
);

/**
 * @route   GET /api/requests/:requestId/communications/stats
 * @desc    Отримання статистики комунікації по запиту
 * @access  Private (Creator, Assignee, Admin, TeamLead)
 */
router.get('/:requestId/communications/stats',
  param('requestId').isInt({ min: 1 }).withMessage('Недійсний ID запиту'),
  communicationsController.getStats
);

/**
 * @route   GET /api/communications/:id
 * @desc    Отримання деталей повідомлення
 * @access  Private (Based on message access rights)
 */
router.get('/communications/:id',
  param('id').isInt({ min: 1 }).withMessage('Недійсний ID повідомлення'),
  communicationsController.getMessageDetails
);

/**
 * @route   PUT /api/communications/:id
 * @desc    Редагування повідомлення
 * @access  Private (Message author, Admin, TeamLead)
 */
router.put('/communications/:id',
  editMessageValidators,
  communicationsController.editMessage
);

/**
 * @route   DELETE /api/communications/:id
 * @desc    Видалення повідомлення
 * @access  Private (Message author, Admin, TeamLead)
 */
router.delete('/communications/:id',
  param('id').isInt({ min: 1 }).withMessage('Недійсний ID повідомлення'),
  communicationsController.deleteMessage
);

/**
 * @route   POST /api/communications/:id/attachments
 * @desc    Завантаження файлового вкладення до повідомлення
 * @access  Private (Message author, Admin, TeamLead)
 */
router.post('/communications/:id/attachments',
  param('id').isInt({ min: 1 }).withMessage('Недійсний ID повідомлення'),
  upload.single('attachment'),
  communicationsController.uploadAttachment
);

/**
 * @route   POST /api/communications/search
 * @desc    Пошук повідомлень
 * @access  Private (Admin, TeamLead for internal search)
 */
router.post('/communications/search',
  body('query')
    .notEmpty()
    .withMessage('Пошуковий запит є обов\'язковим')
    .isLength({ min: 3 })
    .withMessage('Пошуковий запит має містити щонайменше 3 символи'),
  communicationsController.searchMessages
);

// Middleware для обробки помилок завантаження файлів
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Файл занадто великий. Максимальний розмір: 10MB'
      });
    }
  }
  
  if (error.message === 'Недозволений тип файлу') {
    return res.status(400).json({
      success: false,
      message: 'Недозволений тип файлу. Дозволені: JPEG, PNG, PDF, DOC, TXT, XLS, ZIP'
    });
  }
  
  next(error);
});

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