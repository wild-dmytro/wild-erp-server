const db = require("../config/db");

/**
 * Отримує список всіх партнерів з фільтрацією, пагінацією та всіма пов'язаними даними
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {number} [options.page=1] - Номер сторінки
 * @param {number} [options.limit=10] - Кількість записів на сторінці
 * @param {string} [options.type] - Тип партнера
 * @param {boolean} [options.onlyActive] - Тільки активні партнери
 * @param {string} [options.search] - Пошук за назвою
 * @param {boolean} [options.hasIntegration] - Наявність інтеграції
 * @param {number[]} [options.brands] - Масив ID брендів для фільтрації
 * @param {number[]} [options.geos] - Масив ID гео для фільтрації
 * @param {number[]} [options.trafficSources] - Масив ID джерел трафіку для фільтрації
 * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
 */
const getAllPartners = async ({
  page = 1,
  limit = 10,
  type,
  onlyActive,
  search,
  hasIntegration,
  brands,
  geos,
  trafficSources,
  sortBy = "created_at",
  sortOrder = "desc",
}) => {
  const offset = (page - 1) * limit;

  // Побудова WHERE умов та JOIN'ів
  const conditions = ["TRUE"];
  const params = [];
  let paramIndex = 1;
  let additionalJoins = "";

  // Базові фільтри
  if (type) {
    conditions.push(`p.type = $${paramIndex++}`);
    params.push(type);
  }

  if (onlyActive === "true") {
    conditions.push(`p.is_active = $${paramIndex++}`);
    params.push(true);
  } else if (onlyActive === "false") {
    conditions.push(`p.is_active = $${paramIndex++}`);
    params.push(false);
  }

  if (search) {
    conditions.push(`p.name ILIKE $${paramIndex++}`);
    params.push(`%${search}%`);
  }

  if (hasIntegration) {
    conditions.push(`p.has_integration = $${paramIndex++}`);
    params.push(hasIntegration === "true");
  }

  // Нові фільтри за пов'язаними таблицями
  if (brands && brands.length > 0) {
    additionalJoins += " INNER JOIN partner_brands pb ON p.id = pb.partner_id";
    const brandPlaceholders = brands.map(() => `$${paramIndex++}`).join(",");
    conditions.push(`pb.brand_id IN (${brandPlaceholders})`);
    params.push(...brands);
  }

  if (geos && geos.length > 0) {
    additionalJoins += " INNER JOIN partner_geos pg ON p.id = pg.partner_id";
    const geoPlaceholders = geos.map(() => `$${paramIndex++}`).join(",");
    conditions.push(`pg.geo_id IN (${geoPlaceholders})`);
    params.push(...geos);
  }

  if (trafficSources && trafficSources.length > 0) {
    additionalJoins +=
      " INNER JOIN partner_traffic_sources pts ON p.id = pts.partner_id";
    const trafficSourcePlaceholders = trafficSources
      .map(() => `$${paramIndex++}`)
      .join(",");
    conditions.push(`pts.traffic_source_id IN (${trafficSourcePlaceholders})`);
    params.push(...trafficSources);
  }

  const whereClause = conditions.join(" AND ");

  // Валідація полів сортування та підготовка ORDER BY
  const allowedSortFields = [
    "id",
    "name",
    "type",
    "created_at",
    "updated_at",
    "flows_count",
    "offers_count",
  ];
  const validSortBy = allowedSortFields.includes(sortBy)
    ? sortBy
    : "created_at";
  const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

  // Підготовка ORDER BY для різних типів полів
  let orderByClause;
  if (validSortBy === "flows_count") {
    orderByClause = `(SELECT COUNT(DISTINCT f.id) FROM flows f 
                      INNER JOIN offers o ON f.offer_id = o.id 
                      WHERE o.partner_id = p.id) ${validSortOrder}`;
  } else if (validSortBy === "offers_count") {
    orderByClause = `(SELECT COUNT(DISTINCT o.id) FROM offers o 
                      WHERE o.partner_id = p.id) ${validSortOrder}`;
  } else {
    orderByClause = `p.${validSortBy} ${validSortOrder}`;
  }

  // Основний запит з підрахунком offers_count та flows_count
  // Використовуємо DISTINCT для уникнення дублікатів при множинних JOIN'ах
  const query = `
    SELECT DISTINCT
      p.*,
      u.username as created_by_username,
      CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
      (SELECT COUNT(DISTINCT o.id) FROM offers o WHERE o.partner_id = p.id) as offers_count,
      (SELECT COUNT(DISTINCT f.id) FROM flows f 
       INNER JOIN offers o ON f.offer_id = o.id 
       WHERE o.partner_id = p.id) as flows_count
    FROM 
      partners p
    LEFT JOIN 
      users u ON p.created_by = u.id
    ${additionalJoins}
    WHERE 
      ${whereClause}
    ORDER BY 
      ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  params.push(parseInt(limit), offset);

  // Запит для підрахунку загальної кількості (з тими ж фільтрами)
  const countQuery = `
    SELECT COUNT(DISTINCT p.id) as total
    FROM partners p
    ${additionalJoins}
    WHERE ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    db.query(query, params),
    db.query(countQuery, params.slice(0, params.length - 2)),
  ]);

  const partners = dataResult.rows;
  const total = parseInt(countResult.rows[0].total);

  // Якщо партнерів немає, повертаємо порожній результат
  if (partners.length === 0) {
    return {
      data: [],
      pagination: {
        total: 0,
        totalPages: 0,
        currentPage: parseInt(page),
        perPage: parseInt(limit),
      },
    };
  }

  // Отримуємо ID всіх партнерів для запитів пов'язаних даних
  const partnerIds = partners.map((p) => p.id);
  const partnerIdsPlaceholder = partnerIds
    .map((_, index) => `$${index + 1}`)
    .join(",");

  // Паралельно отримуємо всі пов'язані дані
  const [brandsResult, geosResult, paymentMethodsResult, trafficSourcesResult] =
    await Promise.all([
      // Brands
      db.query(
        `SELECT 
          pb.partner_id,
          b.id,
          b.name
        FROM 
          partner_brands pb
        INNER JOIN 
          brands b ON pb.brand_id = b.id
        WHERE 
          pb.partner_id IN (${partnerIdsPlaceholder})
        ORDER BY b.name`,
        partnerIds
      ),

      // Geos
      db.query(
        `SELECT 
          pg.partner_id,
          g.id,
          g.name,
          g.country_code,
          g.region,
          g.is_active
        FROM 
          partner_geos pg
        INNER JOIN 
          geos g ON pg.geo_id = g.id
        WHERE 
          pg.partner_id IN (${partnerIdsPlaceholder})
        ORDER BY g.name`,
        partnerIds
      ),

      // Payment Methods
      db.query(
        `SELECT 
          ppm.partner_id,
          pm.id,
          pm.name,
          pm.description
        FROM 
          partner_payment_methods ppm
        INNER JOIN 
          payment_methods pm ON ppm.payment_method_id = pm.id
        WHERE 
          ppm.partner_id IN (${partnerIdsPlaceholder})
        ORDER BY pm.name`,
        partnerIds
      ),

      // Traffic Sources
      db.query(
        `SELECT 
          pts.partner_id,
          ts.id,
          ts.name
        FROM 
          partner_traffic_sources pts
        INNER JOIN 
          traffic_sources ts ON pts.traffic_source_id = ts.id
        WHERE 
          pts.partner_id IN (${partnerIdsPlaceholder})
        ORDER BY ts.name`,
        partnerIds
      ),
    ]);

  // Групуємо пов'язані дані за partner_id
  const partnerBrands = brandsResult.rows.reduce((acc, row) => {
    if (!acc[row.partner_id]) acc[row.partner_id] = [];
    acc[row.partner_id].push({
      id: row.id,
      name: row.name,
    });
    return acc;
  }, {});

  const partnerGeos = geosResult.rows.reduce((acc, row) => {
    if (!acc[row.partner_id]) acc[row.partner_id] = [];
    acc[row.partner_id].push({
      id: row.id,
      name: row.name,
      country_code: row.country_code,
      region: row.region,
      is_active: row.is_active,
    });
    return acc;
  }, {});

  const partnerPaymentMethods = paymentMethodsResult.rows.reduce((acc, row) => {
    if (!acc[row.partner_id]) acc[row.partner_id] = [];
    acc[row.partner_id].push({
      id: row.id,
      name: row.name,
      description: row.description,
    });
    return acc;
  }, {});

  const partnerTrafficSources = trafficSourcesResult.rows.reduce((acc, row) => {
    if (!acc[row.partner_id]) acc[row.partner_id] = [];
    acc[row.partner_id].push({
      id: row.id,
      name: row.name,
    });
    return acc;
  }, {});

  // Додаємо пов'язані дані до кожного партнера
  const partnersWithRelations = partners.map((partner) => ({
    ...partner,
    brands: partnerBrands[partner.id] || [],
    geos: partnerGeos[partner.id] || [],
    payment_methods: partnerPaymentMethods[partner.id] || [],
    traffic_sources: partnerTrafficSources[partner.id] || [],
    // Перетворюємо числові рядки на числа для консистентності
    offers_count: parseInt(partner.offers_count) || 0,
    flows_count: parseInt(partner.flows_count) || 0,
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    data: partnersWithRelations,
    pagination: {
      total,
      totalPages,
      currentPage: parseInt(page),
      perPage: parseInt(limit),
    },
  };
};

/**
 * Отримує партнера за ID з детальною інформацією
 * @param {number} id - ID партнера
 * @returns {Promise<Object|null>} Об'єкт партнера або null
 */
const getPartnerById = async (id) => {
  const query = `
    SELECT 
      p.*,
      u.username as created_by_username,
      CONCAT(u.first_name, ' ', u.last_name) as created_by_name
    FROM 
      partners p
    LEFT JOIN 
      users u ON p.created_by = u.id
    WHERE 
      p.id = $1
  `;

  const result = await db.query(query, [id]);
  if (result.rows.length === 0) return null;

  const partner = result.rows[0];

  // Отримуємо пов'язані бренди
  const brandsQuery = `
    SELECT b.id, b.name, b.description
    FROM brands b
    JOIN partner_brands pb ON b.id = pb.brand_id
    WHERE pb.partner_id = $1
  `;
  const brandsResult = await db.query(brandsQuery, [id]);

  // Отримуємо пов'язані гео
  const geosQuery = `
    SELECT g.id, g.name, g.country_code, g.region
    FROM geos g
    JOIN partner_geos pg ON g.id = pg.geo_id
    WHERE pg.partner_id = $1
  `;
  const geosResult = await db.query(geosQuery, [id]);

  // Отримуємо пов'язані методи оплати
  const paymentMethodsQuery = `
    SELECT pm.id, pm.name, pm.description
    FROM payment_methods pm
    JOIN partner_payment_methods ppm ON pm.id = ppm.payment_method_id
    WHERE ppm.partner_id = $1
  `;
  const paymentMethodsResult = await db.query(paymentMethodsQuery, [id]);

  // Отримуємо пов'язані джерела трафіку
  const trafficSourcesQuery = `
    SELECT ts.id, ts.name, ts.description
    FROM traffic_sources ts
    JOIN partner_traffic_sources pts ON ts.id = pts.traffic_source_id
    WHERE pts.partner_id = $1
  `;
  const trafficSourcesResult = await db.query(trafficSourcesQuery, [id]);

  return {
    ...partner,
    brands: brandsResult.rows,
    geos: geosResult.rows,
    payment_methods: paymentMethodsResult.rows,
    traffic_sources: trafficSourcesResult.rows,
  };
};

/**
 * Створює нового партнера
 * @param {Object} partnerData - Дані партнера
 * @returns {Promise<Object>} Створений партнер
 */
const createPartner = async (partnerData) => {
  const {
    name,
    type,
    contact_telegram,
    contact_email,
    partner_link,
    has_integration = false,
    postback_type = "none",
    telegram_chat_link,
    description,
    created_by,
    brands = [],
    geos = [],
    payment_methods = [],
    traffic_sources = [],
  } = partnerData;

  console.log(partnerData);

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Створюємо партнера
    const partnerQuery = `
      INSERT INTO partners (
        name, type, contact_telegram, contact_email, partner_link,
        has_integration, postback_type, telegram_chat_link, description, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const partnerResult = await client.query(partnerQuery, [
      name,
      type,
      contact_telegram,
      contact_email,
      partner_link,
      has_integration,
      postback_type,
      telegram_chat_link,
      description,
      created_by,
    ]);

    const partnerId = partnerResult.rows[0].id;

    // Додаємо зв'язки з брендами
    if (brands.length > 0) {
      const brandValues = brands
        .map((brandId, index) => `($1, $${index + 2})`)
        .join(", ");

      const brandsId = brands.map((elem) => elem.id);

      const brandParams = [partnerId, ...brandsId];

      await client.query(
        `INSERT INTO partner_brands (partner_id, brand_id) VALUES ${brandValues}`,
        brandParams
      );
    }

    // Додаємо зв'язки з гео
    if (geos.length > 0) {
      const geoValues = geos
        .map((geoId, index) => `($1, $${index + 2})`)
        .join(", ");

      const geosId = geos.map((elem) => elem.id);

      const geoParams = [partnerId, ...geosId];

      await client.query(
        `INSERT INTO partner_geos (partner_id, geo_id) VALUES ${geoValues}`,
        geoParams
      );
    }

    // Додаємо зв'язки з методами оплати
    if (payment_methods.length > 0) {
      const paymentValues = payment_methods
        .map((pmId, index) => `($1, $${index + 2})`)
        .join(", ");

      const paymentsId = payment_methods.map((elem) => elem.id);

      const paymentParams = [partnerId, ...paymentsId];

      await client.query(
        `INSERT INTO partner_payment_methods (partner_id, payment_method_id) VALUES ${paymentValues}`,
        paymentParams
      );
    }

    // Додаємо зв'язки з джерелами трафіку
    if (traffic_sources.length > 0) {
      const trafficValues = traffic_sources
        .map((tsId, index) => `($1, $${index + 2})`)
        .join(", ");

      const trafficId = traffic_sources.map((elem) => elem.id);

      const trafficParams = [partnerId, ...trafficId];

      await client.query(
        `INSERT INTO partner_traffic_sources (partner_id, traffic_source_id) VALUES ${trafficValues}`,
        trafficParams
      );
    }

    await client.query("COMMIT");
    return partnerResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Оновлює дані партнера
 * @param {number} id - ID партнера
 * @param {Object} partnerData - Дані для оновлення
 * @returns {Promise<Object|null>} Оновлений партнер або null
 */
const updatePartner = async (id, partnerData) => {
  const {
    name,
    type,
    contact_telegram,
    contact_email,
    partner_link,
    has_integration,
    postback_type,
    telegram_chat_link,
    description,
    brands,
    geos,
    payment_methods,
    traffic_sources,
  } = partnerData;

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Оновлюємо основні дані партнера
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (type !== undefined) {
      setClauses.push(`type = $${paramIndex++}`);
      values.push(type);
    }
    if (contact_telegram !== undefined) {
      setClauses.push(`contact_telegram = $${paramIndex++}`);
      values.push(contact_telegram);
    }
    if (contact_email !== undefined) {
      setClauses.push(`contact_email = $${paramIndex++}`);
      values.push(contact_email);
    }
    if (partner_link !== undefined) {
      setClauses.push(`partner_link = $${paramIndex++}`);
      values.push(partner_link);
    }
    if (has_integration !== undefined) {
      setClauses.push(`has_integration = $${paramIndex++}`);
      values.push(has_integration);
    }
    if (postback_type !== undefined) {
      setClauses.push(`postback_type = $${paramIndex++}`);
      values.push(postback_type);
    }
    if (telegram_chat_link !== undefined) {
      setClauses.push(`telegram_chat_link = $${paramIndex++}`);
      values.push(telegram_chat_link);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(description);
    }

    if (setClauses.length > 0) {
      setClauses.push(`updated_at = NOW()`);
      values.push(id);

      const updateQuery = `
        UPDATE partners
        SET ${setClauses.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);
      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
    }

    // Оновлюємо зв'язки, якщо вони передані
    if (brands !== undefined) {
      await client.query("DELETE FROM partner_brands WHERE partner_id = $1", [
        id,
      ]);
      if (brands.length > 0) {
        const brandIds = brands.map((elem) => elem.id);

        const brandValues = brandIds
          .map((brandId, index) => `($1, $${index + 2})`)
          .join(", ");
        const brandParams = [id, ...brandIds];

        await client.query(
          `INSERT INTO partner_brands (partner_id, brand_id) VALUES ${brandValues}`,
          brandParams
        );
      }
    }

    if (geos !== undefined) {
      await client.query("DELETE FROM partner_geos WHERE partner_id = $1", [
        id,
      ]);
      if (geos.length > 0) {
        const geoIds = geos.map((elem) => elem.id);

        const geoValues = geoIds
          .map((geoId, index) => `($1, $${index + 2})`)
          .join(", ");
        const geoParams = [id, ...geoIds];

        await client.query(
          `INSERT INTO partner_geos (partner_id, geo_id) VALUES ${geoValues}`,
          geoParams
        );
      }
    }

    if (payment_methods !== undefined) {
      await client.query(
        "DELETE FROM partner_payment_methods WHERE partner_id = $1",
        [id]
      );
      if (payment_methods.length > 0) {
        const paymentValues = payment_methods
          .map((pmId, index) => `($1, $${index + 2})`)
          .join(", ");
        const paymentParams = [id, ...payment_methods];

        await client.query(
          `INSERT INTO partner_payment_methods (partner_id, payment_method_id) VALUES ${paymentValues}`,
          paymentParams
        );
      }
    }

    if (traffic_sources !== undefined) {
      await client.query(
        "DELETE FROM partner_traffic_sources WHERE partner_id = $1",
        [id]
      );
      if (traffic_sources.length > 0) {
        const trafficValues = traffic_sources
          .map((tsId, index) => `($1, $${index + 2})`)
          .join(", ");
        const trafficParams = [id, ...traffic_sources];

        await client.query(
          `INSERT INTO partner_traffic_sources (partner_id, traffic_source_id) VALUES ${trafficValues}`,
          trafficParams
        );
      }
    }

    await client.query("COMMIT");

    // Повертаємо оновленого партнера
    return await getPartnerById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Видаляє партнера
 * @param {number} id - ID партнера
 * @returns {Promise<Object>} Результат видалення
 */
const deletePartner = async (id) => {
  try {
    // Перевіряємо наявність пов'язаних офферів
    const offersResult = await db.query(
      "SELECT COUNT(*) as count FROM offers WHERE partner_id = $1",
      [id]
    );

    if (parseInt(offersResult.rows[0].count) > 0) {
      return {
        success: false,
        message: "Неможливо видалити партнера, оскільки з ним пов'язані оффери",
      };
    }

    // Видаляємо партнера (каскадне видалення зв'язків відбудеться автоматично)
    const result = await db.query(
      "DELETE FROM partners WHERE id = $1 RETURNING id",
      [id]
    );

    return {
      success: result.rows.length > 0,
      message:
        result.rows.length > 0
          ? "Партнера успішно видалено"
          : "Партнера не знайдено",
    };
  } catch (error) {
    console.error("Error deleting partner:", error);
    return {
      success: false,
      message: "Помилка при видаленні партнера",
      error: error.message,
    };
  }
};

/**
 * Деактивує/активує партнера
 * @param {number} id - ID партнера
 * @param {boolean} isActive - Статус активності
 * @returns {Promise<Object|null>} Оновлений партнер або null
 */
const updatePartnerStatus = async (id, isActive) => {
  const query = `
    UPDATE partners
    SET is_active = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await db.query(query, [isActive, id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Отримує статистику партнерів
 * @returns {Promise<Object>} Статистика партнерів
 */
const getPartnersStats = async () => {
  const query = `
    SELECT
      COUNT(*) as total_partners,
      SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_partners,
      SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END) as inactive_partners,
      SUM(CASE WHEN type = 'Brand' THEN 1 ELSE 0 END) as brand_partners,
      SUM(CASE WHEN type = 'PP' THEN 1 ELSE 0 END) as pp_partners,
      SUM(CASE WHEN type = 'NET' THEN 1 ELSE 0 END) as net_partners,
      SUM(CASE WHEN type = 'DIRECT ADV' THEN 1 ELSE 0 END) as direct_adv_partners,
      SUM(CASE WHEN has_integration = true THEN 1 ELSE 0 END) as with_integration
    FROM 
      partners
  `;

  const result = await db.query(query);
  return result.rows[0];
};

module.exports = {
  getAllPartners,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
  updatePartnerStatus,
  getPartnersStats,
};
