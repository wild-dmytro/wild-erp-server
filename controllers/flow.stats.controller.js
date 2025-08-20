const flowStatsModel = require("../models/flow.stats.model");
const { validationResult } = require("express-validator");
const db = require("../config/db");

/**
 * ОНОВЛЕНО: Створення або оновлення статистики за день з обов'язковим user_id
 * POST /api/flow-stats
 */
const upsertFlowStat = async (req, res) => {
  try {
    const {
      flow_id,
      user_id, // НОВИЙ ОБОВ'ЯЗКОВИЙ ПАРАМЕТР
      day,
      month,
      year,
      spend,
      installs,
      regs,
      deps,
      verified_deps,
      deposit_amount, // НОВИЙ
      redep_count, // НОВИЙ
      unique_redep_count, // НОВИЙ
      notes,
    } = req.body;

    // ОНОВЛЕНО: валідація обов'язкових полів включно з user_id
    if (!flow_id || !user_id || !day || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "Обов'язкові поля: flow_id, user_id, day, month, year",
      });
    }

    // ОНОВЛЕНО: перевірка доступу з урахуванням ролей
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id,
      req.user.role
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    // Додаткова перевірка: buyer може створювати статистику лише для себе
    if (req.user.role === "buyer" && user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Buyer може створювати статистику лише для себе",
      });
    }

    const statData = {
      flow_id,
      user_id,
      day,
      month,
      year,
      spend,
      installs,
      regs,
      deps,
      verified_deps,
      deposit_amount, // НОВИЙ
      redep_count, // НОВИЙ
      unique_redep_count, // НОВИЙ
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
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Отримання всіх потоків зі статистикою за певний день з урахуванням user_id
 * GET /api/flow-stats/daily/:year/:month/:day
 */
const getDailyFlowsStats = async (req, res) => {
  try {
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
      // ОНОВЛЕНО: фільтрація по користувачах з урахуванням ролей
      userId: (() => {
        if (req.user.role === "buyer") {
          // Buyer бачить лише свою статистику
          return req.user.id;
        } else if (
          req.query.userId &&
          ["admin", "bizdev", "teamlead"].includes(req.user.role)
        ) {
          // Інші ролі можуть фільтрувати по конкретному користувачу
          return parseInt(req.query.userId);
        }
        return undefined;
      })(),
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
 * ОНОВЛЕНО: Отримання статистики потоку з фільтрацією по користувачах
 * GET /api/flow-stats/:flow_id
 * Query params: month, year, dateFrom, dateTo, user_id
 */
const getFlowStats = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);
    const { month, year, dateFrom, dateTo, user_id } = req.query;

    if (isNaN(flow_id)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id,
      req.user.role
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const options = {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      dateFrom,
      dateTo,
      user_id: user_id ? parseInt(user_id) : undefined,
    };

    const stats = await flowStatsModel.getFlowStats(
      flow_id,
      options,
      req.user.id,
      req.user.role
    );

    res.json({
      success: true,
      data: {
        flow_id,
        filters: options,
        stats,
        total_records: stats.length,
      },
    });
  } catch (error) {
    console.error("Помилка при отриманні статистики потоку:", error);
    res.status(500).json({
      success: false,
      message: "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Отримання статистики користувача за місяць по днях
 * GET /api/flow-stats/user/:userId/monthly/:year/:month
 */
const getUserMonthlyStats = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(userId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка прав доступу: користувач може дивитись лише свою статистику (buyer)
    // або має права admin/bizdev/teamlead
    if (req.user.role === "buyer" && userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до статистики цього користувача",
      });
    }

    const options = { month, year };
    const stats = await flowStatsModel.getUserMonthlyStats(
      userId,
      options,
      req.user.id,
      req.user.role
    );

    res.json({
      success: true,
      data: stats,
      meta: {
        request_time: new Date().toISOString(),
        period: `${year}-${String(month).padStart(2, "0")}`,
        user_id: userId,
      },
    });
  } catch (error) {
    console.error(
      "Помилка при отриманні місячної статистики користувача:",
      error
    );
    res.status(500).json({
      success: false,
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Отримання статистики команди за місяць по днях
 * GET /api/flow-stats/team/:teamId/monthly/:year/:month
 */
const getTeamMonthlyStats = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(teamId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка прав доступу: лише admin/bizdev/teamlead
    if (req.user.role === "buyer") {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до статистики команди",
      });
    }

    const options = { month, year };
    const stats = await flowStatsModel.getTeamMonthlyStats(
      teamId,
      options,
      req.user.id,
      req.user.role
    );

    res.json({
      success: true,
      data: stats,
      meta: {
        request_time: new Date().toISOString(),
        period: `${year}-${String(month).padStart(2, "0")}`,
        team_id: teamId,
      },
    });
  } catch (error) {
    console.error("Помилка при отриманні місячної статистики команди:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для користувача
 * GET /api/flow-stats/user/:userId/flows/monthly/:year/:month
 */
const getUserFlowsMonthlyStats = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(userId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка прав доступу
    if (req.user.role === "buyer" && userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до статистики цього користувача",
      });
    }

    const options = { month, year };
    const stats = await flowStatsModel.getUserFlowsMonthlyStats(
      userId,
      options,
      req.user.id,
      req.user.role
    );

    res.json({
      success: true,
      data: stats,
      meta: {
        request_time: new Date().toISOString(),
        period: `${year}-${String(month).padStart(2, "0")}`,
        user_id: userId,
        flows_count: stats.flows.length,
      },
    });
  } catch (error) {
    console.error("Помилка при отриманні потоків користувача:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Отримання всіх потоків із агрегованою статистикою за місяць для команди
 * GET /api/flow-stats/team/:teamId/flows/monthly/:year/:month
 */
const getTeamFlowsMonthlyStats = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(teamId) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка прав доступу: лише admin/bizdev/teamlead
    if (req.user.role === "buyer") {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до статистики команди",
      });
    }

    const options = { month, year };
    const stats = await flowStatsModel.getTeamFlowsMonthlyStats(
      teamId,
      options,
      req.user.id,
      req.user.role
    );

    res.json({
      success: true,
      data: stats,
      meta: {
        request_time: new Date().toISOString(),
        period: `${year}-${String(month).padStart(2, "0")}`,
        team_id: teamId,
        flows_count: stats.flows.length,
      },
    });
  } catch (error) {
    console.error("Помилка при отриманні потоків команди:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Отримання загальної статистики компанії за місяць (P/L)
 * GET /api/flow-stats/company/monthly/:year/:month
 */
const getCompanyMonthlyStats = async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка прав доступу: лише admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до загальної статистики компанії",
      });
    }

    const options = { month, year };
    const stats = await flowStatsModel.getCompanyMonthlyStats(options);

    res.json({
      success: true,
      data: stats,
      meta: {
        request_time: new Date().toISOString(),
        period: `${year}-${String(month).padStart(2, "0")}`,
        data_type: "company_pnl",
        requester: req.user.username || req.user.id,
      },
    });
  } catch (error) {
    console.error("Помилка при отриманні статистики компанії:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Внутрішня помилка сервера",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ОНОВЛЕНО: Отримання агрегованої статистики за період з фільтрацією по користувачах
 * GET /api/flow-stats/:flow_id/aggregated
 * Query params: month, year, dateFrom, dateTo, user_id
 * ДОДАНО: підтримка нових метрик та прибутку
 */
const getAggregatedStats = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);
    const { month, year, dateFrom, dateTo, user_id } = req.query;

    if (isNaN(flow_id)) {
      return res.status(400).json({
        success: false,
        message: "Недійсний ID потоку",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id,
      req.user.role
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const options = {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      dateFrom,
      dateTo,
      user_id: user_id ? parseInt(user_id) : undefined,
    };

    const stats = await flowStatsModel.getAggregatedStats(
      flow_id,
      options,
      req.user.id,
      req.user.role
    );

    res.json({
      success: true,
      data: stats,
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
 * ОНОВЛЕНО: Видалення статистики за конкретний день з урахуванням user_id
 * DELETE /api/flow-stats/:flow_id/:user_id/:year/:month/:day
 */
const deleteFlowStat = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);
    const user_id = parseInt(req.params.user_id);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const day = parseInt(req.params.day);

    if (
      isNaN(flow_id) ||
      isNaN(user_id) ||
      isNaN(year) ||
      isNaN(month) ||
      isNaN(day)
    ) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id,
      req.user.role
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    // Додаткова перевірка: buyer може видаляти лише свою статистику
    if (req.user.role === "buyer" && user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Buyer може видаляти лише свою статистику",
      });
    }

    const success = await flowStatsModel.deleteFlowStat(
      flow_id,
      user_id,
      day,
      month,
      year
    );

    if (!success) {
      return res.status(404).json({
        success: false,
        message: "Запис статистики не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Статистика успішно видалена",
    });
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
 * ОНОВЛЕНО: Отримання календарної статистики за місяць з урахуванням user_id
 * GET /api/flow-stats/:flow_id/calendar/:year/:month
 * Query params: user_id
 * ДОДАНО: нові метрики OAS, RD, URD, CPD та розрахунок прибутку
 */
const getMonthlyCalendarStats = async (req, res) => {
  try {
    const flow_id = parseInt(req.params.flow_id);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const { user_id } = req.query;

    if (isNaN(flow_id) || isNaN(year) || isNaN(month)) {
      return res.status(400).json({
        success: false,
        message: "Недійсні параметри",
      });
    }

    // Перевірка доступу
    const hasAccess = await flowStatsModel.checkUserAccess(
      flow_id,
      req.user.id,
      req.user.role
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Немає доступу до цього потоку",
      });
    }

    const options = {
      month,
      year,
      user_id: user_id ? parseInt(user_id) : undefined,
    };

    // Отримуємо статистику через оновлений метод getFlowStats
    const stats = await flowStatsModel.getFlowStats(
      flow_id,
      options,
      req.user.id,
      req.user.role
    );

    // Створюємо календарну структуру з порожніми днями
    const daysInMonth = new Date(year, month, 0).getDate();
    const calendar = {};

    // Ініціалізуємо всі дні місяця
    for (let day = 1; day <= daysInMonth; day++) {
      calendar[day] = {
        day,
        month,
        year,
        users_stats: [],
        aggregated: {
          spend: 0,
          installs: 0,
          regs: 0,
          deps: 0,
          verified_deps: 0,
          deposit_amount: 0,
          redep_count: 0,
          unique_redep_count: 0,
          cpa: 0,
          // Існуючі розраховані метрики
          roi: 0,
          inst2reg: 0,
          reg2dep: 0,
          // ДОДАНО: Нові метрики
          oas: 0,
          rd: 0,
          urd: 0,
          cpd: 0,
          // ДОДАНО: Прибуток
          profit: 0,
        },
        hasData: false,
      };
    }

    // Групуємо статистику по днях та користувачах
    stats.forEach((stat) => {
      const day = stat.day;
      if (calendar[day]) {
        calendar[day].users_stats.push({
          user_id: stat.user_id,
          username: stat.username,
          user_full_name: stat.user_full_name,
          spend: parseFloat(stat.spend) || 0,
          installs: parseInt(stat.installs) || 0,
          regs: parseInt(stat.regs) || 0,
          deps: parseInt(stat.deps) || 0,
          verified_deps: parseInt(stat.verified_deps) || 0,
          deposit_amount: parseFloat(stat.deposit_amount) || 0,
          redep_count: parseInt(stat.redep_count) || 0,
          unique_redep_count: parseInt(stat.unique_redep_count) || 0,
          cpa: parseFloat(stat.cpa) || 0,
          // Існуючі розраховані метрики
          roi: parseFloat(stat.roi) || 0,
          inst2reg: parseFloat(stat.inst2reg) || 0,
          reg2dep: parseFloat(stat.reg2dep) || 0,
          // ДОДАНО: Нові метрики
          oas: parseFloat(stat.oas) || 0,
          rd: parseFloat(stat.rd) || 0,
          urd: parseFloat(stat.urd) || 0,
          cpd: parseFloat(stat.cpd) || 0,
          // ДОДАНО: Прибуток (якщо є)
          profit: parseFloat(stat.profit) || 0,
          // Додаткові дані для spend моделі
          monthly_kpi: parseFloat(stat.monthly_kpi) || undefined,
          spend_multiplier: parseFloat(stat.spend_multiplier) || undefined,
          notes: stat.notes,
        });

        // Оновлюємо агреговані дані для дня
        const agg = calendar[day].aggregated;
        agg.spend += parseFloat(stat.spend) || 0;
        agg.installs += parseInt(stat.installs) || 0;
        agg.regs += parseInt(stat.regs) || 0;
        agg.deps += parseInt(stat.deps) || 0;
        agg.verified_deps += parseInt(stat.verified_deps) || 0;
        agg.deposit_amount += parseFloat(stat.deposit_amount) || 0;
        agg.redep_count += parseInt(stat.redep_count) || 0;
        agg.unique_redep_count += parseInt(stat.unique_redep_count) || 0;
        agg.profit += parseFloat(stat.profit) || 0;

        // Для CPA беремо середньозважене значення
        const userCpa = parseFloat(stat.cpa) || 0;
        const userDeps = parseInt(stat.deps) || 0;
        if (userDeps > 0) {
          agg.cpa =
            (agg.cpa * (agg.deps - userDeps) + userCpa * userDeps) / agg.deps;
        }

        calendar[day].hasData = true;
      }
    });

    // Обчислюємо агреговані метрики для кожного дня
    Object.values(calendar).forEach((dayData) => {
      if (dayData.hasData) {
        const agg = dayData.aggregated;

        // Існуючі метрики
        agg.inst2reg = agg.installs > 0 ? (agg.regs / agg.installs) * 100 : 0;
        agg.reg2dep = agg.regs > 0 ? (agg.deps / agg.regs) * 100 : 0;

        // ROI через прибуток
        agg.roi = agg.spend > 0 ? (agg.profit / agg.spend) * 100 : 0;

        // ДОДАНО: Нові агреговані метрики
        // Використовуємо verified_deps або deps для розрахунків
        const depsForCalculation =
          agg.verified_deps > 0 ? agg.verified_deps : agg.deps;

        // OAS - (deposit_amount / spend) * 100%
        agg.oas = agg.spend > 0 ? (agg.deposit_amount / agg.spend) * 100 : 0;

        // RD - (redep_count / deps) * 100%
        agg.rd =
          depsForCalculation > 0
            ? (agg.redep_count / depsForCalculation) * 100
            : 0;

        // URD - (unique_redep_count / deps) * 100%
        agg.urd =
          depsForCalculation > 0
            ? (agg.unique_redep_count / depsForCalculation) * 100
            : 0;

        // CPD - spend / deps
        agg.cpd = depsForCalculation > 0 ? agg.spend / depsForCalculation : 0;

        // Округлюємо всі метрики
        agg.roi = Math.round(agg.roi * 100) / 100;
        agg.inst2reg = Math.round(agg.inst2reg * 100) / 100;
        agg.reg2dep = Math.round(agg.reg2dep * 100) / 100;
        agg.oas = Math.round(agg.oas * 100) / 100;
        agg.rd = Math.round(agg.rd * 100) / 100;
        agg.urd = Math.round(agg.urd * 100) / 100;
        agg.cpd = Math.round(agg.cpd * 100) / 100;
        agg.profit = Math.round(agg.profit * 100) / 100;
        agg.cpa = Math.round(agg.cpa * 100) / 100;
      }
    });

    // ДОДАНО: Розрахунок підсумкової статистики за місяць
    const monthlyTotals = Object.values(calendar)
      .filter((d) => d.hasData)
      .reduce(
        (totals, dayData) => {
          const agg = dayData.aggregated;
          return {
            spend: totals.spend + agg.spend,
            installs: totals.installs + agg.installs,
            regs: totals.regs + agg.regs,
            deps: totals.deps + agg.deps,
            verified_deps: totals.verified_deps + agg.verified_deps,
            deposit_amount: totals.deposit_amount + agg.deposit_amount,
            redep_count: totals.redep_count + agg.redep_count,
            unique_redep_count:
              totals.unique_redep_count + agg.unique_redep_count,
            profit: totals.profit + agg.profit,
          };
        },
        {
          spend: 0,
          installs: 0,
          regs: 0,
          deps: 0,
          verified_deps: 0,
          deposit_amount: 0,
          redep_count: 0,
          unique_redep_count: 0,
          profit: 0,
        }
      );

    // Розраховуємо місячні метрики
    const depsForMonthlyCalculation =
      monthlyTotals.verified_deps > 0
        ? monthlyTotals.verified_deps
        : monthlyTotals.deps;
    const monthlyMetrics = {
      roi:
        monthlyTotals.spend > 0
          ? Math.round(
              (monthlyTotals.profit / monthlyTotals.spend) * 100 * 100
            ) / 100
          : 0,
      inst2reg:
        monthlyTotals.installs > 0
          ? Math.round(
              (monthlyTotals.regs / monthlyTotals.installs) * 100 * 100
            ) / 100
          : 0,
      reg2dep:
        monthlyTotals.regs > 0
          ? Math.round((monthlyTotals.deps / monthlyTotals.regs) * 100 * 100) /
            100
          : 0,
      oas:
        monthlyTotals.spend > 0
          ? Math.round(
              (monthlyTotals.deposit_amount / monthlyTotals.spend) * 100 * 100
            ) / 100
          : 0,
      rd:
        depsForMonthlyCalculation > 0
          ? Math.round(
              (monthlyTotals.redep_count / depsForMonthlyCalculation) *
                100 *
                100
            ) / 100
          : 0,
      urd:
        depsForMonthlyCalculation > 0
          ? Math.round(
              (monthlyTotals.unique_redep_count / depsForMonthlyCalculation) *
                100 *
                100
            ) / 100
          : 0,
      cpd:
        depsForMonthlyCalculation > 0
          ? Math.round(
              (monthlyTotals.spend / depsForMonthlyCalculation) * 100
            ) / 100
          : 0,
    };

    res.json({
      success: true,
      data: {
        flow_id,
        year,
        month,
        filters: options,
        calendar: Object.values(calendar),
        summary: {
          total_days: daysInMonth,
          days_with_data: Object.values(calendar).filter((d) => d.hasData)
            .length,
          unique_users: [...new Set(stats.map((s) => s.user_id))].length,
          // ДОДАНО: Місячні підсумки
          monthly_totals: monthlyTotals,
          monthly_metrics: monthlyMetrics,
        },
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

// Експорт всіх методів контролера
module.exports = {
  // Основні методи
  upsertFlowStat,
  getDailyFlowsStats,
  getFlowStats,
  getUserMonthlyStats,
  getTeamMonthlyStats,
  getUserFlowsMonthlyStats,
  getTeamFlowsMonthlyStats,
  getCompanyMonthlyStats,
  getAggregatedStats,
  deleteFlowStat,
  getMonthlyCalendarStats,
};
