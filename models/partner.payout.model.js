const db = require("../config/db");

/**
 * Модель для роботи з заявками на виплату партнерських програм
 */
const partnerPayoutModel = {
  /**
   * Отримує список всіх заявок на виплату з фільтрацією та пагінацією
   * @param {Object} options - Опції для фільтрації та пагінації
   * @param {number} [options.page=1] - Номер сторінки
   * @param {number} [options.limit=10] - Кількість записів на сторінці
   * @param {number} [options.partnerId] - ID партнера
   * @param {number} [options.teamId] - ID команди
   * @param {string} [options.status] - Статус заявки
   * @param {string} [options.currency] - Валюта
   * @param {Date} [options.startDate] - Початкова дата періоду
   * @param {Date} [options.endDate] - Кінцева дата періоду
   * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
   */
  getAllPayoutRequests: async ({
    page = 1,
    limit = 10,
    partnerId,
    teamId,
    status,
    currency,
    startDate,
    endDate,
    sortBy = "created_at",
    sortOrder = "desc",
  }) => {
    const offset = (page - 1) * limit;

    // Побудова WHERE умов
    const conditions = ["TRUE"];
    const params = [];
    let paramIndex = 1;

    if (partnerId) {
      conditions.push(`ppr.partner_id = $${paramIndex++}`);
      params.push(parseInt(partnerId));
    }

    if (teamId) {
      conditions.push(`ppr.team_id = $${paramIndex++}`);
      params.push(parseInt(teamId));
    }

    if (status) {
      conditions.push(`ppr.status = $${paramIndex++}`);
      params.push(status);
    }

    if (currency) {
      conditions.push(`ppr.currency = $${paramIndex++}`);
      params.push(currency);
    }

    if (startDate) {
      conditions.push(`ppr.period_start >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`ppr.period_end <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.join(" AND ");

    // Валідація полів сортування
    const allowedSortFields = [
      "id",
      "partner_id",
      "team_id",
      "total_amount",
      "status",
      "created_at",
      "period_start",
    ];
    const validSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : "created_at";
    const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    // Основний запит
    const query = `
    SELECT 
      ppr.*, 
      p.name as partner_name,
      p.type as partner_type,
      p.contact_telegram as partner_contact_telegram,
      p.contact_email as partner_contact_email,
      t.name as team_name,
      creator.username as created_by_username,
      CONCAT(creator.first_name, ' ', creator.last_name) as created_by_name,
      approver.username as approved_by_username,
      CONCAT(approver.first_name, ' ', approver.last_name) as approved_by_name
    FROM 
      partner_payout_requests ppr
    JOIN 
      partners p ON ppr.partner_id = p.id
    LEFT JOIN 
      teams t ON ppr.team_id = t.id
    LEFT JOIN 
      users creator ON ppr.created_by = creator.id
    LEFT JOIN 
      users approver ON ppr.approved_by = approver.id
    WHERE 
      ${whereClause}
    ORDER BY 
      ppr.${validSortBy} ${validSortOrder}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

    // Запит для підрахунку загальної кількості
    const countQuery = `
    SELECT COUNT(*) as total
    FROM partner_payout_requests ppr
    WHERE ${whereClause}
  `;

    // Додавання параметрів пагінації
    params.push(limit, offset);

    const [dataResult, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2)), // Видаляємо limit та offset для count
    ]);

    const payoutRequests = dataResult.rows;

    // Отримуємо потоки для всіх заявок одним запитом
    if (payoutRequests.length > 0) {
      const requestIds = payoutRequests.map((request) => request.id);

      const flowsQuery = `
      SELECT 
        ppf.*,
        f.name as flow_name,
        f.status as flow_status,
        f.cpa as flow_cpa,
        o.name as offer_name,
        g.name as geo_name
      FROM 
        partner_payout_flows ppf
      JOIN 
        flows f ON ppf.flow_id = f.id
      JOIN 
        offers o ON f.offer_id = o.id
      LEFT JOIN 
        geos g ON f.geo_id = g.id
      WHERE 
        ppf.payout_request_id = ANY($1)
      ORDER BY 
        ppf.payout_request_id, f.name
    `;

      const flowsResult = await db.query(flowsQuery, [requestIds]);

      // Групуємо потоки за ID заявки
      const flowsByRequestId = {};
      flowsResult.rows.forEach((flow) => {
        const requestId = flow.payout_request_id;
        if (!flowsByRequestId[requestId]) {
          flowsByRequestId[requestId] = [];
        }
        flowsByRequestId[requestId].push(flow);
      });

      // Додаємо потоки до кожної заявки
      payoutRequests.forEach((request) => {
        request.flows = flowsByRequestId[request.id] || [];
      });
    }

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      data: payoutRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  },

  /**
   * Отримує детальну інформацію про заявку за ID
   * @param {number} id - ID заявки
   * @returns {Promise<Object|null>} Об'єкт заявки з додатковою інформацією або null
   */
  getPayoutRequestById: async (id) => {
    const query = `
      SELECT 
        ppr.*,
        p.name as partner_name,
        p.type as partner_type,
        p.contact_telegram as partner_contact_telegram,
        p.contact_email as partner_contact_email,
        t.name as team_name,
        creator.username as created_by_username,
        CONCAT(creator.first_name, ' ', creator.last_name) as created_by_name,
        approver.username as approved_by_username,
        CONCAT(approver.first_name, ' ', approver.last_name) as approved_by_name
      FROM 
        partner_payout_requests ppr
      JOIN 
        partners p ON ppr.partner_id = p.id
      LEFT JOIN 
        teams t ON ppr.team_id = t.id
      LEFT JOIN 
        users creator ON ppr.created_by = creator.id
      LEFT JOIN 
        users approver ON ppr.approved_by = approver.id
      WHERE 
        ppr.id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const payoutRequest = result.rows[0];

    // Отримуємо пов'язані потоки
    const flowsQuery = `
      SELECT 
        ppf.*,
        f.name as flow_name,
        f.status as flow_status,
        f.cpa as flow_cpa,
        o.name as offer_name,
        g.name as geo_name
      FROM 
        partner_payout_flows ppf
      JOIN 
        flows f ON ppf.flow_id = f.id
      JOIN 
        offers o ON f.offer_id = o.id
      LEFT JOIN 
        geos g ON f.geo_id = g.id
      WHERE 
        ppf.payout_request_id = $1
      ORDER BY 
        f.name
    `;
    const flowsResult = await db.query(flowsQuery, [id]);

    console.log(id);
    console.log(flowsResult);

    // Отримуємо пов'язані платежі
    const paymentsQuery = `
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
        pp.created_at
    `;
    const paymentsResult = await db.query(paymentsQuery, [id]);

    return {
      ...payoutRequest,
      flows: flowsResult.rows,
      payments: paymentsResult.rows,
    };
  },

  /**
   * Створює нову заявку на виплату
   * @param {Object} payoutData - Дані заявки
   * @returns {Promise<Object>} Створена заявка
   */
  createPayoutRequest: async (payoutData) => {
    const {
      partner_id,
      team_id,
      period_start,
      period_end,
      total_amount,
      currency = "USD",
      description,
      notes,
      wallet_address,
      network,
      created_by,
      flows = [],
    } = payoutData;

    const client = await db.getClient();

    console.log(flows);

    try {
      await client.query("BEGIN");

      // Створюємо заявку
      const payoutQuery = `
        INSERT INTO partner_payout_requests (
          partner_id, team_id, period_start, period_end, total_amount, currency, description, 
          notes, wallet_address, network, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const payoutResult = await client.query(payoutQuery, [
        partner_id,
        team_id,
        period_start,
        period_end,
        total_amount,
        currency,
        description,
        notes,
        wallet_address,
        network,
        created_by,
      ]);

      const payoutRequestId = payoutResult.rows[0].id;

      // Додаємо пов'язані потоки
      if (flows.length > 0) {
        for (const flow of flows) {
          console.log(flow);
          await client.query(
            `INSERT INTO partner_payout_flows (payout_request_id, flow_id, flow_amount, conversion_count, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              payoutRequestId,
              flow.flow_id,
              flow.flow_amount || 0,
              flow.conversion_count || 0,
              flow.notes,
            ]
          );
        }
      }

      await client.query("COMMIT");
      return payoutResult.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Оновлює дані заявки на виплату
   * @param {number} id - ID заявки
   * @param {Object} payoutData - Дані для оновлення
   * @returns {Promise<Object|null>} Оновлена заявка або null
   */
  updatePayoutRequest: async (id, payoutData) => {
    const {
      team_id,
      period_start,
      period_end,
      currency,
      description,
      notes,
      wallet_address,
      network,
      status,
      flows,
      total_amount,
    } = payoutData;

    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Оновлюємо основні дані заявки
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (team_id !== undefined) {
        setClauses.push(`team_id = $${paramIndex++}`);
        values.push(team_id);
      }
      if (period_start !== undefined) {
        setClauses.push(`period_start = $${paramIndex++}`);
        values.push(period_start);
      }
      if (period_end !== undefined) {
        setClauses.push(`period_end = $${paramIndex++}`);
        values.push(period_end);
      }
      if (currency !== undefined) {
        setClauses.push(`currency = $${paramIndex++}`);
        values.push(currency);
      }
      if (description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      if (notes !== undefined) {
        setClauses.push(`notes = $${paramIndex++}`);
        values.push(notes);
      }
      if (wallet_address !== undefined) {
        setClauses.push(`wallet_address = $${paramIndex++}`);
        values.push(wallet_address);
      }
      if (network !== undefined) {
        setClauses.push(`network = $${paramIndex++}`);
        values.push(network);
      }
      if (status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(status);
      }
      if (total_amount !== undefined) {
        setClauses.push(`total_amount = $${paramIndex++}`);
        values.push(total_amount);
      }

      setClauses.push(`updated_at = NOW()`);

      const updateQuery = `
        UPDATE partner_payout_requests
        SET ${setClauses.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      values.push(id);

      const result = await client.query(updateQuery, values);

      // Оновлюємо потоки, якщо вони передані
      if (flows !== undefined && flows.length > 0) {
        // Видаляємо старі потоки
        await client.query(
          "DELETE FROM partner_payout_flows WHERE payout_request_id = $1",
          [id]
        );

        // Додаємо нові потоки
        if (flows.length > 0) {
          for (const flow of flows) {
            await client.query(
              `INSERT INTO partner_payout_flows (payout_request_id, flow_id, flow_amount, conversion_count, notes)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                id,
                flow.flow_id,
                flow.flow_amount || 0,
                flow.conversion_count || 0,
                flow.notes,
              ]
            );
          }
        }
      }

      await client.query("COMMIT");
      return result.rows[0] || null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Оновлює статус заявки на виплату
   * @param {number} id - ID заявки
   * @param {string} status - Новий статус
   * @param {number} [userId] - ID користувача, який оновлює статус
   * @returns {Promise<Object|null>} Оновлена заявка або null
   */
  updatePayoutRequestStatus: async (id, status, userId) => {
    const setClauses = ["status = $1", "updated_at = NOW()"];
    const values = [status];
    let paramIndex = 2;

    // Якщо статус "approved", записуємо хто затвердив і коли
    if (status === "approved" && userId) {
      setClauses.push(`approved_by = $${paramIndex++}`);
      setClauses.push(`approved_at = NOW()`);
      values.push(userId);
    }

    const query = `
      UPDATE partner_payout_requests
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    values.push(id);

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Видаляє заявку на виплату
   * @param {number} id - ID заявки для видалення
   * @returns {Promise<Object>} Результат операції
   */
  deletePayoutRequest: async (id) => {
    try {
      const query = `
        DELETE FROM partner_payout_requests
        WHERE id = $1
        RETURNING id
      `;

      const result = await db.query(query, [id]);

      return {
        success: result.rows.length > 0,
        message:
          result.rows.length > 0
            ? "Заявку успішно видалено"
            : "Заявку не знайдено",
      };
    } catch (error) {
      console.error("Error deleting payout request:", error);
      return {
        success: false,
        message: "Помилка при видаленні заявки",
        error: error.message,
      };
    }
  },

  /**
   * Отримує заявки за партнером
   * @param {number} partnerId - ID партнера
   * @param {boolean} [onlyActive=false] - Тільки активні заявки
   * @returns {Promise<Array>} Масив заявок
   */
  getPayoutRequestsByPartner: async (partnerId, onlyActive = false) => {
    let query = `
      SELECT 
        ppr.*,
        t.name as team_name,
        COUNT(ppf.id) as flows_count
      FROM 
        partner_payout_requests ppr
      LEFT JOIN 
        teams t ON ppr.team_id = t.id
      LEFT JOIN 
        partner_payout_flows ppf ON ppr.id = ppf.payout_request_id
      WHERE 
        ppr.partner_id = $1
    `;

    const params = [partnerId];

    if (onlyActive) {
      query += " AND ppr.status NOT IN ('cancelled', 'rejected')";
    }

    query += " GROUP BY ppr.id, t.name ORDER BY ppr.created_at DESC";

    const result = await db.query(query, params);
    return result.rows;
  },

  /**
   * Отримує заявки за командою
   * @param {number} teamId - ID команди
   * @param {boolean} [onlyActive=false] - Тільки активні заявки
   * @returns {Promise<Array>} Масив заявок
   */
  getPayoutRequestsByTeam: async (teamId, onlyActive = false) => {
    let query = `
      SELECT 
        ppr.*,
        p.name as partner_name,
        t.name as team_name,
        COUNT(ppf.id) as flows_count
      FROM 
        partner_payout_requests ppr
      JOIN 
        partners p ON ppr.partner_id = p.id
      LEFT JOIN 
        teams t ON ppr.team_id = t.id
      LEFT JOIN 
        partner_payout_flows ppf ON ppr.id = ppf.payout_request_id
      WHERE 
        ppr.team_id = $1
    `;

    const params = [teamId];

    if (onlyActive) {
      query += " AND ppr.status NOT IN ('cancelled', 'rejected')";
    }

    query += " GROUP BY ppr.id, p.name, t.name ORDER BY ppr.created_at DESC";

    const result = await db.query(query, params);
    return result.rows;
  },

  /**
   * Отримує статистику заявок на виплату
   * @param {Object} options - Опції фільтрації
   * @param {string} [options.startDate] - Початкова дата (YYYY-MM-DD)
   * @param {string} [options.endDate] - Кінцева дата (YYYY-MM-DD)
   * @param {number} [options.teamId] - ID команди для фільтрації
   * @param {number} [options.partnerId] - ID партнера для фільтрації
   * @param {string} [options.status] - Статус заявки для фільтрації
   * @returns {Promise<Object>} Статистика заявок
   */
  getPayoutRequestsStats: async (options = {}) => {
    const { startDate, endDate, teamId, partnerId, status } = options;

    // Побудова WHERE умов
    const whereConditions = [];
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      whereConditions.push(`ppr.period_start >= $${paramIndex++}`);
      params.push(startDate);
    } else if (endDate) {
      whereConditions.push(`ppr.period_end <= $${paramIndex++}`);
      params.push(endDate);
    }

    // Фільтрація по команді
    if (teamId) {
      whereConditions.push(`ppr.team_id = $${paramIndex++}`);
      params.push(teamId);
    }

    // Фільтрація по партнеру
    if (partnerId) {
      whereConditions.push(`ppr.partner_id = $${paramIndex++}`);
      params.push(partnerId);
    }

    // Фільтрація по статусу
    if (status) {
      whereConditions.push(`ppr.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const query = `
    SELECT
      COUNT(*) as total_requests,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_requests,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_requests,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_requests,
      SUM(CASE WHEN status = 'in_payment' THEN 1 ELSE 0 END) as in_payment_requests,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_requests,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_requests,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_requests,
      SUM(total_amount) as total_amount,
      AVG(total_amount) as avg_amount,
      MIN(created_at) as earliest_request,
      MAX(created_at) as latest_request
    FROM 
      partner_payout_requests ppr
    ${whereClause}
  `;

    // Запит для статистики топ-партнерів з фільтрацією
    const partnerStatsQuery = `
    SELECT 
      p.name as partner_name,
      p.id as partner_id,
      COUNT(ppr.id) as requests_count,
      SUM(ppr.total_amount) as total_amount,
      AVG(ppr.total_amount) as avg_amount
    FROM 
      partners p
    LEFT JOIN 
      partner_payout_requests ppr ON p.id = ppr.partner_id
    ${
      whereClause
        ? whereClause.replace("WHERE", "WHERE ppr.id IS NOT NULL AND")
        : "WHERE ppr.id IS NOT NULL"
    }
    GROUP BY 
      p.id, p.name
    HAVING 
      COUNT(ppr.id) > 0
    ORDER BY 
      total_amount DESC NULLS LAST
    LIMIT 10
  `;

    // Запит для статистики топ-команд з фільтрацією
    const teamStatsQuery = `
    SELECT 
      t.name as team_name,
      t.id as team_id,
      COUNT(ppr.id) as requests_count,
      SUM(ppr.total_amount) as total_amount,
      AVG(ppr.total_amount) as avg_amount
    FROM 
      teams t
    LEFT JOIN 
      partner_payout_requests ppr ON t.id = ppr.team_id
    ${
      whereClause
        ? whereClause.replace("WHERE", "WHERE ppr.id IS NOT NULL AND")
        : "WHERE ppr.id IS NOT NULL"
    }
    GROUP BY 
      t.id, t.name
    HAVING 
      COUNT(ppr.id) > 0
    ORDER BY 
      total_amount DESC NULLS LAST
    LIMIT 10
  `;

    // Запит для статистики виплат з фільтрацією
    const paymentsStatsQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN pp.status = 'completed' THEN pp.amount ELSE 0 END), 0) as total_completed,
      COALESCE(SUM(CASE WHEN pp.status = 'failed' THEN pp.amount ELSE 0 END), 0) as total_failed,
      COALESCE(SUM(CASE WHEN pp.status = 'hold' THEN pp.amount ELSE 0 END), 0) as total_hold,
      COUNT(CASE WHEN pp.status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN pp.status = 'failed' THEN 1 END) as failed_count,
      COUNT(CASE WHEN pp.status = 'hold' THEN 1 END) as hold_count
    FROM 
      partner_payments pp
    LEFT JOIN 
      partner_payout_requests ppr ON pp.payout_request_id = ppr.id
    ${
      whereClause
        ? whereClause.replace("WHERE", "WHERE ppr.id IS NOT NULL AND")
        : "WHERE ppr.id IS NOT NULL"
    }
  `;

    // Запит для статистики по датах (для візуалізації тенденцій)
    const dateStatsQuery = `
    SELECT 
      DATE(ppr.created_at) as date,
      COUNT(*) as requests_count,
      SUM(ppr.total_amount) as total_amount,
      AVG(ppr.total_amount) as avg_amount
    FROM 
      partner_payout_requests ppr
    ${whereClause}
    GROUP BY 
      DATE(ppr.created_at)
    ORDER BY 
      date DESC
    LIMIT 30
  `;

    const [result, partnerStats, teamStats, paymentsStats, dateStats] =
      await Promise.all([
        db.query(query, params),
        db.query(partnerStatsQuery, params),
        db.query(teamStatsQuery, params),
        db.query(paymentsStatsQuery, params),
        db.query(dateStatsQuery, params),
      ]);

    return {
      summary: {
        ...result.rows[0],
        period: {
          start: startDate || null,
          end: endDate || null,
        },
        filters: {
          teamId: teamId || null,
          partnerId: partnerId || null,
          status: status || null,
        },
      },
      topPartners: partnerStats.rows,
      topTeams: teamStats.rows,
      paymentsStats: paymentsStats.rows[0],
      dateStats: dateStats.rows, // Додано для візуалізації по датах
    };
  },

  /**
   * Отримує помісячну статистику заявок на виплату
   * @param {Object} options - Опції фільтрації
   * @param {number} [options.year] - Рік для фільтрації
   * @param {number} [options.teamId] - ID команди для фільтрації
   * @param {number} [options.partnerId] - ID партнера для фільтрації
   * @param {string} [options.status] - Статус заявки для фільтрації
   * @returns {Promise<Object>} Помісячна статистика заявок
   */
  getMonthlyPayoutStats: async (options = {}) => {
    const { year, teamId, partnerId, status } = options;

    // Побудова WHERE умов
    const whereConditions = [];
    const params = [];
    let paramIndex = 1;

    // Фільтрація по року
    if (year) {
      whereConditions.push(
        `EXTRACT(YEAR FROM ppr.period_start) = $${paramIndex++}`
      );
      params.push(year);
    }

    // Фільтрація по команді
    if (teamId) {
      whereConditions.push(`ppr.team_id = $${paramIndex++}`);
      params.push(teamId);
    }

    // Фільтрація по партнеру
    if (partnerId) {
      whereConditions.push(`ppr.partner_id = $${paramIndex++}`);
      params.push(partnerId);
    }

    // Фільтрація по статусу
    if (status) {
      whereConditions.push(`ppr.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Основний запит для помісячної статистики
    const monthlyStatsQuery = `
    SELECT 
      EXTRACT(YEAR FROM ppr.period_start) as year,
      EXTRACT(MONTH FROM ppr.period_start) as month,
      TO_CHAR(ppr.period_start, 'YYYY-MM') as period,
      TO_CHAR(ppr.period_start, 'Month YYYY') as period_name,
      COUNT(*) as total_requests,
      SUM(CASE WHEN ppr.status = 'draft' THEN 1 ELSE 0 END) as draft_requests,
      SUM(CASE WHEN ppr.status = 'pending' THEN 1 ELSE 0 END) as pending_requests,
      SUM(CASE WHEN ppr.status = 'approved' THEN 1 ELSE 0 END) as approved_requests,
      SUM(CASE WHEN ppr.status = 'in_payment' THEN 1 ELSE 0 END) as in_payment_requests,
      SUM(CASE WHEN ppr.status = 'completed' THEN 1 ELSE 0 END) as completed_requests,
      SUM(CASE WHEN ppr.status = 'rejected' THEN 1 ELSE 0 END) as rejected_requests,
      SUM(CASE WHEN ppr.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_requests,
      COALESCE(SUM(ppr.total_amount), 0) as total_amount,
      COALESCE(AVG(ppr.total_amount), 0) as avg_amount,
      COALESCE(MIN(ppr.total_amount), 0) as min_amount,
      COALESCE(MAX(ppr.total_amount), 0) as max_amount,
      COUNT(DISTINCT ppr.partner_id) as unique_partners,
      COUNT(DISTINCT ppr.team_id) as unique_teams
    FROM 
      partner_payout_requests ppr
    ${whereClause}
    GROUP BY 
      EXTRACT(YEAR FROM ppr.period_start),
      EXTRACT(MONTH FROM ppr.period_start),
      TO_CHAR(ppr.period_start, 'YYYY-MM'),
      TO_CHAR(ppr.period_start, 'Month YYYY')
    ORDER BY 
      year DESC, month DESC
  `;

    // Запит для топ-партнерів по місяцях
    const topPartnersByMonthQuery = `
    SELECT 
      TO_CHAR(ppr.period_start, 'YYYY-MM') as period,
      p.name as partner_name,
      p.id as partner_id,
      COUNT(ppr.id) as requests_count,
      COALESCE(SUM(ppr.total_amount), 0) as total_amount,
      COALESCE(AVG(ppr.total_amount), 0) as avg_amount
    FROM 
      partner_payout_requests ppr
    JOIN 
      partners p ON ppr.partner_id = p.id
    ${whereClause}
    GROUP BY 
      TO_CHAR(ppr.period_start, 'YYYY-MM'),
      p.id, p.name
    ORDER BY 
      period DESC, total_amount DESC
  `;

    // Запит для статистики платежів по місяцях
    const monthlyPaymentsQuery = `
    SELECT 
      TO_CHAR(ppr.period_start, 'YYYY-MM') as period,
      COUNT(pp.id) as payments_count,
      COALESCE(SUM(CASE WHEN pp.status = 'completed' THEN pp.amount ELSE 0 END), 0) as completed_amount,
      COALESCE(SUM(CASE WHEN pp.status = 'failed' THEN pp.amount ELSE 0 END), 0) as failed_amount,
      COALESCE(SUM(CASE WHEN pp.status = 'hold' THEN pp.amount ELSE 0 END), 0) as hold_amount,
      COUNT(CASE WHEN pp.status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN pp.status = 'failed' THEN 1 END) as failed_count,
      COUNT(CASE WHEN pp.status = 'hold' THEN 1 END) as hold_count
    FROM 
      partner_payout_requests ppr
    LEFT JOIN 
      partner_payments pp ON ppr.id = pp.payout_request_id
    ${whereClause}
    GROUP BY 
      TO_CHAR(ppr.period_start, 'YYYY-MM')
    ORDER BY 
      period DESC
  `;

    // Виконання всіх запитів
    const [monthlyStats, topPartners, monthlyPayments] = await Promise.all([
      db.query(monthlyStatsQuery, params),
      db.query(topPartnersByMonthQuery, params),
      db.query(monthlyPaymentsQuery, params),
    ]);

    // Групування топ-партнерів по місяцях
    const topPartnersByMonth = {};
    topPartners.rows.forEach((row) => {
      if (!topPartnersByMonth[row.period]) {
        topPartnersByMonth[row.period] = [];
      }
      topPartnersByMonth[row.period].push({
        partner_name: row.partner_name,
        partner_id: row.partner_id,
        requests_count: parseInt(row.requests_count),
        total_amount: parseFloat(row.total_amount),
        avg_amount: parseFloat(row.avg_amount),
      });
    });

    // Обмеження до топ-5 партнерів на місяць
    Object.keys(topPartnersByMonth).forEach((period) => {
      topPartnersByMonth[period] = topPartnersByMonth[period].slice(0, 5);
    });

    // Створення карти для платежів
    const paymentsMap = {};
    monthlyPayments.rows.forEach((row) => {
      paymentsMap[row.period] = {
        payments_count: parseInt(row.payments_count),
        completed_amount: parseFloat(row.completed_amount),
        failed_amount: parseFloat(row.failed_amount),
        hold_amount: parseFloat(row.hold_amount),
        completed_count: parseInt(row.completed_count),
        failed_count: parseInt(row.failed_count),
        hold_count: parseInt(row.hold_count),
      };
    });

    // Обробка результатів
    const processedStats = monthlyStats.rows.map((row) => ({
      year: parseInt(row.year),
      month: parseInt(row.month),
      period: row.period,
      period_name: row.period_name.trim(),
      total_requests: parseInt(row.total_requests),
      draft_requests: parseInt(row.draft_requests),
      pending_requests: parseInt(row.pending_requests),
      approved_requests: parseInt(row.approved_requests),
      in_payment_requests: parseInt(row.in_payment_requests),
      completed_requests: parseInt(row.completed_requests),
      rejected_requests: parseInt(row.rejected_requests),
      cancelled_requests: parseInt(row.cancelled_requests),
      total_amount: parseFloat(row.total_amount),
      avg_amount: parseFloat(row.avg_amount),
      min_amount: parseFloat(row.min_amount),
      max_amount: parseFloat(row.max_amount),
      unique_partners: parseInt(row.unique_partners),
      unique_teams: parseInt(row.unique_teams),
      top_partners: topPartnersByMonth[row.period] || [],
      payments_stats: paymentsMap[row.period] || {
        payments_count: 0,
        completed_amount: 0,
        failed_amount: 0,
        hold_amount: 0,
        completed_count: 0,
        failed_count: 0,
        hold_count: 0,
      },
    }));

    return {
      monthly_stats: processedStats,
      filters: {
        year: year || null,
        teamId: teamId || null,
        partnerId: partnerId || null,
        status: status || null,
      },
      summary: {
        total_months: processedStats.length,
        total_requests: processedStats.reduce(
          (sum, month) => sum + month.total_requests,
          0
        ),
        total_amount: processedStats.reduce(
          (sum, month) => sum + month.total_amount,
          0
        ),
        avg_monthly_requests:
          processedStats.length > 0
            ? processedStats.reduce(
                (sum, month) => sum + month.total_requests,
                0
              ) / processedStats.length
            : 0,
        avg_monthly_amount:
          processedStats.length > 0
            ? processedStats.reduce(
                (sum, month) => sum + month.total_amount,
                0
              ) / processedStats.length
            : 0,
      },
    };
  },
};

module.exports = partnerPayoutModel;
