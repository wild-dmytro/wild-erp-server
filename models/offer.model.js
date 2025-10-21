const db = require("../config/db");

/**
 * Отримує список всіх офферів з фільтрацією та пагінацією
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {number} [options.page=1] - Номер сторінки
 * @param {number} [options.limit=12] - Кількість записів на сторінці
 * @param {number[]} [options.partners] - Масив ID партнерів
 * @param {number[]} [options.brands] - Масив ID брендів
 * @param {number[]} [options.geos] - Масив ID гео регіонів
 * @param {boolean} [options.onlyActive] - Тільки активні оффери
 * @param {string} [options.search] - Пошук за назвою
 * @param {string} [options.sortBy] - Поле сортування
 * @param {string} [options.sortOrder] - Порядок сортування
 * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
 */
const getAllOffers = async ({
  page = 1,
  limit = 12,
  partners,
  brands,
  geos,
  onlyActive,
  search,
  sortBy = "created_at",
  sortOrder = "desc",
}) => {
  const offset = (page - 1) * limit;

  // Функція для побудови WHERE умов
  const buildWhereConditions = (aliasPrefix = "o") => {
    const conditions = ["TRUE"];
    const params = [];
    let paramIndex = 1;

    // Фільтр по партнерам (масив)
    if (partners && partners.length > 0) {
      conditions.push(`${aliasPrefix}.partner_id = ANY($${paramIndex++})`);
      params.push(partners);
    }

    // Фільтр по брендам (масив)
    if (brands && brands.length > 0) {
      conditions.push(`${aliasPrefix}.brand_id = ANY($${paramIndex++})`);
      params.push(brands);
    }

    // Фільтр по гео регіонам (масив)
    if (geos && geos.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM offer_geos og_filter 
        WHERE og_filter.offer_id = ${aliasPrefix}.id 
        AND og_filter.geo_id = ANY($${paramIndex++})
      )`);
      params.push(geos);
    }

    // Фільтр по статусу
    if (onlyActive === "true") {
      conditions.push(`${aliasPrefix}.is_active = $${paramIndex++}`);
      params.push(true);
    } else if (onlyActive === "false") {
      conditions.push(`${aliasPrefix}.is_active = $${paramIndex++}`);
      params.push(false);
    }

    // Пошук по назві, опису, умовам, KPI
    if (search) {
      conditions.push(`(
        ${aliasPrefix}.name ILIKE $${paramIndex} OR
        ${aliasPrefix}.description ILIKE $${paramIndex} OR
        ${aliasPrefix}.conditions ILIKE $${paramIndex} OR
        ${aliasPrefix}.kpi ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    console.log(conditions);
    console.log(params);

    return {
      whereClause: conditions.join(" AND "),
      params: params,
    };
  };

  // Отримуємо умови та параметри
  const { whereClause, params } = buildWhereConditions();

  // Валідація полів сортування - ВИПРАВЛЕНО: убрали префікс "o." для CTE
  const allowedSortFields = {
    id: "id",
    name: "name",
    created_at: "created_at",
    updated_at: "updated_at",
    geos_count: "geos_count",
    flows_count: "flows_count",
  };

  const validSortBy = allowedSortFields[sortBy] || "created_at";
  const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

  // Додаємо LIMIT та OFFSET до параметрів для основного запиту
  const queryParams = [...params, parseInt(limit), offset];
  let paramIndex = params.length + 1;

  // Основний запит з підрахунком geos та flows
  const query = `
    WITH offer_data AS (
      SELECT 
        o.*,
        p.name as partner_name,
        p.type as partner_type,
        b.name as brand_name,
        u.username as created_by_username,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
        COUNT(DISTINCT f.id) as flows_count,
        COUNT(DISTINCT og.geo_id) as geos_count,
        COALESCE(
          JSON_AGG(
            DISTINCT jsonb_build_object(
              'id', g.id,
              'name', g.name,
              'country_code', g.country_code,
              'region', g.region
            )
          ) FILTER (WHERE g.id IS NOT NULL),
          '[]'::json
        ) as geos
      FROM 
        offers o
      JOIN 
        partners p ON o.partner_id = p.id
      LEFT JOIN 
        brands b ON o.brand_id = b.id
      LEFT JOIN 
        users u ON o.created_by = u.id
      LEFT JOIN 
        flows f ON o.id = f.offer_id
      LEFT JOIN 
        offer_geos og ON o.id = og.offer_id
      LEFT JOIN 
        geos g ON og.geo_id = g.id
      WHERE 
        ${whereClause}
      GROUP BY 
        o.id, p.name, p.type, b.name, u.username, u.first_name, u.last_name
    )
    SELECT * FROM offer_data
    ORDER BY ${validSortBy} ${validSortOrder}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  // Запит для підрахунку загальної кількості
  const countQuery = `
    SELECT COUNT(DISTINCT o.id) as total
    FROM offers o
    JOIN partners p ON o.partner_id = p.id
    LEFT JOIN brands b ON o.brand_id = b.id
    LEFT JOIN offer_geos og ON o.id = og.offer_id
    WHERE ${whereClause}
  `;

  // Запит для розширеної статистики
  const statsQuery = `
    SELECT 
      COUNT(DISTINCT o.id) as total,
      COUNT(DISTINCT CASE WHEN o.is_active = true THEN o.id END) as active_offers,
      COUNT(DISTINCT o.brand_id) FILTER (WHERE o.brand_id IS NOT NULL) as total_brands,
      COUNT(DISTINCT f.id) as total_flows
    FROM offers o
    JOIN partners p ON o.partner_id = p.id
    LEFT JOIN brands b ON o.brand_id = b.id
    LEFT JOIN flows f ON o.id = f.offer_id
    LEFT JOIN offer_geos og ON o.id = og.offer_id
    WHERE ${whereClause}
  `;

  // Додаємо логування для відлагодження
  if (process.env.NODE_ENV === "development") {
    console.log("WHERE Clause:", whereClause);
    console.log("Query Params:", queryParams);
    console.log("Base Params:", params);
    console.log("Valid Sort By:", validSortBy);
  }

  // Виконання всіх запитів паралельно
  const [dataResult, countResult, statsResult] = await Promise.all([
    db.query(query, queryParams),
    db.query(countQuery, params),
    db.query(statsQuery, params),
  ]);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);
  const stats = statsResult.rows[0];

  return {
    data: dataResult.rows,
    pagination: {
      total,
      totalPages,
      currentPage: parseInt(page),
      perPage: parseInt(limit),
      activeOffers: parseInt(stats.active_offers),
      totalBrands: parseInt(stats.total_brands),
      totalFlows: parseInt(stats.total_flows),
    },
  };
};

/**
 * Отримує статистику офферів
 * @returns {Promise<Object>} Статистика офферів
 */
const getOffersStatistics = async () => {
  // Основна статистика офферів (без JOIN щоб уникнути множення)
  const offersQuery = `
    SELECT 
      COUNT(*) as total_offers,
      COUNT(CASE WHEN is_active = true THEN 1 END) as active_offers,
      COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_offers,
      COUNT(DISTINCT brand_id) FILTER (WHERE brand_id IS NOT NULL) as total_brands,
      MAX(updated_at) as latest_update
    FROM offers
  `;

  // Підрахунок унікальних гео регіонів
  const geosQuery = `
    SELECT COUNT(DISTINCT geo_id) as total_geos
    FROM offer_geos
  `;

  // Підрахунок потоків
  const flowsQuery = `
    SELECT COUNT(*) as total_flows
    FROM flows
  `;

  const [offersResult, geosResult, flowsResult] = await Promise.all([
    db.query(offersQuery),
    db.query(geosQuery),
    db.query(flowsQuery),
  ]);

  const offersStats = offersResult.rows[0];
  const geosStats = geosResult.rows[0];
  const flowsStats = flowsResult.rows[0];

  return {
    totalOffers: parseInt(offersStats.total_offers) || 0,
    activeOffers: parseInt(offersStats.active_offers) || 0,
    inactiveOffers: parseInt(offersStats.inactive_offers) || 0,
    totalBrands: parseInt(offersStats.total_brands) || 0,
    totalGeos: parseInt(geosStats.total_geos) || 0,
    totalFlows: parseInt(flowsStats.total_flows) || 0,
    latestUpdate: offersStats.latest_update,
  };
};

/**
 * Отримує оффер за ID
 * @param {number} id - ID офферу
 * @returns {Promise<Object|null>} Оффер або null
 */
const getOfferById = async (id) => {
  const query = `
    SELECT 
      o.*,
      p.name as partner_name,
      p.type as partner_type,
      b.name as brand_name,
      u.username as created_by_username,
      CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
      COUNT(DISTINCT f.id) as flows_count,
      COALESCE(
        JSON_AGG(
          DISTINCT jsonb_build_object(
            'id', g.id,
            'name', g.name,
            'country_code', g.country_code,
            'region', g.region
          )
        ) FILTER (WHERE g.id IS NOT NULL),
        '[]'::json
      ) as geos
    FROM 
      offers o
    JOIN 
      partners p ON o.partner_id = p.id
    LEFT JOIN 
      brands b ON o.brand_id = b.id
    LEFT JOIN 
      users u ON o.created_by = u.id
    LEFT JOIN 
      flows f ON o.id = f.offer_id
    LEFT JOIN 
      offer_geos og ON o.id = og.offer_id
    LEFT JOIN 
      geos g ON og.geo_id = g.id
    WHERE 
      o.id = $1
    GROUP BY 
      o.id, p.name, p.type, b.name, u.username, u.first_name, u.last_name
  `;

  const result = await db.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Створює новий оффер
 * @param {Object} offerData - Дані офферу
 * @returns {Promise<Object>} Створений оффер
 */
const createOffer = async (offerData) => {
  try {
    const {
      name,
      partner_id,
      brand_id,
      conditions,
      kpi,
      description,
      geos = [],
      is_active = true,
      created_by,
    } = offerData;

    // Перевіряємо існування партнера
    const partnerCheck = await db.query(
      "SELECT id FROM partners WHERE id = $1",
      [partner_id]
    );
    if (partnerCheck.rows.length === 0) {
      throw new Error("Партнер з таким ID не існує");
    }

    // Перевіряємо існування бренда (якщо вказано)
    if (brand_id) {
      const brandCheck = await db.query("SELECT id FROM brands WHERE id = $1", [
        brand_id,
      ]);
      if (brandCheck.rows.length === 0) {
        throw new Error("Бренд з таким ID не існує");
      }
    }

    // Створюємо оффер
    const offerQuery = `
      INSERT INTO offers (
        name, partner_id, brand_id, conditions, kpi, description, 
        is_active, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;

    const offerResult = await db.query(offerQuery, [
      name,
      partner_id,
      brand_id,
      conditions,
      kpi,
      description,
      is_active,
      created_by,
    ]);

    const newOffer = offerResult.rows[0];

    // Додаємо гео регіони
    if (geos && geos.length > 0) {
      // Перевіряємо існування всіх гео регіонів
      const geoCheck = await db.query(
        "SELECT id FROM geos WHERE id = ANY($1)",
        [geos]
      );

      if (geoCheck.rows.length !== geos.length) {
        throw new Error("Деякі гео регіони не існують");
      }

      const geoInsertQuery = `
        INSERT INTO offer_geos (offer_id, geo_id)
        VALUES ${geos.map((_, index) => `($1, $${index + 2})`).join(", ")}
      `;

      await db.query(geoInsertQuery, [newOffer.id, ...geos]);
    }

    // Повертаємо повну інформацію про створений оффер
    return await getOfferById(newOffer.id);
  } catch (error) {
    throw error;
  }
};

/**
 * Оновлює оффер
 * @param {number} id - ID офферу
 * @param {Object} updateData - Дані для оновлення
 * @returns {Promise<Object|null>} Оновлений оффер або null
 */
const updateOffer = async (id, updateData) => {
  try {
    const {
      name,
      partner_id,
      brand_id,
      conditions,
      kpi,
      description,
      geos = [],
      is_active,
    } = updateData;

    // Перевіряємо існування офферу
    const offerCheck = await db.query("SELECT id FROM offers WHERE id = $1", [
      id,
    ]);
    if (offerCheck.rows.length === 0) {
      return null;
    }

    // Перевіряємо існування партнера
    const partnerCheck = await db.query(
      "SELECT id FROM partners WHERE id = $1",
      [partner_id]
    );
    if (partnerCheck.rows.length === 0) {
      throw new Error("Партнер з таким ID не існує");
    }

    // Перевіряємо існування бренда (якщо вказано)
    if (brand_id) {
      const brandCheck = await db.query("SELECT id FROM brands WHERE id = $1", [
        brand_id,
      ]);
      if (brandCheck.rows.length === 0) {
        throw new Error("Бренд з таким ID не існує");
      }
    }

    // Оновлюємо оффер
    const updateQuery = `
      UPDATE offers 
      SET name = $1, partner_id = $2, brand_id = $3, conditions = $4, 
          kpi = $5, description = $6, is_active = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;

    await db.query(updateQuery, [
      name,
      partner_id,
      brand_id,
      conditions,
      kpi,
      description,
      is_active,
      id,
    ]);

    // Оновлюємо гео регіони
    // Спочатку видаляємо всі існуючі
    await db.query("DELETE FROM offer_geos WHERE offer_id = $1", [id]);

    // Додаємо нові
    if (geos && geos.length > 0) {
      // Перевіряємо існування всіх гео регіонів
      const geoCheck = await db.query(
        "SELECT id FROM geos WHERE id = ANY($1)",
        [geos]
      );

      if (geoCheck.rows.length !== geos.length) {
        throw new Error("Деякі гео регіони не існують");
      }

      const geoInsertQuery = `
        INSERT INTO offer_geos (offer_id, geo_id)
        VALUES ${geos.map((_, index) => `($1, $${index + 2})`).join(", ")}
      `;

      await db.query(geoInsertQuery, [id, ...geos]);
    }

    // Повертаємо повну інформацію про оновлений оффер
    return await getOfferById(id);
  } catch (error) {
    throw error;
  }
};

/**
 * Оновлює статус офферу
 * @param {number} id - ID офферу
 * @param {boolean} isActive - Новий статус
 * @returns {Promise<Object|null>} Оновлений оффер або null
 */
const updateOfferStatus = async (id, isActive) => {
  const query = `
    UPDATE offers 
    SET is_active = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await db.query(query, [isActive, id]);

  if (result.rows.length === 0) {
    return null;
  }

  // Повертаємо повну інформацію про оновлений оффер
  return await getOfferById(id);
};

/**
 * Видаляє оффер
 * @param {number} id - ID офферу
 * @returns {Promise<boolean>} true, якщо оффер видалено
 */
const deleteOffer = async (id) => {
  try {
    // Перевіряємо чи є пов'язані потоки
    const flowsCheck = await db.query(
      "SELECT COUNT(*) as count FROM flows WHERE offer_id = $1",
      [id]
    );

    if (parseInt(flowsCheck.rows[0].count) > 0) {
      throw new Error("Неможливо видалити оффер, який має пов'язані потоки");
    }

    // Видаляємо пов'язані гео регіони
    await db.query("DELETE FROM offer_geos WHERE offer_id = $1", [id]);

    // Видаляємо оффер
    const result = await db.query(
      "DELETE FROM offers WHERE id = $1 RETURNING id",
      [id]
    );

    return result.rows.length > 0;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAllOffers,
  getOffersStatistics,
  getOfferById,
  createOffer,
  updateOffer,
  updateOfferStatus,
  deleteOffer,
};
