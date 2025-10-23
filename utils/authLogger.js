// utils/authLogger.js
const fs = require("fs");
const path = require("path");

// Директорія для логів
const logsDir = path.join(__dirname, "../logs");

// Створення директорії логів, якщо вона не існує
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Генерує ім'я файлу логу з поточною датою
 * @returns {string} Ім'я файлу у форматі: auth-YYYY-MM-DD.log
 */
const getLogFileName = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `auth-${year}-${month}-${day}.log`;
};

/**
 * Форматує час для логу
 * @returns {string} Час у форматі: YYYY-MM-DD HH:mm:ss
 */
const getFormattedTime = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Логує успішну авторизацію
 * @param {string} username - Користувач
 * @param {string} userId - ID користувача
 * @param {string} ip - IP адреса
 * @param {string} userAgent - User Agent браузера
 */
const logSuccessfulLogin = (username, userId, ip, userAgent) => {
  const logMessage = `[${getFormattedTime()}] SUCCESS | Username: ${username} | User ID: ${userId} | IP: ${ip} | User-Agent: ${userAgent}\n`;

  const filePath = path.join(logsDir, getLogFileName());

  fs.appendFile(filePath, logMessage, (err) => {
    if (err) {
      console.error("Помилка запису логу успішної авторизації:", err);
    }
  });
};

/**
 * Логує невдалу авторизацію
 * @param {string} username - Користувач
 * @param {string} reason - Причина невдачі
 * @param {string} ip - IP адреса
 * @param {string} userAgent - User Agent браузера
 */
const logFailedLogin = (username, reason, ip, userAgent) => {
  const logMessage = `[${getFormattedTime()}] FAILED | Username: ${username} | Reason: ${reason} | IP: ${ip} | User-Agent: ${userAgent}\n`;

  const filePath = path.join(logsDir, getLogFileName());

  fs.appendFile(filePath, logMessage, (err) => {
    if (err) {
      console.error("Помилка запису логу невдалої авторизації:", err);
    }
  });
};

/**
 * Логує помилку сервера під час авторизації
 * @param {string} username - Користувач
 * @param {string} errorMessage - Повідомлення про помилку
 * @param {string} ip - IP адреса
 * @param {string} userAgent - User Agent браузера
 */
const logServerError = (username, errorMessage, ip, userAgent) => {
  const logMessage = `[${getFormattedTime()}] ERROR | Username: ${username} | Error: ${errorMessage} | IP: ${ip} | User-Agent: ${userAgent}\n`;

  const filePath = path.join(logsDir, getLogFileName());

  fs.appendFile(filePath, logMessage, (err) => {
    if (err) {
      console.error("Помилка запису логу помилки сервера:", err);
    }
  });
};

module.exports = {
  logSuccessfulLogin,
  logFailedLogin,
  logServerError,
};
