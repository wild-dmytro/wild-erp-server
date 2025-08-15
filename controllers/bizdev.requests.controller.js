/**
 * Контролер для роботи з запитами користувачів
 * Обробляє HTTP запити для CRUD операцій з користувацькими запитами
 */
const { validationResult } = require("express-validator");
const {
  createUserRequest,
  getRequestById,
  getRequests,
  updateRequest,
  updateRequestStatus,
  deleteRequest,
  getRequestsStats,
} = require("../models/bizdev.requests.model");

/**
 * Створення нового запиту
 * @route POST /api/requests
 */
const createRequest = async (req, res) => {
  try {
    // Перевірка валідації
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Помилка валідації",
        errors: errors.array(),
      });
    }

    const {
      name,
      description,
      type,
      priority = "medium",
      deadline,
      assigned_to,
      tags = [],
      attachments,
      metadata,
    } = req.body;

    const requestData = {
      name,
      description,
      type,
      priority,
      deadline: deadline ? new Date(deadline) : null,
      created_by: req.user.id,
      assigned_to,
      tags,
      attachments,
      metadata,
    };

    const newRequest = await createUserRequest(requestData);

    res.status(201).json({
      success: true,
      message: "Запит успішно створено",
      data: newRequest,
    });
  } catch (error) {
    console.error("Помилка створення запиту:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: error.message,
    });
  }
};

/**
 * Отримання списку запитів з фільтрацією
 * @route GET /api/requests
 */
const getAllRequests = async (req, res) => {
  try {
    const {
      status,
      type,
      priority,
      created_by,
      assigned_to,
      search,
      page = 1,
      limit = 20,
      sort_by = "created_at",
      sort_order = "DESC",
    } = req.query;

    // Валідація параметрів
    const validSortFields = [
      "created_at",
      "updated_at",
      "deadline",
      "priority",
      "name",
    ];
    const validSortOrders = ["ASC", "DESC"];

    if (sort_by && !validSortFields.includes(sort_by)) {
      return res.status(400).json({
        success: false,
        message: "Недійсне поле для сортування",
      });
    }

    if (sort_order && !validSortOrders.includes(sort_order.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Недійсний порядок сортування",
      });
    }

    const options = {
      status,
      type,
      priority,
      created_by: created_by ? parseInt(created_by) : undefined,
      assigned_to: assigned_to ? parseInt(assigned_to) : undefined,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Максимум 100 записів за раз
      sort_by,
      sort_order: sort_order?.toUpperCase() || "DESC",
    };

    const result = await getRequests(options);

    res.json({
      success: true,
      data: result.requests,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Помилка отримання запитів:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: error.message,
    });
  }
};

/**
 * Отримання запиту за ID
 * @route GET /api/requests/:id
 */
const getRequestDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await getRequestById(parseInt(id));

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Запит не знайдено",
      });
    }

    let responseData = { request };

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Помилка отримання запиту:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: error.message,
    });
  }
};

/**
 * Оновлення запиту
 * @route PUT /api/requests/:id
 */
const updateRequestDetails = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Помилка валідації",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Конвертуємо deadline в Date якщо передано
    if (updateData.deadline) {
      updateData.deadline = new Date(updateData.deadline);
    }

    const updatedRequest = await updateRequest(
      parseInt(id),
      updateData,
      req.user.id
    );

    if (!updatedRequest) {
      return res.status(404).json({
        success: false,
        message: "Запит не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Запит успішно оновлено",
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Помилка оновлення запиту:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: error.message,
    });
  }
};

