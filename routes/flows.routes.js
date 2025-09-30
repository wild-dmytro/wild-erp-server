/**
 * Маршрути для роботи з потоками
 * ОНОВЛЕНО: додано підтримку типів потоків та KPI метрик
 * Адаптовано наявні маршрути під нову логіку
 */

const express = require("express");
const router = express.Router();
const flowController = require("../controllers/flows.controller");
const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const { check, query, body } = require("express-validator");

// Застосовуємо middleware авторизації до всіх маршрутів
router.use(authMiddleware);

/**
 * ОНОВЛЕНО: Отримання всіх потоків з додатковими фільтрами
 */
router.get(
  "/",
  roleMiddleware("admin", "teamlead", "bizdev", "buyer", "affiliate_manager"),
  [
    query("page", "Номер сторінки має бути числом")
      .optional()
      .isInt({ min: 1 }),
    query("limit", "Ліміт має бути числом від 1 до 100")
      .optional()
      .isInt({ min: 1, max: 100 }),
    query("offerId", "ID оффера має бути числом").optional().isInt(),
    query("userId", "ID користувача має бути числом").optional().isInt(),
    query("geoId", "ID гео має бути числом").optional().isInt(),
    query("teamId", "ID команди має бути числом").optional().isInt(),
    query("partnerId", "ID партнера має бути числом").optional().isInt(),
    // ДОДАНО: фільтри за типом потоку та метрикою KPI
    query("flow_type", "Тип потоку має бути cpa або spend")
      .optional()
      .isIn(["cpa", "spend"]),
    query("kpi_metric", "Метрика KPI має бути одна з: OAS, CPD, RD, URD")
      .optional()
      .isIn(["OAS", "CPD", "RD", "URD"]),
    query("status", "Недійсний статус")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    query("currency", "Недійсна валюта")
      .optional()
      .isIn(["USD", "EUR", "GBP", "UAH"]),
    query("sortBy", "Недійсне поле сортування")
      .optional()
      .isIn(["created_at", "updated_at", "name", "cpa"]),
    query("sortOrder", "Недійсний порядок сортування")
      .optional()
      .isIn(["asc", "desc"]),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.getAllFlows
);

/**
 * ОНОВЛЕНО: Отримання загальної статистики всіх потоків з фільтрами за типами
 */
router.get(
  "/stats/overview",
  roleMiddleware("admin", "teamlead", "bizdev", "buyer"),
  [
    query("dateFrom", "Недійсна дата початку").optional().isDate(),
    query("dateTo", "Недійсна дата завершення").optional().isDate(),
    query("status", "Недійсний статус")
      .optional()
      .isIn(["active", "paused", "stopped", "pending"]),
    query("partnerId", "ID партнера має бути числом").optional().isInt(),
    // ДОДАНО: фільтри за типом потоку та метрикою KPI
    query("flow_type", "Тип потоку має бути cpa або spend")
      .optional()
      .isIn(["cpa", "spend"]),
    query("kpi_metric", "Метрика KPI має бути одна з: OAS, CPD, RD, URD")
      .optional()
      .isIn(["OAS", "CPD", "RD", "URD"]),
    query("userIds", "userIds має бути масивом чисел")
      .optional()
      .custom((value) => {
        if (typeof value === "string") {
          // Якщо передано як рядок, розбиваємо по комах
          const ids = value.split(",").map((id) => parseInt(id.trim()));
          return ids.every((id) => Number.isInteger(id) && id > 0);
        }
        if (Array.isArray(value)) {
          return value.every(
            (id) => Number.isInteger(parseInt(id)) && parseInt(id) > 0
          );
        }
        return false;
      }),
    query("teamIds", "teamIds має бути масивом чисел")
      .optional()
      .custom((value) => {
        if (typeof value === "string") {
          // Якщо передано як рядок, розбиваємо по комах
          const ids = value.split(",").map((id) => parseInt(id.trim()));
          return ids.every((id) => Number.isInteger(id) && id > 0);
        }
        if (Array.isArray(value)) {
          return value.every(
            (id) => Number.isInteger(parseInt(id)) && parseInt(id) > 0
          );
        }
        return false;
      }),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.getAllFlowsStats
);

/**
 * Отримання детальної інформації про потік за ID (без змін)
 */
router.get(
  "/:id",
  [check("id", "ID потоку має бути числом").isInt()],
  flowController.getFlowById
);

/**
 * ОНОВЛЕНО: Створення потоку з підтримкою типів та KPI
 */
router.post(
  "/",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("name", "Назва потоку є обов'язковою").notEmpty().trim(),
    check("name", "Назва потоку має бути від 3 до 255 символів").isLength({
      min: 3,
      max: 255,
    }),
    check("offer_id", "ID оффера є обов'язковим").isInt(),
    check("geo_id", "ID гео має бути числом").optional().isInt(),
    check("team_id", "ID команди має бути числом").optional().isInt(),

    // ДОДАНО: валідація нових полів
    check("flow_type", "Тип потоку є обов'язковим")
      .isIn(["cpa", "spend"])
      .withMessage("Тип потоку має бути cpa або spend"),
    check("kpi_metric", "Метрика KPI є обов'язковою")
      .isIn(["OAS", "CPD", "RD", "URD"])
      .withMessage("Метрика KPI має бути одна з: OAS, CPD, RD, URD"),

    // Умовна валідація для CPA потоків
    check("kpi_target_value")
      .if(body("flow_type").equals("cpa"))
      .isNumeric()
      .withMessage(
        "Для CPA потоків необхідно вказати числове цільове значення KPI"
      )
      .custom((value) => {
        if (value < 0) {
          throw new Error("Цільове значення KPI не може бути від'ємним");
        }
        return true;
      }),

    // Умовна валідація для SPEND потоків
    check("spend_percentage_ranges")
      .if(body("flow_type").equals("spend"))
      .isArray({ min: 1 })
      .withMessage("Для SPEND потоків необхідно вказати масив діапазонів"),

    check("spend_percentage_ranges.*.min_percentage")
      .if(body("flow_type").equals("spend"))
      .isNumeric()
      .withMessage("min_percentage має бути числом")
      .custom((value) => {
        if (value < 0) {
          throw new Error("min_percentage не може бути від'ємним");
        }
        return true;
      }),

    check("spend_percentage_ranges.*.max_percentage")
      .if(body("flow_type").equals("spend"))
      .optional({ nullable: true })
      .isNumeric()
      .withMessage("max_percentage має бути числом або null"),

    check("spend_percentage_ranges.*.spend_multiplier")
      .if(body("flow_type").equals("spend"))
      .isNumeric()
      .withMessage(
        "spend_multiplier має бути числом (множник, наприклад 1.0 для 100%)"
      )
      .custom((value) => {
        if (value < 0) {
          throw new Error("spend_multiplier не може бути від'ємним");
        }
        return true;
      }),

    check("spend_percentage_ranges.*.description")
      .optional()
      .if(body("flow_type").equals("spend"))
      .isString(),

    // Інші поля (без змін)
    check("status", "Недійсний статус потоку")
      .optional()
      .isIn(["active", "paused", "stopped", "pending", "archived"]),
    check("cpa", "CPA має бути числом").optional().isFloat({ min: 0 }),
    check("currency", "Недійсна валюта")
      .optional()
      .isIn(["USD", "EUR", "GBP", "UAH"]),
    check("is_active", "is_active має бути булевим значенням")
      .optional()
      .isBoolean(),
    check("start_date", "Недійсна дата початку").optional().isISO8601(),
    check("stop_date", "Недійсна дата завершення").optional().isISO8601(),
    check("conditions", "Умови мають бути рядком").optional().isString(),
    check("description", "Опис має бути рядком").optional().isString(),
    check("notes", "Нотатки мають бути рядком").optional().isString(),
    check("cap", "Cap має бути рядком").optional().isString(),
    check("kpi", "KPI має бути рядком").optional().isString(),
    check("landings", "Landings має бути рядком").optional().isString(),
  ],
  flowController.createFlow
);

/**
 * ОНОВЛЕНО: Оновлення потоку з підтримкою нових полів
 */
router.put(
  "/:id",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("name", "Назва потоку має бути від 3 до 255 символів")
      .optional()
      .isLength({ min: 3, max: 255 }),
    check("offer_id", "ID оффера має бути числом").optional().isInt(),
    check("geo_id", "ID гео має бути числом").optional().isInt(),
    check("team_id", "ID команди має бути числом").optional().isInt(),

    // ДОДАНО: валідація нових полів (опціональна для оновлення)
    check("flow_type", "Тип потоку має бути cpa або spend")
      .optional()
      .isIn(["cpa", "spend"]),
    check("kpi_metric", "Метрика KPI має бути одна з: OAS, CPD, RD, URD")
      .optional()
      .isIn(["OAS", "CPD", "RD", "URD"]),
    check("kpi_target_value", "Цільове значення KPI має бути числом")
      .optional()
      .isNumeric(),
    check("spend_percentage_ranges", "Діапазони мають бути масивом")
      .optional()
      .isArray(),

    check("status", "Недійсний статус потоку")
      .optional()
      .isIn(["active", "paused", "stopped", "pending", "archived"]),
    check("cpa", "CPA має бути числом").optional().isFloat({ min: 0 }),
    check("currency", "Недійсна валюта")
      .optional()
      .isIn(["USD", "EUR", "GBP", "UAH"]),
    check("is_active", "is_active має бути булевим значенням")
      .optional()
      .isBoolean(),
    check("start_date", "Недійсна дата початку").optional().isISO8601(),
    check("stop_date", "Недійсна дата завершення").optional().isISO8601(),
    check("conditions", "Умови мають бути рядком").optional().isString(),
    check("description", "Опис має бути рядком").optional().isString(),
    check("notes", "Нотатки мають бути рядком").optional().isString(),
    check("cap", "Cap має бути рядком").optional().isString(),
    check("kpi", "KPI має бути рядком").optional().isString(),
    check("landings", "Landings має бути рядком").optional().isString(),
  ],
  flowController.updateFlow
);

/**
 * Видалення потоку (без змін)
 */
router.delete(
  "/:id",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [check("id", "ID потоку має бути числом").isInt()],
  flowController.deleteFlow
);

/**
 * ОПЕРАЦІЇ ЗІ СТАТУСОМ ПОТОКІВ (без змін)
 */
router.patch(
  "/:id/status",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("status", "Статус є обов'язковим").notEmpty(),
    check("status", "Недійсний статус потоку").isIn([
      "active",
      "paused",
      "stopped",
      "pending",
      "archived",
    ]),
  ],
  flowController.updateFlowStatus
);

router.patch(
  "/:id/active",
  roleMiddleware("admin", "teamlead", "bizdev"),
  [
    check("id", "ID потоку має бути числом").isInt(),
    check("is_active", "is_active є обов'язковим").isBoolean(),
  ],
  flowController.updateFlowActiveStatus
);

/**
 * РОБОТА З КОРИСТУВАЧАМИ ПОТОКІВ (без змін)
 */
router.get(
  "/:id/users",
  [
    check("id", "ID потоку має бути числом").isInt(),
    query("onlyActive", "onlyActive має бути булевим значенням")
      .optional()
      .isBoolean(),
  ],
  flowController.getFlowUsers
);

module.exports = router;
