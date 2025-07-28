/**
 * Точка входу сервера
 * Запускає Express застосунок на вказаному порту
 */
const app = require('./app');
const dotenv = require('dotenv');

// Завантаження змінних оточення, якщо ще не завантажено
dotenv.config();

// Визначення порту
const PORT = process.env.PORT || 5000;

// Обробка необроблених винятків
process.on('uncaughtException', (err) => {
  console.error('Необроблений виняток:', err);
  console.log('Завершення роботи сервера через необроблений виняток');
  process.exit(1);
});

// Запуск сервера
const server = app.listen(PORT, () => {
  console.log(`✅ Сервер запущено на порту ${PORT} в режимі ${process.env.NODE_ENV}`);
  console.log(`🔗 Локальний URL: http://localhost:${PORT}`);
});

// Обробка необроблених відмов у Promise
process.on('unhandledRejection', (err) => {
  console.error('Необроблена відмова у Promise:', err);
  console.log('Завершення роботи сервера через необроблену відмову у Promise');
  // Правильне завершення сервера перед виходом
  server.close(() => {
    process.exit(1);
  });
});

// Обробка сигналів завершення для належного завершення роботи
process.on('SIGTERM', () => {
  console.log('Отримано SIGTERM. Правильне завершення роботи сервера.');
  server.close(() => {
    console.log('Процес завершено');
  });
});