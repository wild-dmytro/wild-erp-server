const { validationResult } = require("express-validator");
const agentsModel = require("../models/agents.model");
const userModel = require("../models/user.model");
// const ApiError = require("../utils/ApiError");

/**
 * Контролер для управління агентами
 */
const agentsController = {
  /**
   * Отримання списку всіх агентів з фільтрацією та пагінацією
   * @param {object} req - Об'єкт запиту Express
   * @param {object} res - Об'єкт відповіді Express
   * @param {function} next - Функція переходу до наступного middleware
   */
  getAllAgents: async (req, res, next) => {
    try {
      // Отримання агентів з моделі
      const { agents, pagination } = await agentsModel.getAllAgents(req.query);

      // Повертаємо результат
      res.json({
        success: true,
        data: agents,
        pagination,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання агентів",
      });
    }
  },

  /**
   * Отримання агента за ID
   * @param {object} req - Об'єкт запиту Express
   * @param {object} res - Об'єкт відповіді Express
   * @param {function} next - Функція переходу до наступного middleware
   */
  getAgentById: async (req, res, next) => {
    try {
      const { id } = req.params;

      // Отримання агента з моделі
      const agent = await agentsModel.getAgentById(id);

      // Перевірка наявності агента
      if (!agent) {
        res.status(404).json({
          success: false,
          message: `Агента з ID ${id} не знайдено`,
        });
      }

      res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Створення нового агента
   * @param {object} req - Об'єкт запиту Express
   * @param {object} res - Об'єкт відповіді Express
   * @param {function} next - Функція переходу до наступного middleware
   */
  createAgent: async (req, res, next) => {
    try {
      // Валідація вхідних даних
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(
          new ApiError("Помилка валідації даних", 400, errors.array())
        );
      }

      const { name, fee, is_active = true } = req.body;

      // Перевірка унікальності назви агента
      const exists = await agentsModel.agentExistsByName(name);
      if (exists) {
        res.status(400).json({
          success: false,
          message: `Агент з назвою ${name} вже існує`,
        });
      }

      // Створення агента
      const agent = await agentsModel.createAgent({ name, fee, is_active });

      res.status(201).json({
        success: true,
        data: agent,
        message: "Агента успішно створено",
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Оновлення даних агента
   * @param {object} req - Об'єкт запиту Express
   * @param {object} res - Об'єкт відповіді Express
   * @param {function} next - Функція переходу до наступного middleware
   */
  updateAgent: async (req, res, next) => {
    try {
      // Валідація вхідних даних
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(
          new ApiError("Помилка валідації даних", 400, errors.array())
        );
      }

      const { id } = req.params;
      const { name, fee, is_active } = req.body;

      // Перевірка наявності агента
      const agent = await agentsModel.getAgentById(id);
      if (!agent) {
        return next(new ApiError(`Агента з ID ${id} не знайдено`, 404));
      }

      // Перевірка унікальності назви, якщо вона змінюється
      if (name && name !== agent.name) {
        const exists = await agentsModel.agentExistsByName(name, id);
        if (exists) {
          return next(new ApiError(`Агент з назвою ${name} вже існує`, 400));
        }
      }

      // Оновлення агента
      const updatedAgent = await agentsModel.updateAgent(id, {
        name,
        fee,
        is_active,
      });

      res.json({
        success: true,
        data: updatedAgent,
        message: "Агента успішно оновлено",
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Оновлення статусу агента
   * @param {object} req - Об'єкт запиту Express
   * @param {object} res - Об'єкт відповіді Express
   * @param {function} next - Функція переходу до наступного middleware
   */
  updateAgentStatus: async (req, res, next) => {
    try {
      // Валідація вхідних даних
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(
          new ApiError("Помилка валідації даних", 400, errors.array())
        );
      }

      const { id } = req.params;
      const { is_active } = req.body;

      // Перевірка наявності агента
      const agent = await agentsModel.getAgentById(id);
      if (!agent) {
        return next(new ApiError(`Агента з ID ${id} не знайдено`, 404));
      }

      // Оновлення статусу
      const updatedAgent = await agentsModel.updateAgentStatus(id, is_active);

      res.json({
        success: true,
        data: updatedAgent,
        message: `Статус агента успішно ${
          is_active ? "активовано" : "деактивовано"
        }`,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Видалення агента
   * @param {object} req - Об'єкт запиту Express
   * @param {object} res - Об'єкт відповіді Express
   * @param {function} next - Функція переходу до наступного middleware
   */
  deleteAgent: async (req, res, next) => {
    try {
      const { id } = req.params;

      // Перевірка наявності агента
      const agent = await agentsModel.getAgentById(id);
      if (!agent) {
        return next(new ApiError(`Агента з ID ${id} не знайдено`, 404));
      }

      // Перевірка використання агента у заявках
      const usageCount = await agentsModel.getAgentUsageCount(id);

      if (usageCount > 0) {
        return next(
          new ApiError(
            `Неможливо видалити агента, оскільки він використовується у ${usageCount} заявках. Ви можете деактивувати його замість видалення.`,
            400
          )
        );
      }

      // Видалення агента
      await agentsModel.deleteAgent(id);

      res.json({
        success: true,
        message: "Агента успішно видалено",
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Отримання статистики використання агентів
   * @param {object} req - Об'єкт запиту Express
   * @param {object} res - Об'єкт відповіді Express
   * @param {function} next - Функція переходу до наступного middleware
   */
  getAgentsStats: async (req, res, next) => {
    try {
      // Створюємо копію query параметрів
      const queryOptions = { ...req.query };

      if (req.user && req.user.role === "teamlead") {
        const userDetails = await userModel.getUserById(req.user.id);
        if (userDetails && userDetails.team_id) {
          queryOptions.teamId = userDetails.team_id;
        } else {
          return res.status(403).json({
            success: false,
            message: "Тімлід не призначений до команди",
          });
        }
      }

      // Отримання статистики з моделі з урахуванням команди
      const stats = await agentsModel.getAgentsStats(queryOptions);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = agentsController;
