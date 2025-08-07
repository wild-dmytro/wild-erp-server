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
 * Отримання всіх потоків зі статистикою за певний день з фільтрацією за партнерами
 * @param {Object} options - Опції фільтрації
 * @param {number} options.year - Рік
 * @param {number} options.month - Місяць
 * @param {number} options.day - День
 * @param {number} [options.partnerId] - ID партнера
 * @param {Array<number>} [options.partnerIds] - Масив ID партнерів
 * @param {string} [options.status] - Статус потоку
 * @param {number} [options.teamId] - ID команди
 * @param {number} [options.userId] - ID користувача
 * @param {boolean} [options.onlyActive] - Тільки активні потоки
 * @param {boolean} [options.includeUsers] - Включити інформацію про користувачів
 * @param {number} [options.page] - Номер сторінки
 * @param {number} [options.limit] - Кількість елементів на сторінці
 * @param {number} [options.offset] - Зсув для пагінації
 * @returns {Promise<Object>} Об'єкт з масивом потоків та загальною кількістю
 */
const getDailyFlowsStats = async (options = {}) => {
  const { 
    year, 
    month, 
    day, 
    partnerId, 
    partnerIds, 
    status, 
    teamId, 
    userId, 
    onlyActive = false,
    includeUsers = false,
    limit = 20,
    offset = 0
  } = options;

  console.log('getDailyFlowsStats викликано з опціями:', options);

  try {
    // Крок 1: Будуємо WHERE умови та параметри
    const whereConditions = [];
    const queryParams = [];
    let paramCounter = 1;

    // Додаткові фільтри
    if (onlyActive) {
      whereConditions.push(`f.is_active = $${paramCounter++}`);
      queryParams.push(true);
    }

    if (status) {
      whereConditions.push(`f.status = $${paramCounter++}`);
      queryParams.push(status);
    }

    if (teamId) {
      whereConditions.push(`f.team_id = $${paramCounter++}`);
      queryParams.push(teamId);
    }

    if (partnerId) {
      whereConditions.push(`o.partner_id = $${paramCounter++}`);
      queryParams.push(partnerId);
    }

    if (partnerIds && partnerIds.length > 0) {
      whereConditions.push(`o.partner_id = ANY($${paramCounter++})`);
      queryParams.push(partnerIds);
    }

    if (userId) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM flow_users fu 
        WHERE fu.flow_id = f.id 
        AND fu.user_id = $${paramCounter++} 
        AND fu.status = 'active'
      )`);
      queryParams.push(userId);
    }

    const whereClause = whereConditions.length > 0 ? 
      `AND ${whereConditions.join(' AND ')}` : '';

    console.log('WHERE умови:', { whereConditions, queryParams, whereClause });

    // Крок 2: Запит для підрахунку загальної кількості (БЕЗ статистики)
    const countQuery = `
      SELECT COUNT(DISTINCT f.id) as total_count
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      WHERE 1=1 ${whereClause}
    `;

    console.log('Count query:', countQuery);
    console.log('Count params:', queryParams);

    const countResult = await db.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total_count) || 0;

    console.log('Total count отримано:', totalCount);

    // Крок 3: Основний запит з пагінацією
    // Додаємо параметри для дати статистики
    const statsYear = paramCounter++;
    const statsMonth = paramCounter++;
    const statsDay = paramCounter++;
    const limitParam = paramCounter++;
    const offsetParam = paramCounter++;
    
    const mainParams = [...queryParams, year, month, day, limit, offset];

    // Будуємо умову для дати статистики в основному запиті
    const statsDateCondition = `(fs.year = $${statsYear} AND fs.month = $${statsMonth} AND fs.day = $${statsDay})`;

    const mainQuery = `
      SELECT 
        -- Основні дані потоку
        f.id as flow_id,
        f.name as flow_name,
        f.status as flow_status,
        f.is_active as flow_is_active,
        f.cpa as flow_cpa,
        f.currency as flow_currency,
        f.description as flow_description,
        f.conditions as flow_conditions,
        f.kpi as flow_kpi,
        f.created_at as flow_created_at,
        f.team_id,
        
        -- Дані партнера
        p.id as partner_id,
        p.name as partner_name,
        p.type as partner_type,
        p.is_active as partner_is_active,
        p.contact_telegram as partner_telegram,
        p.contact_email as partner_email,
        
        -- Дані офферу
        o.id as offer_id,
        o.name as offer_name,
        o.description as offer_description,
        
        -- Дані команди
        t.id as team_id_full,
        t.name as team_name,
        
        -- Дані гео
        g.id as geo_id,
        g.name as geo_name,
        g.country_code as geo_country_code,
        
        -- Статистика за день
        fs.id as stats_id,
        fs.spend,
        fs.installs,
        fs.regs,
        fs.deps,
        fs.verified_deps,
        fs.cpa as stats_cpa,
        fs.notes as stats_notes,
        fs.created_at as stats_created_at,
        fs.updated_at as stats_updated_at,
        
        -- Обчислювальні поля
        CASE 
          WHEN fs.id IS NOT NULL AND fs.spend > 0 
          THEN ROUND(((fs.deps * fs.cpa - fs.spend) / fs.spend * 100)::numeric, 2)
          ELSE NULL 
        END as roi,
        CASE 
          WHEN fs.id IS NOT NULL AND fs.installs > 0 
          THEN ROUND((fs.regs::numeric / fs.installs * 100)::numeric, 2)
          ELSE NULL 
        END as inst2reg,
        CASE 
          WHEN fs.id IS NOT NULL AND fs.regs > 0 
          THEN ROUND((fs.deps::numeric / fs.regs * 100)::numeric, 2)
          ELSE NULL 
        END as reg2dep,
        
        -- Прапорець наявності статистики
        CASE WHEN fs.id IS NOT NULL THEN true ELSE false END as has_stats,
        
        -- Кількість активних користувачів
        (SELECT COUNT(*) 
         FROM flow_users fu 
         WHERE fu.flow_id = f.id 
         AND fu.status = 'active') as active_users_count
         
      FROM flows f
      LEFT JOIN offers o ON f.offer_id = o.id
      LEFT JOIN partners p ON o.partner_id = p.id
      LEFT JOIN teams t ON f.team_id = t.id
      LEFT JOIN geos g ON f.geo_id = g.id
      LEFT JOIN flow_stats fs ON f.id = fs.flow_id AND ${statsDateCondition}
      WHERE 1=1 ${whereClause}
      ORDER BY 
        CASE WHEN fs.id IS NOT NULL THEN 0 ELSE 1 END,
        p.name ASC,
        f.name ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    console.log('Main query:', mainQuery);
    console.log('Main params:', mainParams);

    const result = await db.query(mainQuery, mainParams);

    console.log(`Отримано ${result.rows.length} рядків з основного запиту`);

    // Крок 4: Отримуємо користувачів якщо потрібно
    let usersData = {};
    if (includeUsers && result.rows.length > 0) {
      const flowIds = result.rows.map(row => row.flow_id);
      
      const usersQuery = `
        SELECT 
          fu.flow_id,
          u.username,
          u.first_name,
          u.last_name
        FROM flow_users fu
        JOIN users u ON fu.user_id = u.id
        WHERE fu.flow_id = ANY($1) AND fu.status = 'active'
        ORDER BY fu.joined_at DESC
      `;

      console.log('Users query для flow_ids:', flowIds);
      
      const usersResult = await db.query(usersQuery, [flowIds]);
      
      // Групуємо користувачів за flow_id
      usersData = usersResult.rows.reduce((acc, user) => {
        if (!acc[user.flow_id]) {
          acc[user.flow_id] = [];
        }
        acc[user.flow_id].push({
          id: user.user_id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          full_name: user.first_name && user.last_name ? 
            `${user.first_name} ${user.last_name}` : 
            user.username,
          role: user.role,
          is_active: user.user_is_active,
          avatar_url: user.avatar_url,
          telegram_username: user.telegram_username,
          last_login_at: user.last_login_at,
          flow_participation: {
            status: user.user_status,
            notes: user.user_notes,
            joined_at: user.joined_at,
            left_at: user.left_at
          }
        });
        return acc;
      }, {});

      console.log(`Отримано користувачів для ${Object.keys(usersData).length} потоків`);
    }
    
    // Крок 5: Форматуємо результат
    const flows = result.rows.map(row => ({
      flow: {
        id: row.flow_id,
        name: row.flow_name,
        status: row.flow_status,
        is_active: row.flow_is_active,
        cpa: parseFloat(row.flow_cpa) || 0,
        currency: row.flow_currency,
        description: row.flow_description,
        conditions: row.flow_conditions,
        kpi: row.flow_kpi,
        created_at: row.flow_created_at,
        team_id: row.team_id,
        active_users_count: parseInt(row.active_users_count) || 0
      },
      
      partner: row.partner_id ? {
        id: row.partner_id,
        name: row.partner_name,
        type: row.partner_type,
        is_active: row.partner_is_active,
        contact_telegram: row.partner_telegram,
        contact_email: row.partner_email
      } : null,
      
      offer: row.offer_id ? {
        id: row.offer_id,
        name: row.offer_name,
        description: row.offer_description
      } : null,
      
      team: row.team_id ? {
        id: row.team_id_full,
        name: row.team_name
      } : null,
      
      geo: row.geo_id ? {
        id: row.geo_id,
        name: row.geo_name,
        country_code: row.geo_country_code
      } : null,
      
      stats: row.has_stats ? {
        id: row.stats_id,
        spend: parseFloat(row.spend) || 0,
        installs: parseInt(row.installs) || 0,
        regs: parseInt(row.regs) || 0,
        deps: parseInt(row.deps) || 0,
        verified_deps: parseInt(row.verified_deps) || 0,
        cpa: parseFloat(row.stats_cpa) || 0,
        notes: row.stats_notes,
        roi: row.roi ? parseFloat(row.roi) : 0,
        inst2reg: row.inst2reg ? parseFloat(row.inst2reg) : 0,
        reg2dep: row.reg2dep ? parseFloat(row.reg2dep) : 0,
        created_at: row.stats_created_at,
        updated_at: row.stats_updated_at
      } : null,
      
      users: includeUsers ? (usersData[row.flow_id] || []) : undefined,
      has_stats: row.has_stats
    }));

    console.log(`Повертаємо ${flows.length} потоків з ${totalCount} загальних`);
    
    return {
      flows,
      totalCount
    };
    
  } catch (error) {
    console.error('Помилка в getDailyFlowsStats:', error);
    console.error('Stack trace:', error.stack);
    throw new Error(`Помилка бази даних: ${error.message}`);
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
  getDailyFlowsStats,
  getFlowStats,
  getAggregatedStats,
  deleteFlowStat,
  checkUserAccess
};