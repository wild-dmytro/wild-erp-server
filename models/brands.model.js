const db = require("../config/db");

/**
 * BRANDS MODEL
 */
const brandsModel = {
  /**
   * Отримує всі бренди
   */
  getAll: async (onlyActive = false) => {
    let query = 'SELECT * FROM brands';
    if (onlyActive) {
      query += ' WHERE is_active = true';
    }
    query += ' ORDER BY name';
    
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Отримує бренд за ID
   */
  getById: async (id) => {
    const result = await db.query('SELECT * FROM brands WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  /**
   * Створює новий бренд
   */
  create: async ({ name, description }) => {
    const query = `
      INSERT INTO brands (name, description)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await db.query(query, [name, description]);
    return result.rows[0];
  },

  /**
   * Оновлює бренд
   */
  update: async (id, { name, description }) => {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(description);
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE brands
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Оновлює статус бренда
   */
  updateStatus: async (id, isActive) => {
    const query = `
      UPDATE brands
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [isActive, id]);
    return result.rows[0] || null;
  },

  /**
   * Видаляє бренд
   */
  delete: async (id) => {
    try {
      // Перевіряємо наявність пов'язаних офферів
      const offersResult = await db.query(
        'SELECT COUNT(*) as count FROM offers WHERE brand_id = $1',
        [id]
      );

      if (parseInt(offersResult.rows[0].count) > 0) {
        return {
          success: false,
          message: "Неможливо видалити бренд, оскільки з ним пов'язані оффери"
        };
      }

      const result = await db.query('DELETE FROM brands WHERE id = $1 RETURNING id', [id]);
      return {
        success: result.rows.length > 0,
        message: result.rows.length > 0 ? "Бренд успішно видалено" : "Бренд не знайдено"
      };
    } catch (error) {
      return {
        success: false,
        message: "Помилка при видаленні бренда",
        error: error.message
      };
    }
  }
};


module.exports = brandsModel