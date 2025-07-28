/**
 * Утиліти для роботи з базою даних PostgreSQL
 * Допоміжні функції для транзакцій та складних запитів
 */
const db = require('../config/db');

/**
 * Виконує операції в транзакції
 * @param {Function} callback - Функція з операціями бази даних, яка отримує клієнта
 * @returns {Promise<any>} Результат виконання callback
 */
const withTransaction = async (callback) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Створює динамічний SQL запит для оновлення 
 * @param {string} table - Назва таблиці
 * @param {Object} data - Об'єкт з даними для оновлення
 * @param {string|Array} whereField - Поле або масив полів для WHERE умови
 * @param {any|Array} whereValue - Значення або масив значень для WHERE умови
 * @returns {Object} Об'єкт з текстом запиту і параметрами
 */
const buildUpdateQuery = (table, data, whereField, whereValue) => {
  const fields = Object.keys(data);
  const values = Object.values(data);
  
  if (fields.length === 0) {
    throw new Error('Немає даних для оновлення');
  }
  
  // Створення SET частини запиту
  const setClause = fields
    .map((field, index) => `${field} = $${index + 1}`)
    .join(', ');
  
  // Створення WHERE умови
  let whereClause;
  const isMultipleWhereFields = Array.isArray(whereField);
  
  if (isMultipleWhereFields) {
    whereClause = whereField
      .map((field, index) => `${field} = $${fields.length + index + 1}`)
      .join(' AND ');
  } else {
    whereClause = `${whereField} = $${fields.length + 1}`;
  }
  
  // Створення параметрів
  let params = [...values];
  
  if (isMultipleWhereFields) {
    params = params.concat(Array.isArray(whereValue) ? whereValue : [whereValue]);
  } else {
    params.push(whereValue);
  }
  
  const query = `
    UPDATE ${table} 
    SET ${setClause} 
    WHERE ${whereClause}
    RETURNING *
  `;
  
  return { query, params };
};

/**
 * Створює динамічний SQL запит для вставки
 * @param {string} table - Назва таблиці
 * @param {Object} data - Об'єкт з даними для вставки
 * @returns {Object} Об'єкт з текстом запиту і параметрами
 */
const buildInsertQuery = (table, data) => {
  const fields = Object.keys(data);
  const values = Object.values(data);
  
  if (fields.length === 0) {
    throw new Error('Немає даних для вставки');
  }
  
  // Створення параметрів для підготовленого запиту
  const placeholders = fields
    .map((_, index) => `$${index + 1}`)
    .join(', ');
  
  const query = `
    INSERT INTO ${table} (${fields.join(', ')}) 
    VALUES (${placeholders})
    RETURNING *
  `;
  
  return { query, params: values };
};

/**
 * Створює параметризований запит на основі умов
 * @param {string} baseQuery - Базовий SQL запит
 * @param {Object} filters - Об'єкт з умовами фільтрації
 * @param {Object} options - Додаткові опції (сортування, пагінація)
 * @returns {Object} Об'єкт з текстом запиту і параметрами
 */
const buildFilteredQuery = (baseQuery, filters = {}, options = {}) => {
  const conditions = [];
  const params = [];
  let paramIndex = 1;
  
  // Розбір фільтрів і створення умов WHERE
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Спеціальна обробка для різних типів операторів
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Приклад: { price: { gt: 100 } } => "price > 100"
        Object.entries(value).forEach(([op, opValue]) => {
          if (opValue !== undefined && opValue !== null) {
            switch (op) {
              case 'eq': // Рівність
                conditions.push(`${key} = $${paramIndex++}`);
                params.push(opValue);
                break;
              case 'neq': // Нерівність
                conditions.push(`${key} != $${paramIndex++}`);
                params.push(opValue);
                break;
              case 'gt': // Більше ніж
                conditions.push(`${key} > $${paramIndex++}`);
                params.push(opValue);
                break;
              case 'gte': // Більше або дорівнює
                conditions.push(`${key} >= $${paramIndex++}`);
                params.push(opValue);
                break;
              case 'lt': // Менше ніж
                conditions.push(`${key} < $${paramIndex++}`);
                params.push(opValue);
                break;
              case 'lte': // Менше або дорівнює
                conditions.push(`${key} <= $${paramIndex++}`);
                params.push(opValue);
                break;
              case 'like': // LIKE
                conditions.push(`${key} ILIKE $${paramIndex++}`);
                params.push(`%${opValue}%`);
                break;
              case 'in': // IN
                if (Array.isArray(opValue) && opValue.length > 0) {
                  const placeholders = opValue.map(() => `$${paramIndex++}`).join(', ');
                  conditions.push(`${key} IN (${placeholders})`);
                  params.push(...opValue);
                }
                break;
            }
          }
        });
      } else if (Array.isArray(value) && value.length > 0) {
        // Масив значень
        const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        params.push(...value);
      } else {
        // Просте значення
        conditions.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }
  });
  
  // Формування повного запиту
  let query = baseQuery;
  
  // Додавання WHERE умов, якщо вони є
  if (conditions.length > 0) {
    const whereKeyword = baseQuery.toUpperCase().includes('WHERE') ? 'AND' : 'WHERE';
    query += ` ${whereKeyword} ${conditions.join(' AND ')}`;
  }
  
  // Додавання сортування, якщо вказано
  if (options.sort) {
    const { field, order } = options.sort;
    query += ` ORDER BY ${field} ${order || 'ASC'}`;
  }
  
  // Додавання пагінації, якщо вказано
  if (options.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(options.limit);
    
    if (options.offset || options.offset === 0) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }
  }
  
  return { query, params };
};

/**
 * Функція для простішої побудови JOIN запитів
 * @param {Object} options - Опції для побудови JOIN запиту
 * @param {string} options.baseTable - Базова таблиця
 * @param {Array} options.joins - Масив об'єктів { table, on, type } для JOIN
 * @param {Array} options.fields - Масив полів для вибірки
 * @param {Object} options.where - Об'єкт умов для WHERE
 * @param {Object} options.sort - Об'єкт { field, order } для сортування
 * @param {Object} options.pagination - Об'єкт { limit, offset } для пагінації
 * @returns {Object} Об'єкт з текстом запиту і параметрами
 */
const buildJoinQuery = ({ baseTable, joins = [], fields = ['*'], where = {}, sort, pagination }) => {
  // Побудова частини SELECT
  const selectClause = fields.join(', ');
  
  // Побудова частини FROM з JOIN
  let fromClause = baseTable;
  joins.forEach(({ table, on, type = 'INNER' }) => {
    fromClause += ` ${type} JOIN ${table} ON ${on}`;
  });
  
  // Базовий запит
  const baseQuery = `SELECT ${selectClause} FROM ${fromClause}`;
  
  // Додавання WHERE, ORDER BY, LIMIT/OFFSET
  return buildFilteredQuery(
    baseQuery, 
    where, 
    { 
      sort, 
      limit: pagination?.limit, 
      offset: pagination?.offset 
    }
  );
};

module.exports = {
  withTransaction,
  buildUpdateQuery,
  buildInsertQuery,
  buildFilteredQuery,
  buildJoinQuery
};