/**
 * Оновлення статусу запиту
 * @route PATCH /api/requests/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Помилка валідації",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const { status, reason } = req.body;

    // Валідація параметрів
    if (!id || !status) {
      return res.status(400).json({
        success: false,
        message: "ID запиту та статус є обов'язковими параметрами",
      });
    }

    // Конвертуємо ID в число та валідуємо
    const requestId = parseInt(id, 10);
    if (isNaN(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Некоректний ID запиту",
      });
    }

    // Валідуємо статус
    const validStatuses = [
      "pending",
      "in_progress",
      "completed",
      "cancelled",
      "on_hold",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Некоректний статус",
      });
    }

    console.log("Оновлення статусу запиту:", {
      requestId,
      status,
      userId: req.user.id,
      reason: reason || null,
    });

    const updatedRequest = await updateRequestStatus(
      requestId,
      status,
      req.user.id,
      reason || null // Явно передаємо null замість undefined
    );

    if (!updatedRequest) {
      return res.status(404).json({
        success: false,
        message: "Запит не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Статус запиту успішно оновлено",
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Помилка оновлення статусу:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Внутрішня помилка",
    });
  }
};

/**
 * Видалення запиту
 * @route DELETE /api/requests/:id
 */
const deleteRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    // Перевіряємо чи існує запит
    const request = await getRequestById(parseInt(id));
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Запит не знайдено",
      });
    }

    // Перевіряємо права доступу
    if (
      request.created_by !== req.user.id &&
      !["admin", "teamlead"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Недостатньо прав для видалення запиту",
      });
    }

    const deleted = await deleteRequest(parseInt(id));

    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: "Помилка видалення запиту",
      });
    }

    res.json({
      success: true,
      message: "Запит успішно видалено",
    });
  } catch (error) {
    console.error("Помилка видалення запиту:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: error.message,
    });
  }
};

/**
 * Отримання статистики запитів
 * @route GET /api/requests/stats
 */
const getStats = async (req, res) => {
  try {
    const { created_by, assigned_to, date_from, date_to } = req.query;

    const filters = {
      created_by: created_by ? parseInt(created_by) : undefined,
      assigned_to: assigned_to ? parseInt(assigned_to) : undefined,
      date_from: date_from ? new Date(date_from) : undefined,
      date_to: date_to ? new Date(date_to) : undefined,
    };

    const stats = await getRequestsStats(filters);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Помилка отримання статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: error.message,
    });
  }
};

/**
 * Отримання запитів поточного користувача
 * @route GET /api/requests/my
 */
const getMyRequests = async (req, res) => {
  try {
    const {
      status,
      type,
      priority,
      as_creator = "true",
      as_assignee = "true",
      page = 1,
      limit = 20,
    } = req.query;

    let requests = [];

    // Запити створені користувачем
    if (as_creator === "true") {
      const createdRequests = await getRequests({
        created_by: req.user.id,
        status,
        type,
        priority,
        page: parseInt(page),
        limit: parseInt(limit),
      });
      requests = requests.concat(
        createdRequests.requests.map((r) => ({ ...r, relation: "creator" }))
      );
    }

    // Запити призначені користувачу
    if (as_assignee === "true") {
      const assignedRequests = await getRequests({
        assigned_to: req.user.id,
        status,
        type,
        priority,
        page: parseInt(page),
        limit: parseInt(limit),
      });
      requests = requests.concat(
        assignedRequests.requests.map((r) => ({ ...r, relation: "assignee" }))
      );
    }

    // Видаляємо дублікати та сортуємо
    const uniqueRequests = requests.reduce((acc, current) => {
      const existing = acc.find((item) => item.id === current.id);
      if (!existing) {
        acc.push(current);
      } else {
        // Якщо запит є і як створений, і як призначений
        existing.relation = "both";
      }
      return acc;
    }, []);

    uniqueRequests.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    res.json({
      success: true,
      data: uniqueRequests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: uniqueRequests.length,
      },
    });
  } catch (error) {
    console.error("Помилка отримання персональних запитів:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: error.message,
    });
  }
};

module.exports = {
  createRequest,
  getAllRequests,
  getRequestDetails,
  updateRequestDetails,
  updateStatus,
  deleteRequestById,
  getStats,
  getMyRequests,
};
