const requestModel = require("../models/request.model");
const { isValid } = require("date-fns");

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

    console.log("statistics");
    console.log(startDate);
    console.log(endDate);

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