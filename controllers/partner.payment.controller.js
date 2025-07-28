const partnerPaymentModel = require("../models/partner.payment.model");
const { validationResult } = require("express-validator");

/**
 * Отримання списку всіх платежів з фільтрацією та пагінацією
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      payoutRequestId,
      status,
      currency,
      network,
      startDate,
      endDate,
      sortBy = "created_at",
      sortOrder = "desc"
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (payoutRequestId && isNaN(parseInt(payoutRequestId))) {
      errors.push({ param: "payoutRequestId", msg: "ID заявки на виплату має бути числом" });
    }
    if (status && !['pending', 'processing', 'completed', 'hold', 'failed', 'cancelled'].includes(status)) {
      errors.push({ param: "status", msg: "Невірний статус платежу" });
    }
    if (currency && !['USD', 'EUR', 'GBP'].includes(currency)) {
      errors.push({ param: "currency", msg: "Невірна валюта" });
    }
    if (startDate && isNaN(Date.parse(startDate))) {
      errors.push({ param: "startDate", msg: "Невірний формат дати" });
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      errors.push({ param: "endDate", msg: "Невірний формат дати" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Отримання платежів
    const result = await partnerPaymentModel.getAllPayments({
      page: parseInt(page),
      limit: parseInt(limit),
      payoutRequestId: payoutRequestId ? parseInt(payoutRequestId) : undefined,
      status,
      currency,
      network,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    console.error("Помилка отримання платежів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання платежів",
    });
  }
};

/**
 * Отримання детальної інформації про платіж за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPaymentById = async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);

    if (isNaN(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "ID платежу має бути числом",
      });
    }

    // Отримання платежу
    const payment = await partnerPaymentModel.getPaymentById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Платіж не знайдено",
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (err) {
    console.error(`Помилка отримання платежу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання платежу",
    });
  }
};

/**
 * Створення нового платежу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createPayment = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { transaction_hash } = req.body;

    // Перевірка унікальності хешу транзакції, якщо він вказаний
    if (transaction_hash) {
      const exists = await partnerPaymentModel.paymentExistsByHash(transaction_hash);
      if (exists) {
        return res.status(400).json({
          success: false,
          message: "Платіж з таким хешем транзакції вже існує",
        });
      }
    }

    const paymentData = {
      ...req.body,
      created_by: req.userId
    };

    // Створення платежу
    const newPayment = await partnerPaymentModel.createPayment(paymentData);

    res.status(201).json({
      success: true,
      data: newPayment,
      message: "Платіж успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення платежу:", err);
    
    // Перевірка на foreign key constraint
    if (err.code === '23503') {
      return res.status(400).json({
        success: false,
        message: "Вказана заявка на виплату не існує",
      });
    }

    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення платежу",
    });
  }
};

/**
 * Оновлення даних платежу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updatePayment = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const paymentId = parseInt(req.params.id);

    if (isNaN(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "ID платежу має бути числом",
      });
    }

    // Перевірка наявності платежу
    const existingPayment = await partnerPaymentModel.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        message: "Платіж не знайдено",
      });
    }

    // Перевірка можливості редагування
    if (['completed', 'cancelled'].includes(existingPayment.status)) {
      return res.status(400).json({
        success: false,
        message: "Неможливо редагувати платіж з таким статусом",
      });
    }

    const { transaction_hash } = req.body;

    // Перевірка унікальності хешу транзакції, якщо він змінюється
    if (transaction_hash && transaction_hash !== existingPayment.transaction_hash) {
      const exists = await partnerPaymentModel.paymentExistsByHash(transaction_hash, paymentId);
      if (exists) {
        return res.status(400).json({
          success: false,
          message: "Платіж з таким хешем транзакції вже існує",
        });
      }
    }

    // Оновлення платежу
    const updatedPayment = await partnerPaymentModel.updatePayment(paymentId, req.body);

    if (!updatedPayment) {
      return res.status(400).json({
        success: false,
        message: "Немає даних для оновлення",
      });
    }

    res.json({
      success: true,
      data: updatedPayment,
      message: "Дані платежу успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення платежу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення платежу",
    });
  }
};

/**
 * Зміна статусу платежу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const paymentId = parseInt(req.params.id);
    const { status, transaction_hash, block_number, failure_reason, notes } = req.body;

    if (isNaN(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "ID платежу має бути числом",
      });
    }

    // Перевірка наявності платежу
    const existingPayment = await partnerPaymentModel.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        message: "Платіж не знайдено",
      });
    }

    // Перевірка логіки зміни статусу
    // const statusFlow = {
    //   'pending': ['processing', 'hold', 'cancelled', ],
    //   'processing': ['completed', 'failed', 'hold'],
    //   'hold': ['pending', 'processing', 'cancelled'],
    //   'completed': [],
    //   'failed': ['pending'],
    //   'cancelled': ['pending']
    // };

    // if (!statusFlow[existingPayment.status].includes(status)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: `Неможливо змінити статус з "${existingPayment.status}" на "${status}"`,
    //   });
    // }

    // Додаткові дані залежно від статусу
    const additionalData = {};
    if (status === 'completed') {
      if (transaction_hash) additionalData.transaction_hash = transaction_hash;
      if (block_number) additionalData.block_number = block_number;
    } else if (status === 'failed') {
      if (failure_reason) additionalData.failure_reason = failure_reason;
    } else if (status === 'hold') {
      if (notes) additionalData.notes = notes;
    }

    // Оновлення статусу
    const updatedPayment = await partnerPaymentModel.updatePaymentStatus(
      paymentId, 
      status, 
      req.userId, 
      additionalData
    );

    res.json({
      success: true,
      data: updatedPayment,
      message: `Статус платежу успішно змінено на "${status}"`,
    });
  } catch (err) {
    console.error(`Помилка оновлення статусу платежу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення статусу платежу",
    });
  }
};

/**
 * Видалення платежу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deletePayment = async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);

    if (isNaN(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "ID платежу має бути числом",
      });
    }

    // Перевірка наявності платежу
    const existingPayment = await partnerPaymentModel.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        message: "Платіж не знайдено",
      });
    }

    // Видалення платежу
    const result = await partnerPaymentModel.deletePayment(paymentId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error(`Помилка видалення платежу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення платежу",
    });
  }
};

/**
 * Отримання платежів за заявкою на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPaymentsByPayoutRequest = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки на виплату має бути числом",
      });
    }

    // Отримання платежів
    const payments = await partnerPaymentModel.getPaymentsByPayoutRequest(payoutRequestId);

    res.json({
      success: true,
      data: payments,
    });
  } catch (err) {
    console.error(`Помилка отримання платежів заявки з ID ${req.params.payoutRequestId}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання платежів заявки",
    });
  }
};

/**
 * Отримання статистики платежів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPaymentStats = async (req, res) => {
  try {
    const { startDate, endDate, currency } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (startDate && isNaN(Date.parse(startDate))) {
      errors.push({ param: "startDate", msg: "Невірний формат дати" });
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      errors.push({ param: "endDate", msg: "Невірний формат дати" });
    }
    if (currency && !['USD', 'EUR', 'GBP'].includes(currency)) {
      errors.push({ param: "currency", msg: "Невірна валюта" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Отримання статистики
    const stats = await partnerPaymentModel.getPaymentStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      currency
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики платежів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики платежів",
    });
  }
};

/**
 * Отримання статистики платежів за партнерами
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPaymentStatsByPartner = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (startDate && isNaN(Date.parse(startDate))) {
      errors.push({ param: "startDate", msg: "Невірний формат дати" });
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      errors.push({ param: "endDate", msg: "Невірний формат дати" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Отримання статистики
    const stats = await partnerPaymentModel.getPaymentStatsByPartner({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики платежів за партнерами:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики платежів за партнерами",
    });
  }
};

/**
 * Оновлення blockchain даних для платежу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateBlockchainData = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const paymentId = parseInt(req.params.id);

    if (isNaN(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "ID платежу має бути числом",
      });
    }

    // Перевірка наявності платежу
    const existingPayment = await partnerPaymentModel.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        message: "Платіж не знайдено",
      });
    }

    // Оновлення blockchain даних
    const updatedPayment = await partnerPaymentModel.updateBlockchainData(paymentId, req.body);

    if (!updatedPayment) {
      return res.status(400).json({
        success: false,
        message: "Немає даних для оновлення",
      });
    }

    res.json({
      success: true,
      data: updatedPayment,
      message: "Blockchain дані успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення blockchain даних платежу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення blockchain даних",
    });
  }
};