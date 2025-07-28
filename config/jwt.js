/**
 * Конфігурація JWT (JSON Web Token)
 * Налаштування для створення та перевірки токенів авторизації
 */
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Генерує JWT токен для користувача
 * @param {Object} payload - Дані користувача для включення в токен
 * @returns {String} JWT токен
 */
const generateToken = (payload) => {
  // Створюємо токен з прийнятним терміном дії (8 годин)
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION || '1m' }
  );
};

/**
 * Перевіряє JWT токен
 * @param {String} token - JWT токен для перевірки
 * @returns {Object|null} Розшифровані дані або null при помилці
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('Помилка перевірки JWT токена:', error.message);
    return null;
  }
};

/**
 * Налаштування опцій для генерації токенів
 */
const jwtOptions = {
  issuer: 'finance-reports-api',
  audience: 'finance-reports-client',
  algorithm: 'HS256',
  expiresIn: process.env.JWT_EXPIRATION || '8h'
};

/**
 * Генерує токен з розширеними опціями
 * @param {Object} payload - Дані користувача 
 * @returns {String} JWT токен
 */
const generateTokenWithOptions = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET, 
    jwtOptions
  );
};

module.exports = {
  generateToken,
  verifyToken,
  generateTokenWithOptions,
  jwtOptions
};