/**
 * Контролер для роботи з потоками
 * ОНОВЛЕНО: додано підтримку типів потоків та KPI метрик
 * Адаптовано наявні методи під нову логіку
 */

const { validationResult } = require("express-validator");
const flowModel = require("../models/flow.model");

/**
 * Обробка помилок валідації
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
 * ОНОВЛЕНО: Отримання всіх потоків з фільтрацією та пагінацією
 * Додано підтримку фільтрації за типом потоку та метрикою KPI
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

      // ДОДАНО: фільтри за типом потоку та метрикою KPI
      flow_type: req.query.flow_type,
      kpi_metric: req.query.kpi_metric,

      status: req.query.status,
      onlyActive: req.query.onlyActive === "true",
      search: req.query.search,
      currency: req.query.currency,
      sortBy: req.query.sortBy || "created_at",
      sortOrder: req.query.sortOrder || "desc",
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const roleCheck = await applyRoleFilters(req, options);
    if (!roleCheck.success) {
      return res.status(roleCheck.statusCode).json({
        success: false,
        message: roleCheck.message,
      });
    }

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
 * Отримання потоку за ID (без змін, але отримує нові поля автоматично)
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
 * ОНОВЛЕНО: Створення нового потоку з підтримкою типів та KPI
 */
const createFlow = async (req, res) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const flowData = {
      ...req.body,
      created_by: req.user.id,
    };

    // ДОДАНО: Додаткова валідація для різних типів потоків
    if (flowData.flow_type === "spend") {
      // Для spend типу перевіряємо наявність діапазонів
      if (
        !flowData.spend_percentage_ranges ||
        !Array.isArray(flowData.spend_percentage_ranges)
      ) {
        return res.status(400).json({
          success: false,
          message: "Для типу 'spend' необхідно вказати діапазони процентів",
        });
      }

      // Валідуємо множники (повинні бути числами, не процентами)
      const invalidRanges = flowData.spend_percentage_ranges.filter(
        (range) =>
          typeof range.spend_multiplier !== "number" ||
          range.spend_multiplier < 0
      );

      if (invalidRanges.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "spend_multiplier має бути числом >= 0 (множник, не проценти). Наприклад: 1.0 для 100%, 1.2 для 120%",
        });
      }
    } else if (flowData.flow_type === "cpa") {
      // Для cpa типу перевіряємо цільове значення
      if (
        flowData.kpi_target_value === undefined ||
        flowData.kpi_target_value === null
      ) {
        return res.status(400).json({
          success: false,
          message: "Для типу 'cpa' необхідно вказати цільове значення KPI",
        });
      }
    }

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
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Оновлення потоку з підтримкою нових полів
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

    // ДОДАНО: Отримуємо поточний потік для валідації змін типу
    const existingFlow = await flowModel.getFlowById(flowId);
    if (!existingFlow) {
      return res.status(404).json({
        success: false,
        message: "Потік не знайдено",
      });
    }

    const flowData = {
      ...req.body,
      updated_by: req.user.id,
    };

    // ДОДАНО: Валідація при зміні типу потоку
    if (flowData.flow_type && flowData.flow_type !== existingFlow.flow_type) {
      if (flowData.flow_type === "spend" && !flowData.spend_percentage_ranges) {
        return res.status(400).json({
          success: false,
          message:
            "При зміні типу на 'spend' необхідно вказати діапазони процентів",
        });
      }

      if (
        flowData.flow_type === "cpa" &&
        flowData.kpi_target_value === undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "При зміні типу на 'cpa' необхідно вказати цільове значення KPI",
        });
      }
    }

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
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Видалення потоку (без змін)
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
 * Оновлення статусу потоку (без змін)
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
 * Оновлення активності потоку (без змін)
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
 * Отримання користувачів потоку (без змін)
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
 * ОНОВЛЕНО: Отримання загальної статистики всіх потоків з підтримкою типів
 */
const getAllFlowsStats = async (req, res) => {
  try {
    // Функція для обробки ID - може прийти як рядок або масив
    const processIds = (ids) => {
      if (!ids) return undefined;

      if (typeof ids === "string") {
        return ids.split(",").map((id) => parseInt(id.trim()));
      } else if (Array.isArray(ids)) {
        return ids.map((id) => parseInt(id));
      }
      return undefined;
    };

    // Обробка userIds
    const userIds = processIds(req.query.userIds);
    console.log("Processed userIds:", userIds);

    // Обробка teamIds
    const teamIds = processIds(req.query.teamIds);
    console.log("Processed teamIds:", teamIds);

    const options = {
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      status: req.query.status,
      partnerId: req.query.partnerId
        ? parseInt(req.query.partnerId)
        : undefined,
      userIds: userIds && userIds.length > 0 ? userIds : undefined,
      teamIds: teamIds && teamIds.length > 0 ? teamIds : undefined,
      onlyActive: req.query.onlyActive == "true" ? true : false,
      // ДОДАНО: фільтри за типом потоку та метрикою KPI
      flow_type: req.query.flow_type,
      kpi_metric: req.query.kpi_metric,
    };

    const roleCheck = await applyRoleFilters(req, options);
    if (!roleCheck.success) {
      return res.status(roleCheck.statusCode).json({
        success: false,
        message: roleCheck.message,
      });
    }

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
 * УНІВЕРСАЛЬНА ФУНКЦІЯ ДЛЯ ЗАСТОСУВАННЯ РОЛЕВИХ ФІЛЬТРІВ (без змін)
 */
const applyRoleFilters = async (req, options) => {
  const userRole = req.userRole;
  const userId = req.userId;
  const teamId = req.user.teamId;

  try {
    switch (userRole) {
      case "admin":
      case "bizdev":
        // Повний доступ
        return { success: true };
      case "affiliate_manager":
        // Повний доступ
        return { success: true };
      case "teamlead":
        if (!teamId) {
          return {
            success: false,
            statusCode: 403,
            message: "TeamLead повинен мати призначену команду",
          };
        }

        // Перевірка явно вказаних команд
        if (options.teamIds || options.teamId) {
          const requestedTeamIds = options.teamIds || [options.teamId];
          const hasAccess = requestedTeamIds.every(
            (teamId) => teamId === teamId
          );

          if (!hasAccess) {
            return {
              success: false,
              statusCode: 403,
              message: "Недостатньо прав для доступу до цієї команди",
            };
          }
        } else {
          // Застосовуємо фільтр команди
          options.teamIds = [teamId];
        }

        return { success: true };

      case "buyer":
        // Перевірка явно вказаних користувачів
        if (options.userIds || options.userId) {
          const requestedUserIds = options.userIds || [options.userId];
          const hasAccess = requestedUserIds.every((id) => id === userId);

          if (!hasAccess) {
            return {
              success: false,
              statusCode: 403,
              message: "Недостатньо прав для доступу до цього користувача",
            };
          }
        } else {
          // Застосовуємо фільтр користувача
          options.userIds = [userId];
        }

        return { success: true };

      default:
        return {
          success: false,
          statusCode: 403,
          message: "Недостатньо прав доступу",
        };
    }
  } catch (error) {
    console.error("Помилка застосування ролевих фільтрів:", error);
    return {
      success: false,
      statusCode: 500,
      message: "Внутрішня помилка сервера при перевірці прав доступу",
    };
  }
};

module.exports = {
  // Основні CRUD операції
  getAllFlows,
  getFlowById,
  createFlow,
  updateFlow,
  deleteFlow,
  getFlowUsers,
  getAllFlowsStats,

  // Операції зі статусом
  updateFlowStatus,
  updateFlowActiveStatus,
};
