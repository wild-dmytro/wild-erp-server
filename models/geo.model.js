const db = require("../config/db");

/**
 * GEOS MODEL
 */
const geosModel = {
  /**
   * Отримує всі гео
   */
  getAll: async (onlyActive = false) => {
    let query = 'SELECT * FROM geos';
    if (onlyActive) {
      query += ' WHERE is_active = true';
    }
    query += ' ORDER BY name';
    
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Отримує гео за ID
   */
  getById: async (id) => {
    const result = await db.query('SELECT * FROM geos WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  /**
   * Створює нове гео
   */
  create: async ({ name, country_code, region }) => {
    const query = `
      INSERT INTO geos (name, country_code, region)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await db.query(query, [name, country_code, region]);
    return result.rows[0];
  },

  /**
   * Оновлює гео
   */
  update: async (id, { name, country_code, region }) => {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (country_code !== undefined) {
      setClauses.push(`country_code = $${paramIndex++}`);
      values.push(country_code);
    }
    if (region !== undefined) {
      setClauses.push(`region = $${paramIndex++}`);
      values.push(region);
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE geos
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Оновлює статус гео
   */
  updateStatus: async (id, isActive) => {
    const query = `
      UPDATE geos
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [isActive, id]);
    return result.rows[0] || null;
  },

  /**
   * Видаляє гео
   */
  delete: async (id) => {
    try {
      // Перевіряємо наявність пов'язаних записів
      const [partnersResult, offersResult, flowsResult] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM partner_geos WHERE geo_id = $1', [id]),
        db.query('SELECT COUNT(*) as count FROM offer_geos WHERE geo_id = $1', [id]),
        db.query('SELECT COUNT(*) as count FROM flows WHERE geo_id = $1', [id])
      ]);

      const totalUsage = parseInt(partnersResult.rows[0].count) + 
                        parseInt(offersResult.rows[0].count) + 
                        parseInt(flowsResult.rows[0].count);

      if (totalUsage > 0) {
        return {
          success: false,
          message: "Неможливо видалити гео, оскільки воно використовується"
        };
      }

      const result = await db.query('DELETE FROM geos WHERE id = $1 RETURNING id', [id]);
      return {
        success: result.rows.length > 0,
        message: result.rows.length > 0 ? "Гео успішно видалено" : "Гео не знайдено"
      };
    } catch (error) {
      return {
        success: false,
        message: "Помилка при видаленні гео",
        error: error.message
      };
    }
  }
};

module.exports = geosModel