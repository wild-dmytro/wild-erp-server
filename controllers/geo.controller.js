const geosModel = require("../models/geo.model");
const { validationResult } = require("express-validator");

/**
 * GEOS CONTROLLER
 */
const geosController = {
  // Отримання всіх гео
  getAll: async (req, res) => {
    try {
      const { onlyActive = "false" } = req.query;
      const geos = await geosModel.getAll(onlyActive === "true");

      res.json({
        success: true,
        data: geos,
      });
    } catch (err) {
      console.error("Помилка отримання гео:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання гео",
      });
    }
  },

  // Отримання гео за ID
  getById: async (req, res) => {
    try {
      const geoId = parseInt(req.params.id);

      if (isNaN(geoId)) {
        return res.status(400).json({
          success: false,
          message: "ID гео має бути числом",
        });
      }

      const geo = await geosModel.getById(geoId);

      if (!geo) {
        return res.status(404).json({
          success: false,
          message: "Гео не знайдено",
        });
      }

      res.json({
        success: true,
        data: geo,
      });
    } catch (err) {
      console.error(`Помилка отримання гео з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання гео",
      });
    }
  },

  // Створення нового гео
  create: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const newGeo = await geosModel.create(req.body);

      res.status(201).json({
        success: true,
        data: newGeo,
        message: "Гео успішно створено",
      });
    } catch (err) {
      console.error("Помилка створення гео:", err);

      if (err.code === "23505") {
        return res.status(400).json({
          success: false,
          message: "Гео з такою назвою вже існує",
        });
      }

      res.status(500).json({
        success: false,
        message: "Помилка сервера під час створення гео",
      });
    }
  },

  // Оновлення гео
  update: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const geoId = parseInt(req.params.id);

      if (isNaN(geoId)) {
        return res.status(400).json({
          success: false,
          message: "ID гео має бути числом",
        });
      }

      const existingGeo = await geosModel.getById(geoId);
      if (!existingGeo) {
        return res.status(404).json({
          success: false,
          message: "Гео не знайдено",
        });
      }

      const updatedGeo = await geosModel.update(geoId, req.body);

      if (!updatedGeo) {
        return res.status(400).json({
          success: false,
          message: "Немає даних для оновлення",
        });
      }

      res.json({
        success: true,
        data: updatedGeo,
        message: "Гео успішно оновлено",
      });
    } catch (err) {
      console.error(`Помилка оновлення гео з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення гео",
      });
    }
  },

  // Зміна статусу гео
  updateStatus: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const geoId = parseInt(req.params.id);
      const { is_active } = req.body;

      if (isNaN(geoId)) {
        return res.status(400).json({
          success: false,
          message: "ID гео має бути числом",
        });
      }

      const existingGeo = await geosModel.getById(geoId);
      if (!existingGeo) {
        return res.status(404).json({
          success: false,
          message: "Гео не знайдено",
        });
      }

      const updatedGeo = await geosModel.updateStatus(geoId, is_active);

      res.json({
        success: true,
        data: updatedGeo,
        message: `Гео успішно ${is_active ? "активовано" : "деактивовано"}`,
      });
    } catch (err) {
      console.error(
        `Помилка оновлення статусу гео з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення статусу гео",
      });
    }
  },

  // Видалення гео
  delete: async (req, res) => {
    try {
      const geoId = parseInt(req.params.id);

      if (isNaN(geoId)) {
        return res.status(400).json({
          success: false,
          message: "ID гео має бути числом",
        });
      }

      const existingGeo = await geosModel.getById(geoId);
      if (!existingGeo) {
        return res.status(404).json({
          success: false,
          message: "Гео не знайдено",
        });
      }

      const result = await geosModel.delete(geoId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      res.json({
        success: true,
        message: result.message,
      });
    } catch (err) {
      console.error(`Помилка видалення гео з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час видалення гео",
      });
    }
  },
};

module.exports = geosController;
