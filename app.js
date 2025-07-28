/**
 * Головний файл Express застосунку
 */
const express = require("express");
const cors = require("cors");
// const helmet = require("helmet");
const dotenv = require("dotenv");
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

// BIZDEV
const partnersRoutes = require('./routes/partners.routes');
const offersRoutes = require('./routes/offers.routes');
const flowsRoutes = require('./routes/flows.routes');
const brandsRoutes = require('./routes/brands.routes');
const geosRoutes = require('./routes/geos.routes');
const paymentMethodsRoutes = require('./routes/payment.methods.routes');
const trafficSourcesRoutes = require('./routes/traffic.sources.routes');
const partnerPaymentsRoutes = require('./routes/partner.payment.routes');
const partnerPayoutsRoutes = require('./routes/partner.payout.routes');


// Завантаження змінних оточення
dotenv.config();

// Створення Express застосунку
const app = express();

// Визначення доступних клієнтських URL для CORS
const allowedOrigins = ["http://localhost:3000"];

// Налаштування CORS
// app.use(cors({
//   origin: function(origin, callback) {
//     // Дозволяємо запити без origin (наприклад, мобільні застосунки)
//     if (!origin) return callback(null, true);

//     if (allowedOrigins.indexOf(origin) === -1) {
//       const msg = 'Політика CORS забороняє доступ з цього джерела.';
//       return callback(new Error(msg), false);
//     }

//     return callback(null, true);
//   },
//   credentials: true
// }));

app.use(cors('*'));

// Налаштування CORS
// app.use(
//   cors({
//     origin: "http://localhost:3000",
//     credentials: true,
//   })
// );
// Додаткова безпека
// app.use(helmet());

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

// Базовий маршрут для перевірки API
app.get("/", (req, res) => {
  res.json({
    message: "API для фінансових звітів працює!",
    timestamp: new Date(),
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

// Define the port
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
