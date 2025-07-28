/**
 * Контролер для роботи з потоками
 * Обробляє всі HTTP запити пов'язані з потоками
 * Додано підтримку team_id
 */

const { validationResult } = require("express-validator");
const flowModel = require("../models/flow.model");

/**
 * Обробка помилок валідації
 * @param {Object} req - Об'єкт запиту
 * @param {Object} res - Об'єкт відповіді
 * @returns {boolean} true якщо є помилки валідації
 */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Помилки валідації",
      errors: errors.array(),
    });
  }
  return false;
};

/**
 * Основні CRUD операції
 */

/**
 * Отримання всіх потоків з фільтрацією та пагінацією
 * GET /api/flows
 */
const getAllFlows = async (req, res) => {
  try {
    // Функція для парсингу масивів ID з параметрів запиту
    const parseIds = (param) => {
      if (!param) return undefined;
      if (typeof param === "string") {
        // Якщо це строка з комами, розділяємо її
        if (param.includes(",")) {
          return param
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        }
        // Інакше це одиночний ID
        const singleId = parseInt(param);
        return !isNaN(singleId) ? [singleId] : undefined;
      }
      if (Array.isArray(param)) {
        return param.map((id) => parseInt(id)).filter((id) => !isNaN(id));
      }
      return undefined;
    };

    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,

      // Обробляємо масиви ID
      offerIds: parseIds(req.query.offerIds),
      userIds: parseIds(req.query.userIds),
      geoIds: parseIds(req.query.geoIds),
      teamIds: parseIds(req.query.teamIds),
      partnerIds: parseIds(req.query.partnerIds),
      brandIds: parseIds(req.query.brandIds),

      // Залишаємо сумісність зі старими параметрами
      offerId: req.query.offerId ? parseInt(req.query.offerId) : undefined,
      userId: req.query.userId ? parseInt(req.query.userId) : undefined,
      geoId: req.query.geoId ? parseInt(req.query.geoId) : undefined,
      teamId: req.query.teamId ? parseInt(req.query.teamId) : undefined,
      partnerId: req.query.partnerId
        ? parseInt(req.query.partnerId)
        : undefined,

      status: req.query.status,
      onlyActive: req.query.onlyActive === "true",
      search: req.query.search,
      currency: req.query.currency,
      sortBy: req.query.sortBy || "created_at",
      sortOrder: req.query.sortOrder || "desc",
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const result = await flowModel.getAllFlows(options);

    res.json({
      success: true,
      data: result.flows,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Помилка отримання потоків:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання потоку за ID
 * GET /api/flows/:id
 */
const getFlowById = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const flow = await flowModel.getFlowById(flowId);

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: "Потік не знайдено",
      });
    }

    res.json({
      success: true,
      data: flow,
    });
  } catch (error) {
    console.error("Помилка отримання потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Створення нового потоку (ВИПРАВЛЕНО)
 * POST /api/flows
 */
const createFlow = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowData = {
      ...req.body,
      created_by: req.user.id,
    };

    const newFlow = await flowModel.createFlow(flowData);

    res.status(201).json({
      success: true,
      message: "Потік успішно створено",
      data: newFlow,
    });
  } catch (error) {
    console.error("Помилка створення потоку:", error);

    if (error.message === "Потік з такою назвою вже існує") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Оновлення потоку (ВИПРАВЛЕНО - додано landings)
 * PUT /api/flows/:id
 */
const updateFlow = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const flowData = {
      ...req.body,
      updated_by: req.user.id,
    };

    const updatedFlow = await flowModel.updateFlow(flowId, flowData);

    if (!updatedFlow) {
      return res.status(404).json({
        success: false,
        message: "Потік не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Потік успішно оновлено",
      data: updatedFlow,
    });
  } catch (error) {
    console.error("Помилка оновлення потоку:", error);

    if (error.message === "Потік з такою назвою вже існує") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Видалення потоку
 * DELETE /api/flows/:id
 */
const deleteFlow = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const result = await flowModel.deleteFlow(flowId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Помилка видалення потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Робота з командами
 */

/**
 * Отримання потоків команди
 * GET /api/flows/team/:teamId
 */
const getFlowsByTeam = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);

    if (isNaN(teamId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID команди",
      });
    }

    const options = {
      status: req.query.status,
      onlyActive: req.query.onlyActive !== "false",
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    };

    const flows = await flowModel.getFlowsByTeam(teamId, options);

    res.json({
      success: true,
      data: flows,
    });
  } catch (error) {
    console.error("Помилка отримання потоків команди:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Перенесення потоку до іншої команди
 * PATCH /api/flows/:id/transfer-team
 */
const transferFlowToTeam = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);
    const { team_id } = req.body;

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    if (!team_id || isNaN(parseInt(team_id))) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID команди",
      });
    }

    const updatedFlow = await flowModel.transferFlowToTeam(
      flowId,
      parseInt(team_id),
      req.user.id
    );

    if (!updatedFlow) {
      return res.status(404).json({
        success: false,
        message: "Потік не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Потік успішно перенесено до іншої команди",
      data: updatedFlow,
    });
  } catch (error) {
    console.error("Помилка перенесення потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання статистики потоків по командах
 * GET /api/flows/stats/by-teams
 */
const getFlowStatsByTeams = async (req, res) => {
  try {
    const options = {
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      onlyActive: req.query.onlyActive !== "false",
    };

    const stats = await flowModel.getFlowStatsByTeams(options);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Помилка отримання статистики за командами:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Операції зі статусом (існуючі методи залишаються без змін)
 */

/**
 * Оновлення статусу потоку
 * PATCH /api/flows/:id/status
 */
const updateFlowStatus = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const updatedFlow = await flowModel.updateFlowStatus(
      flowId,
      status,
      req.user.id
    );

    if (!updatedFlow) {
      return res.status(404).json({
        success: false,
        message: "Потік не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Статус потоку оновлено",
      data: updatedFlow,
    });
  } catch (error) {
    console.error("Помилка оновлення статусу потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Оновлення активності потоку
 * PATCH /api/flows/:id/active
 */
const updateFlowActiveStatus = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);
    const { is_active } = req.body;

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const updatedFlow = await flowModel.updateFlowActiveStatus(
      flowId,
      is_active,
      req.user.id
    );

    if (!updatedFlow) {
      return res.status(404).json({
        success: false,
        message: "Потік не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Активність потоку оновлено",
      data: updatedFlow,
    });
  } catch (error) {
    console.error("Помилка оновлення активності потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Масове оновлення статусу потоків
 * POST /api/flows/bulk-status-update
 */
const bulkUpdateFlowStatus = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { flowIds, status } = req.body;

    if (!Array.isArray(flowIds) || flowIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Список ID потоків є обов'язковим",
      });
    }

    const updatedFlows = await flowModel.bulkUpdateFlowStatus(
      flowIds,
      status,
      req.user.id
    );

    res.json({
      success: true,
      message: `Оновлено ${updatedFlows.length} потоків`,
      data: updatedFlows,
    });
  } catch (error) {
    console.error("Помилка масового оновлення статусу:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Масове перенесення потоків до команди
 * POST /api/flows/bulk-transfer-team
 */
const bulkTransferFlowsToTeam = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { flowIds, team_id } = req.body;

    if (!Array.isArray(flowIds) || flowIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Список ID потоків є обов'язковим",
      });
    }

    if (!team_id || isNaN(parseInt(team_id))) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID команди",
      });
    }

    const updatedFlows = [];

    for (const flowId of flowIds) {
      try {
        const updatedFlow = await flowModel.transferFlowToTeam(
          parseInt(flowId),
          parseInt(team_id),
          req.user.id
        );
        if (updatedFlow) {
          updatedFlows.push(updatedFlow);
        }
      } catch (error) {
        console.error(`Помилка перенесення потоку ${flowId}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Перенесено ${updatedFlows.length} потоків до команди`,
      data: updatedFlows,
    });
  } catch (error) {
    console.error("Помилка масового перенесення потоків:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Робота з користувачами потоку
 */

/**
 * Отримання користувачів потоку
 * GET /api/flows/:id/users
 */
const getFlowUsers = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);
    const onlyActive = req.query.onlyActive === "true";

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const users = await flowModel.getFlowUsers(flowId, onlyActive);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Помилка отримання користувачів потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Додавання користувача до потоку (ВИПРАВЛЕНО - видалено percentage та individual_cpa)
 * POST /api/flows/:id/users
 */
const addUserToFlow = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const userData = {
      ...req.body,
      created_by: req.user.id,
    };

    const addedUser = await flowModel.addUserToFlow(flowId, userData);

    res.status(201).json({
      success: true,
      message: "Користувача додано до потоку",
      data: addedUser,
    });
  } catch (error) {
    console.error("Помилка додавання користувача до потоку:", error);

    if (error.message === "Користувач вже доданий до цього потоку") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Оновлення користувача в потоці (ВИПРАВЛЕНО - видалено percentage та individual_cpa)
 * PUT /api/flows/:id/users/:userId
 */
const updateUserInFlow = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    if (isNaN(flowId) || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні ID потоку або користувача",
      });
    }

    const userData = {
      ...req.body,
      updated_by: req.user.id,
    };

    const updatedUser = await flowModel.updateUserInFlow(
      flowId,
      userId,
      userData
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "Користувач не знайдений в потоці",
      });
    }

    res.json({
      success: true,
      message: "Дані користувача в потоці оновлено",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Помилка оновлення користувача в потоці:", error);

    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Видалення користувача з потоку
 * DELETE /api/flows/:id/users/:userId
 */
const removeUserFromFlow = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    if (isNaN(flowId) || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні ID потоку або користувача",
      });
    }

    const result = await flowModel.removeUserFromFlow(flowId, userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Помилка видалення користувача з потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання потоків користувача
 * GET /api/flows/user/:userId
 */
const getUserFlows = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID користувача",
      });
    }

    const options = {
      status: req.query.status,
      onlyActive: req.query.onlyActive === "true",
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    };

    const flows = await flowModel.getUserFlows(userId, options);

    res.json({
      success: true,
      data: flows,
    });
  } catch (error) {
    console.error("Помилка отримання потоків користувача:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Комунікації в потоці
 */

/**
 * Надсилання повідомлення користувачеві
 * POST /api/flows/:id/messages
 */
const sendMessageToUser = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const messageData = {
      flow_id: flowId,
      sender_id: req.user.id,
      ...req.body,
    };

    const sentMessage = await flowModel.sendMessageToUser(messageData);

    res.status(201).json({
      success: true,
      message: "Повідомлення надіслано",
      data: sentMessage,
    });
  } catch (error) {
    console.error("Помилка надсилання повідомлення:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Надсилання оповіщення всім користувачам потоку
 * POST /api/flows/:id/notifications
 */
const sendNotificationToAllUsers = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const notificationData = {
      flow_id: flowId,
      sender_id: req.user.id,
      ...req.body,
    };

    const sentMessages = await flowModel.sendNotificationToAllUsers(
      notificationData
    );

    res.status(201).json({
      success: true,
      message: `Оповіщення надіслано ${sentMessages.length} користувачам`,
      data: sentMessages,
    });
  } catch (error) {
    console.error("Помилка надсилання оповіщення:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання комунікацій потоку
 * GET /api/flows/:id/communications
 */
const getFlowCommunications = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const options = {
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      messageType: req.query.messageType,
      unreadOnly: req.query.unreadOnly === "true",
      recipientId: req.query.recipientId
        ? parseInt(req.query.recipientId)
        : undefined,
    };

    const communications = await flowModel.getFlowCommunications(
      flowId,
      options
    );

    res.json({
      success: true,
      data: communications,
    });
  } catch (error) {
    console.error("Помилка отримання комунікацій:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Позначення повідомлення як прочитаного
 * PATCH /api/flows/messages/:messageId/read
 */
const markMessageAsRead = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);

    if (isNaN(messageId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID повідомлення",
      });
    }

    const updatedMessage = await flowModel.markMessageAsRead(
      messageId,
      req.user.id
    );

    if (!updatedMessage) {
      return res.status(404).json({
        success: false,
        message: "Повідомлення не знайдено або ви не маєте доступу до нього",
      });
    }

    res.json({
      success: true,
      message: "Повідомлення позначено як прочитане",
      data: updatedMessage,
    });
  } catch (error) {
    console.error("Помилка позначення повідомлення:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання кількості непрочитаних повідомлень
 * GET /api/flows/unread-count
 */
const getUnreadMessagesCount = async (req, res) => {
  try {
    const flowId = req.query.flowId ? parseInt(req.query.flowId) : null;

    const count = await flowModel.getUnreadMessagesCount(req.user.id, flowId);

    res.json({
      success: true,
      data: { unread_count: count },
    });
  } catch (error) {
    console.error(
      "Помилка отримання кількості непрочитаних повідомлень:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Статистика потоків
 */

/**
 * Додавання/оновлення статистики потоку
 * POST /api/flows/:id/stats
 */
const upsertFlowStats = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const statsData = {
      flow_id: flowId,
      ...req.body,
    };

    const savedStats = await flowModel.upsertFlowStats(statsData);

    res.json({
      success: true,
      message: "Статистику збережено",
      data: savedStats,
    });
  } catch (error) {
    console.error("Помилка збереження статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання статистики потоку
 * GET /api/flows/:id/stats
 */
const getFlowStats = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const options = {
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      userId: req.query.userId ? parseInt(req.query.userId) : undefined,
      groupBy: req.query.groupBy || "day",
    };

    const stats = await flowModel.getFlowStats(flowId, options);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Помилка отримання статистики потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання топ користувачів за метрикою
 * GET /api/flows/:id/top-users
 */
const getTopUsersByMetric = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);

    if (isNaN(flowId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    const options = {
      metric: req.query.metric || "revenue",
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: parseInt(req.query.limit) || 10,
    };

    const topUsers = await flowModel.getTopUsersByMetric(flowId, options);

    res.json({
      success: true,
      data: topUsers,
    });
  } catch (error) {
    console.error("Помилка отримання топ користувачів:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання загальної статистики всіх потоків
 * GET /api/flows/stats/overview
 */
const getAllFlowsStats = async (req, res) => {
  try {
    // Функція для обробки ID - може прийти як рядок або масив
    const processIds = (ids) => {
      if (!ids) return undefined;
      
      if (typeof ids === 'string') {
        return ids.split(',').map(id => parseInt(id.trim()));
      } else if (Array.isArray(ids)) {
        return ids.map(id => parseInt(id));
      }
      return undefined;
    };

    // Обробка userIds
    const userIds = processIds(req.query.userIds);
    console.log('Processed userIds:', userIds);

    // Обробка teamIds
    const teamIds = processIds(req.query.teamIds);
    console.log('Processed teamIds:', teamIds);

    const options = {
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      status: req.query.status,
      partnerId: req.query.partnerId ? parseInt(req.query.partnerId) : undefined,
      userIds: userIds && userIds.length > 0 ? userIds : undefined,
      teamIds: teamIds && teamIds.length > 0 ? teamIds : undefined,
      onlyActive: req.query.onlyActive == "true" ? true : false,
    };

    const stats = await flowModel.getAllFlowsStats(options);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Помилка отримання загальної статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання статистики потоків за партнерами
 * GET /api/flows/stats/by-partners
 */
const getFlowStatsByPartners = async (req, res) => {
  try {
    const options = {
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: parseInt(req.query.limit) || 20,
    };

    const stats = await flowModel.getFlowStatsByPartners(options);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Помилка отримання статистики за партнерами:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Перевірка доступу користувача до потоку
 * GET /api/flows/:id/access-check
 */
const checkUserFlowAccess = async (req, res) => {
  try {
    const flowId = parseInt(req.params.id);
    const userId = req.query.userId ? parseInt(req.query.userId) : req.user.id;

    if (isNaN(flowId) || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні ID потоку або користувача",
      });
    }

    const hasAccess = await flowModel.checkUserFlowAccess(flowId, userId);

    res.json({
      success: true,
      data: { has_access: hasAccess },
    });
  } catch (error) {
    console.error("Помилка перевірки доступу:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  // Основні CRUD операції
  getAllFlows,
  getFlowById,
  createFlow,
  updateFlow,
  deleteFlow,

  // Операції зі статусом
  updateFlowStatus,
  updateFlowActiveStatus,
  bulkUpdateFlowStatus,

  // Робота з командами (нові методи)
  getFlowsByTeam,
  transferFlowToTeam,
  getFlowStatsByTeams,
  bulkTransferFlowsToTeam,

  // Робота з користувачами
  getFlowUsers,
  addUserToFlow,
  updateUserInFlow,
  removeUserFromFlow,
  getUserFlows,
  checkUserFlowAccess,

  // Комунікації
  sendMessageToUser,
  sendNotificationToAllUsers,
  getFlowCommunications,
  markMessageAsRead,
  getUnreadMessagesCount,

  // Статистика
  upsertFlowStats,
  getFlowStats,
  getTopUsersByMetric,
  getAllFlowsStats,
  getFlowStatsByPartners,
};
