/**
 * Конфігурація підключення до бази даних PostgreSQL
 * Створює пул підключень для оптимізації запитів
 */
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Завантаження змінних оточення
dotenv.config();

// Створення пулу підключень з параметрами з .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  // SSL налаштування для production середовища
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Базові налаштування пулу
  max: 20, // максимальна кількість клієнтів у пулі
  idleTimeoutMillis: 30000, // час очікування перед звільненням клієнта
  connectionTimeoutMillis: 2000, // час очікування підключення
});

// Тестування підключення
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Помилка підключення до бази даних:', err.stack);
  } else {
    console.log('База даних успішно підключена:', res.rows[0].now);
  }
});

// Обробка помилок пулу
pool.on('error', (err) => {
  console.error('Несподівана помилка пулу PostgreSQL', err);
  process.exit(-1);
});

/**
 * Виконує параметризований SQL запит
 * @param {string} text - SQL запит
 * @param {Array} params - Параметри запиту
 * @returns {Promise} Результат запиту
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Логування для відлагодження в dev режимі
    if (process.env.NODE_ENV === 'development') {
      console.log('Виконаний запит', { text, params, duration, rows: res.rowCount });
    }
    
    return res;
  } catch (err) {
    console.error('Помилка виконання запиту:', err);
    throw err;
  }
};

/**
 * Отримує клієнта з пулу для транзакцій
 * @returns {Promise<Object>} Клієнт бази даних
 */
const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;
  
  // Перевизначення query для логування
  client.query = (...args) => {
    client.lastQuery = args;
    return query.apply(client, args);
  };
  
  // Перевизначення release для логування
  client.release = () => {
    client.query = query;
    client.release = release;
    return release.apply(client);
  };
  
  return client;
};

module.exports = {
  query,
  getClient,
  pool
};