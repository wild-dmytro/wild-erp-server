const partnerPayoutModel = require("../models/partner.payout.model");
const partnerPaymentModel = require("../models/partner.payment.model");
const payoutAllocationModel = require("../models/payout.allocation.model");

const userModel = require("../models/user.model");
const { validationResult } = require("express-validator");

/**
 * Отримання списку всіх заявок на виплату з фільтрацією та пагінацією
 * Включає дані про payments і allocations для кожної заявки
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
      includeDetails = "true", // новий параметр для включення додаткових даних
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

    // Якщо не потрібно включати додаткові дані, повертаємо як раніше
    if (
      includeDetails === "false" ||
      !result.data ||
      result.data.length === 0
    ) {
      return res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    }

    // Збираємо ID всіх заявок для batch-запитів
    const payoutRequestIds = result.data.map((request) => request.id);

    try {
      // Паралельно отримуємо платежі та розподіли для всіх заявок
      const paymentsPromises = payoutRequestIds.map((id) =>
        partnerPaymentModel
          .getPaymentsByPayoutRequest(id)
          .then((payments) => ({ payoutRequestId: id, payments }))
          .catch((err) => {
            console.error(`Помилка отримання платежів для заявки ${id}:`, err);
            return { payoutRequestId: id, payments: [] };
          })
      );

      const allocationsPromises = payoutRequestIds.map((id) =>
        Promise.all([
          payoutAllocationModel.getAllocationsByPayoutRequest(id),
          payoutAllocationModel.getAllocationStats(id),
        ])
          .then(([allocations, stats]) => ({
            payoutRequestId: id,
            allocations: allocations || [],
            stats: stats || {},
          }))
          .catch((err) => {
            console.error(
              `Помилка отримання розподілів для заявки ${id}:`,
              err
            );
            return {
              payoutRequestId: id,
              allocations: [],
              stats: {},
            };
          })
      );

      // Очікуємо завершення всіх запитів
      const [paymentsResults, allocationsResults] = await Promise.all([
        Promise.all(paymentsPromises),
        Promise.all(allocationsPromises),
      ]);

      // Створюємо мапи для швидкого доступу до даних
      const paymentsMap = new Map();
      const allocationsMap = new Map();

      paymentsResults.forEach(({ payoutRequestId, payments }) => {
        paymentsMap.set(payoutRequestId, payments);
      });

      allocationsResults.forEach(({ payoutRequestId, allocations, stats }) => {
        allocationsMap.set(payoutRequestId, { allocations, stats });
      });

      // Об'єднуємо дані
      const enrichedData = result.data.map((payoutRequest) => {
        const payments = paymentsMap.get(payoutRequest.id) || [];
        const allocationData = allocationsMap.get(payoutRequest.id) || {
          allocations: [],
          stats: {},
        };

        return {
          ...payoutRequest,
          payments: payments,
          allocations: {
            items: allocationData.allocations,
            stats: allocationData.stats,
          },
          // Додаткові обчислені поля
          summary: {
            payments_count: payments.length,
            payments_total: payments.reduce(
              (sum, p) => sum + (parseFloat(p.amount) || 0),
              0
            ),
            allocations_count: allocationData.allocations.length,
            allocations_total: allocationData.stats.total_allocated || 0,
            allocation_percentage:
              allocationData.stats.allocation_percentage || 0,
          },
        };
      });

      res.json({
        success: true,
        data: enrichedData,
        pagination: result.pagination,
        meta: {
          include_details: true,
          total_payments: paymentsResults.reduce(
            (sum, r) => sum + r.payments.length,
            0
          ),
          total_allocations: allocationsResults.reduce(
            (sum, r) => sum + r.allocations.length,
            0
          ),
        },
      });
    } catch (detailsError) {
      console.error("Помилка отримання додаткових даних:", detailsError);

      // У випадку помилки повертаємо базові дані
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        warning:
          "Не вдалося завантажити додаткові дані про платежі та розподіли",
      });
    }
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
 * Включає дані про payments і allocations
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPayoutRequestById = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.id);
    const { includeDetails = "true" } = req.query;

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки має бути числом",
      });
    }

    // Паралельно отримуємо всі необхідні дані
    const promises = [partnerPayoutModel.getPayoutRequestById(payoutRequestId)];

    // Додаємо запити на платежі та розподіли, якщо потрібно
    if (includeDetails === "true") {
      promises.push(
        partnerPaymentModel
          .getPaymentsByPayoutRequest(payoutRequestId)
          .catch((err) => {
            console.error(
              `Помилка отримання платежів для заявки ${payoutRequestId}:`,
              err
            );
            return [];
          }),
        payoutAllocationModel
          .getAllocationsByPayoutRequest(payoutRequestId)
          .catch((err) => {
            console.error(
              `Помилка отримання розподілів для заявки ${payoutRequestId}:`,
              err
            );
            return [];
          }),
        payoutAllocationModel
          .getAllocationStats(payoutRequestId)
          .catch((err) => {
            console.error(
              `Помилка отримання статистики розподілів для заявки ${payoutRequestId}:`,
              err
            );
            return {};
          })
      );
    }

    const results = await Promise.all(promises);
    const [payoutRequest, payments, allocations, allocationStats] = results;

    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку не знайдено",
      });
    }

    // Базовий відгук
    const responseData = {
      ...payoutRequest,
    };

    // Додаємо деталі, якщо потрібно
    if (includeDetails === "true") {
      responseData.payments = payments || [];
      responseData.allocations = {
        items: allocations || [],
        stats: allocationStats || {},
      };

      // Додаткові обчислені поля
      responseData.summary = {
        payments_count: (payments || []).length,
        payments_total: (payments || []).reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        ),
        allocations_count: (allocations || []).length,
        allocations_total:
          (allocationStats && allocationStats.total_allocated) || 0,
        allocation_percentage:
          (allocationStats && allocationStats.allocation_percentage) || 0,
        unique_users: (allocationStats && allocationStats.unique_users) || 0,
      };

      // Статус аналіз
      const paymentsTotal = responseData.summary.payments_total;
      const allocationsTotal = responseData.summary.allocations_total;
      const payoutTotal = parseFloat(payoutRequest.total_amount) || 0;

      responseData.analysis = {
        is_fully_allocated: allocationsTotal >= payoutTotal,
        is_fully_paid: paymentsTotal >= payoutTotal,
        allocation_coverage:
          payoutTotal > 0
            ? Math.round((allocationsTotal / payoutTotal) * 100)
            : 0,
        payment_coverage:
          payoutTotal > 0 ? Math.round((paymentsTotal / payoutTotal) * 100) : 0,
        remaining_to_allocate: Math.max(0, payoutTotal - allocationsTotal),
        remaining_to_pay: Math.max(0, payoutTotal - paymentsTotal),
      };
    }

    res.json({
      success: true,
      data: responseData,
      meta: {
        include_details: includeDetails === "true",
        loaded_at: new Date().toISOString(),
      },
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
 * Допоміжна функція для отримання повних даних однієї заявки
 * Може використовуватися в інших частинах додатку
 * @param {number} payoutRequestId - ID заявки на виплату
 * @returns {Promise<Object>} Повні дані заявки з платежами та розподілами
 */
