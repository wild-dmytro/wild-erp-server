const express = require('express');
const router = express.Router();
const offersController = require('../controllers/offers.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/offers
 * @desc    Отримання списку всіх офферів з фільтрацією та пагінацією
 * @access  Private/Admin/BizDev
 * @query   {number} [page=1] - Номер сторінки
 * @query   {number} [limit=12] - Кількість записів на сторінці (макс. 100)
 * @query   {number[]} [partners] - Масив ID партнерів для фільтрації
 * @query   {number[]} [brands] - Масив ID брендів для фільтрації
 * @query   {number[]} [geos] - Масив ID гео регіонів для фільтрації
 * @query   {string} [onlyActive] - Фільтр по статусу ("true"/"false")
 * @query   {string} [search] - Пошук за назвою, описом, умовами, KPI
 * @query   {string} [sortBy=created_at] - Поле сортування (id|name|created_at|updated_at|geos_count|flows_count)
 * @query   {string} [sortOrder=desc] - Порядок сортування (asc|desc)
 */
router.get(
  '/',
  roleMiddleware('admin', "teamlead", 'bizdev'),
  offersController.getAllOffers
);

/**
 * @route   GET /api/offers/stats
 * @desc    Отримання статистики офферів
 * @access  Private/Admin/BizDev
 */
router.get(
  '/stats',
  roleMiddleware('admin', 'bizdev'),
  offersController.getOffersStats
);

/**
 * @route   GET /api/offers/:id
 * @desc    Отримання офферу за ID
 * @access  Private/Admin/BizDev
 * @param   {number} id - ID офферу
 */
router.get(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  offersController.getOfferById
);

/**
 * @route   POST /api/offers
 * @desc    Створення нового офферу
 * @access  Private/Admin/BizDev
 * @body    {string} name - Назва офферу
 * @body    {number} partner_id - ID партнера
 * @body    {number} [brand_id] - ID бренда
 * @body    {string} [conditions] - Умови офферу
 * @body    {string} [kpi] - KPI офферу
 * @body    {string} [description] - Опис офферу
 * @body    {number[]} [geos] - Масив ID гео регіонів
 * @body    {boolean} [is_active=true] - Статус активності
 */
router.post(
  '/',
  roleMiddleware('admin', 'bizdev'),
  offersController.createOffer
);

/**
 * @route   PUT /api/offers/:id
 * @desc    Оновлення офферу
 * @access  Private/Admin/BizDev
 * @param   {number} id - ID офферу
 * @body    {string} name - Назва офферу
 * @body    {number} partner_id - ID партнера
 * @body    {number} [brand_id] - ID бренда
 * @body    {string} [conditions] - Умови офферу
 * @body    {string} [kpi] - KPI офферу
 * @body    {string} [description] - Опис офферу
 * @body    {number[]} [geos] - Масив ID гео регіонів
 * @body    {boolean} is_active - Статус активності
 */
router.put(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  offersController.updateOffer
);

/**
 * @route   PATCH /api/offers/:id/status
 * @desc    Оновлення статусу офферу
 * @access  Private/Admin/BizDev
 * @param   {number} id - ID офферу
 * @body    {boolean} is_active - Новий статус активності
 */
router.patch(
  '/:id/status',
  roleMiddleware('admin', 'bizdev'),
  offersController.updateOfferStatus
);

/**
 * @route   DELETE /api/offers/:id
 * @desc    Видалення офферу
 * @access  Private/Admin/BizDev
 * @param   {number} id - ID офферу
 */
router.delete(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  offersController.deleteOffer
);

module.exports = router;