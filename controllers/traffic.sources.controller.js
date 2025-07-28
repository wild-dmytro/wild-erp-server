const trafficSourcesModel = require("../models/traffic.source.model");
const { validationResult } = require("express-validator");

/**
 * TRAFFIC SOURCES CONTROLLER
 */
const trafficSourcesController = {
  // Аналогічні методи для джерел трафіку
  getAll: async (req, res) => {
    try {
      const { onlyActive = "false" } = req.query;
      const trafficSources = await trafficSourcesModel.getAll(
        onlyActive === "true"
      );

      res.json({
        success: true,
        data: trafficSources,
      });
    } catch (err) {
      console.error("Помилка отримання джерел трафіку:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання джерел трафіку",
      });
    }
  },

  getById: async (req, res) => {
    try {
      const tsId = parseInt(req.params.id);

      if (isNaN(tsId)) {
        return res.status(400).json({
          success: false,
          message: "ID джерела трафіку має бути числом",
        });
      }

      const trafficSource = await trafficSourcesModel.getById(tsId);

      if (!trafficSource) {
        return res.status(404).json({
          success: false,
          message: "Джерело трафіку не знайдено",
        });
      }

      res.json({
        success: true,
        data: trafficSource,
      });
    } catch (err) {
      console.error(
        `Помилка отримання джерела трафіку з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання джерела трафіку",
      });
    }
  },

  create: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const newTrafficSource = await trafficSourcesModel.create(req.body);

      res.status(201).json({
        success: true,
        data: newTrafficSource,
        message: "Джерело трафіку успішно створено",
      });
    } catch (err) {
      console.error("Помилка створення джерела трафіку:", err);

      if (err.code === "23505") {
        return res.status(400).json({
          success: false,
          message: "Джерело трафіку з такою назвою вже існує",
        });
      }

      res.status(500).json({
        success: false,
        message: "Помилка сервера під час створення джерела трафіку",
      });
    }
  },

  update: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const tsId = parseInt(req.params.id);

      if (isNaN(tsId)) {
        return res.status(400).json({
          success: false,
          message: "ID джерела трафіку має бути числом",
        });
      }

      const existingTS = await trafficSourcesModel.getById(tsId);
      if (!existingTS) {
        return res.status(404).json({
          success: false,
          message: "Джерело трафіку не знайдено",
        });
      }

      const updatedTS = await trafficSourcesModel.update(tsId, req.body);

      if (!updatedTS) {
        return res.status(400).json({
          success: false,
          message: "Немає даних для оновлення",
        });
      }

      res.json({
        success: true,
        data: updatedTS,
        message: "Джерело трафіку успішно оновлено",
      });
    } catch (err) {
      console.error(
        `Помилка оновлення джерела трафіку з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення джерела трафіку",
      });
    }
  },

  updateStatus: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const tsId = parseInt(req.params.id);
      const { is_active } = req.body;

      if (isNaN(tsId)) {
        return res.status(400).json({
          success: false,
          message: "ID джерела трафіку має бути числом",
        });
      }

      const existingTS = await trafficSourcesModel.getById(tsId);
      if (!existingTS) {
        return res.status(404).json({
          success: false,
          message: "Джерело трафіку не знайдено",
        });
      }

      const updatedTS = await trafficSourcesModel.updateStatus(tsId, is_active);

      res.json({
        success: true,
        data: updatedTS,
        message: `Джерело трафіку успішно ${
          is_active ? "активовано" : "деактивовано"
        }`,
      });
    } catch (err) {
      console.error(
        `Помилка оновлення статусу джерела трафіку з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення статусу джерела трафіку",
      });
    }
  },

  delete: async (req, res) => {
    try {
      const tsId = parseInt(req.params.id);

      if (isNaN(tsId)) {
        return res.status(400).json({
          success: false,
          message: "ID джерела трафіку має бути числом",
        });
      }

      const existingTS = await trafficSourcesModel.getById(tsId);
      if (!existingTS) {
        return res.status(404).json({
          success: false,
          message: "Джерело трафіку не знайдено",
        });
      }

      const result = await trafficSourcesModel.delete(tsId);

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
      console.error(
        `Помилка видалення джерела трафіку з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час видалення джерела трафіку",
      });
    }
  },
};

module.exports = trafficSourcesController;
