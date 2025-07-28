const db = require("../config/db");

/**
 * Модель для роботи з інвестиційними операціями
 */
const investmentOperationsModel = {
  /**
   * Отримує всі інвестиційні операції з фільтрацією та пагінацією
   * @param {Object} options - Опції для фільтрації та пагінації
   * @param {number} [options.page=1] - Номер сторінки
   * @param {number} [options.limit=10] - Кількість записів на сторінці
   * @param {string} [options.operationType] - Тип операції (incoming/outgoing)
   * @param {string} [options.operator] - Оператор (maks_founder/ivan_partner)
   * @param {string} [options.network] - Мережа блокчейн
   * @param {string} [options.token] - Тип токена
   * @param {Date} [options.startDate] - Початкова дата
   * @param {Date} [options.endDate] - Кінцева дата
   * @param {number} [options.minAmount] - Мінімальна сума
   * @param {number} [options.maxAmount] - Максимальна сума
   * @param {string} [options.sortBy='created_at'] - Поле для сортування
   * @param {string} [options.sortOrder='desc'] - Порядок сортування
   * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
   */
  getAll: async (options = {}) => {
    const {
      page = 1,
      limit = 10,
      operationType,
      operator,
      network,
      token,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options;

    const offset = (page - 1) * limit;
    
    // Побудова WHERE умов
    const conditions = ["TRUE"];
    const params = [];
    let paramIndex = 1;

    if (operationType) {
      conditions.push(`io.operation_type = $${paramIndex++}`);
      params.push(operationType);
    }

    if (operator) {
      conditions.push(`io.operator = $${paramIndex++}`);
      params.push(operator);
    }

    if (network) {
      conditions.push(`io.network = $${paramIndex++}`);
      params.push(network);
    }

    if (token) {
      conditions.push(`io.token = $${paramIndex++}`);
      params.push(token);
    }

    if (startDate) {
      conditions.push(`io.operation_date >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`io.operation_date <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (minAmount) {
      conditions.push(`io.amount >= $${paramIndex++}`);
      params.push(minAmount);
    }

    if (maxAmount) {
      conditions.push(`io.amount <= $${paramIndex++}`);
      params.push(maxAmount);
    }

    const whereClause = conditions.join(" AND ");

    // Валідація полів сортування
    const allowedSortFields = [
      'id', 'operation_date', 'amount', 'operation_type', 'operator', 
      'network', 'token', 'created_at', 'updated_at'
    ];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Основний запит для отримання даних
    const dataQuery = `
      SELECT 
        io.*,
        cb.username as created_by_username,
        CONCAT(cb.first_name, ' ', cb.last_name) as created_by_name,
        ub.username as updated_by_username,
        CONCAT(ub.first_name, ' ', ub.last_name) as updated_by_name
      FROM 
        investment_operations io
      LEFT JOIN 
        users cb ON io.created_by = cb.id
      LEFT JOIN 
        users ub ON io.updated_by = ub.id
      WHERE 
        ${whereClause}
      ORDER BY 
        io.${validSortBy} ${validSortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    // Запит для підрахунку загальної кількості
    const countQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN operation_type = 'incoming' THEN amount ELSE 0 END) as total_incoming,
        SUM(CASE WHEN operation_type = 'outgoing' THEN amount ELSE 0 END) as total_outgoing,
        SUM(additional_fees) as total_fees
      FROM 
        investment_operations io
      WHERE 
        ${whereClause}
    `;

    params.push(parseInt(limit), offset);

    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, params),
      db.query(countQuery, params.slice(0, params.length - 2))
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      pagination: {
        total,
        totalPages,
        currentPage: parseInt(page),
        perPage: parseInt(limit)
      },
      summary: {
        totalIncoming: parseFloat(countResult.rows[0].total_incoming || 0),
        totalOutgoing: parseFloat(countResult.rows[0].total_outgoing || 0),
        totalFees: parseFloat(countResult.rows[0].total_fees || 0),
        balance: parseFloat(countResult.rows[0].total_incoming || 0) - 
                parseFloat(countResult.rows[0].total_outgoing || 0)
      }
    };
  },

  /**
   * Отримує операцію за ID
   * @param {number} id - ID операції
   * @returns {Promise<Object|null>} Об'єкт операції або null
   */
  getById: async (id) => {
    const query = `
      SELECT 
        io.*,
        cb.username as created_by_username,
        CONCAT(cb.first_name, ' ', cb.last_name) as created_by_name,
        ub.username as updated_by_username,
        CONCAT(ub.first_name, ' ', ub.last_name) as updated_by_name
      FROM 
        investment_operations io
      LEFT JOIN 
        users cb ON io.created_by = cb.id
      LEFT JOIN 
        users ub ON io.updated_by = ub.id
      WHERE 
        io.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  },

  /**
   * Створює нову інвестиційну операцію
   * @param {Object} operationData - Дані операції
   * @param {number} createdBy - ID користувача, який створює операцію
   * @returns {Promise<Object>} Створена операція
   */
  create: async (operationData, createdBy) => {
    const {
      operation_date,
      amount,
      network,
      token,
      transaction_hash,
      notes,
      additional_fees = 0,
      operation_type,
      operator,
      wallet_address
    } = operationData;

    const query = `
      INSERT INTO investment_operations (
        operation_date, amount, network, token, transaction_hash, notes,
        additional_fees, operation_type, operator, wallet_address, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      operation_date, amount, network, token, transaction_hash, notes,
      additional_fees, operation_type, operator, wallet_address, createdBy
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  },

  /**
   * Оновлює інвестиційну операцію
   * @param {number} id - ID операції
   * @param {Object} operationData - Нові дані операції
   * @param {number} updatedBy - ID користувача, який оновлює операцію
   * @returns {Promise<Object|null>} Оновлена операція або null
   */
  update: async (id, operationData, updatedBy) => {
    const allowedFields = [
      'operation_date', 'amount', 'network', 'token', 'transaction_hash',
      'notes', 'additional_fees', 'operation_type', 'operator', 'wallet_address'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    // Формування SET частини запиту
    allowedFields.forEach(field => {
      if (operationData[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(operationData[field]);
      }
    });

    if (setClauses.length === 0) {
      return null;
    }

    // Додавання updated_at та updated_by
    setClauses.push(`updated_at = NOW()`);
    setClauses.push(`updated_by = $${paramIndex++}`);
    values.push(updatedBy);

    // Додавання ID операції
    values.push(id);

    const query = `
      UPDATE investment_operations
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Видаляє інвестиційну операцію
   * @param {number} id - ID операції
   * @returns {Promise<boolean>} true якщо видалено, false якщо не знайдено
   */
  delete: async (id) => {
    const query = `
      DELETE FROM investment_operations
      WHERE id = $1
      RETURNING id
    `;

    const result = await db.query(query, [id]);
    return result.rows.length > 0;
  },

  /**
   * Отримує статистику інвестиційних операцій
   * @param {Object} options - Опції для фільтрації
   * @returns {Promise<Object>} Статистика операцій
   */
  getStats: async (options = {}) => {
    const {
      startDate,
      endDate,
      operator,
      operationType
    } = options;

    const conditions = ["TRUE"];
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`operation_date >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`operation_date <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (operator) {
      conditions.push(`operator = $${paramIndex++}`);
      params.push(operator);
    }

    if (operationType) {
      conditions.push(`operation_type = $${paramIndex++}`);
      params.push(operationType);
    }

    const whereClause = conditions.join(" AND ");

    // Основна статистика
    const summaryQuery = `
      SELECT
        COUNT(*) as total_operations,
        SUM(CASE WHEN operation_type = 'incoming' THEN 1 ELSE 0 END) as incoming_count,
        SUM(CASE WHEN operation_type = 'outgoing' THEN 1 ELSE 0 END) as outgoing_count,
        SUM(CASE WHEN operation_type = 'incoming' THEN amount ELSE 0 END) as total_incoming,
        SUM(CASE WHEN operation_type = 'outgoing' THEN amount ELSE 0 END) as total_outgoing,
        SUM(additional_fees) as total_fees,
        AVG(amount) as avg_amount,
        MAX(amount) as max_amount,
        MIN(amount) as min_amount
      FROM investment_operations
      WHERE ${whereClause}
    `;

    // Статистика по операторах
    const operatorStatsQuery = `
      SELECT
        operator,
        COUNT(*) as operations_count,
        SUM(CASE WHEN operation_type = 'incoming' THEN amount ELSE 0 END) as incoming_amount,
        SUM(CASE WHEN operation_type = 'outgoing' THEN amount ELSE 0 END) as outgoing_amount,
        SUM(additional_fees) as total_fees
      FROM investment_operations
      WHERE ${whereClause}
      GROUP BY operator
      ORDER BY operator
    `;

    // Статистика по мережах
    const networkStatsQuery = `
      SELECT
        network,
        COUNT(*) as operations_count,
        SUM(amount) as total_amount,
        SUM(additional_fees) as total_fees
      FROM investment_operations
      WHERE ${whereClause} AND network IS NOT NULL
      GROUP BY network
      ORDER BY total_amount DESC
    `;

    // Статистика по токенах
    const tokenStatsQuery = `
      SELECT
        token,
        COUNT(*) as operations_count,
        SUM(amount) as total_amount
      FROM investment_operations
      WHERE ${whereClause} AND token IS NOT NULL
      GROUP BY token
      ORDER BY total_amount DESC
    `;

    const [summaryResult, operatorResult, networkResult, tokenResult] = await Promise.all([
      db.query(summaryQuery, params),
      db.query(operatorStatsQuery, params),
      db.query(networkStatsQuery, params),
      db.query(tokenStatsQuery, params)
    ]);

    const summary = summaryResult.rows[0];
    const balance = parseFloat(summary.total_incoming || 0) - parseFloat(summary.total_outgoing || 0);

    return {
      summary: {
        ...summary,
        balance,
        total_incoming: parseFloat(summary.total_incoming || 0),
        total_outgoing: parseFloat(summary.total_outgoing || 0),
        total_fees: parseFloat(summary.total_fees || 0),
        avg_amount: parseFloat(summary.avg_amount || 0),
        max_amount: parseFloat(summary.max_amount || 0),
        min_amount: parseFloat(summary.min_amount || 0)
      },
      byOperator: operatorResult.rows.map(row => ({
        ...row,
        incoming_amount: parseFloat(row.incoming_amount || 0),
        outgoing_amount: parseFloat(row.outgoing_amount || 0),
        total_fees: parseFloat(row.total_fees || 0),
        balance: parseFloat(row.incoming_amount || 0) - parseFloat(row.outgoing_amount || 0)
      })),
      byNetwork: networkResult.rows.map(row => ({
        ...row,
        total_amount: parseFloat(row.total_amount || 0),
        total_fees: parseFloat(row.total_fees || 0)
      })),
      byToken: tokenResult.rows.map(row => ({
        ...row,
        total_amount: parseFloat(row.total_amount || 0)
      }))
    };
  },

  /**
   * Отримує місячну статистику
   * @param {number} year - Рік для статистики
   * @returns {Promise<Array>} Місячна статистика
   */
  getMonthlyStats: async (year = new Date().getFullYear()) => {
    const query = `
      SELECT
        EXTRACT(MONTH FROM operation_date) as month,
        COUNT(*) as operations_count,
        SUM(CASE WHEN operation_type = 'incoming' THEN amount ELSE 0 END) as incoming_amount,
        SUM(CASE WHEN operation_type = 'outgoing' THEN amount ELSE 0 END) as outgoing_amount,
        SUM(additional_fees) as total_fees
      FROM investment_operations
      WHERE EXTRACT(YEAR FROM operation_date) = $1
      GROUP BY EXTRACT(MONTH FROM operation_date)
      ORDER BY month
    `;

    const result = await db.query(query, [year]);

    // Формування даних для всіх 12 місяців
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    
    return months.map(month => {
      const monthData = result.rows.find(row => parseInt(row.month) === month) || {
        operations_count: 0,
        incoming_amount: 0,
        outgoing_amount: 0,
        total_fees: 0
      };

      const incomingAmount = parseFloat(monthData.incoming_amount || 0);
      const outgoingAmount = parseFloat(monthData.outgoing_amount || 0);

      return {
        month,
        monthName: new Date(year, month - 1, 1).toLocaleString("uk-UA", { month: "long" }),
        operationsCount: parseInt(monthData.operations_count || 0),
        incomingAmount,
        outgoingAmount,
        totalFees: parseFloat(monthData.total_fees || 0),
        balance: incomingAmount - outgoingAmount
      };
    });
  }
};

module.exports = investmentOperationsModel;