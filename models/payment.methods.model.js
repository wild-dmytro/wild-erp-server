const db = require("../config/db");

/**
 * PAYMENT METHODS MODEL
 */
const paymentMethodsModel = {
  /**
   * Отримує всі методи оплати
   */
  getAll: async (onlyActive = false) => {
    let query = 'SELECT * FROM payment_methods';
    if (onlyActive) {
      query += ' WHERE is_active = true';
    }
    query += ' ORDER BY name';
    
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Отримує метод оплати за ID
   */
  getById: async (id) => {
    const result = await db.query('SELECT * FROM payment_methods WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  /**
   * Створює новий метод оплати
   */
  create: async ({ name, description }) => {
    const query = `
      INSERT INTO payment_methods (name, description)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await db.query(query, [name, description]);
    return result.rows[0];
  },

  /**
   * Оновлює метод оплати
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
      UPDATE payment_methods
      SET ${setClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Оновлює статус методу оплати
   */
  updateStatus: async (id, isActive) => {
    const query = `
      UPDATE payment_methods
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await db.query(query, [isActive, id]);
    return result.rows[0] || null;
  },

  /**
   * Видаляє метод оплати
   */
  delete: async (id) => {
    try {
      // Перевіряємо наявність пов'язаних партнерів
      const partnersResult = await db.query(
        'SELECT COUNT(*) as count FROM partner_payment_methods WHERE payment_method_id = $1',
        [id]
      );

      if (parseInt(partnersResult.rows[0].count) > 0) {
        return {
          success: false,
          message: "Неможливо видалити метод оплати, оскільки він використовується партнерами"
        };
      }

      const result = await db.query('DELETE FROM payment_methods WHERE id = $1 RETURNING id', [id]);
      return {
        success: result.rows.length > 0,
        message: result.rows.length > 0 ? "Метод оплати успішно видалено" : "Метод оплати не знайдено"
      };
    } catch (error) {
      return {
        success: false,
        message: "Помилка при видаленні методу оплати",
        error: error.message
      };
    }
  }
};

module.exports = paymentMethodsModel