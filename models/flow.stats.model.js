const db = require('../config/db');

/**
 * Модель для роботи зі статистикою потоків (P/L таблиці)
 */

/**
 * Створення або оновлення статистики за день
 * @param {Object} data - Дані статистики
 * @param {number} data.flow_id - ID потоку
 * @param {number} data.day - День (1-31)
 * @param {number} data.month - Місяць (1-12)
 * @param {number} data.year - Рік
 * @param {number} [data.spend] - Витрати
 * @param {number} [data.installs] - Інстали
 * @param {number} [data.regs] - Реєстрації
 * @param {number} [data.deps] - Депозити
 * @param {number} [data.verified_deps] - Верифіковані депозити
 * @param {number} [data.cpa] - CPA
 * @param {string} [data.notes] - Примітки
 * @param {number} data.updated_by - ID користувача, що оновлює
 * @returns {Promise<Object>} Створений або оновлений запис
 */
const upsertFlowStat = async (data) => {
  const {
    flow_id,
    day,
    month,
    year,
    spend = 0,
    installs = 0,
    regs = 0,
    deps = 0,
    verified_deps = 0,
    cpa = 0,
    notes = null,
    updated_by
  } = data;

  // Перевіряємо, що дата коректна
  const date = new Date(year, month - 1, day);
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
    throw new Error('Некоректна дата');
  }

  const query = `
    INSERT INTO flow_stats (
      flow_id, day, month, year, spend, installs, regs, deps, 
      verified_deps, cpa, notes, created_by, updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    ON CONFLICT (flow_id, day, month, year)
    DO UPDATE SET
      spend = EXCLUDED.spend,
      installs = EXCLUDED.installs,
      regs = EXCLUDED.regs,
      deps = EXCLUDED.deps,
      verified_deps = EXCLUDED.verified_deps,
      cpa = EXCLUDED.cpa,
      notes = EXCLUDED.notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *, 
      -- Обчислювані метрики
      CASE 
        WHEN spend > 0 THEN ROUND(((deps * cpa - spend) / spend * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      CASE 
        WHEN installs > 0 THEN ROUND((regs::numeric / installs * 100)::numeric, 2)
        ELSE 0 
      END as inst2reg,
      CASE 
        WHEN regs > 0 THEN ROUND((deps::numeric / regs * 100)::numeric, 2)
        ELSE 0 
      END as reg2dep
  `;

  const params = [
    flow_id, day, month, year, spend, installs, regs, deps,
    verified_deps, cpa, notes, updated_by
  ];

  try {
    const result = await db.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error('Помилка при створенні/оновленні статистики:', error);
    throw error;
  }
};

/**
 * Масове оновлення статистики (для оновлення декількох днів одночасно)
 * @param {Array<Object>} statsArray - Масив даних статистики
 * @param {number} updated_by - ID користувача, що оновлює
 * @returns {Promise<Array>} Масив оновлених записів
 */
const bulkUpsertFlowStats = async (statsArray, updated_by) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    for (const stat of statsArray) {
      const result = await upsertFlowStat({ ...stat, updated_by });
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Отримання статистики потоку за період
 * @param {number} flow_id - ID потоку
 * @param {Object} options - Опції фільтрації
 * @param {number} [options.month] - Місяць (1-12)
 * @param {number} [options.year] - Рік
 * @param {string} [options.dateFrom] - Дата початку (YYYY-MM-DD)
 * @param {string} [options.dateTo] - Дата кінця (YYYY-MM-DD)
 * @returns {Promise<Array>} Масив статистики з обчислюваними метриками
 */
const getFlowStats = async (flow_id, options = {}) => {
  const { month, year, dateFrom, dateTo } = options;
  
  const conditions = ['flow_id = $1'];
  const params = [flow_id];
  let paramIndex = 2;

  // Фільтр за місяцем та роком
  if (month && year) {
    conditions.push(`month = $${paramIndex++} AND year = $${paramIndex++}`);
    params.push(month, year);
  } else if (year) {
    conditions.push(`year = $${paramIndex++}`);
    params.push(year);
  }

  // Фільтр за діапазоном дат
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    conditions.push(`(year > $${paramIndex++} OR (year = $${paramIndex} AND month > $${paramIndex + 1}) OR (year = $${paramIndex} AND month = $${paramIndex + 1} AND day >= $${paramIndex + 2}))`);
    params.push(fromDate.getFullYear(), fromDate.getFullYear(), fromDate.getMonth() + 1, fromDate.getFullYear(), fromDate.getMonth() + 1, fromDate.getDate());
    paramIndex += 3;
  }

  if (dateTo) {
    const toDate = new Date(dateTo);
    conditions.push(`(year < $${paramIndex++} OR (year = $${paramIndex} AND month < $${paramIndex + 1}) OR (year = $${paramIndex} AND month = $${paramIndex + 1} AND day <= $${paramIndex + 2}))`);
    params.push(toDate.getFullYear(), toDate.getFullYear(), toDate.getMonth() + 1, toDate.getFullYear(), toDate.getMonth() + 1, toDate.getDate());
    paramIndex += 3;
  }

  const query = `
    SELECT 
      *,
      -- Обчислювані метрики
      CASE 
        WHEN spend > 0 THEN ROUND(((deps * cpa - spend) / spend * 100)::numeric, 2)
        ELSE 0 
      END as roi,
      CASE 
        WHEN installs > 0 THEN ROUND((regs::numeric / installs * 100)::numeric, 2)
        ELSE 0 
      END as inst2reg,
      CASE 
        WHEN regs > 0 THEN ROUND((deps::numeric / regs * 100)::numeric, 2)
        ELSE 0 
      END as reg2dep,
      -- Конкатенована дата для зручності
      CONCAT(year, '-', LPAD(month::text, 2, '0'), '-', LPAD(day::text, 2, '0')) as full_date
    FROM flow_stats
    WHERE ${conditions.join(' AND ')}
    ORDER BY year, month, day
  `;

  try {
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Помилка при отриманні статистики потоку:', error);
    throw error;
  }
};

