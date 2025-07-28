const departmentModel = require("../models/department.model");
const { validationResult } = require("express-validator");
const { getDepartmentExpenseStats, getDepartmentDetailStats, getTopDepartments } = require("../models/department.stats.model");
const { isValid } = require('date-fns');

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
    const stats = await getDepartmentExpenseStats({
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
 * Отримання детальної статистики конкретного відділу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getDepartmentDetailStats = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { startDate, endDate } = req.query;

    // Валідація
    if (!departmentId || isNaN(parseInt(departmentId))) {
      return res.status(400).json({
        success: false,
        message: "Невірний ID відділу",
      });
    }

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
    const stats = await getDepartmentDetailStats(parseInt(departmentId), {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    if (!stats) {
      return res.status(404).json({
        success: false,
        message: "Відділ не знайдено",
      });
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання детальної статистики відділу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання детальної статистики відділу",
    });
  }
};

/**
 * Отримання топ-5 відділів за обраною метрикою
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getTopDepartments = async (req, res) => {
  try {
    const { startDate, endDate, metric = 'total_amount' } = req.query;

    // Валідація метрики
    const allowedMetrics = [
      'total_amount', 'agent_refill_amount', 'expense_amount', 'salary_amount',
      'total_count', 'agent_refill_count', 'expense_count', 'salary_count'
    ];

    if (metric && !allowedMetrics.includes(metric)) {
      return res.status(400).json({
        success: false,
        message: "Невірна метрика для сортування",
        allowedMetrics,
      });
    }

    // Перевірка дат
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
    const stats = await getTopDepartments({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      metric,
    });

    res.json({
      success: true,
      data: stats,
      meta: {
        metric,
        count: stats.length,
      },
    });
  } catch (err) {
    console.error("Помилка отримання топ відділів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання топ відділів",
    });
  }
};

/**
 * Отримання списку всіх відділів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllDepartments = async (req, res) => {
  try {
    const { onlyActive = false } = req.query;

    // Перевірка параметра onlyActive
    if (onlyActive && !['true', 'false'].includes(onlyActive)) {
      return res.status(400).json({
        success: false,
        message: "Параметр onlyActive має бути true або false",
      });
    }

    // Отримання відділів
    const departments = await departmentModel.getAllDepartments(onlyActive === 'true');

    res.json({
      success: true,
      data: departments,
    });
  } catch (err) {
    console.error("Помилка отримання відділів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання відділів",
    });
  }
};

/**
 * Отримання детальної інформації про відділ за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getDepartmentById = async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id);

    if (isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "ID відділу має бути числом",
      });
    }

    // Отримання відділу
    const department = await departmentModel.getDepartmentById(departmentId);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Відділ не знайдено",
      });
    }

    res.json({
      success: true,
      data: department,
    });
  } catch (err) {
    console.error(`Помилка отримання відділу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання відділу",
    });
  }
};

/**
 * Створення нового відділу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createDepartment = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, description } = req.body;

    // Перевірка на існування відділу з такою назвою
    const existingDepartment = await departmentModel.getDepartmentByName(name);
    if (existingDepartment) {
      return res.status(400).json({
        success: false,
        message: "Відділ з такою назвою вже існує",
      });
    }

    // Створення відділу
    const newDepartment = await departmentModel.createDepartment({ name, description });

    res.status(201).json({
      success: true,
      data: newDepartment,
      message: "Відділ успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення відділу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення відділу",
    });
  }
};

/**
 * Оновлення даних відділу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateDepartment = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const departmentId = parseInt(req.params.id);
    const { name, description } = req.body;

    if (isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "ID відділу має бути числом",
      });
    }

    // Перевіряємо наявність відділу
    const existingDepartment = await departmentModel.getDepartmentById(departmentId);
    if (!existingDepartment) {
      return res.status(404).json({
        success: false,
        message: "Відділ не знайдено",
      });
    }

    // Перевірка на унікальність нової назви, якщо вона змінюється
    if (name && name !== existingDepartment.name) {
      const departmentWithName = await departmentModel.getDepartmentByName(name);
      if (departmentWithName) {
        return res.status(400).json({
          success: false,
          message: "Відділ з такою назвою вже існує",
        });
      }
    }

    // Оновлення відділу
    const updatedDepartment = await departmentModel.updateDepartment(departmentId, { name, description });

    if (!updatedDepartment) {
      return res.status(400).json({
        success: false,
        message: "Немає даних для оновлення",
      });
    }

    res.json({
      success: true,
      data: updatedDepartment,
      message: "Дані відділу успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення відділу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення відділу",
    });
  }
};

/**
 * Оновлення статусу відділу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateDepartmentStatus = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const departmentId = parseInt(req.params.id);
    const { is_active } = req.body;

    if (isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "ID відділу має бути числом",
      });
    }

    // Перевіряємо наявність відділу
    const existingDepartment = await departmentModel.getDepartmentById(departmentId);
    if (!existingDepartment) {
      return res.status(404).json({
        success: false,
        message: "Відділ не знайдено",
      });
    }

    // Оновлення статусу
    const updatedDepartment = is_active
      ? await departmentModel.activateDepartment(departmentId)
      : await departmentModel.deactivateDepartment(departmentId);

    res.json({
      success: true,
      data: updatedDepartment,
      message: `Відділ успішно ${is_active ? 'активовано' : 'деактивовано'}`,
    });
  } catch (err) {
    console.error(`Помилка оновлення статусу відділу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення статусу відділу",
    });
  }
};

/**
 * Видалення відділу
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deleteDepartment = async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id);

    if (isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "ID відділу має бути числом",
      });
    }

    // Перевіряємо наявність відділу
    const existingDepartment = await departmentModel.getDepartmentById(departmentId);
    if (!existingDepartment) {
      return res.status(404).json({
        success: false,
        message: "Відділ не знайдено",
      });
    }

    // Спроба видалення відділу
    const result = await departmentModel.deleteDepartment(departmentId);

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
    console.error(`Помилка видалення відділу з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення відділу",
    });
  }
};

/**
 * Отримання структури відділів та користувачів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getDepartmentsStructure = async (req, res) => {
  try {
    const { onlyActive = true } = req.query;

    // Перевірка параметра onlyActive
    if (onlyActive && !['true', 'false'].includes(onlyActive)) {
      return res.status(400).json({
        success: false,
        message: "Параметр onlyActive має бути true або false",
      });
    }

    // Отримання структури
    const structure = await departmentModel.getDepartmentsStructure(onlyActive === 'true');

    res.json({
      success: true,
      data: structure,
    });
  } catch (err) {
    console.error("Помилка отримання структури відділів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання структури відділів",
    });
  }
};

/**
 * От * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getDepartmentsStats = async (req, res) => {
  try {
    // Отримання статистики
    const stats = await departmentModel.getDepartmentsStats();

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