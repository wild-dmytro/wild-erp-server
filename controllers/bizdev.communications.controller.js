/**
 * Контролер для роботи з комунікацією по запитах
 * Обробляє повідомлення, коментарі та файлові вкладення
 */
const { validationResult } = require('express-validator');
const {
  addCommunication,
  getCommunicationById,
  getRequestCommunications,
  editCommunication,
  deleteCommunication,
  addAttachment,
  getCommunicationStats,
  searchCommunications
} = require('../models/bizdev.communications.model');

const { getRequestById } = require('../models/userRequest.model');

/**
 * Додавання нового повідомлення до запиту
 * @route POST /api/requests/:requestId/communications
 */
const addMessage = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилка валідації',
        errors: errors.array()
      });
    }

    const { requestId } = req.params;
    const {
      message,
      message_type = 'comment',
      attachments,
      metadata,
      is_internal = false
    } = req.body;

    // Перевіряємо чи існує запит
    const request = await getRequestById(parseInt(requestId));
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Запит не знайдено'
      });
    }

    // Перевіряємо права на внутрішні повідомлення
    if (is_internal && !['admin', 'teamlead'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для створення внутрішніх повідомлень'
      });
    }

    const messageData = {
      request_id: parseInt(requestId),
      sender_id: req.user.id,
      message,
      message_type,
      attachments,
      metadata,
      is_internal
    };

    const newMessage = await addCommunication(messageData);

    res.status(201).json({
      success: true,
      message: 'Повідомлення успішно додано',
      data: newMessage
    });

  } catch (error) {
    console.error('Помилка додавання повідомлення:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Отримання всіх повідомлень по запиту
 * @route GET /api/requests/:requestId/communications
 */
const getMessages = async (req, res) => {
  try {
    const { requestId } = req.params;
    const {
      include_internal = 'false',
      message_type,
      page = 1,
      limit = 50,
      sort_order = 'ASC'
    } = req.query;

    // Перевіряємо чи існує запит
    const request = await getRequestById(parseInt(requestId));
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Запит не знайдено'
      });
    }

    // Перевіряємо права на перегляд внутрішніх повідомлень
    const canSeeInternal = ['admin', 'teamlead'].includes(req.user.role) || 
                          request.created_by === req.user.id || 
                          request.assigned_to === req.user.id;

    const options = {
      include_internal: include_internal === 'true' && canSeeInternal,
      message_type,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      sort_order: sort_order.toUpperCase()
    };

    const result = await getRequestCommunications(parseInt(requestId), options);

    res.json({
      success: true,
      data: result.communications,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Помилка отримання повідомлень:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Редагування повідомлення
 * @route PUT /api/communications/:id
 */
const editMessage = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Помилка валідації',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { message } = req.body;

    // Перевіряємо чи існує повідомлення
    const communication = await getCommunicationById(parseInt(id));
    if (!communication) {
      return res.status(404).json({
        success: false,
        message: 'Повідомлення не знайдено'
      });
    }

    // Перевіряємо права на редагування
    if (communication.sender_id !== req.user.id && !['admin', 'teamlead'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для редагування повідомлення'
      });
    }

    // Системні повідомлення не можна редагувати
    if (communication.message_type === 'system') {
      return res.status(400).json({
        success: false,
        message: 'Системні повідомлення не можна редагувати'
      });
    }

    const updatedMessage = await editCommunication(parseInt(id), message, req.user.id);

    res.json({
      success: true,
      message: 'Повідомлення успішно відредаговано',
      data: updatedMessage
    });

  } catch (error) {
    console.error('Помилка редагування повідомлення:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Видалення повідомлення
 * @route DELETE /api/communications/:id
 */
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;

    // Перевіряємо чи існує повідомлення
    const communication = await getCommunicationById(parseInt(id));
    if (!communication) {
      return res.status(404).json({
        success: false,
        message: 'Повідомлення не знайдено'
      });
    }

    // Перевіряємо права на видалення
    if (communication.sender_id !== req.user.id && !['admin', 'teamlead'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для видалення повідомлення'
      });
    }

    // Системні повідомлення не можна видаляти
    if (communication.message_type === 'system') {
      return res.status(400).json({
        success: false,
        message: 'Системні повідомлення не можна видаляти'
      });
    }

    const deleted = await deleteCommunication(parseInt(id), req.user.id);

    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: 'Помилка видалення повідомлення'
      });
    }

    res.json({
      success: true,
      message: 'Повідомлення успішно видалено'
    });

  } catch (error) {
    console.error('Помилка видалення повідомлення:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Завантаження файлового вкладення
 * @route POST /api/communications/:id/attachments
 */
const uploadAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    // Перевіряємо чи існує повідомлення
    const communication = await getCommunicationById(parseInt(id));
    if (!communication) {
      return res.status(404).json({
        success: false,
        message: 'Повідомлення не знайдено'
      });
    }

    // Перевіряємо права на додавання вкладень
    if (communication.sender_id !== req.user.id && !['admin', 'teamlead'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Недостатньо прав для додавання вкладень'
      });
    }

    // Перевіряємо чи є файл
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Файл не завантажено'
      });
    }

    const fileData = {
      filename: req.file.originalname,
      file_path: req.file.path,
      file_size: req.file.size,
      mime_type: req.file.mimetype
    };

    const updatedMessage = await addAttachment(parseInt(id), fileData);

    res.json({
      success: true,
      message: 'Вкладення успішно додано',
      data: updatedMessage
    });

  } catch (error) {
    console.error('Помилка завантаження вкладення:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Отримання статистики комунікації по запиту
 * @route GET /api/requests/:requestId/communications/stats
 */
const getStats = async (req, res) => {
  try {
    const { requestId } = req.params;

    // Перевіряємо чи існує запит
    const request = await getRequestById(parseInt(requestId));
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Запит не знайдено'
      });
    }

    const stats = await getCommunicationStats(parseInt(requestId));

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Помилка отримання статистики комунікації:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Пошук повідомлень
 * @route POST /api/communications/search
 */
const searchMessages = async (req, res) => {
  try {
    const {
      query,
      request_id,
      sender_id,
      message_type,
      date_from,
      date_to,
      include_internal = false,
      limit = 100
    } = req.body;

    if (!query || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Пошуковий запит має містити щонайменше 3 символи'
      });
    }

    // Перевіряємо права на пошук внутрішніх повідомлень
    const canSearchInternal = include_internal && ['admin', 'teamlead'].includes(req.user.role);

    const searchOptions = {
      query: query.trim(),
      request_id: request_id ? parseInt(request_id) : undefined,
      sender_id: sender_id ? parseInt(sender_id) : undefined,
      message_type,
      date_from: date_from ? new Date(date_from) : undefined,
      date_to: date_to ? new Date(date_to) : undefined,
      include_internal: canSearchInternal,
      limit: Math.min(parseInt(limit), 500)
    };

    const results = await searchCommunications(searchOptions);

    res.json({
      success: true,
      data: results,
      search_query: query.trim(),
      total_results: results.length
    });

  } catch (error) {
    console.error('Помилка пошуку повідомлень:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

/**
 * Отримання деталей повідомлення
 * @route GET /api/communications/:id
 */
const getMessageDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const communication = await getCommunicationById(parseInt(id));

    if (!communication) {
      return res.status(404).json({
        success: false,
        message: 'Повідомлення не знайдено'
      });
    }

    // Перевіряємо права на перегляд внутрішніх повідомлень
    if (communication.is_internal && !['admin', 'teamlead'].includes(req.user.role)) {
      const request = await getRequestById(communication.request_id);
      if (request.created_by !== req.user.id && request.assigned_to !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Недостатньо прав для перегляду повідомлення'
        });
      }
    }

    res.json({
      success: true,
      data: communication
    });

  } catch (error) {
    console.error('Помилка отримання деталей повідомлення:', error);
    res.status(500).json({
      success: false,
      message: 'Внутрішня помилка сервера',
      error: error.message
    });
  }
};

module.exports = {
  addMessage,
  getMessages,
  editMessage,
  deleteMessage,
  uploadAttachment,
  getStats,
  searchMessages,
  getMessageDetails
};