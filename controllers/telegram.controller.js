// server/controllers/telegram.controller.js
const telegramModel = require('../models/telegram.model');
const telegramService = require('../services/telegram.service');
const { validationResult } = require('express-validator');

/**
 * Створити нову розсилку
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createBroadcast = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { title, message, target_type, target_departments, target_teams, target_users } = req.body;
    const sender_id = req.user.id;

    // Перевірити, чи є отримувачі
    if (target_type === 'department' && (!target_departments || target_departments.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Не вибрано жодного відділу для розсилки',
      });
    }

    if (target_type === 'team' && (!target_teams || target_teams.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Не вибрано жодної команди для розсилки',
      });
    }

    if (target_type === 'specific_users' && (!target_users || target_users.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Не вибрано жодного користувача для розсилки',
      });
    }

    const broadcastData = {
      title,
      message,
      sender_id,
      target_type,
      target_departments,
      target_teams,
      target_users,
    };

    const broadcastId = await telegramModel.createBroadcast(broadcastData);

    res.status(201).json({
      success: true,
      data: { id: broadcastId },
      message: 'Розсилку створено успішно',
    });

  } catch (error) {
    console.error('Помилка створення розсилки:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера під час створення розсилки',
    });
  }
};

/**
 * Виконати розсилку
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.executeBroadcast = async (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id);

    if (isNaN(broadcastId)) {
      return res.status(400).json({
        success: false,
        message: 'ID розсилки має бути числом',
      });
    }

    // Перевірити існування розсилки
    const broadcast = await telegramModel.getBroadcastById(broadcastId);
    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Розсилку не знайдено',
      });
    }

    // Перевірити статус розсилки
    if (broadcast.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Розсилку можна виконати тільки зі статусом "pending"',
      });
    }

    // Запустити розсилку асинхронно
    telegramService.executeBroadcast(broadcastId)
      .then(result => {
        console.log(`Розсилку ${broadcastId} завершено:`, result);
      })
      .catch(error => {
        console.error(`Помилка виконання розсилки ${broadcastId}:`, error);
      });

    res.json({
      success: true,
      message: 'Розсилку запущено',
    });

  } catch (error) {
    console.error('Помилка запуску розсилки:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера під час запуску розсилки',
    });
  }
};

/**
 * Створити та відразу виконати розсилку
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.sendBroadcast = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { title, message, target_type, target_departments, target_teams, target_users } = req.body;
    const sender_id = req.user.id;

    const broadcastData = {
      title,
      message,
      sender_id,
      target_type,
      target_departments,
      target_teams,
      target_users,
    };

    // Створити розсилку
    const broadcastId = await telegramModel.createBroadcast(broadcastData);

    // Виконати розсилку асинхронно
    telegramService.executeBroadcast(broadcastId)
      .then(result => {
        console.log(`Розсилку ${broadcastId} завершено:`, result);
      })
      .catch(error => {
        console.error(`Помилка виконання розсилки ${broadcastId}:`, error);
      });

    res.status(201).json({
      success: true,
      data: { id: broadcastId },
      message: 'Розсилку створено та запущено',
    });

  } catch (error) {
    console.error('Помилка відправки розсилки:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера під час відправки розсилки',
    });
  }
};

/**
 * Отримати розсилку за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getBroadcastById = async (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id);

    if (isNaN(broadcastId)) {
      return res.status(400).json({
        success: false,
        message: 'ID розсилки має бути числом',
      });
    }

    const broadcast = await telegramModel.getBroadcastById(broadcastId);

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: 'Розсилку не знайдено',
      });
    }

    res.json({
      success: true,
      data: broadcast,
    });

  } catch (error) {
    console.error('Помилка отримання розсилки:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера під час отримання розсилки',
    });
  }
};

/**
 * Отримати всі розсилки з пагінацією
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllBroadcasts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, sender_id } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      sender_id: sender_id ? parseInt(sender_id) : undefined,
    };

    const result = await telegramModel.getAllBroadcasts(options);

    res.json({
      success: true,
      ...result,
    });

  } catch (error) {
    console.error('Помилка отримання списку розсилок:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера під час отримання списку розсилок',
    });
  }
};

/**
 * Отримати статистику розсилок
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getBroadcastsStats = async (req, res) => {
  try {
    const { startDate, endDate, sender_id } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      sender_id: sender_id ? parseInt(sender_id) : undefined,
    };

    const stats = await telegramModel.getBroadcastsStats(options);

    res.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    console.error('Помилка отримання статистики розсилок:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера під час отримання статистики',
    });
  }
};

/**
 * Отримати список користувачів для розсилки
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getRecipientsPreview = async (req, res) => {
  try {
    const { target_type, target_departments, target_teams, target_users } = req.body;

    if (!target_type) {
      return res.status(400).json({
        success: false,
        message: 'Тип цільової аудиторії є обов\'язковим',
      });
    }

    const recipients = await telegramModel.getRecipients(target_type, {
      target_departments,
      target_teams,
      target_users
    });

    const recipientsCount = await telegramModel.calculateRecipients(target_type, {
      target_departments,
      target_teams,
      target_users
    });

    res.json({
      success: true,
      data: {
        recipients,
        count: recipientsCount
      },
    });

  } catch (error) {
    console.error('Помилка отримання списку отримувачів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера під час отримання списку отримувачів',
    });
  }
};