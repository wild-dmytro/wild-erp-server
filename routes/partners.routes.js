const express = require('express');
const router = express.Router();
const partnersController = require('../controllers/partners.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/partners
 * @desc    Отримання списку всіх партнерів з фільтрацією та пагінацією
 * @access  Private/Admin/BizDev
 * @query   {number} [page=1] - Номер сторінки
 * @query   {number} [limit=10] - Кількість записів на сторінці (макс. 100)
 * @query   {string} [type] - Тип партнера: 'Brand', 'PP', 'NET', 'DIRECT ADV'
 * @query   {boolean} [onlyActive] - Фільтр активних партнерів: true/false
 * @query   {string} [search] - Пошук за назвою партнера
 * @query   {boolean} [hasIntegration] - Наявність інтеграції: true/false
 * @query   {string} [brands] - ID брендів через кому: "1,2,3" або одне число: "5"
 * @query   {string} [geos] - ID гео через кому: "1,2,3" або одне число: "5"
 * @query   {string} [trafficSources] - ID джерел трафіку через кому: "1,2,3" або одне число: "5"
 * @query   {string} [sortBy] - Поле сортування: 'id', 'name', 'type', 'created_at', 'updated_at'
 * @query   {string} [sortOrder] - Порядок сортування: 'asc', 'desc'
 * 
 * @example
 * GET /api/partners?brands=1,2&geos=3,4&trafficSources=5&type=Brand&onlyActive=true&page=1&limit=20
 * 
 * @returns {Object} response
 * @returns {boolean} response.success - Статус успіху
 * @returns {Array} response.data - Масив партнерів з пов'язаними даними
 * @returns {Object} response.pagination - Інформація про пагінацію
 * @returns {Object} response.appliedFilters - Застосовані фільтри
 */
router.get(
  '/',
  roleMiddleware('admin', "teamlead", 'bizdev', 'buyer'),
  partnersController.getAllPartners
);

/**
 * @route   GET /api/partners/stats
 * @desc    Отримання статистики партнерів
 * @access  Private/Admin/BizDev
 */
router.get(
  '/stats',
  roleMiddleware('admin', 'bizdev'),
  partnersController.getPartnersStats
);

/**
 * @route   GET /api/partners/:id
 * @desc    Отримання детальної інформації про партнера за ID
 * @access  Private/Admin/BizDev
 */
router.get(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  partnersController.getPartnerById
);

/**
 * @route   POST /api/partners
 * @desc    Створення нового партнера
 * @access  Private/Admin/BizDev
 */
router.post(
  '/',
  roleMiddleware('admin', 'bizdev'),
  [
    check('name', 'Назва партнера є обов\'язковою').notEmpty(),
    check('name', 'Назва партнера має бути рядком').isString(),
    check('type', 'Тип партнера є обов\'язковим').notEmpty(),
    check('type', 'Недійсний тип партнера').isIn(['Brand', 'PP', 'NET', 'DIRECT ADV']),
    check('contact_telegram', 'Telegram контакт має бути рядком').optional().isString(),
    check('contact_email', 'Email має бути валідним').optional(),
    check('partner_link', 'Посилання партнера має бути рядком').optional().isString(),
    check('has_integration', 'Наявність інтеграції має бути булевим значенням').optional().isBoolean(),
    check('postback_type', 'Недійсний тип постбека').optional().isIn(['Real time', '15-20 minutes', '1 hours', 'none']),
    check('telegram_chat_link', 'Посилання на Telegram чат має бути рядком').optional().isString(),
    check('description', 'Опис має бути рядком').optional().isString(),
    check('brands', 'Бренди мають бути масивом').optional().isArray(),
    check('brands.*.id', 'ID бренда має бути числом').optional().isInt(),
    check('geos', 'Гео мають бути масивом').optional().isArray(),
    check('geos.*.id', 'ID гео має бути числом').optional().isInt(),
    check('payment_methods', 'Способи оплати мають бути масивом').optional().isArray(),
    check('payment_methods.*', 'ID способу оплати має бути числом').optional().isInt(),
    check('traffic_sources', 'Джерела трафіку мають бути масивом').optional().isArray(),
    check('traffic_sources.*', 'ID джерела трафіку має бути числом').optional().isInt()
  ],
  partnersController.createPartner
);

/**
 * @route   PUT /api/partners/:id
 * @desc    Оновлення даних партнера
 * @access  Private/Admin/BizDev
 */
router.put(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  [
    check('name', 'Назва партнера має бути рядком').optional().isString(),
    check('type', 'Недійсний тип партнера').optional().isIn(['Brand', 'PP', 'NET', 'DIRECT ADV']),
    check('contact_telegram', 'Telegram контакт має бути рядком').optional().isString(),
    check('contact_email', 'Email має бути валідним').optional().isEmail(),
    check('partner_link', 'Посилання партнера має бути рядком').optional().isString(),
    check('has_integration', 'Наявність інтеграції має бути булевим значенням').optional().isBoolean(),
    check('postback_type', 'Недійсний тип постбека').optional().isIn(['Real time', '15-20 minutes', '1 hours', 'none']),
    check('telegram_chat_link', 'Посилання на Telegram чат має бути рядком').optional().isString(),
    check('description', 'Опис має бути рядком').optional().isString(),
    check('brands', 'Бренди мають бути масивом').optional().isArray(),
    check('brands.*', 'ID бренда має бути числом').optional().isInt(),
    check('geos', 'Гео мають бути масивом').optional().isArray(),
    check('geos.*', 'ID гео має бути числом').optional().isInt(),
    check('payment_methods', 'Способи оплати мають бути масивом').optional().isArray(),
    check('payment_methods.*', 'ID способу оплати має бути числом').optional().isInt(),
    check('traffic_sources', 'Джерела трафіку мають бути масивом').optional().isArray(),
    check('traffic_sources.*', 'ID джерела трафіку має бути числом').optional().isInt()
  ],
  partnersController.updatePartner
);

/**
 * @route   PATCH /api/partners/:id/status
 * @desc    Оновлення статусу партнера (активний/неактивний)
 * @access  Private/Admin/BizDev
 */
router.patch(
  '/:id/status',
  roleMiddleware('admin', 'bizdev'),
  [
    check('is_active', 'Статус є обов\'язковим').isBoolean()
  ],
  partnersController.updatePartnerStatus
);

/**
 * @route   DELETE /api/partners/:id
 * @desc    Видалення партнера
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  partnersController.deletePartner
);

module.exports = router;