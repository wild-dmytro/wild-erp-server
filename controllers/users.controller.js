const userModel = require("../models/user.model");
const teamModel = require("../models/team.model");
const departmentModel = require("../models/department.model");
const { validationResult } = require("express-validator");

/**
 * Отримання списку всіх користувачів з фільтрацією та пагінацією
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      isActive,
      teamId,
      departmentId,
      search,
      sortBy = "id",
      sortOrder = "asc",
      isBuyer,
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (isActive && !["true", "false"].includes(isActive)) {
      errors.push({ param: "isActive", msg: "Має бути true або false" });
    }
    if (teamId && isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "Має бути числом" });
    }
    if (departmentId && isNaN(parseInt(departmentId))) {
      errors.push({ param: "departmentId", msg: "Має бути числом" });
    }
    if (sortOrder && !["asc", "desc"].includes(sortOrder.toLowerCase())) {
      errors.push({ param: "sortOrder", msg: "Має бути 'asc' або 'desc'" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Формування параметрів для моделі
    const params = {
      page: parseInt(page),
      limit: parseInt(limit),
      role,
      isActive:
        isActive === "true" ? true : isActive === "false" ? false : undefined,
      teamId: teamId ? parseInt(teamId) : undefined,
      departmentId: departmentId ? parseInt(departmentId) : undefined,
      search,
      sortBy,
      sortOrder,
      isBuyer:
        isBuyer === "true" ? true : isBuyer === "false" ? false : undefined,
    };

    // Отримання даних
    const result = await userModel.getAllUsers(params);

    res.json({
      success: true,
      data: result.users,
      pagination: {
        total: result.total,
        totalActive: result.totalActive,
        page: params.page,
        limit: params.limit,
        pages: Math.ceil(result.total / params.limit),
      },
    });
  } catch (err) {
    console.error("Помилка отримання користувачів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання користувачів",
    });
  }
};

/**
 * Отримання детальної інформації про користувача за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getUserById = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Перевіряємо, чи має користувач доступ до цієї інформації
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Тільки адміни, тімліди та сам користувач можуть переглядати деталі
    if (
      currentUserRole !== "admin" &&
      currentUserRole !== "teamlead" &&
      currentUserId !== userId
    ) {
      // Якщо це тімлід, перевіряємо, чи користувач у його команді
      if (currentUserRole === "teamlead") {
        const userInfo = await userModel.getUserById(userId);
        if (!userInfo) {
          return res.status(404).json({
            success: false,
            message: "Користувача не знайдено",
          });
        }

        const teamUsers = await userModel.getUsersByTeam(userInfo.team_id);
        const isUserInTeam = teamUsers.some(
          (user) => user.id === currentUserId
        );

        if (!isUserInTeam) {
          return res.status(403).json({
            success: false,
            message: "Доступ заборонено",
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          message: "Доступ заборонено",
        });
      }
    }

    // Отримання даних користувача з деталями
    const user = await userModel.getUserWithDetails(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error(`Помилка отримання користувача з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання користувача",
    });
  }
};

/**
 * Створення нового користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createUser = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      telegram_id,
      username,
      first_name,
      last_name,
      role,
      team_id,
      department_id,
      table_id,
      email,
      position,
    } = req.body;

    // Перевірка на існування користувача з таким Telegram ID
    const existingUser = await userModel.getUserByTelegramId(telegram_id);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Користувач з таким Telegram ID вже існує",
      });
    }

    // Перевірка на існування команди, якщо передано
    if (team_id) {
      const team = await teamModel.getTeamById(team_id);
      if (!team) {
        return res.status(400).json({
          success: false,
          message: "Вказаної команди не існує",
        });
      }
    }

    // Перевірка на існування відділу, якщо передано
    if (department_id) {
      const department = await departmentModel.getDepartmentById(department_id);
      if (!department) {
        return res.status(400).json({
          success: false,
          message: "Вказаного відділу не існує",
        });
      }
    }

    // Створення користувача
    const newUser = await userModel.createUser({
      telegram_id,
      username,
      first_name,
      last_name,
      role,
      team_id,
      department_id,
      table_id,
      email,
      position,
    });

    res.status(201).json({
      success: true,
      data: newUser,
      message: "Користувача успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення користувача:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення користувача",
    });
  }
};

/**
 * Оновлення даних користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Перевіряємо права доступу
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Перевіряємо наявність користувача
    const currentUser = await userModel.getUserById(currentUserId);
    if (!currentUser) {
      return res.status(403).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    const currentUserTeamId = currentUser.team_id;

    const existingUser = await userModel.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // Перевіряємо права доступу залежно від ролі
    let hasAccess = false;
    let allowedFields = [];

    if (currentUserRole === "admin") {
      // Адмін може оновлювати будь-кого
      hasAccess = true;
      allowedFields = [
        "username",
        "first_name",
        "last_name",
        "table_id",
        "department_id",
        "team_id",
        "role",
        "is_active",
        "position",
        "email",
      ];
    } else if (currentUserRole === "teamlead") {
      // Тімлід може оновлювати користувачів зі своєї команди
      if (!currentUserTeamId) {
        return res.status(403).json({
          success: false,
          message: "Тімлід не призначений до команди",
        });
      }

      // Перевіряємо, чи користувач належить до тієї ж команди
      if (existingUser.team_id !== currentUserTeamId) {
        return res.status(403).json({
          success: false,
          message: "Можна оновлювати тільки користувачів зі своєї команди",
        });
      }

      // Тімлід не може оновлювати адмінів
      if (existingUser.role === "admin") {
        return res.status(403).json({
          success: false,
          message: "Тімлід не може оновлювати дані адміністраторів",
        });
      }

      hasAccess = true;
      allowedFields = [
        "first_name",
        "last_name",
        "email",
        "position",
        "is_active",
      ];
    } else if (currentUserId === userId) {
      // Користувач може оновлювати тільки себе
      hasAccess = true;
      allowedFields = ["first_name", "last_name", "table_id"];
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Доступ заборонено",
      });
    }

    console.log(
      `Користувач ${currentUserId} (${currentUserRole}) оновлює користувача ${userId}`
    );

    // Фільтруємо дані для оновлення
    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Немає даних для оновлення",
      });
    }

    // Додаткові перевірки для тімліда
    if (currentUserRole === "teamlead") {
      // Тімлід не може змінювати роль користувача
      if (updateData.role && updateData.role !== existingUser.role) {
        return res.status(403).json({
          success: false,
          message: "Тімлід не може змінювати роль користувача",
        });
      }

      // Тімлід не може переводити користувача в іншу команду
      if (updateData.team_id && updateData.team_id !== currentUserTeamId) {
        return res.status(403).json({
          success: false,
          message: "Тімлід не може переводити користувачів в іншу команду",
        });
      }
    }

    // Оновлення користувача
    const updatedUser = await userModel.updateUser(userId, updateData);

    res.json({
      success: true,
      data: updatedUser,
      message: "Дані користувача успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення користувача з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення користувача",
    });
  }
};

/**
 * Деактивація користувача (встановлення is_active = false)
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deactivateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Перевіряємо наявність користувача
    const existingUser = await userModel.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // Не можна деактивувати себе
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Ви не можете деактивувати свій власний обліковий запис",
      });
    }

    // Деактивація користувача
    const result = await userModel.deactivateUser(userId);

    res.json({
      success: true,
      message: "Користувача успішно деактивовано",
      data: result,
    });
  } catch (err) {
    console.error(
      `Помилка деактивації користувача з ID ${req.params.id}:`,
      err
    );
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час деактивації користувача",
    });
  }
};

/**
 * Активація користувача (встановлення is_active = true)
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.activateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Перевіряємо наявність користувача
    const existingUser = await userModel.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // Активація користувача
    const result = await userModel.activateUser(userId);

    res.json({
      success: true,
      message: "Користувача успішно активовано",
      data: result,
    });
  } catch (err) {
    console.error(`Помилка активації користувача з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час активації користувача",
    });
  }
};

/**
 * Зміна ролі користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateUserRole = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const userId = parseInt(req.params.id);
    const { role } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Перевіряємо наявність користувача
    const existingUser = await userModel.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // // Не можна змінити роль самому собі
    // if (userId === req.user.id) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Ви не можете змінити свою власну роль",
    //   });
    // }

    // Зміна ролі користувача
    const result = await userModel.updateUserRole(userId, role);

    res.json({
      success: true,
      message: "Роль користувача успішно змінено",
      data: result,
    });
  } catch (err) {
    console.error(`Помилка зміни ролі користувача з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час зміни ролі користувача",
    });
  }
};