/**
 * Отримання агрегованої статистики за період
 * @param {number} flow_id - ID потоку
 * @param {Object} options - Опції фільтрації та групування
 * @returns {Promise<Object>} Агрегована статистика
 */
const getAggregatedStats = async (flow_id, options = {}) => {
  const { month, year, dateFrom, dateTo } = options;
  
  const conditions = ['flow_id = $1'];
  const params = [flow_id];
  let paramIndex = 2;

  // Додаємо ті ж умови фільтрації, що і в getFlowStats
  if (month && year) {
    conditions.push(`month = $${paramIndex++} AND year = $${paramIndex++}`);
    params.push(month, year);
  } else if (year) {
    conditions.push(`year = $${paramIndex++}`);
    params.push(year);
  }

  const query = `
    SELECT 
      COUNT(*) as total_days,
      SUM(spend) as total_spend,
      SUM(installs) as total_installs,
      SUM(regs) as total_regs,
      SUM(deps) as total_deps,
      SUM(verified_deps) as total_verified_deps,
      AVG(cpa) as avg_cpa,
      -- Агреговані метрики
      CASE 
        WHEN SUM(spend) > 0 THEN ROUND(((SUM(deps * cpa) - SUM(spend)) / SUM(spend) * 100)::numeric, 2)
        ELSE 0 
      END as total_roi,
      CASE 
        WHEN SUM(installs) > 0 THEN ROUND((SUM(regs)::numeric / SUM(installs) * 100)::numeric, 2)
        ELSE 0 
      END as total_inst2reg,
      CASE 
        WHEN SUM(regs) > 0 THEN ROUND((SUM(deps)::numeric / SUM(regs) * 100)::numeric, 2)
        ELSE 0 
      END as total_reg2dep
    FROM flow_stats
    WHERE ${conditions.join(' AND ')}
  `;

  try {
    const result = await db.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error('Помилка при отриманні агрегованої статистики:', error);
    throw error;
  }
};

/**
 * Видалення статистики за день
 * @param {number} flow_id - ID потоку
 * @param {number} day - День
 * @param {number} month - Місяць
 * @param {number} year - Рік
 * @returns {Promise<boolean>} Успішність видалення
 */
const deleteFlowStat = async (flow_id, day, month, year) => {
  const query = `
    DELETE FROM flow_stats 
    WHERE flow_id = $1 AND day = $2 AND month = $3 AND year = $4
  `;

  try {
    const result = await db.query(query, [flow_id, day, month, year]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Помилка при видаленні статистики:', error);
    throw error;
  }
};

/**
 * Перевірка доступу користувача до редагування статистики потоку
 * @param {number} flow_id - ID потоку
 * @param {number} user_id - ID користувача
 * @returns {Promise<boolean>} Чи має користувач доступ
 */
const checkUserAccess = async (flow_id, user_id) => {
  const query = `
    SELECT 1 FROM flows f
    LEFT JOIN flow_users fu ON f.id = fu.flow_id
    WHERE f.id = $1 AND (
      f.created_by = $2 OR 
      fu.user_id = $2 AND fu.status = 'active'
    )
    LIMIT 1
  `;

  try {
    const result = await db.query(query, [flow_id, user_id]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Помилка при перевірці доступу:', error);
    throw error;
  }
};

module.exports = {
  upsertFlowStat,
  bulkUpsertFlowStats,
  getFlowStats,
  getAggregatedStats,
  deleteFlowStat,
  checkUserAccess
};