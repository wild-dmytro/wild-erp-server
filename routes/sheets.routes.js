// routes/sheets.routes.js
const express = require('express');
const router = express.Router();
const {
  getUserSheetData,
  getUserSheetsList,
  getUserSheetInfo,
  getUserSheetRange,
  exportUserSheetData,
  searchInUserSheet,
  getUserSheetStats
} = require('../controllers/sheets.controller');

// Middleware для логування запитів
const logRequest = (req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
};

router.use(logRequest);

// Основні маршрути для роботи з Google Sheets

/**
 * Отримання даних таблиці користувача
 * GET /api/sheets/user/:id
 * Query params: range, sheet
 * Приклади:
 * - /api/sheets/user/123 - дані з першого аркуша
 * - /api/sheets/user/123?sheet=Sheet2 - дані з аркуша "Sheet2"
 * - /api/sheets/user/123?sheet=Sheet2&range=A1:D10 - конкретний діапазон з аркуша "Sheet2"
 */
router.get('/user/:id', getUserSheetData);

/**
 * Отримання списку аркушів таблиці користувача
 * GET /api/sheets/user/:id/sheets
 */
router.get('/user/:id/sheets', getUserSheetsList);

/**
 * Отримання інформації про конкретний аркуш
 * GET /api/sheets/user/:id/sheet/:sheetName
 */
router.get('/user/:id/sheet/:sheetName', getUserSheetInfo);

/**
 * Отримання конкретного діапазону даних
 * POST /api/sheets/user/:id/range
 * Body: { range, sheet }
 * Приклади:
 * - { "range": "A1:E10" } - з першого аркуша
 * - { "range": "A1:E10", "sheet": "Sheet2" } - з аркуша "Sheet2"
 */
router.post('/user/:id/range', getUserSheetRange);

/**
 * Експорт даних таблиці
 * GET /api/sheets/user/:id/export
 * Query params: format (csv, json, xlsx), sheet, range
 * Приклади:
 * - /api/sheets/user/123/export?format=csv - експорт першого аркуша в CSV
 * - /api/sheets/user/123/export?format=xlsx&sheet=Sheet2 - експорт аркуша "Sheet2" в Excel
 * - /api/sheets/user/123/export?format=json&sheet=Sheet2&range=A1:D10 - експорт діапазону в JSON
 */
router.get('/user/:id/export', exportUserSheetData);

/**
 * Пошук в таблиці користувача
 * POST /api/sheets/user/:id/search
 * Body: { query, sheet, caseSensitive, exactMatch }
 * Приклади:
 * - { "query": "test" } - пошук в першому аркуші
 * - { "query": "test", "sheet": "Sheet2" } - пошук в аркуші "Sheet2"
 * - { "query": "test", "sheet": "Sheet2", "caseSensitive": true } - пошук з урахуванням регістру
 */
router.post('/user/:id/search', searchInUserSheet);

/**
 * Отримання статистики таблиці
 * GET /api/sheets/user/:id/stats
 * Query params: sheet
 * Приклади:
 * - /api/sheets/user/123/stats - статистика першого аркуша
 * - /api/sheets/user/123/stats?sheet=Sheet2 - статистика аркуша "Sheet2"
 */
router.get('/user/:id/stats', getUserSheetStats);

// Middleware для обробки помилок
router.use((error, req, res, next) => {
  console.error('Помилка в маршруті sheets:', error);
  res.status(500).json({
    success: false,
    message: 'Внутрішня помилка сервера',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Щось пішло не так'
  });
});

module.exports = router;