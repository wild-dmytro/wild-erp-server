const expenseTypeModel = require("../models/expense.type.model");
const { validationResult } = require("express-validator");

/**
 * Отримання списку всіх типів витрат
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllExpenseTypes = async (req, res) => {
  try {
    const onlyActive = req.query.onlyActive === 'true';
    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId) : null;

    if (departmentId && isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "departmentId має бути числом",
      });
    }

    // Отримання типів витрат
    const expenseTypes = await expenseTypeModel.getAllExpenseTypes(onlyActive, departmentId);

    res.json({
      success: true,
      data: expenseTypes,
    });
  } catch (err) {
    console.error("Помилка отримання типів витрат:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання типів витрат",
    });
  }
};

/**
 * Отримання детальної інформації про тип витрати за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getExpenseTypeById = async (req, res) => {
  try {
    const typeId = parseInt(req.params.id);

    if (isNaN(typeId)) {
      return res.status(400).json({
        success: false,
        message: "ID типу витрати має бути числом",
      });
    }

    // Отримання типу витрати
    const expenseType = await expenseTypeModel.getExpenseTypeById(typeId);

    if (!expenseType) {
      return res.status(404).json({
        success: false,
        message: "Тип витрати не знайдено",
      });
    }

    res.json({
      success: true,
      data: expenseType,
    });
  } catch (err) {
    console.error(`Помилка отримання типу витрати з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання типу витрати",
    });
  }
};

/**
 * Створення нового типу витрати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createExpenseType = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, description, departmentId } = req.body;

    if (!departmentId || isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "departmentId є обов'язковим і має бути числом",
      });
    }

    // Перевірка на існування типу витрати з такою назвою в межах departmentId
    const existingType = await expenseTypeModel.getExpenseTypeByName(name, departmentId);
    if (existingType) {
      return res.status(400).json({
        success: false,
        message: "Тип витрати з такою назвою вже існує в цьому відділі",
      });
    }

    // Створення типу витрати
    const newExpenseType = await expenseTypeModel.createExpenseType(name, description, departmentId);

    res.status(201).json({
      success: true,
      data: newExpenseType,
      message: "Тип витрати успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення типу витрати:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення типу витрати",
    });
  }
};

/**
 * Оновлення даних типу витрати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateExpenseType = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const typeId = parseInt(req.params.id);
    const { name, description, departmentId } = req.body;

    if (isNaN(typeId)) {
      return res.status(400).json({
        success: false,
        message: "ID типу витрати має бути числом",
      });
    }

    if (departmentId && isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "departmentId має бути числом",
      });
    }

    // Перевіряємо наявність типу витрати
    const existingType = await expenseTypeModel.getExpenseTypeById(typeId);
    if (!existingType) {
      return res.status(404).json({
        success: false,
        message: "Тип витрати не знайдено",
      });
    }

    // Перевірка на унікальність нової назви в межах departmentId
    if (name && name !== existingType.name) {
      const typeWithSameName = await expenseTypeModel.getExpenseTypeByName(
        name,
        departmentId || existingType.department_id
      );
      if (typeWithSameName) {
        return res.status(400).json({
          success: false,
          message: "Тип витрати з такою назвою вже існує в цьому відділі",
        });
      }
    }

    // Оновлення типу витрати
    const updatedType = await expenseTypeModel.updateExpenseType(
      typeId,
      name || existingType.name,
      description !== undefined ? description : existingType.description,
      departmentId || existingType.department_id
    );

    res.json({
      success: true,
      data: updatedType,
      message: "Дані типу витрати успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення типу витрати з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення типу витрати",
    });
  }
};

/**
 * Оновлення статусу типу витрати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateExpenseTypeStatus = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const typeId = parseInt(req.params.id);
    const { is_active } = req.body;

    if (isNaN(typeId)) {
      return res.status(400).json({
        success: false,
        message: "ID типу витрати має бути числом",
      });
    }

    // Перевіряємо наявність типу витрати
    const existingType = await expenseTypeModel.getExpenseTypeById(typeId);
    if (!existingType) {
      return res.status(404).json({
        success: false,
        message: "Тип витрати не знайдено",
      });
    }

    // Оновлення статусу типу витрати
    const updatedType = await expenseTypeModel.updateExpenseTypeStatus(typeId, is_active);

    res.json({
      success: true,
      data: updatedType,
      message: `Тип витрати успішно ${is_active ? 'активовано' : 'деактивовано'}`,
    });
  } catch (err) {
    console.error(`Помилка оновлення статусу типу витрати з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення статусу типу витрати",
    });
  }
};

/**
 * Видалення типу витрати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deleteExpenseType = async (req, res) => {
  try {
    const typeId = parseInt(req.params.id);

    if (isNaN(typeId)) {
      return res.status(400).json({
        success: false,
        message: "ID типу витрати має бути числом",
      });
    }

    // Перевіряємо наявність типу витрати
    const existingType = await expenseTypeModel.getExpenseTypeById(typeId);
    if (!existingType) {
      return res.status(404).json({
        success: false,
        message: "Тип витрати не знайдено",
      });
    }

    // Перевіряємо, чи використовується тип витрати в заявках
    const isUsed = await expenseTypeModel.isExpenseTypeUsed(typeId);
    if (isUsed) {
      return res.status(400).json({
        success: false,
        message: "Неможливо видалити тип витрати, оскільки він використовується в заявках",
      });
    }

    // Видалення типу витрати
    await expenseTypeModel.deleteExpenseType(typeId);

    res.json({
      success: true,
      message: "Тип витрати успішно видалено",
    });
  } catch (err) {
    console.error(`Помилка видалення типу витрати з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення типу витрати",
    });
  }
};

/**
 * Отримання статистики типів витрат
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getExpenseTypeStats = async (req, res) => {
  try {
    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId) : null;

    if (departmentId && isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "departmentId має бути числом",
      });
    }

    // Отримання статистики
    const stats = await expenseTypeModel.getExpenseTypeStats(departmentId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики типів витрат:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики типів витрат",
    });
  }
};