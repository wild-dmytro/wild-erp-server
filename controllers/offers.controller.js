const offerModel = require("../models/offer.model");
const { validationResult } = require("express-validator");

/**
 * Функція для парсингу множинних ID з query параметрів
 * @param {string|Array} param - Параметр у вигляді рядка з ID, розділеними комами, або масив
 * @returns {number[]|null} Масив чисел або null якщо помилка
 */
function parseMultipleIds(param) {
  if (!param) return null;

  try {
    // Підтримуємо як рядок з комами, так і масив
    let ids;
    if (Array.isArray(param)) {
      ids = param;
    } else {
      ids = param.split(",");
    }

    const parsedIds = ids.map((id) => {
      const parsed = parseInt(id.toString().trim());
      if (isNaN(parsed)) {
        throw new Error("Invalid ID");
      }
      return parsed;
    });

    return parsedIds.length > 0 ? parsedIds : null;
  } catch (error) {
    return null;
  }
}

/**
 * Отримання списку всіх офферів з фільтрацією та пагінацією
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllOffers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      partners, // Може бути масивом ID або строкою через кому
      brands, // Може бути масивом ID або строкою через кому
      geos, // Може бути масивом ID або строкою через кому
      onlyActive,
      search,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];

    // Валідація параметрів партнерів
    if (partners) {
      const partnerIds = parseMultipleIds(partners);
      if (partnerIds === null) {
        errors.push({
          param: "partners",
          msg: "ID партнерів мають бути числами, розділеними комами або масивом чисел",
        });
      }
    }

    // Валідація параметрів брендів
    if (brands) {
      const brandIds = parseMultipleIds(brands);
      if (brandIds === null) {
        errors.push({
          param: "brands",
          msg: "ID брендів мають бути числами, розділеними комами або масивом чисел",
        });
      }
    }

    // Валідація параметрів гео
    if (geos) {
      const geoIds = parseMultipleIds(geos);
      if (geoIds === null) {
        errors.push({
          param: "geos",
          msg: "ID гео регіонів мають бути числами, розділеними комами або масивом чисел",
        });
      }
    }

    if (onlyActive && !["true", "false"].includes(onlyActive)) {
      errors.push({ param: "onlyActive", msg: "Має бути true або false" });
    }

    // Валідація полів сортування
    const allowedSortFields = [
      "id",
      "name",
      "created_at",
      "updated_at",
      "geos_count",
      "flows_count",
    ];
    if (sortBy && !allowedSortFields.includes(sortBy)) {
      errors.push({
        param: "sortBy",
        msg: `Дозволені поля сортування: ${allowedSortFields.join(", ")}`,
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Отримання офферів з використанням оновленої функції парсингу
    const result = await offerModel.getAllOffers({
      page: parseInt(page),
      limit: parseInt(limit),
      partners: partners ? parseMultipleIds(partners) : null,
      brands: brands ? parseMultipleIds(brands) : null,
      geos: geos ? parseMultipleIds(geos) : null,
      onlyActive,
      search,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      appliedFilters: {
        partners: partners ? parseMultipleIds(partners) : null,
        brands: brands ? parseMultipleIds(brands) : null,
        geos: geos ? parseMultipleIds(geos) : null,
        onlyActive,
        search,
        sortBy,
        sortOrder,
      },
    });
  } catch (err) {
    console.error("Помилка отримання офферів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання офферів",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання статистики офферів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getOffersStats = async (req, res) => {
  try {
    const stats = await offerModel.getOffersStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики офферів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Отримання офферу за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getOfferById = async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "ID офферу має бути числом",
      });
    }

    const offer = await offerModel.getOfferById(parseInt(id));

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Оффер не знайдено",
      });
    }

    res.json({
      success: true,
      data: offer,
    });
  } catch (err) {
    console.error("Помилка отримання офферу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання офферу",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Створення нового офферу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createOffer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const offerData = {
      ...req.body,
      created_by: req.user.userId,
    };

    const newOffer = await offerModel.createOffer(offerData);

    res.status(201).json({
      success: true,
      data: newOffer,
      message: "Оффер успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення офферу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення офферу",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Оновлення офферу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateOffer = async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "ID офферу має бути числом",
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const offerData = {
      ...req.body,
      updated_by: req.user.userId,
    };

    const updatedOffer = await offerModel.updateOffer(parseInt(id), offerData);

    if (!updatedOffer) {
      return res.status(404).json({
        success: false,
        message: "Оффер не знайдено",
      });
    }

    res.json({
      success: true,
      data: updatedOffer,
      message: "Оффер успішно оновлено",
    });
  } catch (err) {
    console.error("Помилка оновлення офферу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення офферу",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Оновлення статусу офферу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "ID офферу має бути числом",
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Статус має бути булевим значенням",
      });
    }

    const updatedOffer = await offerModel.updateOfferStatus(
      parseInt(id),
      is_active,
      req.user.userId
    );

    if (!updatedOffer) {
      return res.status(404).json({
        success: false,
        message: "Оффер не знайдено",
      });
    }

    res.json({
      success: true,
      data: updatedOffer,
      message: "Статус офферу успішно оновлено",
    });
  } catch (err) {
    console.error("Помилка оновлення статусу офферу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення статусу офферу",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Видалення офферу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "ID офферу має бути числом",
      });
    }

    const deletedOffer = await offerModel.deleteOffer(parseInt(id));

    if (!deletedOffer) {
      return res.status(404).json({
        success: false,
        message: "Оффер не знайдено",
      });
    }

    res.json({
      success: true,
      data: deletedOffer,
      message: "Оффер успішно видалено",
    });
  } catch (err) {
    console.error("Помилка видалення офферу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення офферу",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};