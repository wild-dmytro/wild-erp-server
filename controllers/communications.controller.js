// =====================================
// controllers/communications.controller.js
// Спільний контролер для всіх типів комунікацій
// =====================================

const { validationResult } = require('express-validator');
const CommunicationModel = require('../models/communication.model');

/**
 * Обробка помилок валідації
 */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Помилки валідації',
      errors: errors.array()
    });
  }
  return false;
};

/**
 * Додавання нової комунікації
 * @route POST /api/communications/:contextType/:contextId
 */
const addCommunication = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { contextType, contextId } = req.params;
    const {
      recipient_id,
      message_type = 'message',
      subject,
      message,
      attachments,
      metadata,
      priority = 'normal',
      is_urgent = false,
      is_internal = false
    } = req.body;

    const communicationData = {
      sender_id: req.user.id,
      recipient_id,
      message_type,
      subject,
      message,
      attachments,
      metadata,
      priority,
      is_urgent,
      is_internal
    };

    const communication = await CommunicationModel.addCommunication(
      communicationData,
      contextType,
      parseInt(contextId)
    );

    res.status(201).json({
      success: true,
      message: 'Комунікацію успішно створено',
      data: communication
    });

  } catch (error) {
    console.error('Помилка створення комунікації:', error);
    
    if (error.message.includes('не знайдено')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Отримання комунікацій за контекстом
 * @route GET /api/communications/:contextType/:contextId
 */
const getCommunicationsByContext = async (req, res) => {
  try {
    const { contextType, contextId } = req.params;
    const {
      page = 1,
      limit = 50,
      is_internal,
      message_type,
      sender_id,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    // Валідація типу контексту
    if (!['flow', 'bizdev_request'].includes(contextType)) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний тип контексту. Дозволені: flow, bizdev_request'
      });
    }

    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Обмежуємо максимальну кількість
      is_internal: is_internal !== undefined ? is_internal === 'true' : null,
      message_type,
      sender_id: sender_id ? parseInt(sender_id) : null,
      search,
      sort_by,
      sort_order
    };

    const result = await CommunicationModel.getCommunicationsByContext(
      contextType,
      parseInt(contextId),
      options
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Помилка отримання комунікацій:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Отримання комунікації за ID
 * @route GET /api/communications/:id
 */
const getCommunicationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний ID комунікації'
      });
    }

    const communication = await CommunicationModel.getCommunicationById(parseInt(id));

    if (!communication) {
      return res.status(404).json({
        success: false,
        message: 'Комунікацію не знайдено'
      });
    }

    res.json({
      success: true,
      data: communication
    });

  } catch (error) {
    console.error('Помилка отримання комунікації:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Редагування комунікації
 * @route PUT /api/communications/:id
 */
const editCommunication = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { id } = req.params;
    const { message } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний ID комунікації'
      });
    }

    const communication = await CommunicationModel.editCommunication(
      parseInt(id),
      message,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Комунікацію успішно оновлено',
      data: communication
    });

  } catch (error) {
    console.error('Помилка редагування комунікації:', error);
    
    if (error.message === 'Комунікацію не знайдено') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Видалення комунікації
 * @route DELETE /api/communications/:id
 */
const deleteCommunication = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний ID комунікації'
      });
    }

    await CommunicationModel.deleteCommunication(parseInt(id), req.user.id);

    res.json({
      success: true,
      message: 'Комунікацію успішно видалено'
    });

  } catch (error) {
    console.error('Помилка видалення комунікації:', error);
    
    if (error.message === 'Комунікацію не знайдено') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Позначення комунікації як прочитаної
 * @route PATCH /api/communications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний ID комунікації'
      });
    }

    const wasUpdated = await CommunicationModel.markAsRead(parseInt(id), req.user.id);

    if (!wasUpdated) {
      return res.status(404).json({
        success: false,
        message: 'Комунікацію не знайдено або у вас немає прав для її читання'
      });
    }

    res.json({
      success: true,
      message: 'Комунікацію позначено як прочитану'
    });

  } catch (error) {
    console.error('Помилка позначення як прочитаної:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Отримання статистики комунікацій
 * @route GET /api/communications/:contextType/:contextId/stats
 */
const getCommunicationStats = async (req, res) => {
  try {
    const { contextType, contextId } = req.params;

    // Валідація типу контексту
    if (!['flow', 'bizdev_request'].includes(contextType)) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний тип контексту. Дозволені: flow, bizdev_request'
      });
    }

    if (!contextId || isNaN(parseInt(contextId))) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний ID контексту'
      });
    }

    const stats = await CommunicationModel.getCommunicationStats(
      contextType,
      parseInt(contextId)
    );

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Помилка отримання статистики:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Пошук комунікацій
 * @route GET /api/communications/search
 */
const searchCommunications = async (req, res) => {
  try {
    const { q: searchQuery, context_type, context_id, sender_id, page = 1, limit = 50 } = req.query;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Пошуковий запит повинен містити мінімум 2 символи'
      });
    }

    // Валідація типу контексту, якщо він вказаний
    if (context_type && !['flow', 'bizdev_request'].includes(context_type)) {
      return res.status(400).json({
        success: false,
        message: 'Недійсний тип контексту. Дозволені: flow, bizdev_request'
      });
    }

    const options = {
      context_type,
      context_id: context_id ? parseInt(context_id) : null,
      sender_id: sender_id ? parseInt(sender_id) : null,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100)
    };

    const result = await CommunicationModel.searchCommunications(searchQuery.trim(), options);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Помилка пошуку комунікацій:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Масове позначення комунікацій як прочитаних
 * @route PATCH /api/communications/mark-read
 */
const markMultipleAsRead = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { communication_ids } = req.body;

    if (!Array.isArray(communication_ids) || communication_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Необхідно вказати масив ID комунікацій'
      });
    }

    const results = [];
    const errors = [];

    for (const id of communication_ids) {
      try {
        const wasUpdated = await CommunicationModel.markAsRead(parseInt(id), req.user.id);
        results.push({ id, success: wasUpdated });
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Оброблено ${results.length} комунікацій`,
      data: {
        processed: results,
        errors: errors
      }
    });

  } catch (error) {
    console.error('Помилка масового позначення як прочитаних:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

module.exports = {
  // Основні методи
  addCommunication,
  getCommunicationsByContext,
  getCommunicationById,
  editCommunication,
  deleteCommunication,
  markAsRead,
  getCommunicationStats,
  searchCommunications,
  markMultipleAsRead
};