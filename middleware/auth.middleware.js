/**
 * Middleware для перевірки авторизації користувача
 * Перевіряє наявність та валідність JWT токена
 */
const jwt = require("jsonwebtoken");
const db = require("../config/db");

/**
 * Middleware для перевірки авторизації
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 * @param {Function} next - Функція для продовження обробки запиту
 */
module.exports = async (req, res, next) => {
  try {
    // Отримання токена з заголовка
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Не авторизовано: відсутній токен авторизації",
      });
    }

    // Отримання токена з формату "Bearer [token]"
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Не авторизовано: невірний формат токена",
      });
    }

    try {
      // Верифікація токена
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Перевірка, чи існує користувач
      const userResult = await db.query(
        "SELECT id, team_id, username, email, web_role, is_active FROM users WHERE id = $1",
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Не авторизовано: користувача не знайдено",
        });
      }

      const user = userResult.rows[0];

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: "Доступ заборонено: обліковий запис неактивний",
        });
      }

      // Додавання інформації про користувача до запиту
      req.userId = decoded.userId;
      req.userRole = decoded.role || user.web_role;
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.web_role,
        teamId: user.team_id,
      };

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Не авторизовано: закінчився термін дії токена",
        });
      }

      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Не авторизовано: невірний токен",
        });
      }

      throw error;
    }
  } catch (err) {
    console.error("Помилка в middleware авторизації:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час перевірки авторизації",
    });
  }
};
