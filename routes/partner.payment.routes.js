const express = require('express');
const router = express.Router();
const partnerPaymentsController = require('../controllers/partner.payment.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { check } = require('express-validator');

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * @route   GET /api/partner-payments
 * @desc    Отримання списку всіх платежів з фільтрацією та пагінацією
 * @access  Private/Admin/Finance
 */
router.get(
  '/',
  roleMiddleware('admin', 'bizdev'),
  partnerPaymentsController.getAllPayments
);

/**
 * @route   GET /api/partner-payments/stats
 * @desc    Отримання статистики платежів
 * @access  Private/Admin/Finance
 */
router.get(
  '/stats',
  roleMiddleware('admin', 'bizdev'),
  partnerPaymentsController.getPaymentStats
);

/**
 * @route   GET /api/partner-payments/stats/by-partner
 * @desc    Отримання статистики платежів за партнерами
 * @access  Private/Admin/Finance
 */
router.get(
  '/stats/by-partner',
  roleMiddleware('admin', 'bizdev'),
  partnerPaymentsController.getPaymentStatsByPartner
);

/**
 * @route   GET /api/partner-payments/payout-request/:payoutRequestId
 * @desc    Отримання всіх платежів заявки на виплату
 * @access  Private/Admin/Finance
 */
router.get(
  '/payout-request/:payoutRequestId',
  roleMiddleware('admin', 'bizdev', 'teamlead'),
  partnerPaymentsController.getPaymentsByPayoutRequest
);

/**
 * @route   GET /api/partner-payments/:id
 * @desc    Отримання детальної інформації про платіж за ID
 * @access  Private/Admin/Finance
 */
router.get(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  partnerPaymentsController.getPaymentById
);

/**
 * @route   POST /api/partner-payments
 * @desc    Створення нового платежу
 * @access  Private/Admin/Finance
 */
router.post(
  '/',
  roleMiddleware('admin', 'bizdev'),
  [
    check('payout_request_id', 'ID заявки на виплату є обов\'язковим').notEmpty().isInt(),
    check('amount', 'Сума платежу є обов\'язковою').notEmpty().isFloat({ min: 0 }),
    check('currency', 'Недійсна валюта').optional().isIn(['USD', 'EUR', 'GBP']),
    check('transaction_hash', 'Хеш транзакції має бути рядком').optional().isString(),
    check('network', 'Мережа має бути рядком').optional().isString(),
    check('wallet_address', 'Адреса гаманця має бути рядком').optional().isString(),
    check('notes', 'Примітки мають бути рядком').optional().isString()
  ],
  partnerPaymentsController.createPayment
);

/**
 * @route   PUT /api/partner-payments/:id
 * @desc    Оновлення даних платежу
 * @access  Private/Admin/Finance
 */
router.put(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  [
    check('amount', 'Сума платежу має бути числом').optional().isFloat({ min: 0 }),
    check('currency', 'Недійсна валюта').optional().isIn(['USD', 'EUR', 'GBP']),
    check('transaction_hash', 'Хеш транзакції має бути рядком').optional().isString(),
    check('network', 'Мережа має бути рядком').optional().isString(),
    check('wallet_address', 'Адреса гаманця має бути рядком').optional().isString(),
    check('notes', 'Примітки мають бути рядком').optional().isString(),
    check('failure_reason', 'Причина невдачі має бути рядком').optional().isString(),
    check('block_number', 'Номер блоку має бути числом').optional().isInt(),
    check('gas_used', 'Використаний газ має бути числом').optional().isInt(),
    check('gas_price', 'Ціна газу має бути числом').optional().isNumeric()
  ],
  partnerPaymentsController.updatePayment
);

/**
 * @route   PATCH /api/partner-payments/:id/status
 * @desc    Зміна статусу платежу
 * @access  Private/Admin/Finance
 */
router.patch(
  '/:id/status',
  roleMiddleware('admin', 'bizdev'),
  [
    check('status', 'Статус є обов\'язковим').notEmpty(),
    check('status', 'Недійсний статус платежу').isIn(['pending', 'processing', 'completed', 'hold', 'failed', 'cancelled']),
    check('transaction_hash', 'Хеш транзакції має бути рядком').optional().isString(),
    check('block_number', 'Номер блоку має бути числом').optional().isInt(),
    check('failure_reason', 'Причина невдачі має бути рядком').optional().isString(),
    check('notes', 'Примітки мають бути рядком').optional().isString()
  ],
  partnerPaymentsController.updatePaymentStatus
);

/**
 * @route   PATCH /api/partner-payments/:id/blockchain
 * @desc    Оновлення blockchain даних платежу
 * @access  Private/Admin/Finance
 */
router.patch(
  '/:id/blockchain',
  roleMiddleware('admin', 'bizdev'),
  [
    check('transaction_hash', 'Хеш транзакції має бути рядком').optional().isString(),
    check('block_number', 'Номер блоку має бути числом').optional().isInt(),
    check('gas_used', 'Використаний газ має бути числом').optional().isInt(),
    check('gas_price', 'Ціна газу має бути числом').optional().isNumeric(),
    check('confirmation_date', 'Дата підтвердження має бути валідною датою').optional().isISO8601()
  ],
  partnerPaymentsController.updateBlockchainData
);

/**
 * @route   DELETE /api/partner-payments/:id
 * @desc    Видалення платежу
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  roleMiddleware('admin', 'bizdev'),
  partnerPaymentsController.deletePayment
);

module.exports = router;