const brandsModel = require("../models/brands.model");
const { validationResult } = require("express-validator");

/**
 * BRANDS CONTROLLER
 */
const brandsController = {
  // Отримання всіх брендів
  getAll: async (req, res) => {
    try {
      const { onlyActive = "false" } = req.query;
      const brands = await brandsModel.getAll(onlyActive === "true");

      res.json({
        success: true,
        data: brands,
      });
    } catch (err) {
      console.error("Помилка отримання брендів:", err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання брендів",
      });
    }
  },

  // Отримання бренда за ID
  getById: async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);

      if (isNaN(brandId)) {
        return res.status(400).json({
          success: false,
          message: "ID бренда має бути числом",
        });
      }

      const brand = await brandsModel.getById(brandId);

      if (!brand) {
        return res.status(404).json({
          success: false,
          message: "Бренд не знайдено",
        });
      }

      res.json({
        success: true,
        data: brand,
      });
    } catch (err) {
      console.error(`Помилка отримання бренда з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час отримання бренда",
      });
    }
  },

  // Створення нового бренда
  create: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const newBrand = await brandsModel.create(req.body);

      res.status(201).json({
        success: true,
        data: newBrand,
        message: "Бренд успішно створено",
      });
    } catch (err) {
      console.error("Помилка створення бренда:", err);

      if (err.code === "23505") {
        return res.status(400).json({
          success: false,
          message: "Бренд з такою назвою вже існує",
        });
      }

      res.status(500).json({
        success: false,
        message: "Помилка сервера під час створення бренда",
      });
    }
  },

  // Оновлення бренда
  update: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const brandId = parseInt(req.params.id);

      if (isNaN(brandId)) {
        return res.status(400).json({
          success: false,
          message: "ID бренда має бути числом",
        });
      }

      const existingBrand = await brandsModel.getById(brandId);
      if (!existingBrand) {
        return res.status(404).json({
          success: false,
          message: "Бренд не знайдено",
        });
      }

      const updatedBrand = await brandsModel.update(brandId, req.body);

      if (!updatedBrand) {
        return res.status(400).json({
          success: false,
          message: "Немає даних для оновлення",
        });
      }

      res.json({
        success: true,
        data: updatedBrand,
        message: "Бренд успішно оновлено",
      });
    } catch (err) {
      console.error(`Помилка оновлення бренда з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення бренда",
      });
    }
  },

  // Зміна статусу бренда
  updateStatus: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const brandId = parseInt(req.params.id);
      const { is_active } = req.body;

      if (isNaN(brandId)) {
        return res.status(400).json({
          success: false,
          message: "ID бренда має бути числом",
        });
      }

      const existingBrand = await brandsModel.getById(brandId);
      if (!existingBrand) {
        return res.status(404).json({
          success: false,
          message: "Бренд не знайдено",
        });
      }

      const updatedBrand = await brandsModel.updateStatus(brandId, is_active);

      res.json({
        success: true,
        data: updatedBrand,
        message: `Бренд успішно ${is_active ? "активовано" : "деактивовано"}`,
      });
    } catch (err) {
      console.error(
        `Помилка оновлення статусу бренда з ID ${req.params.id}:`,
        err
      );
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час оновлення статусу бренда",
      });
    }
  },

  // Видалення бренда
  delete: async (req, res) => {
    try {
      const brandId = parseInt(req.params.id);

      if (isNaN(brandId)) {
        return res.status(400).json({
          success: false,
          message: "ID бренда має бути числом",
        });
      }

      const existingBrand = await brandsModel.getById(brandId);
      if (!existingBrand) {
        return res.status(404).json({
          success: false,
          message: "Бренд не знайдено",
        });
      }

      const result = await brandsModel.delete(brandId);

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
      console.error(`Помилка видалення бренда з ID ${req.params.id}:`, err);
      res.status(500).json({
        success: false,
        message: "Помилка сервера під час видалення бренда",
      });
    }
  },
};

module.exports = brandsController
