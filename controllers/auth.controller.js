/**
 * Контролер для авторизації користувачів
 * Обробляє реєстрацію, логін та інші операції авторизації
 */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const jwtConfig = require("../config/jwt");
const userModel = require("../models/user.model");
const { validationResult } = require("express-validator");
const authLogger = require("../utils/authLogger");

/**
 * Отримує IP адресу клієнта
 * @param {Object} req - Об'єкт запиту
 * @returns {string} IP адреса
 */
const getClientIp = (req) => {
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0] ||
    req.socket.remoteAddress ||
    req.connection.remoteAddress
  );
};

/**
 * Реєстрація нового користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.register = async (req, res) => {
  try {
    // Перевірка помилок валідації
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { username, email, password, first_name, last_name, role } = req.body;

    // Перевірка, чи існує користувач
    const existingUser =
      (await userModel.findByUsernameOrEmail(username)) ||
      (await userModel.findByUsernameOrEmail(email));

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Користувач з таким іменем або email вже існує",
      });
    }

    // Створення нового користувача
    const newUser = await userModel.create({
      username,
      email,
      password,
      first_name,
      last_name,
      role: role || "user",
    });

    // Генерація JWT токена
    const token = jwtConfig.generateToken({
      userId: newUser.id,
      role: newUser.role,
    });

    // Видалення пароля з відповіді
    delete newUser.password;

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error("Помилка реєстрації:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час реєстрації",
    });
  }
};

/**
 * Логін користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.login = async (req, res) => {
  try {
    // Отримуємо IP та User Agent
    const clientIp = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "Unknown";
    const username = req.body.username || "unknown";

    // Перевірка помилок валідації
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      authLogger.logFailedLogin(
        username,
        "Помилка валідації: " +
          errors
            .array()
            .map((e) => e.msg)
            .join(", "),
        clientIp,
        userAgent
      );

      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { password } = req.body;

    // Автентифікація користувача
    const user = await userModel.authenticate(username, password);

    if (!user) {
      authLogger.logFailedLogin(
        username,
        "Невірні облікові дані",
        clientIp,
        userAgent
      );

      return res.status(401).json({
        success: false,
        message: "Невірні облікові дані",
      });
    }

    // Генерація JWT токена
    const token = jwtConfig.generateToken({
      userId: user.id,
      role: user.web_role,
    });

    // Логуємо успішну авторизацію
    authLogger.logSuccessfulLogin(user.username, user.id, clientIp, userAgent);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.web_role,
        team_id: user.team_id,
        department_id: user.department_id,
      },
    });
  } catch (err) {
    const clientIp = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "Unknown";
    const username = req.body.username || "unknown";

    console.error("Помилка логіну:", err);

    authLogger.logServerError(username, err.message, clientIp, userAgent);

    res.status(500).json({
      success: false,
      message: "Помилка сервера під час логіну",
    });
  }
};

/**
 * Отримання інформації про поточного користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await userModel.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        position: user.position,
        salary_wallet: user.salary_wallet_address,
        role: user.web_role,
        is_active: user.is_active,
        created_at: user.created_at,
        team_name: user.team_name,
        department_name: user.department_name,
        team_id: user.team_id,
        department_id: user.department_id,
      },
    });
  } catch (err) {
    console.error("Помилка отримання користувача:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання інформації про користувача",
    });
  }
};

/**
 * Зміна пароля користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.changePassword = async (req, res) => {
  try {
    // Перевірка помилок валідації
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Отримання користувача з паролем для перевірки
    const userResult = await db.query("SELECT * FROM users WHERE id = $1", [
      req.userId,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    const user = userResult.rows[0];

    // Перевірка поточного пароля
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Невірний поточний пароль",
      });
    }

    // Хешування нового пароля
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Оновлення пароля
    await db.query(
      "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
      [hashedPassword, req.userId]
    );

    res.json({
      success: true,
      message: "Пароль успішно змінено",
    });
  } catch (err) {
    console.error("Помилка зміни пароля:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час зміни пароля",
    });
  }
};

/**
 * Оновлення профілю користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateProfile = async (req, res) => {
  try {
    // Перевірка помилок валідації
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, firstsame, last_name } = req.body;

    // Перевірка, чи існує користувач з таким email
    if (email) {
      const existingUser = await db.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, req.userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Користувач з таким email вже існує",
        });
      }
    }

    // Оновлення профілю
    const updatedUser = await userModel.updateUser(req.userId, {
      email,
      first_name: firstsame,
      last_name: last_name,
    });

    res.json({
      success: true,
      message: "Профіль успішно оновлено",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        role: updatedUser.web_role,
      },
    });
  } catch (err) {
    console.error("Помилка оновлення профілю:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення профілю",
    });
  }
};

/**
 * Управління користувачами (тільки для адміністраторів)
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const result = await userModel.getAllUsers({
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Помилка отримання користувачів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання списку користувачів",
    });
  }
};

/**
 * Видалення користувача (тільки для адміністраторів)
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Перевірка, чи користувач не намагається видалити себе
    if (parseInt(id) === req.userId) {
      return res.status(400).json({
        success: false,
        message: "Ви не можете видалити свій обліковий запис через цей API",
      });
    }

    const result = await userModel.remove(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Користувача успішно видалено",
    });
  } catch (err) {
    console.error("Помилка видалення користувача:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення користувача",
    });
  }
};
