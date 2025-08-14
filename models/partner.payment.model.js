const db = require("../config/db");

/**
 * Модель для роботи з платежами партнерських програм
 */
const partnerPaymentModel = {
  /**
   * Отримує список всіх платежів з фільтрацією та пагінацією
   * @param {Object} options - Опції для фільтрації та пагінації
   * @param {number} [options.page=1] - Номер сторінки
   * @param {number} [options.limit=10] - Кількість записів на сторінці
   * @param {number} [options.payoutRequestId] - ID заявки на виплату
   * @param {string} [options.status] - Статус платежу
   * @param {string} [options.currency] - Валюта
   * @param {string} [options.network] - Мережа
   * @param {Date} [options.startDate] - Початкова дата
   * @param {Date} [options.endDate] - Кінцева дата
   * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
   */
  getAllPayments: async ({
    page = 1,
    limit = 10,
    payoutRequestId,
    status,
    currency,
    network,
    startDate,
    endDate,
    sortBy = "created_at",
    sortOrder = "desc"
  }) => {
    const offset = (page - 1) * limit;

    // Побудова WHERE умов
    const conditions = ["TRUE"];
    const params = [];
    let paramIndex = 1;

    if (payoutRequestId) {
      conditions.push(`pp.payout_request_id = $${paramIndex++}`);
      params.push(parseInt(payoutRequestId));
    }

    if (status) {
      conditions.push(`pp.status = $${paramIndex++}`);
      params.push(status);
    }

    if (currency) {
      conditions.push(`pp.currency = $${paramIndex++}`);
      params.push(currency);
    }

    if (network) {
      conditions.push(`pp.network = $${paramIndex++}`);
      params.push(network);
    }

    if (startDate) {
      conditions.push(`pp.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`pp.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.join(" AND ");

    // Валідація полів сортування
    const allowedSortFields = ["id", "amount", "status", "payment_date", "created_at"];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : "created_at";
    const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    // Основний запит
    const query = `
      SELECT 
        pp.*,
        ppr.partner_id,
        p.name as partner_name,
        p.type as partner_type,
        creator.username as created_by_username,
        CONCAT(creator.first_name, ' ', creator.last_name) as created_by_name,
        processor.username as processed_by_username,
        CONCAT(processor.first_name, ' ', processor.last_name) as processed_by_name
      FROM 
        partner_payments pp
      JOIN 
        partner_payout_requests ppr ON pp.payout_request_id = ppr.id
      JOIN 
        partners p ON ppr.partner_id = p.id
      LEFT JOIN 
        users creator ON pp.created_by = creator.id
      LEFT JOIN 
        users processor ON pp.processed_by = processor.id
      WHERE 
        ${whereClause}
      ORDER BY 
        pp.${validSortBy} ${validSortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(parseInt(limit), offset);

    // Запит для підрахунку загальної кількості
    const countQuery = `
      SELECT COUNT(*) as total
      FROM partner_payments pp
      JOIN partner_payout_requests ppr ON pp.payout_request_id = ppr.id
      JOIN partners p ON ppr.partner_id = p.id
      WHERE ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, params.length - 2)),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows,
      pagination: {
        total,
        totalPages,
        currentPage: parseInt(page),
        perPage: parseInt(limit),
      },
    };
  },

  /**
   * Отримує платіж за ID з детальною інформацією
   * @param {number} id - ID платежу
   * @returns {Promise<Object|null>} Об'єкт платежу або null
   */
  getPaymentById: async (id) => {
    const query = `
      SELECT 
        pp.*,
        ppr.partner_id,
        ppr.period_start,
        ppr.period_end,
        ppr.total_amount as payout_total_amount,
        p.name as partner_name,
        p.type as partner_type,
        p.contact_telegram as partner_contact_telegram,
        p.contact_email as partner_contact_email,
        creator.username as created_by_username,
        CONCAT(creator.first_name, ' ', creator.last_name) as created_by_name,
        processor.username as processed_by_username,
        CONCAT(processor.first_name, ' ', processor.last_name) as processed_by_name
      FROM 
        partner_payments pp
      JOIN 
        partner_payout_requests ppr ON pp.payout_request_id = ppr.id
      JOIN 
        partners p ON ppr.partner_id = p.id
      LEFT JOIN 
        users creator ON pp.created_by = creator.id
      LEFT JOIN 
        users processor ON pp.processed_by = processor.id
      WHERE 
        pp.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  },

  /**
   * Створює новий платіж
   * @param {Object} paymentData - Дані платежу
   * @returns {Promise<Object>} Створений платіж
   */
  createPayment: async (paymentData) => {
    const {
      payout_request_id,
      amount,
      currency = 'USD',
      transaction_hash,
      network,
      wallet_address,
      notes,
      status,
      created_by
    } = paymentData;

    const query = `
      INSERT INTO partner_payments (
        payout_request_id, amount, currency, transaction_hash, network,
        wallet_address, notes, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await db.query(query, [
      payout_request_id, amount, currency, transaction_hash, network,
      wallet_address, notes, status, created_by
    ]);

    return result.rows[0];
  },

  /**
   * Оновлює дані платежу
   * @param {number} id - ID платежу
   * @param {Object} paymentData - Дані для оновлення
   * @returns {Promise<Object|null>} Оновлений платіж або null
   */
  updatePayment: async (id, paymentData) => {
    const {
      amount,
      currency,
      transaction_hash,
      network,
      wallet_address,
      notes,
      failure_reason,
      block_number,
      gas_used,
      gas_price
    } = paymentData;

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (amount !== undefined) {
      setClauses.push(`amount = $${paramIndex++}`);
      values.push(amount);
    }
    if (currency !== undefined) {
      setClauses.push(`currency = $${paramIndex++}`);
      values.push(currency);
    }
    if (transaction_hash !== undefined) {
      setClauses.push(`transaction_hash = $${paramIndex++}`);
      values.push(transaction_hash);
    }
    if (network !== undefined) {
      setClauses.push(`network = $${paramIndex++}`);
      values.push(network);
    }
    if (wallet_address !== undefined) {
      setClauses.push(`wallet_address = $${paramIndex++}`);
      values.push(wallet_address);
    }
    if (notes !== undefined) {
      setClauses.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }
    if (failure_reason !== undefined) {
      setClauses.push(`failure_reason = $${paramIndex++}`);
      values.push(failure_reason);
    }
    if (block_number !== undefined) {
      setClauses.push(`block_number = $${paramIndex++}`);
      values.push(block_number);
    }
    if (gas_used !== undefined) {
      setClauses.push(`gas_used = $${paramIndex++}`);
      values.push(gas_used);
    }
    if (gas_price !== undefined) {
      setClauses.push(`gas_price = $${paramIndex++}`);
      values.push(gas_price);
    }

    if (setClauses.length === 0) {
      return null;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE partner_payments
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows.length > 0 ? result.rows[0] : null;
  },

  /**
   * Оновлює статус платежу
   * @param {number} id - ID платежу
   * @param {string} status - Новий статус
   * @param {number} [processedBy] - ID користувача, який обробляє платіж
   * @param {Object} [additionalData] - Додаткові дані залежно від статусу
   * @returns {Promise<Object|null>} Оновлений платіж або null
   */
  updatePaymentStatus: async (id, status, processedBy = null, additionalData = {}) => {
    const setClauses = ["status = $1", "updated_at = NOW()"];
    const values = [status];
    let paramIndex = 2;

    // Додаємо processed_by якщо вказано
    if (processedBy) {
      setClauses.push(`processed_by = $${paramIndex++}`);
      values.push(processedBy);
    }

    // Логіка залежно від статусу
    switch (status) {
      case 'processing':
        setClauses.push("payment_date = NOW()");
        break;
      case 'completed':
        setClauses.push("confirmation_date = NOW()");
        if (additionalData.transaction_hash) {
          setClauses.push(`transaction_hash = $${paramIndex++}`);
          values.push(additionalData.transaction_hash);
        }
        if (additionalData.block_number) {
          setClauses.push(`block_number = $${paramIndex++}`);
          values.push(additionalData.block_number);
        }
        break;
      case 'failed':
        if (additionalData.failure_reason) {
          setClauses.push(`failure_reason = $${paramIndex++}`);
          values.push(additionalData.failure_reason);
        }
        break;
      case 'hold':
        if (additionalData.notes) {
          setClauses.push(`notes = $${paramIndex++}`);
          values.push(additionalData.notes);
        }
        break;
    }

    values.push(id);

    const query = `
      UPDATE partner_payments
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows.length > 0 ? result.rows[0] : null;
  },

  /**
   * Видаляє платіж
   * @param {number} id - ID платежу
   * @returns {Promise<Object>} Результат видалення
   */
  deletePayment: async (id) => {
    try {
      // Перевіряємо, чи можна видалити платіж
      const paymentCheck = await db.query(
        'SELECT status FROM partner_payments WHERE id = $1',
        [id]
      );

      if (paymentCheck.rows.length === 0) {
        return {
          success: false,
          message: "Платіж не знайдено"
        };
      }

      // Не дозволяємо видалення завершених платежів
      if (['completed', 'processing'].includes(paymentCheck.rows[0].status)) {
        return {
          success: false,
          message: "Неможливо видалити платіж з таким статусом"
        };
      }

      const result = await db.query(
        'DELETE FROM partner_payments WHERE id = $1 RETURNING id',
        [id]
      );

      return {
        success: result.rows.length > 0,
        message: result.rows.length > 0 ? "Платіж успішно видалено" : "Платіж не знайдено"
      };
    } catch (error) {
      console.error("Error deleting payment:", error);
      return {
        success: false,
        message: "Помилка при видаленні платежу",
        error: error.message
      };
    }
  },

  /**
   * Отримує платежі за заявкою на виплату
   * @param {number} payoutRequestId - ID заявки на виплату
   * @returns {Promise<Array>} Масив платежів
   */
  getPaymentsByPayoutRequest: async (payoutRequestId) => {
    const query = `
      SELECT 
        pp.*,
        creator.username as created_by_username,
        CONCAT(creator.first_name, ' ', creator.last_name) as created_by_name,
        processor.username as processed_by_username,
        CONCAT(processor.first_name, ' ', processor.last_name) as processed_by_name
      FROM 
        partner_payments pp
      LEFT JOIN 
        users creator ON pp.created_by = creator.id
      LEFT JOIN 
        users processor ON pp.processed_by = processor.id
      WHERE 
        pp.payout_request_id = $1
      ORDER BY 
        pp.created_at DESC
    `;

    const result = await db.query(query, [payoutRequestId]);
    return result.rows;
  },

  /**
   * Перевіряє наявність платежу з певним хешем транзакції
   * @param {string} transactionHash - Хеш транзакції
   * @param {number} [excludeId] - ID платежу для виключення з перевірки
   * @returns {Promise<boolean>} true якщо існує, false якщо не існує
   */
  paymentExistsByHash: async (transactionHash, excludeId = null) => {
    let query = 'SELECT id FROM partner_payments WHERE transaction_hash = $1';
    const params = [transactionHash];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await db.query(query, params);
    return result.rows.length > 0;
  },
};

module.exports = partnerPaymentModel;