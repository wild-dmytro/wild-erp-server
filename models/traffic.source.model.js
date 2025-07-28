const db = require("../config/db");

/**
 * TRAFFIC SOURCES MODEL
 */
const trafficSourcesModel = {
  /**
   * Отримує всі джерела трафіку
   */
  getAll: async (onlyActive = false) => {
    let query = "SELECT * FROM traffic_sources";
    if (onlyActive) {
      query += " WHERE is_active = true";
    }
    query += " ORDER BY name";

    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Отримує джерело трафіку за ID
   */
  getById: async (id) => {
    const result = await db.query(
      "SELECT * FROM traffic_sources WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Створює нове джерело трафіку
   */
  create: async ({ name, description }) => {
    const query = `
        INSERT INTO traffic_sources (name, description)
        VALUES ($1, $2)
        RETURNING *
      `;
    const result = await db.query(query, [name, description]);
    return result.rows[0];
  },

  /**
   * Оновлює джерело трафіку
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
        UPDATE traffic_sources
        SET ${setClauses.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Оновлює статус джерела трафіку
   */
  updateStatus: async (id, isActive) => {
    const query = `
        UPDATE traffic_sources
        SET is_active = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
    const result = await db.query(query, [isActive, id]);
    return result.rows[0] || null;
  },

  /**
   * Видаляє джерело трафіку
   */
  delete: async (id) => {
    try {
      // Перевіряємо наявність пов'язаних партнерів
      const partnersResult = await db.query(
        "SELECT COUNT(*) as count FROM partner_traffic_sources WHERE traffic_source_id = $1",
        [id]
      );

      if (parseInt(partnersResult.rows[0].count) > 0) {
        return {
          success: false,
          message:
            "Неможливо видалити джерело трафіку, оскільки воно використовується партнерами",
        };
      }

      const result = await db.query(
        "DELETE FROM traffic_sources WHERE id = $1 RETURNING id",
        [id]
      );
      return {
        success: result.rows.length > 0,
        message:
          result.rows.length > 0
            ? "Джерело трафіку успішно видалено"
            : "Джерело трафіку не знайдено",
      };
    } catch (error) {
      return {
        success: false,
        message: "Помилка при видаленні джерела трафіку",
        error: error.message,
      };
    }
  },
};

module.exports = trafficSourcesModel