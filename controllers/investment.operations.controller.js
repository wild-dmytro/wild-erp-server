const investmentOperationsModel = require("../models/investment.operations.model");
const { validationResult } = require("express-validator");

/**
 * Контролер для управління інвестиційними операціями
 */
const investmentOperationsController = {
  /**
   * Отримання списку всіх інвестиційних операцій з фільтрацією та пагінацією
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   */
  getAllOperations: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        operationType,
        operator,
        network,
        token,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      // Перевірка коректності параметрів
      const errors = [];
      
      if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
        errors.push({ param: "page", msg: "Номер сторінки має бути позитивним числом" });
      }
      
      if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
        errors.push({ param: "limit", msg: "Ліміт має бути числом від 1 до 100" });
      }

      if (operationType && !['incoming', 'outgoing'].includes(operationType)) {
        errors.push({ param: "operationType", msg: "Тип операції має бути 'incoming' або 'outgoing'" });
      }

      if (operator && !['maks_founder', 'ivan_partner'].includes(operator)) {
        errors.push({ param: "operator", msg: "Оператор має бути 'maks_founder' або 'ivan_partner'" });
      }

      if (startDate && isNaN(Date.parse(startDate))) {
        errors.push({ param: "startDate", msg: "Невірний формат початкової дати" });
      }

      if (endDate && isNaN(Date.parse(endDate))) {
        errors.push({ param: "endDate", msg: "Невірний формат кінцевої дати" });
      }

      if (minAmount && isNaN(parseFloat(minAmount))) {
        errors.push({ param: "minAmount", msg: "Мінімальна сума має бути числом" });
      }

      if (maxAmount && isNaN(parseFloat(maxAmount))) {
        errors.push({ param: "maxAmount", msg: "Максимальна сума має бути числом" });
      }

      if (sortOrder && !['asc', 'desc'].includes(sortOrder.toLowerCase())) {
        errors.push({ param: "sortOrder", msg: "Порядок сортування має бути 'asc' або 'desc'" });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          errors,
        });
      }

      // Формування параметрів для моделі
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        operationType,
        operator,
        network,
        token,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
        sortBy,
        sortOrder
      };

      const result = await investmentOperationsModel.getAll(options);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      console.error("Помилка отримання інвестиційних операцій:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання інвестиційних операцій",
      });
    }
  },

  /**
   * Отримання детальної інформації про операцію за ID
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   */
  getOperationById: async (req, res) => {
    try {
      const operationId = parseInt(req.params.id);

      if (isNaN(operationId)) {
        return res.status(400).json({
          success: false,
          message: "ID операції має бути числом",
        });
      }

      const operation = await investmentOperationsModel.getById(operationId);

      if (!operation) {
        return res.status(404).json({
          success: false,
          message: "Операцію не знайдено",
        });
      }

      res.json({
        success: true,
        data: operation,
      });
    } catch (err) {
      console.error(`Помилка отримання операції з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання операції",
      });
    }
  },

  /**
   * Створення нової інвестиційної операції
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   */
  createOperation: async (req, res) => {
    try {
      // Валідація вхідних даних
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const {
        operation_date,
        amount,
        network,
        token,
        transaction_hash,
        notes,
        additional_fees = 0,
        operation_type,
        operator,
        wallet_address
      } = req.body;

      // Перевірка обов'язкових полів
      if (!operation_date || !amount || !operation_type || !operator) {
        return res.status(400).json({
          success: false,
          message: "Обов'язкові поля: operation_date, amount, operation_type, operator",
        });
      }

      // Створення операції
      const newOperation = await investmentOperationsModel.create({
        operation_date,
        amount,
        network,
        token,
        transaction_hash,
        notes,
        additional_fees,
        operation_type,
        operator,
        wallet_address
      }, req.userId);

      res.status(201).json({
        success: true,
        data: newOperation,
        message: "Інвестиційну операцію успішно створено",
      });
    } catch (err) {
      console.error("Помилка створення інвестиційної операції:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час створення інвестиційної операції",
      });
    }
  },

  /**
   * Оновлення інвестиційної операції
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   */
  updateOperation: async (req, res) => {
    try {
      const operationId = parseInt(req.params.id);

      if (isNaN(operationId)) {
        return res.status(400).json({
          success: false,
          message: "ID операції має бути числом",
        });
      }

      // Валідація вхідних даних
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      // Перевіряємо наявність операції
      const existingOperation = await investmentOperationsModel.getById(operationId);
      if (!existingOperation) {
        return res.status(404).json({
          success: false,
          message: "Операцію не знайдено",
        });
      }

      const {
        operation_date,
        amount,
        network,
        token,
        transaction_hash,
        notes,
        additional_fees,
        operation_type,
        operator,
        wallet_address
      } = req.body;

      // Фільтруємо дані для оновлення (виключаємо undefined значення)
      const updateData = {};
      if (operation_date !== undefined) updateData.operation_date = operation_date;
      if (amount !== undefined) updateData.amount = amount;
      if (network !== undefined) updateData.network = network;
      if (token !== undefined) updateData.token = token;
      if (transaction_hash !== undefined) updateData.transaction_hash = transaction_hash;
      if (notes !== undefined) updateData.notes = notes;
      if (additional_fees !== undefined) updateData.additional_fees = additional_fees;
      if (operation_type !== undefined) updateData.operation_type = operation_type;
      if (operator !== undefined) updateData.operator = operator;
      if (wallet_address !== undefined) updateData.wallet_address = wallet_address;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Немає даних для оновлення",
        });
      }

      // Оновлення операції
      const updatedOperation = await investmentOperationsModel.update(
        operationId, 
        updateData, 
        req.userId
      );

      if (!updatedOperation) {
        return res.status(500).json({
          success: false,
          message: "Не вдалося оновити операцію",
        });
      }

      res.json({
        success: true,
        data: updatedOperation,
        message: "Інвестиційну операцію успішно оновлено",
      });
    } catch (err) {
      console.error(`Помилка оновлення операції з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення операції",
      });
    }
  },

  /**
   * Видалення інвестиційної операції
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   */
  deleteOperation: async (req, res) => {
    try {
      const operationId = parseInt(req.params.id);

      if (isNaN(operationId)) {
        return res.status(400).json({
          success: false,
          message: "ID операції має бути числом",
        });
      }

      // Перевіряємо наявність операції
      const existingOperation = await investmentOperationsModel.getById(operationId);
      if (!existingOperation) {
        return res.status(404).json({
          success: false,
          message: "Операцію не знайдено",
        });
      }

      // Видалення операції
      const deleted = await investmentOperationsModel.delete(operationId);

      if (!deleted) {
        return res.status(500).json({
          success: false,
          message: "Не вдалося видалити операцію",
        });
      }

      res.json({
        success: true,
        message: "Інвестиційну операцію успішно видалено",
      });
    } catch (err) {
      console.error(`Помилка видалення операції з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час видалення операції",
      });
    }
  },

  /**
   * Отримання статистики інвестиційних операцій
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   */
  getOperationsStats: async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        operator,
        operationType
      } = req.query;

      // Перевірка коректності параметрів
      const errors = [];
      
      if (startDate && isNaN(Date.parse(startDate))) {
        errors.push({ param: "startDate", msg: "Невірний формат початкової дати" });
      }

      if (endDate && isNaN(Date.parse(endDate))) {
        errors.push({ param: "endDate", msg: "Невірний формат кінцевої дати" });
      }

      if (operator && !['maks_founder', 'ivan_partner'].includes(operator)) {
        errors.push({ param: "operator", msg: "Оператор має бути 'maks_founder' або 'ivan_partner'" });
      }

      if (operationType && !['incoming', 'outgoing'].includes(operationType)) {
        errors.push({ param: "operationType", msg: "Тип операції має бути 'incoming' або 'outgoing'" });
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          errors,
        });
      }

      // Формування параметрів для моделі
      const options = {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        operator,
        operationType
      };

      const stats = await investmentOperationsModel.getStats(options);

      res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      console.error("Помилка отримання статистики інвестиційних операцій:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання статистики",
      });
    }
  },

  /**
   * Отримання місячної статистики інвестиційних операцій
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   */
  getMonthlyStats: async (req, res) => {
    try {
      const { year = new Date().getFullYear() } = req.query;

      // Перевірка коректності року
      if (isNaN(parseInt(year)) || parseInt(year) < 2000 || parseInt(year) > 2100) {
        return res.status(400).json({
          success: false,
          message: "Рік має бути числом від 2000 до 2100",
        });
      }

      const monthlyStats = await investmentOperationsModel.getMonthlyStats(parseInt(year));

      res.json({
        success: true,
        data: monthlyStats,
      });
    } catch (err) {
      console.error("Помилка отримання місячної статистики:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання місячної статистики",
      });
    }
  }
};

module.exports = investmentOperationsController;