const partnerModel = require("../models/partner.model");
const { validationResult } = require("express-validator");

/**
 * Функція для парсингу множинних ID з query параметрів
 * @param {string} param - Параметр у вигляді рядка з ID, розділеними комами
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
      ids = param.split(',');
    }
    
    const parsedIds = ids.map(id => {
      const parsed = parseInt(id.toString().trim());
      if (isNaN(parsed)) {
        throw new Error('Invalid ID');
      }
      return parsed;
    });
    
    return parsedIds.length > 0 ? parsedIds : null;
  } catch (error) {
    return null;
  }
}

/**
 * Отримання списку всіх партнерів з фільтрацією та пагінацією
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllPartners = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      onlyActive,
      search,
      hasIntegration,
      brands, // Нові фільтри
      geos,
      trafficSources,
      sortBy = "created_at",
      sortOrder = "desc"
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    
    if (type && !['Brand', 'PP', 'NET', 'DIRECT ADV'].includes(type)) {
      errors.push({ param: "type", msg: "Невірний тип партнера" });
    }
    
    if (onlyActive && !['true', 'false'].includes(onlyActive)) {
      errors.push({ param: "onlyActive", msg: "Має бути true або false" });
    }
    
    if (hasIntegration && !['true', 'false'].includes(hasIntegration)) {
      errors.push({ param: "hasIntegration", msg: "Має бути true або false" });
    }

    // Валідація нових фільтрів
    if (brands) {
      const brandIds = parseMultipleIds(brands);
      if (brandIds === null) {
        errors.push({ param: "brands", msg: "ID брендів мають бути числами, розділеними комами" });
      }
    }

    if (geos) {
      const geoIds = parseMultipleIds(geos);
      if (geoIds === null) {
        errors.push({ param: "geos", msg: "ID гео мають бути числами, розділеними комами" });
      }
    }

    if (trafficSources) {
      const trafficSourceIds = parseMultipleIds(trafficSources);
      if (trafficSourceIds === null) {
        errors.push({ param: "trafficSources", msg: "ID джерел трафіку мають бути числами, розділеними комами" });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Отримання партнерів з новими фільтрами
    const result = await partnerModel.getAllPartners({
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      onlyActive,
      search,
      hasIntegration,
      brands: brands ? parseMultipleIds(brands) : null,
      geos: geos ? parseMultipleIds(geos) : null,
      trafficSources: trafficSources ? parseMultipleIds(trafficSources) : null,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      appliedFilters: {
        type,
        onlyActive,
        search,
        hasIntegration,
        brands: brands ? parseMultipleIds(brands) : null,
        geos: geos ? parseMultipleIds(geos) : null,
        trafficSources: trafficSources ? parseMultipleIds(trafficSources) : null
      }
    });
  } catch (err) {
    console.error("Помилка отримання партнерів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання партнерів",
    });
  }
};

/**
 * Отримання детальної інформації про партнера за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPartnerById = async (req, res) => {
  try {
    const partnerId = parseInt(req.params.id);

    if (isNaN(partnerId)) {
      return res.status(400).json({
        success: false,
        message: "ID партнера має бути числом",
      });
    }

    // Отримання партнера
    const partner = await partnerModel.getPartnerById(partnerId);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Партнера не знайдено",
      });
    }

    res.json({
      success: true,
      data: partner,
    });
  } catch (err) {
    console.error(`Помилка отримання партнера з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання партнера",
    });
  }
};

/**
 * Створення нового партнера
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createPartner = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const partnerData = {
      ...req.body,
      created_by: req.userId
    };

    // Створення партнера
    const newPartner = await partnerModel.createPartner(partnerData);

    res.status(201).json({
      success: true,
      data: newPartner,
      message: "Партнера успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення партнера:", err);
    
    // Перевірка на унікальність
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: "Партнер з такою назвою вже існує",
      });
    }

    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення партнера",
    });
  }
};

/**
 * Оновлення даних партнера
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updatePartner = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const partnerId = parseInt(req.params.id);

    if (isNaN(partnerId)) {
      return res.status(400).json({
        success: false,
        message: "ID партнера має бути числом",
      });
    }

    // Перевірка наявності партнера
    const existingPartner = await partnerModel.getPartnerById(partnerId);
    if (!existingPartner) {
      return res.status(404).json({
        success: false,
        message: "Партнера не знайдено",
      });
    }

    // Оновлення партнера
    const updatedPartner = await partnerModel.updatePartner(partnerId, req.body);

    if (!updatedPartner) {
      return res.status(400).json({
        success: false,
        message: "Немає даних для оновлення",
      });
    }

    res.json({
      success: true,
      data: updatedPartner,
      message: "Дані партнера успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення партнера з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення партнера",
    });
  }
};

/**
 * Зміна статусу партнера
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updatePartnerStatus = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const partnerId = parseInt(req.params.id);
    const { is_active } = req.body;

    if (isNaN(partnerId)) {
      return res.status(400).json({
        success: false,
        message: "ID партнера має бути числом",
      });
    }

    // Перевірка наявності партнера
    const existingPartner = await partnerModel.getPartnerById(partnerId);
    if (!existingPartner) {
      return res.status(404).json({
        success: false,
        message: "Партнера не знайдено",
      });
    }

    // Оновлення статусу
    const updatedPartner = await partnerModel.updatePartnerStatus(partnerId, is_active);

    res.json({
      success: true,
      data: updatedPartner,
      message: `Партнера успішно ${is_active ? 'активовано' : 'деактивовано'}`,
    });
  } catch (err) {
    console.error(`Помилка оновлення статусу партнера з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення статусу партнера",
    });
  }
};

/**
 * Видалення партнера
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deletePartner = async (req, res) => {
  try {
    const partnerId = parseInt(req.params.id);

    if (isNaN(partnerId)) {
      return res.status(400).json({
        success: false,
        message: "ID партнера має бути числом",
      });
    }

    // Перевірка наявності партнера
    const existingPartner = await partnerModel.getPartnerById(partnerId);
    if (!existingPartner) {
      return res.status(404).json({
        success: false,
        message: "Партнера не знайдено",
      });
    }

    // Видалення партнера
    const result = await partnerModel.deletePartner(partnerId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error(`Помилка видалення партнера з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення партнера",
    });
  }
};

/**
 * Отримання статистики партнерів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getPartnersStats = async (req, res) => {
  try {
    // Отримання статистики
    const stats = await partnerModel.getPartnersStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики партнерів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики партнерів",
    });
  }
};