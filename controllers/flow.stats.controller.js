const flowStatsModel = require("../models/flow.stats.model");

/**
 * Створення або оновлення статистики за день
 * POST /api/flow-stats
 */
const upsertFlowStat = async (req, res) => {
  try {
    const {
      flow_id,
      day,
      month,
      year,
      spend,
      installs,
      regs,
      deps,
      verified_deps,
      cpa,
      notes,
    } = req.body;

    // Валідація обов'язкових полів
    if (!flow_id || !day || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "Обов'язкові поля: flow_id, day, month, year",
      });
    }

    // Перевірка доступу користувача до потоку
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id
    );
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const statData = {
      flow_id,
      day,
      month,
      year,
      spend,
      installs,
      regs,
      deps,
      verified_deps,
      cpa,
      notes,
      updated_by: req.user.id,
    };

    const result = await flowStatsModel.upsertFlowStat(statData);

    res.status(201).json({
      success: true,
      message: "Статистика успішно збережена",
      data: result,
    });
  } catch (error) {
    console.error("Помилка при збереженні статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Масове оновлення статистики
 * POST /api/flow-stats/bulk
 */
const bulkUpsertFlowStats = async (req, res) => {
  try {
    const { flow_id, stats } = req.body;

    // Валідація
    if (!flow_id || !Array.isArray(stats) || stats.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Потрібні flow_id та масив stats",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id
    );
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    // Додаємо flow_id до кожного елемента статистики
    const statsWithFlowId = stats.map((stat) => ({
      ...stat,
      flow_id,
    }));

    const results = await flowStatsModel.bulkUpsertFlowStats(
      statsWithFlowId,
      req.user.id
    );

    res.status(201).json({
      success: true,
      message: `Успішно оновлено ${results.length} записів`,
      data: results,
    });
  } catch (error) {
    console.error("Помилка при масовому оновленні статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання всіх потоків зі статистикою за певний день
 * GET /api/flow-stats/daily/:year/:month/:day
 */
const getDailyFlowsStats = async (req, res) => {
  try {
    const { validationResult } = require("express-validator");
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Помилки валідації",
        errors: errors.array(),
      });
    }

    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const day = parseInt(req.params.day);

    // Валідація дати
    const targetDate = new Date(year, month - 1, day);
    if (
      targetDate.getFullYear() !== year ||
      targetDate.getMonth() !== month - 1 ||
      targetDate.getDate() !== day
    ) {
      return res.status(400).json({
        success: false,
        message: "Недійсна дата",
      });
    }

    // Параметри пагінації
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const options = {
      year,
      month,
      day,
      partnerId: req.query.partnerId
        ? parseInt(req.query.partnerId)
        : undefined,
      partnerIds: req.query.partnerIds
        ? typeof req.query.partnerIds === "string"
          ? req.query.partnerIds.split(",").map((id) => parseInt(id.trim()))
          : req.query.partnerIds.map((id) => parseInt(id))
        : undefined,
      status: req.query.status,
      teamId: req.query.teamId ? parseInt(req.query.teamId) : undefined,
      userId: req.query.userId ? parseInt(req.query.userId) : undefined,
      onlyActive: req.query.onlyActive === "true",
      includeUsers: true,
      // Пагінація
      page,
      limit,
      offset,
    };

    console.log("Запит статистики потоків за день:", options);

    const result = await flowStatsModel.getDailyFlowsStats(options);
    const { flows, totalCount } = result;

    // Розрахунок метаданих пагінації
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        date: {
          year,
          month,
          day,
          formatted: `${year}-${month.toString().padStart(2, "0")}-${day
            .toString()
            .padStart(2, "0")}`,
        },
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? page + 1 : null,
          prevPage: hasPrevPage ? page - 1 : null,
        },
        summary: {
          total_flows: totalCount,
          flows_with_stats: flows.filter((flow) => flow.has_stats).length,
          flows_without_stats: flows.filter((flow) => !flow.has_stats).length,
          current_page_flows: flows.length,
        },
        filters: {
          partnerId: options.partnerId,
          partnerIds: options.partnerIds,
          status: options.status,
          teamId: options.teamId,
          userId: options.userId,
          onlyActive: options.onlyActive,
          includeUsers: options.includeUsers,
        },
        flows,
      },
    });
  } catch (error) {
    console.error("Помилка при отриманні денної статистики потоків:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання статистики потоку
 * GET /api/flow-stats/:flow_id
 */
const getFlowStats = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);

    if (isNaN(flow_id)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id
    );
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const options = {
      month: req.query.month ? parseInt(req.query.month) : undefined,
      year: req.query.year ? parseInt(req.query.year) : undefined,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

    const stats = await flowStatsModel.getFlowStats(flow_id, options);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Помилка при отриманні статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання агрегованої статистики
 * GET /api/flow-stats/:flow_id/aggregated
 */
const getAggregatedStats = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);

    if (isNaN(flow_id)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id
    );
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const options = {
      month: req.query.month ? parseInt(req.query.month) : undefined,
      year: req.query.year ? parseInt(req.query.year) : undefined,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

    const aggregatedStats = await flowStatsModel.getAggregatedStats(
      flow_id,
      options
    );

    res.json({
      success: true,
      data: aggregatedStats,
    });
  } catch (error) {
    console.error("Помилка при отриманні агрегованої статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Видалення статистики за день
 * DELETE /api/flow-stats/:flow_id/:year/:month/:day
 */
const deleteFlowStat = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const day = parseInt(req.params.day);

    if (isNaN(flow_id) || isNaN(year) || isNaN(month) || isNaN(day)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id
    );
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const deleted = await flowStatsModel.deleteFlowStat(
      flow_id,
      day,
      month,
      year
    );

    if (deleted) {
      res.json({
        success: true,
        message: "Статистика успішно видалена",
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Запис не знайдено",
      });
    }
  } catch (error) {
    console.error("Помилка при видаленні статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Отримання статистики за місяць (для календарного представлення)
 * GET /api/flow-stats/:flow_id/calendar/:year/:month
 */
const getMonthlyCalendarStats = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(flow_id) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id
    );
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const stats = await flowStatsModel.getFlowStats(flow_id, { month, year });

    // Створюємо календарну структуру з порожніми днями
    const daysInMonth = new Date(year, month, 0).getDate();
    const calendar = {};

    // Ініціалізуємо всі дні місяця
    for (let day = 1; day <= daysInMonth; day++) {
      calendar[day] = {
        day,
        month,
        year,
        spend: 0,
        installs: 0,
        regs: 0,
        deps: 0,
        verified_deps: 0,
        cpa: 0,
        roi: 0,
        inst2reg: 0,
        reg2dep: 0,
        notes: null,
        hasData: false,
      };
    }

    // Заповнюємо данимі з бази
    stats.forEach((stat) => {
      calendar[stat.day] = {
        ...stat,
        hasData: true,
      };
    });

    res.json({
      success: true,
      data: {
        flow_id,
        year,
        month,
        calendar: Object.values(calendar),
      },
    });
  } catch (error) {
    console.error("Помилка при отриманні календарної статистики:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  upsertFlowStat,
  bulkUpsertFlowStats,
  getFlowStats,
  getAggregatedStats,
  deleteFlowStat,
  getMonthlyCalendarStats,
  getDailyFlowsStats,
};
