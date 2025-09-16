const requestModel = require("../models/request.model");
const reportsModel = require("../models/reports.model");
const { isValid } = require("date-fns");
const { validationResult } = require("express-validator");

/**
 * Отримання статистики заявок за фінансовими менеджерами
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getFinanceManagerStats = async (req, res) => {
  try {
    const { startDate, endDate, requestType } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (startDate && isNaN(Date.parse(startDate))) {
      errors.push({ param: "startDate", msg: "Невірний формат дати" });
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      errors.push({ param: "endDate", msg: "Невірний формат дати" });
    }
    if (requestType && !["agent_refill", "expenses"].includes(requestType)) {
      errors.push({ param: "requestType", msg: "Невірний тип заявки" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Отримання даних
    const stats = await requestModel.getFinanceManagerStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      requestType,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики фінансових менеджерів:", err);
    res.status(500).json({
      success: false,
      message:
        "Помилка сервера під час отримання статистики фінансових менеджерів",
    });
  }
};

/**
 * Отримання сумарних витрат по місяцях або тижнях
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getMonthlyExpenseSummary = async (req, res) => {
  try {
    const {
      year = new Date().getFullYear(),
      teamId,
      period = "month", // 'month' або 'week'
      month, // для тижневого періоду в конкретному місяці
      startDate, // кастомний початок періоду
      endDate, // кастомний кінець періоду
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];

    if (isNaN(parseInt(year))) {
      errors.push({ param: "year", msg: "Рік повинен бути числом" });
    }

    if (period && !["month", "week"].includes(period)) {
      errors.push({
        param: "period",
        msg: "Період повинен бути 'month' або 'week'",
      });
    }

    if (
      month &&
      (isNaN(parseInt(month)) || parseInt(month) < 1 || parseInt(month) > 12)
    ) {
      errors.push({
        param: "month",
        msg: "Місяць повинен бути числом від 1 до 12",
      });
    }

    if (teamId && isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "ID команди повинен бути числом" });
    }

    // Валідація дат для кастомного періоду
    let parsedStartDate = null;
    let parsedEndDate = null;

    if (startDate) {
      parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        errors.push({
          param: "startDate",
          msg: "Невірний формат початкової дати",
        });
      }
    }

    if (endDate) {
      parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        errors.push({ param: "endDate", msg: "Невірний формат кінцевої дати" });
      }
    }

    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
      errors.push({
        param: "dateRange",
        msg: "Початкова дата не може бути пізніше кінцевої",
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Підготовка параметрів для моделі
    const params = {
      year: parseInt(year),
      period: period,
      teamId: teamId ? parseInt(teamId) : undefined,
      month: month ? parseInt(month) : undefined,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    };

    // Отримання даних
    const data = await requestModel.getMonthlyExpenseSummary(params);

    // Формування відповіді з додатковими метаданими
    const response = {
      success: true,
      data: data,
      meta: {
        period: period,
        year: parseInt(year),
        month: month ? parseInt(month) : null,
        teamId: teamId ? parseInt(teamId) : null,
        totalRecords: data.length,
        hasCustomDateRange: !!(parsedStartDate && parsedEndDate),
        dateRange:
          parsedStartDate && parsedEndDate
            ? {
                startDate: startDate,
                endDate: endDate,
              }
            : null,
      },
    };

    res.json(response);
  } catch (err) {
    console.error("Помилка отримання статистики витрат:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики витрат",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання агрегованих даних для статистичних карток
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Перевірка коректності параметрів
    const errors = [];

    // Валідація дат
    if (startDate || endDate) {
      if (!startDate || !endDate) {
        errors.push({
          param: "date",
          msg: "Потрібно вказати обидві дати (startDate і endDate)",
        });
      } else {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (!isValid(start) || !isValid(end)) {
          errors.push({ param: "date", msg: "Невірний формат дат" });
        } else if (start > end) {
          errors.push({
            param: "date",
            msg: "startDate не може бути пізніше за endDate",
          });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Формування параметрів для моделі
    const params = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    console.log(params);

    // Отримання даних
    const data = await requestModel.getStatistics(params);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Помилка отримання статистики:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики",
    });
  }
};

exports.getRequestTypeSummary = async (req, res) => {
  try {
    const { startDate, endDate, teamId } = req.query;

    const errors = [];
    if (
      (startDate && isNaN(Date.parse(startDate))) ||
      (endDate && isNaN(Date.parse(endDate)))
    ) {
      errors.push({ msg: "Невірний формат дат" });
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await requestModel.getRequestTypeSummary({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      teamId: teamId ? parseInt(teamId) : undefined,
    });

    const mapped = {
      agent_refill: { count: 0, amount: 0 },
      expenses: { count: 0, amount: 0 },
    };

    result.forEach((row) => {
      mapped[row.request_type] = {
        count: parseInt(row.total_count),
        amount: parseFloat(row.total_amount),
      };
    });

    res.json({
      success: true,
      data: mapped,
    });
  } catch (err) {
    console.error("Помилка отримання зведення типів заявок:", err);
    res.status(500).json({ success: false, message: "Серверна помилка" });
  }
};

/**
 * Отримання статистики витрат за відділами
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getDepartmentExpenseStats = async (req, res) => {
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

    // Отримання даних
    const stats = await requestModel.getDepartmentExpenseStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики відділів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики відділів",
    });
  }
};

/**
 * Отримання загальної статистики для біздевів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getBizdevOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Валідація дат
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

    // Отримання даних через модель
    const stats = await reportsModel.getBizdevStatistics({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики для біздевів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики для біздевів",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання статистики для конкретного користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getUserStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Валідація параметрів
    const errors = [];

    if (!userId || isNaN(parseInt(userId))) {
      errors.push({ param: "userId", msg: "ID користувача має бути числом" });
    }

    // Валідація дат
    let parsedStartDate, parsedEndDate;
    if (startDate || endDate) {
      if (!startDate || !endDate) {
        errors.push({
          param: "date",
          msg: "Потрібно вказати обидві дати (startDate і endDate)",
        });
      } else {
        parsedStartDate = new Date(startDate);
        parsedEndDate = new Date(endDate);
        if (!isValid(parsedStartDate) || !isValid(parsedEndDate)) {
          errors.push({ param: "date", msg: "Невірний формат дат" });
        } else if (parsedStartDate > parsedEndDate) {
          errors.push({
            param: "date",
            msg: "startDate не може бути пізніше за endDate",
          });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const stats = await reportsModel.getUserStatistics(parseInt(userId), {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики користувача:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики користувача",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання статистики для команди
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getTeamStats = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { startDate, endDate } = req.query;

    // Валідація параметрів
    const errors = [];

    if (!teamId || isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "ID команди має бути числом" });
    }

    // Валідація дат
    let parsedStartDate, parsedEndDate;
    if (startDate || endDate) {
      if (!startDate || !endDate) {
        errors.push({
          param: "date",
          msg: "Потрібно вказати обидві дати (startDate і endDate)",
        });
      } else {
        parsedStartDate = new Date(startDate);
        parsedEndDate = new Date(endDate);
        if (!isValid(parsedStartDate) || !isValid(parsedEndDate)) {
          errors.push({ param: "date", msg: "Невірний формат дат" });
        } else if (parsedStartDate > parsedEndDate) {
          errors.push({
            param: "date",
            msg: "startDate не може бути пізніше за endDate",
          });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const stats = await reportsModel.getTeamStatistics(parseInt(teamId), {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики команди:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики команди",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання календарної статистики користувача по витратах за місяць
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getUserCalendarStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    // Валідація параметрів
    const errors = [];

    if (!userId || isNaN(parseInt(userId))) {
      errors.push({ param: "userId", msg: "Невірний ID користувача" });
    }

    if (
      !month ||
      isNaN(parseInt(month)) ||
      parseInt(month) < 1 ||
      parseInt(month) > 12
    ) {
      errors.push({
        param: "month",
        msg: "Місяць має бути числом від 1 до 12",
      });
    }

    if (!year || isNaN(parseInt(year)) || parseInt(year) < 2020) {
      errors.push({ param: "year", msg: "Рік має бути числом не менше 2020" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const parsedUserId = parseInt(userId);
    const parsedMonth = parseInt(month);
    const parsedYear = parseInt(year);

    // Отримання календарної статистики
    const calendarData = await reportsModel.getUserCalendarStats({
      userId: parsedUserId,
      month: parsedMonth,
      year: parsedYear,
    });

    res.json({
      success: true,
      data: {
        userId: parsedUserId,
        month: parsedMonth,
        year: parsedYear,
        calendar: calendarData,
      },
    });
  } catch (err) {
    console.error("Помилка отримання календарної статистики користувача:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання календарної статистики",
    });
  }
};

/**
 * Отримання календарної статистики команди по витратах за місяць
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getTeamCalendarStats = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { month, year } = req.query;

    // Валідація параметрів
    const errors = [];

    if (!teamId || isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "Невірний ID команди" });
    }

    if (
      !month ||
      isNaN(parseInt(month)) ||
      parseInt(month) < 1 ||
      parseInt(month) > 12
    ) {
      errors.push({
        param: "month",
        msg: "Місяць має бути числом від 1 до 12",
      });
    }

    if (!year || isNaN(parseInt(year)) || parseInt(year) < 2020) {
      errors.push({ param: "year", msg: "Рік має бути числом не менше 2020" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const parsedTeamId = parseInt(teamId);
    const parsedMonth = parseInt(month);
    const parsedYear = parseInt(year);

    // Отримання календарної статистики команди
    const calendarData = await reportsModel.getTeamCalendarStats({
      teamId: parsedTeamId,
      month: parsedMonth,
      year: parsedYear,
    });

    res.json({
      success: true,
      data: {
        teamId: parsedTeamId,
        month: parsedMonth,
        year: parsedYear,
        calendar: calendarData,
      },
    });
  } catch (err) {
    console.error("Помилка отримання календарної статистики команди:", err);
    res.status(500).json({
      success: false,
      message:
        "Помилка сервера під час отримання календарної статистики команди",
    });
  }
};

/**
 * Отримання місячної статистики користувача за рік
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getUserMonthlyStatistics = async (req, res) => {
  try {
    const { userId } = req.params;
    const { year } = req.query;

    // Валідація параметрів
    const errors = [];

    if (!userId || isNaN(parseInt(userId))) {
      errors.push({ param: "userId", msg: "Невірний ID користувача" });
    }

    if (
      !year ||
      isNaN(parseInt(year)) ||
      parseInt(year) < 2020 ||
      parseInt(year) > new Date().getFullYear() + 1
    ) {
      errors.push({
        param: "year",
        msg: "Рік має бути числом від 2020 до поточного року + 1",
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const parsedUserId = parseInt(userId);
    const parsedYear = parseInt(year);

    // Отримання місячної статистики
    const monthlyStats = await reportsModel.getUserMonthlyStatistics(
      parsedUserId,
      {
        year: parsedYear,
      }
    );

    res.json({
      success: true,
      data: monthlyStats,
    });
  } catch (err) {
    console.error("Помилка отримання місячної статистики користувача:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання місячної статистики",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання місячної статистики команди за рік
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getTeamMonthlyStatistics = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { year } = req.query;

    // Валідація параметрів
    const errors = [];

    if (!teamId || isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "Невірний ID команди" });
    }

    if (
      !year ||
      isNaN(parseInt(year)) ||
      parseInt(year) < 2020 ||
      parseInt(year) > new Date().getFullYear() + 1
    ) {
      errors.push({
        param: "year",
        msg: "Рік має бути числом від 2020 до поточного року + 1",
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const parsedTeamId = parseInt(teamId);
    const parsedYear = parseInt(year);

    // Отримання місячної статистики команди
    const monthlyStats = await reportsModel.getTeamMonthlyStatistics(
      parsedTeamId,
      {
        year: parsedYear,
      }
    );

    res.json({
      success: true,
      data: monthlyStats,
    });
  } catch (err) {
    console.error("Помилка отримання місячної статистики команди:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання місячної статистики команди",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання загальної статистики компанії
 * @route GET /api/statistics/company
 */
