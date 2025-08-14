/**
 * Головний файл Express застосунку з підключенням Swagger
 */
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Імпорт маршрутів
const authRoutes = require("./routes/auth.routes");
const reportsRoutes = require("./routes/reports.routes");
const usersRoutes = require("./routes/users.routes");
const teamsRoutes = require("./routes/teams.routes");
const departmentsRoutes = require("./routes/departments.routes");
const requestsRoutes = require("./routes/requests.routes");
const agentsRoutes = require("./routes/agents.routes");
const expenseTypesRoutes = require('./routes/expense.types.routes');
const salariesRoutes = require('./routes/salaries.routes');
const investmentOperationsRoutes = require('./routes/investment.operations.routes');
const sheetsRoutes = require('./routes/sheets.routes');
const telegramRoutes = require('./routes/telegram.routes');
const flowStatsRoutes = require('./routes/flow.stats.routes');
const payoutAllocationRoutes = require('./routes/payout.allocation.routes');
const bizdevRequestsRoutes = require('./routes/bizdev.requests.routes.js');
const communicationsRoutes = require('./routes/communications.routes');

// BIZDEV маршрути
const partnersRoutes = require('./routes/partners.routes');
const offersRoutes = require('./routes/offers.routes');
const flowsRoutes = require('./routes/flows.routes');
const brandsRoutes = require('./routes/brands.routes');
const geosRoutes = require('./routes/geos.routes');
const paymentMethodsRoutes = require('./routes/payment.methods.routes');
const trafficSourcesRoutes = require('./routes/traffic.sources.routes');
const partnerPaymentsRoutes = require('./routes/partner.payment.routes');
const partnerPayoutsRoutes = require('./routes/partner.payout.routes');

// Імпорт Swagger setup та авторизації
const { swaggerDocument, serve, setup } = require('./swagger-setup');
const { swaggerAuth, swaggerJsonAuth } = require('./swagger-auth');

// Завантаження змінних оточення
dotenv.config();

// Створення Express застосунку
const app = express();

// Визначення доступних клієнтських URL для CORS
const allowedOrigins = ["http://localhost:3000"];

// Налаштування CORS
app.use(cors('*'));

// Парсинг JSON у тілі запиту
app.use(express.json());

// Парсинг URL-encoded даних
app.use(express.urlencoded({ extended: true }));

// Логування запитів у розробницькому середовищі
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// Swagger документація з Basic Auth
app.use('/api-docs', swaggerAuth, serve, setup);

// Маршрут для отримання JSON специфікації
app.get('/api-docs.json', swaggerJsonAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

// Базовий маршрут для перевірки API
app.get("/", (req, res) => {
  res.json({
    message: "SERVER IS WORKING!",
    timestamp: new Date(),
    documentation: "/api-docs",
    apiSpec: "/api-docs.json"
  });
});

// Маршрути API
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/requests", requestsRoutes);
app.use("/api/agents", agentsRoutes);
app.use('/api/expense-types', expenseTypesRoutes);
app.use('/api/salaries', salariesRoutes);
app.use('/api/investment-operations', investmentOperationsRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/flow-stats', flowStatsRoutes);
app.use("/api/payout-allocations", payoutAllocationRoutes);
app.use('/api/bizdev-requests', bizdevRequestsRoutes);
app.use('/api/communications', communicationsRoutes);

// Тестові маршрути для Swagger авторизації (тільки в розробці)
if (process.env.NODE_ENV === 'development') {
  app.use('/api/swagger-test', require('./swagger-test.routes'));
}

// Нові маршрути для бізнес-дев відділу
app.use('/api/partners', partnersRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/flows', flowsRoutes);
app.use('/api/brands', brandsRoutes);
app.use('/api/geos', geosRoutes);
app.use('/api/payment-methods', paymentMethodsRoutes);
app.use('/api/traffic-sources', trafficSourcesRoutes);
app.use('/api/partner-payments', partnerPaymentsRoutes);
app.use('/api/partner-payouts', partnerPayoutsRoutes);

// Обробка 404 помилки
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Ресурс не знайдено",
    availableEndpoints: {
      documentation: "/api-docs",
      apiSpec: "/api-docs.json",
      health: "/"
    }
  });
});

// Глобальна обробка помилок
app.use((err, req, res, next) => {
  console.error("Глобальна обробка помилок:", err);

  const statusCode = err.statusCode || 500;
  const message = err.message || "Внутрішня помилка сервера";

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

module.exports = app;