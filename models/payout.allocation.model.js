/**
 * Модель для роботи з розподілом коштів заявок на виплату
 * models/payout.allocation.model.js
 */

const db = require("../config/db");

/**
 * Отримання всіх розподілів для заявки на виплату
 * @param {number} payoutRequestId - ID заявки на виплату
 * @returns {Promise<Array>} Масив розподілів з інформацією про користувачів
 */
const getAllocationsByPayoutRequest = async (payoutRequestId) => {
  const query = `
    SELECT 
      pra.*,
      u.username,
      u.first_name,
      u.last_name,
      u.telegram_id,
      CONCAT(u.first_name, ' ', u.last_name) as user_full_name,
      f.name as flow_name,
      f.status as flow_status,
      creator.username as created_by_username,
      CONCAT(creator.first_name, ' ', creator.last_name) as created_by_name,
      updater.username as updated_by_username,
      CONCAT(updater.first_name, ' ', updater.last_name) as updated_by_name
    FROM 
      payout_request_allocations pra
    JOIN 
      users u ON pra.user_id = u.id
    LEFT JOIN 
      flows f ON pra.flow_id = f.id
    LEFT JOIN 
      users creator ON pra.created_by = creator.id
    LEFT JOIN 
      users updater ON pra.updated_by = updater.id
    WHERE 
      pra.payout_request_id = $1
    ORDER BY 
      pra.created_at DESC
  `;

  const result = await db.query(query, [payoutRequestId]);
  return result.rows;
};

/**
 * Отримання потоків з користувачами для заявки на виплату
 * @param {number} payoutRequestId - ID заявки на виплату
 * @returns {Promise<Array>} Масив потоків з користувачами та інформацією про розподіли
 */
const getUsersByPayoutRequestFlows = async (payoutRequestId) => {
  const query = `
    SELECT 
      f.id as flow_id,
      f.name as flow_name,
      f.status as flow_status,
      f.cpa as flow_cpa,
      f.currency as flow_currency,
      f.description as flow_description,
      ppf.flow_amount as flow_payout_amount,
      ppf.conversion_count as flow_conversions,
      o.name as offer_name,
      g.name as geo_name,
      -- Інформація про користувача
      u.id as user_id,
      u.username,
      u.first_name,
      u.last_name,
      u.telegram_id,
      CONCAT(u.first_name, ' ', u.last_name) as user_full_name,
      fu.status as user_flow_status,
      fu.created_at as user_added_to_flow,
      -- Інформація про розподіл
      pra.id as allocation_id,
      pra.allocated_amount,
      pra.percentage as allocation_percentage,
      pra.status as allocation_status,
      pra.description as allocation_description,
      pra.notes as allocation_notes,
      pra.created_at as allocation_created_at,
      CASE WHEN pra.id IS NOT NULL THEN true ELSE false END as has_allocation
    FROM 
      partner_payout_flows ppf
    JOIN 
      flows f ON ppf.flow_id = f.id
    JOIN 
      offers o ON f.offer_id = o.id
    LEFT JOIN 
      geos g ON f.geo_id = g.id
    JOIN 
      flow_users fu ON f.id = fu.flow_id AND fu.status = 'active'
    JOIN 
      users u ON fu.user_id = u.id
    LEFT JOIN 
      payout_request_allocations pra ON pra.payout_request_id = ppf.payout_request_id 
      AND pra.user_id = u.id 
      AND (pra.flow_id = f.id OR pra.flow_id IS NULL)
    WHERE 
      ppf.payout_request_id = $1
    ORDER BY 
      f.name, u.first_name, u.last_name
  `;

  const result = await db.query(query, [payoutRequestId]);
  
  // Групуємо результати по потоках
  const flowsMap = new Map();
  
  result.rows.forEach(row => {
    const flowId = row.flow_id;
    
    if (!flowsMap.has(flowId)) {
      flowsMap.set(flowId, {
        id: row.flow_id,
        name: row.flow_name,
        status: row.flow_status,
        cpa: row.flow_cpa,
        currency: row.flow_currency,
        description: row.flow_description,
        payout_amount: row.flow_payout_amount,
        conversions: row.flow_conversions,
        offer_name: row.offer_name,
        geo_name: row.geo_name,
        users: []
      });
    }
    
    const flow = flowsMap.get(flowId);
    
    // Додаємо користувача до потоку
    flow.users.push({
      id: row.user_id,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
      full_name: row.user_full_name,
      telegram_id: row.telegram_id,
      flow_status: row.user_flow_status,
      added_to_flow: row.user_added_to_flow,
      allocation: row.has_allocation ? {
        id: row.allocation_id,
        allocated_amount: row.allocated_amount,
        percentage: row.allocation_percentage,
        status: row.allocation_status,
        description: row.allocation_description,
        notes: row.allocation_notes,
        created_at: row.allocation_created_at
      } : null,
      has_allocation: row.has_allocation
    });
  });
  
  return Array.from(flowsMap.values());
};

/**
 * Створення розподілу коштів для користувача
 * @param {Object} allocationData - Дані розподілу
 * @returns {Promise<Object>} Створений розподіл
 */
