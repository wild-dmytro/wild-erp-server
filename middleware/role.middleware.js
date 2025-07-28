/**
 * Middleware для перевірки ролей користувача
 * Обмежує доступ до маршрутів в залежності від ролі
 */

/**
 * Створює middleware для перевірки ролей
 * @param {...string} roles - Список ролей, яким дозволено доступ
 * @returns {Function} Middleware для перевірки ролей
 */
module.exports = (...roles) => {
  /**
   * Middleware для перевірки ролей
   * @param {Object} req - Об'єкт запиту Express
   * @param {Object} res - Об'єкт відповіді Express
   * @param {Function} next - Функція для продовження обробки запиту
   */
  return (req, res, next) => {
    // Перевірка, чи пройшов користувач авторизацію
    if (!req.userRole) {
      return res.status(401).json({
        success: false,
        message: "Не авторизовано: відсутня інформація про роль користувача",
      });
    }

    // Перевірка, чи має користувач необхідну роль
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: `Доступ заборонено: необхідна одна з ролей [${roles.join(
          ", "
        )}]`,
      });
    }

    // Продовження обробки запиту, якщо роль відповідає
    next();
  };
};
