const partnerPayoutModel = require("../models/partner.payout.model");
const userModel = require("../models/user.model");
const { validationResult } = require("express-validator");

/**
 * Отримання списку всіх заявок на виплату з фільтрацією та пагінацією
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllPayoutRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      partnerId,
      teamId,
      status,
      currency,
      startDate,
      endDate,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (partnerId && isNaN(parseInt(partnerId))) {
      errors.push({ param: "partnerId", msg: "ID партнера має бути числом" });
    }
    if (teamId && isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "ID команди має бути числом" });
    }
    if (
      status &&
      ![
        "draft",
        "pending",
        "approved",
        "in_payment",
        "completed",
        "rejected",
        "cancelled",
      ].includes(status)
    ) {
      errors.push({ param: "status", msg: "Невірний статус заявки" });
    }
    if (currency && !["USD", "EUR", "GBP"].includes(currency)) {
      errors.push({ param: "currency", msg: "Невірна валюта" });
    }
    if (startDate && isNaN(Date.parse(startDate))) {
      errors.push({ param: "startDate", msg: "Невірний формат дати початку" });
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      errors.push({ param: "endDate", msg: "Невірний формат дати закінчення" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Перевірка ролі користувача
    if (req.user.role === "teamlead") {
      // Для тімліда teamId є обов'язковою
      if (!teamId) {
        return res.status(400).json({
          success: false,
          message: "Для тімліда параметр teamId є обов'язковим",
        });
      }

      // Отримуємо інформацію про поточного користувача
      const currentUser = await userModel.getUserById(req.user.id);

      // Перевіряємо, чи тімлід належить до цієї команди
      if (currentUser.team_id !== parseInt(teamId)) {
        return res.status(403).json({
          success: false,
          message: "Доступ заборонено. Ви не є тімлідом цієї команди",
        });
      }
    }

    // Отримання заявок
    const result = await partnerPayoutModel.getAllPayoutRequests({
      page: parseInt(page),
      limit: parseInt(limit),
      partnerId: partnerId ? parseInt(partnerId) : undefined,
      teamId: teamId ? parseInt(teamId) : undefined,
      status,
      currency,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Помилка отримання заявок на виплату:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання заявок на виплату",
    });
  }
};

/**
 * Отримання детальної інформації про заявку за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPayoutRequestById = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.id);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки має бути числом",
      });
    }

    // Отримання заявки
    const payoutRequest = await partnerPayoutModel.getPayoutRequestById(
      payoutRequestId
    );

    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку не знайдено",
      });
    }

    res.json({
      success: true,
      data: payoutRequest,
    });
  } catch (err) {
    console.error(`Помилка отримання заявки з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання заявки",
    });
  }
};

/**
 * Створення нової заявки на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createPayoutRequest = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const payoutData = {
      ...req.body,
      created_by: req.userId,
    };

    // Додаткова валідація дат
    const { period_start, period_end } = payoutData;
    if (new Date(period_start) >= new Date(period_end)) {
      return res.status(400).json({
        success: false,
        message: "Дата початку періоду має бути менша за дату закінчення",
      });
    }

    // Створення заявки
    const payoutRequest = await partnerPayoutModel.createPayoutRequest(
      payoutData
    );

    res.status(201).json({
      success: true,
      data: payoutRequest,
      message: "Заявку на виплату успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення заявки на виплату:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення заявки на виплату",
    });
  }
};

/**
 * Оновлення даних заявки на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updatePayoutRequest = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.id);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки має бути числом",
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

    // Додаткова валідація дат
    const { period_start, period_end } = req.body;
    if (
      period_start &&
      period_end &&
      new Date(period_start) >= new Date(period_end)
    ) {
      return res.status(400).json({
        success: false,
        message: "Дата початку періоду має бути менша за дату закінчення",
      });
    }

    // Оновлення заявки
    const updatedPayoutRequest = await partnerPayoutModel.updatePayoutRequest(
      payoutRequestId,
      req.body
    );

    if (!updatedPayoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку не знайдено",
      });
    }

    res.json({
      success: true,
      data: updatedPayoutRequest,
      message: "Заявку на виплату успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення заявки з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення заявки",
    });
  }
};

/**
 * Оновлення статусу заявки на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updatePayoutRequestStatus = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.id);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки має бути числом",
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

    const { status } = req.body;

    // Оновлення статусу заявки
    const updatedPayoutRequest =
      await partnerPayoutModel.updatePayoutRequestStatus(
        payoutRequestId,
        status,
        req.userId
      );

    if (!updatedPayoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку не знайдено",
      });
    }

    res.json({
      success: true,
      data: updatedPayoutRequest,
      message: `Статус заявки успішно змінено на "${status}"`,
    });
  } catch (err) {
    console.error(
      `Помилка оновлення статусу заявки з ID ${req.params.id}:`,
      err
    );
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення статусу заявки",
    });
  }
};

/**
 * Видалення заявки на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deletePayoutRequest = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.id);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки має бути числом",
      });
    }

    // Видалення заявки
    const result = await partnerPayoutModel.deletePayoutRequest(
      payoutRequestId
    );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error(`Помилка видалення заявки з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення заявки",
    });
  }
};

/**
 * Отримання всіх заявок партнера
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPayoutRequestsByPartner = async (req, res) => {
  try {
    const partnerId = parseInt(req.params.partnerId);

    if (isNaN(partnerId)) {
      return res.status(400).json({
        success: false,
        message: "ID партнера має бути числом",
      });
    }

    const payoutRequests = await partnerPayoutModel.getPayoutRequestsByPartner(
      partnerId
    );

    res.json({
      success: true,
      data: payoutRequests,
    });
  } catch (err) {
    console.error("Помилка отримання заявок партнера:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання заявок партнера",
    });
  }
};

/**
 * Отримання всіх заявок команди
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPayoutRequestsByTeam = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);

    if (isNaN(teamId)) {
      return res.status(400).json({
        success: false,
        message: "ID команди має бути числом",
      });
    }

    const payoutRequests = await partnerPayoutModel.getPayoutRequestsByTeam(
      teamId
    );

    res.json({
      success: true,
      data: payoutRequests,
    });
  } catch (err) {
    console.error("Помилка отримання заявок команди:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання заявок команди",
    });
  }
};

/**
 * Отримання статистики заявок на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPayoutRequestsStats = async (req, res) => {
  try {
    const { startDate, endDate, teamId, partnerId, status } = req.query;

    // Валідація параметрів
    const options = {};

    // Валідація та додавання дат
    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          message:
            "Неправильний формат початкової дати. Використовуйте формат YYYY-MM-DD",
        });
      }
      options.startDate = startDate;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message:
            "Неправильний формат кінцевої дати. Використовуйте формат YYYY-MM-DD",
        });
      }
      options.endDate = endDate;
    }

    // Перевірка логіки дат
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "Початкова дата не може бути пізнішою за кінцеву",
        });
      }
    }

    // Валідація та додавання teamId
    if (teamId) {
      const parsedTeamId = parseInt(teamId, 10);
      if (isNaN(parsedTeamId) || parsedTeamId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID команди повинен бути додатним числом",
        });
      }
      options.teamId = parsedTeamId;
    }

    // Валідація та додавання partnerId
    if (partnerId) {
      const parsedPartnerId = parseInt(partnerId, 10);
      if (isNaN(parsedPartnerId) || parsedPartnerId <= 0) {
        return res.status(400).json({
          success: false,
          message: "ID партнера повинен бути додатним числом",
        });
      }
      options.partnerId = parsedPartnerId;
    }

    // Валідація статусу
    if (status) {
      const validStatuses = [
        "draft",
        "pending",
        "approved",
        "in_payment",
        "completed",
        "rejected",
        "cancelled",
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Неправильний статус. Допустимі значення: ${validStatuses.join(
            ", "
          )}`,
        });
      }
      options.status = status;
    }

    // Отримання статистики з фільтрами
    const stats = await partnerPayoutModel.getPayoutRequestsStats(options);

    res.json({
      success: true,
      data: stats,
      meta: {
        filters: {
          startDate: options.startDate || null,
          endDate: options.endDate || null,
          teamId: options.teamId || null,
          partnerId: options.partnerId || null,
          status: options.status || null,
        },
        appliedFilters: Object.keys(options).length,
      },
    });
  } catch (err) {
    console.error("Помилка отримання статистики заявок:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики заявок",
    });
  }
};

/**
 * Отримання помісячної статистики заявок на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getMonthlyPayoutStats = async (req, res) => {
  try {
    const { year, teamId, partnerId, status } = req.query;

    // Валідація параметрів
    const errors = [];

    if (
      year &&
      (isNaN(parseInt(year)) || parseInt(year) < 2020 || parseInt(year) > 2030)
    ) {
      errors.push({
        param: "year",
        msg: "Рік має бути числом між 2020 та 2030",
      });
    }

    if (teamId && (isNaN(parseInt(teamId)) || parseInt(teamId) < 1)) {
      errors.push({
        param: "teamId",
        msg: "ID команди має бути позитивним числом",
      });
    }

    if (partnerId && (isNaN(parseInt(partnerId)) || parseInt(partnerId) < 1)) {
      errors.push({
        param: "partnerId",
        msg: "ID партнера має бути позитивним числом",
      });
    }

    if (
      status &&
      ![
        "draft",
        "pending",
        "approved",
        "in_payment",
        "completed",
        "rejected",
        "cancelled",
      ].includes(status)
    ) {
      errors.push({
        param: "status",
        msg: "Недійсний статус заявки",
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Помилки валідації",
        errors,
      });
    }

    // Формування опцій для моделі
    const options = {
      year: year ? parseInt(year) : undefined,
      teamId: teamId ? parseInt(teamId) : undefined,
      partnerId: partnerId ? parseInt(partnerId) : undefined,
      status: status || undefined,
    };

    // Отримання статистики з моделі
    const monthlyStats = await partnerPayoutModel.getMonthlyPayoutStats(
      options
    );

    res.json({
      success: true,
      data: monthlyStats,
      message: "Помісячна статистика отримана успішно",
    });
  } catch (error) {
    console.error("Помилка отримання помісячної статистики:", error);
    res.status(500).json({
      success: false,
      message:
        "Внутрішня помилка сервера під час отримання помісячної статистики",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};