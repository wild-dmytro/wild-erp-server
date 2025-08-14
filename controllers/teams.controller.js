const teamModel = require("../models/team.model");
const { validationResult } = require("express-validator");

/**
 * Отримання списку всіх команд
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllTeams = async (req, res) => {
  try {
    // Отримання параметра фільтру з query string
    const { isBuying } = req.query;
    
    // Перетворення string в boolean
    const isBuyingFilter = isBuying === 'true';

    // Отримання команд з фільтром
    const teams = await teamModel.getAllTeams(isBuyingFilter);

    res.json({
      success: true,
      data: teams,
    });
  } catch (err) {
    console.error("Помилка отримання команд:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання команд",
    });
  }
};

/**
 * Отримання детальної інформації про команду за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getTeamById = async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);

    if (isNaN(teamId)) {
      return res.status(400).json({
        success: false,
        message: "ID команди має бути числом",
      });
    }

    // Перевіряємо права доступу для тімліда
    if (req.user.role === 'teamlead') {
      const currentUser = await teamModel.getTeamLead(teamId);
      if (!currentUser || currentUser.team_id !== teamId) {
        return res.status(403).json({
          success: false,
          message: "Доступ заборонено. Ви не є тімлідом цієї команди",
        });
      }
    }

    // Отримання команди
    const team = await teamModel.getTeamById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Команду не знайдено",
      });
    }

    // Додаємо додаткову інформацію
    const teamLead = await teamModel.getTeamLead(teamId);
    const userCount = await teamModel.getUserCountInTeam(teamId);

    res.json({
      success: true,
      data: {
        ...team,
        teamLead: teamLead ? {
          id: teamLead.id,
          username: teamLead.username,
          first_name: teamLead.first_name,
          last_name: teamLead.last_name
        } : null,
        userCount
      },
    });
  } catch (err) {
    console.error(`Помилка отримання команди з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання команди",
    });
  }
};

/**
 * Створення нової команди
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createTeam = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name } = req.body;

    // Перевірка на існування команди з такою назвою
    const existingTeam = await teamModel.getTeamByName(name);
    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: "Команда з такою назвою вже існує",
      });
    }

    // Створення команди
    const newTeam = await teamModel.createTeam(name);

    res.status(201).json({
      success: true,
      data: newTeam,
      message: "Команду успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення команди:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення команди",
    });
  }
};

/**
 * Оновлення назви команди
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateTeam = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const teamId = parseInt(req.params.id);
    const { name } = req.body;

    if (isNaN(teamId)) {
      return res.status(400).json({
        success: false,
        message: "ID команди має бути числом",
      });
    }

    // Перевіряємо наявність команди
    const existingTeam = await teamModel.getTeamById(teamId);
    if (!existingTeam) {
      return res.status(404).json({
        success: false,
        message: "Команду не знайдено",
      });
    }

    // Перевірка на унікальність нової назви
    if (name !== existingTeam.name) {
      const teamWithName = await teamModel.getTeamByName(name);
      if (teamWithName) {
        return res.status(400).json({
          success: false,
          message: "Команда з такою назвою вже існує",
        });
      }
    }

    // Оновлення команди
    const updatedTeam = await teamModel.updateTeam(teamId, name);

    res.json({
      success: true,
      data: updatedTeam,
      message: "Назву команди успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення команди з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення команди",
    });
  }
};

/**
 * Видалення команди
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deleteTeam = async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);

    if (isNaN(teamId)) {
      return res.status(400).json({
        success: false,
        message: "ID команди має бути числом",
      });
    }

    // Перевіряємо наявність команди
    const existingTeam = await teamModel.getTeamById(teamId);
    if (!existingTeam) {
      return res.status(404).json({
        success: false,
        message: "Команду не знайдено",
      });
    }

    // Спроба видалення команди
    const result = await teamModel.deleteTeam(teamId);

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
    console.error(`Помилка видалення команди з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення команди",
    });
  }
};