exports.getCompanyStats = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Помилка валідації",
        errors: errors.array(),
      });
    }

    const { startDate, endDate } = req.query;

    const options = {};
    if (startDate) {
      options.startDate = new Date(startDate);
    }
    if (endDate) {
      options.endDate = new Date(endDate);
    }

    // Валідація дат
    if (startDate && endDate && options.startDate > options.endDate) {
      return res.status(400).json({
        success: false,
        message: "Початкова дата не може бути більшою за кінцеву",
      });
    }

    const statistics = await reportsModel.getCompanyStatistics(options);

    res.json({
      success: true,
      message: "Статистика компанії успішно отримана",
      data: statistics,
    });
  } catch (error) {
    console.error("Помилка отримання статистики компанії:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання місячної статистики компанії за рік
 * @route GET /api/statistics/company/monthly/:year
 */
exports.getCompanyMonthlyStats = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Помилка валідації",
        errors: errors.array(),
      });
    }

    const year = parseInt(req.query.year);

    // Валідація року
    const currentYear = new Date().getFullYear();
    if (year < 2020 || year > currentYear + 1) {
      return res.status(400).json({
        success: false,
        message:
          "Некоректний рік. Використовуйте рік від 2020 до поточного року",
      });
    }

    const statistics = await reportsModel.getCompanyMonthlyStatistics({ year });

    res.json({
      success: true,
      message: "Місячна статистика компанії успішно отримана",
      data: statistics,
    });
  } catch (error) {
    console.error("Помилка отримання місячної статистики компанії:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання календарної статистики компанії за місяць
 * @route GET /api/statistics/company/calendar/:year/:month
 */
exports.getCompanyCalendarStatistics = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Помилка валідації",
        errors: errors.array(),
      });
    }

    const { month, year } = req.query;

    if (
      !month ||
      isNaN(parseInt(month)) ||
      parseInt(month) < 1 ||
      parseInt(month) > 12
    ) {
      errors.push({
        param: "month",
        msg: "Місяць має бути числом від 1 до 12",
      });
    }

    if (!year || isNaN(parseInt(year)) || parseInt(year) < 2020) {
      errors.push({ param: "year", msg: "Рік має бути числом не менше 2020" });
    }

    // Валідація року
    const currentYear = new Date().getFullYear();
    if (parseInt(year) < 2020 || parseInt(year) > currentYear + 1) {
      return res.status(400).json({
        success: false,
        message:
          "Некоректний рік. Використовуйте рік від 2020 до поточного року",
      });
    }

    // Валідація місяця
    if (parseInt(month) < 1 || parseInt(month) > 12) {
      return res.status(400).json({
        success: false,
        message: "Некоректний місяць. Використовуйте значення від 1 до 12",
      });
    }

    const statistics = await reportsModel.getCompanyCalendarStats({
      month: parseInt(month),
      year: parseInt(year),
    });

    res.json({
      success: true,
      message: "Календарна статистика компанії успішно отримана",
      data: {
        year,
        month,
        daily_stats: statistics,
        summary: {
          total_days: statistics.length,
          total_refills: statistics.reduce(
            (sum, day) => sum + day.agent_refill_amount,
            0
          ),
          total_expenses: statistics.reduce(
            (sum, day) => sum + day.total_expenses,
            0
          ),
          total_spend: statistics.reduce((sum, day) => sum + day.flow_spend, 0),
          avg_daily_spend:
            statistics.length > 0
              ? Math.round(
                  (statistics.reduce((sum, day) => sum + day.flow_spend, 0) /
                    statistics.length) *
                    100
                ) / 100
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("Помилка отримання календарної статистики компанії:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