exports.getFullPayoutRequestData = async (payoutRequestId) => {
  try {
    const [payoutRequest, payments, allocations, allocationStats] =
      await Promise.all([
        partnerPayoutModel.getPayoutRequestById(payoutRequestId),
        partnerPaymentModel
          .getPaymentsByPayoutRequest(payoutRequestId)
          .catch(() => []),
        payoutAllocationModel
          .getAllocationsByPayoutRequest(payoutRequestId)
          .catch(() => []),
        payoutAllocationModel
          .getAllocationStats(payoutRequestId)
          .catch(() => ({})),
      ]);

    if (!payoutRequest) {
      return null;
    }

    return {
      ...payoutRequest,
      payments: payments || [],
      allocations: {
        items: allocations || [],
        stats: allocationStats || {},
      },
      summary: {
        payments_count: (payments || []).length,
        payments_total: (payments || []).reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0
        ),
        allocations_count: (allocations || []).length,
        allocations_total:
          (allocationStats && allocationStats.total_allocated) || 0,
        allocation_percentage:
          (allocationStats && allocationStats.allocation_percentage) || 0,
        unique_users: (allocationStats && allocationStats.unique_users) || 0,
      },
    };
  } catch (error) {
    console.error(
      `Помилка отримання повних даних заявки ${payoutRequestId}:`,
      error
    );
    throw error;
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
