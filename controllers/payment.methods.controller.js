const paymentMethodsModel = require("../models/payment.methods.model");
const { validationResult } = require("express-validator");

/**
 * PAYMENT METHODS CONTROLLER
 */
const paymentMethodsController = {
  // Аналогічні методи для способів оплати
  getAll: async (req, res) => {
    try {
      const { onlyActive = "false" } = req.query;
      const paymentMethods = await paymentMethodsModel.getAll(
        onlyActive === "true"
      );

      res.json({
        success: true,
        data: paymentMethods,
      });
    } catch (err) {
      console.error("Помилка отримання способів оплати:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання способів оплати",
      });
    }
  },

  getById: async (req, res) => {
    try {
      const pmId = parseInt(req.params.id);

      if (isNaN(pmId)) {
        return res.status(400).json({
          success: false,
          message: "ID способу оплати має бути числом",
        });
      }

      const paymentMethod = await paymentMethodsModel.getById(pmId);

      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          message: "Спосіб оплати не знайдено",
        });
      }

      res.json({
        success: true,
        data: paymentMethod,
      });
    } catch (err) {
      console.error(
        `Помилка отримання способу оплати з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання способу оплати",
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

      const newPaymentMethod = await paymentMethodsModel.create(req.body);

      res.status(201).json({
        success: true,
        data: newPaymentMethod,
        message: "Спосіб оплати успішно створено",
      });
    } catch (err) {
      console.error("Помилка створення способу оплати:", err);

      if (err.code === "23505") {
        return res.status(400).json({
          success: false,
          message: "Спосіб оплати з такою назвою вже існує",
        });
      }

      res.status(500).json({
        success: false,
        message: "Помилка сервера під час створення способу оплати",
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

      const pmId = parseInt(req.params.id);

      if (isNaN(pmId)) {
        return res.status(400).json({
          success: false,
          message: "ID способу оплати має бути числом",
        });
      }

      const existingPM = await paymentMethodsModel.getById(pmId);
      if (!existingPM) {
        return res.status(404).json({
          success: false,
          message: "Спосіб оплати не знайдено",
        });
      }

      const updatedPM = await paymentMethodsModel.update(pmId, req.body);

      if (!updatedPM) {
        return res.status(400).json({
          success: false,
          message: "Немає даних для оновлення",
        });
      }

      res.json({
        success: true,
        data: updatedPM,
        message: "Спосіб оплати успішно оновлено",
      });
    } catch (err) {
      console.error(
        `Помилка оновлення способу оплати з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення способу оплати",
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

      const pmId = parseInt(req.params.id);
      const { is_active } = req.body;

      if (isNaN(pmId)) {
        return res.status(400).json({
          success: false,
          message: "ID способу оплати має бути числом",
        });
      }

      const existingPM = await paymentMethodsModel.getById(pmId);
      if (!existingPM) {
        return res.status(404).json({
          success: false,
          message: "Спосіб оплати не знайдено",
        });
      }

      const updatedPM = await paymentMethodsModel.updateStatus(pmId, is_active);

      res.json({
        success: true,
        data: updatedPM,
        message: `Спосіб оплати успішно ${
          is_active ? "активовано" : "деактивовано"
        }`,
      });
    } catch (err) {
      console.error(
        `Помилка оновлення статусу способу оплати з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення статусу способу оплати",
      });
    }
  },

  delete: async (req, res) => {
    try {
      const pmId = parseInt(req.params.id);

      if (isNaN(pmId)) {
        return res.status(400).json({
          success: false,
          message: "ID способу оплати має бути числом",
        });
      }

      const existingPM = await paymentMethodsModel.getById(pmId);
      if (!existingPM) {
        return res.status(404).json({
          success: false,
          message: "Спосіб оплати не знайдено",
        });
      }

      const result = await paymentMethodsModel.delete(pmId);

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
        `Помилка видалення способу оплати з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час видалення способу оплати",
      });
    }
  },
};

module.exports = paymentMethodsController;