const createAllocation = async (allocationData) => {
  const {
    payout_request_id,
    user_id,
    flow_id,
    allocated_amount,
    percentage,
    currency = 'USD',
    description,
    notes,
    created_by
  } = allocationData;

  const query = `
    INSERT INTO payout_request_allocations (
      payout_request_id,
      user_id,
      flow_id,
      allocated_amount,
      percentage,
      currency,
      description,
      notes,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await db.query(query, [
    payout_request_id,
    user_id,
    flow_id,
    allocated_amount,
    percentage,
    currency,
    description,
    notes,
    created_by
  ]);

  return result.rows[0];
};

/**
 * Оновлення розподілу коштів
 * @param {number} allocationId - ID розподілу
 * @param {Object} updateData - Дані для оновлення
 * @returns {Promise<Object>} Оновлений розподіл
 */
const updateAllocation = async (allocationId, updateData) => {
  const {
    allocated_amount,
    percentage,
    flow_id,
    description,
    notes,
    status,
    updated_by
  } = updateData;

  const query = `
    UPDATE payout_request_allocations 
    SET 
      allocated_amount = COALESCE($2, allocated_amount),
      percentage = COALESCE($3, percentage),
      flow_id = COALESCE($4, flow_id),
      description = COALESCE($5, description),
      notes = COALESCE($6, notes),
      status = COALESCE($7, status),
      updated_by = $8,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [
    allocationId,
    allocated_amount,
    percentage,
    flow_id,
    description,
    notes,
    status,
    updated_by
  ]);

  return result.rows[0];
};

/**
 * Масове створення/оновлення розподілів
 * @param {number} payoutRequestId - ID заявки на виплату
 * @param {Array} allocations - Масив розподілів
 * @param {number} createdBy - ID користувача, який створює
 * @returns {Promise<Array>} Масив створених/оновлених розподілів
 */
const bulkUpsertAllocations = async (payoutRequestId, allocations, createdBy) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    
    for (const allocation of allocations) {
      const {
        user_id,
        flow_id,
        allocated_amount,
        percentage,
        description,
        notes
      } = allocation;

      // Спробуємо оновити існуючий розподіл
      const updateQuery = `
        UPDATE payout_request_allocations 
        SET 
          allocated_amount = $4,
          percentage = $5,
          description = $6,
          notes = $7,
          updated_by = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE payout_request_id = $1 AND user_id = $2 AND (flow_id = $3 OR (flow_id IS NULL AND $3 IS NULL))
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [
        payoutRequestId,
        user_id,
        flow_id,
        allocated_amount,
        percentage,
        description,
        notes,
        createdBy
      ]);

      if (updateResult.rows.length > 0) {
        results.push(updateResult.rows[0]);
      } else {
        // Якщо оновлення не відбулося, створюємо новий запис
        const insertQuery = `
          INSERT INTO payout_request_allocations (
            payout_request_id,
            user_id,
            flow_id,
            allocated_amount,
            percentage,
            description,
            notes,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `;

        const insertResult = await client.query(insertQuery, [
          payoutRequestId,
          user_id,
          flow_id,
          allocated_amount,
          percentage,
          description,
          notes,
          createdBy
        ]);

        results.push(insertResult.rows[0]);
      }
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
 * Видалення розподілу
 * @param {number} allocationId - ID розподілу
 * @returns {Promise<boolean>} Результат видалення
 */
const deleteAllocation = async (allocationId) => {
  const query = `
    DELETE FROM payout_request_allocations 
    WHERE id = $1
    RETURNING id
  `;

  const result = await db.query(query, [allocationId]);
  return result.rows.length > 0;
};

/**
 * Отримання статистики розподілів для заявки
 * @param {number} payoutRequestId - ID заявки на виплату
 * @returns {Promise<Object>} Статистика розподілів
 */
const getAllocationStats = async (payoutRequestId) => {
  const query = `
    SELECT 
      COUNT(*) as total_allocations,
      COALESCE(SUM(allocated_amount), 0) as total_allocated,
      COALESCE(AVG(allocated_amount), 0) as avg_allocation,
      COUNT(DISTINCT user_id) as unique_users,
      -- Порівняння з загальною сумою заявки
      ppr.total_amount as payout_total,
      CASE 
        WHEN ppr.total_amount > 0 THEN 
          ROUND((SUM(allocated_amount) / ppr.total_amount * 100), 2)
        ELSE 0 
      END as allocation_percentage,
      -- Розподіл за статусами
      COUNT(CASE WHEN pra.status = 'draft' THEN 1 END) as draft_count,
      COUNT(CASE WHEN pra.status = 'confirmed' THEN 1 END) as confirmed_count,
      COUNT(CASE WHEN pra.status = 'paid' THEN 1 END) as paid_count,
      COUNT(CASE WHEN pra.status = 'cancelled' THEN 1 END) as cancelled_count
    FROM 
      payout_request_allocations pra
    JOIN 
      partner_payout_requests ppr ON pra.payout_request_id = ppr.id
    WHERE 
      pra.payout_request_id = $1
    GROUP BY 
      ppr.total_amount
  `;

  const result = await db.query(query, [payoutRequestId]);
  return result.rows[0] || {
    total_allocations: 0,
    total_allocated: 0,
    avg_allocation: 0,
    unique_users: 0,
    payout_total: 0,
    allocation_percentage: 0,
    draft_count: 0,
    confirmed_count: 0,
    paid_count: 0,
    cancelled_count: 0
  };
};

/**
 * Підтвердження всіх розподілів для заявки
 * @param {number} payoutRequestId - ID заявки на виплату
 * @param {number} updatedBy - ID користувача, який підтверджує
 * @returns {Promise<number>} Кількість підтверджених розподілів
 */
const confirmAllAllocations = async (payoutRequestId, updatedBy) => {
  const query = `
    UPDATE payout_request_allocations 
    SET 
      status = 'confirmed',
      updated_by = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE 
      payout_request_id = $1 
      AND status = 'draft'
    RETURNING id
  `;

  const result = await db.query(query, [payoutRequestId, updatedBy]);
  return result.rows.length;
};

module.exports = {
  getAllocationsByPayoutRequest,
  getUsersByPayoutRequestFlows,
  createAllocation,
  updateAllocation,
  bulkUpsertAllocations,
  deleteAllocation,
  getAllocationStats,
  confirmAllAllocations
};