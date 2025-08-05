/**
 * Контролер для роботи з розподілом коштів заявок на виплату
 * controllers/payout.allocation.controller.js
 */

const payoutAllocationModel = require("../models/payout.allocation.model");
const partnerPayoutModel = require("../models/partner.payout.model");
const { validationResult } = require("express-validator");

/**
 * Отримання користувачів, які працюють з потоками заявки на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getUsersForAllocation = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        message: "ID заявки на виплату має бути числом",
      });
    }

    // Перевіряємо чи існує заявка на виплату
    const payoutRequest = await partnerPayoutModel.getPayoutRequestById(payoutRequestId);
    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку на виплату не знайдено",
      });
    }

    // Отримуємо користувачів, які працюють з потоками цієї заявки
    const flows = await payoutAllocationModel.getUsersByPayoutRequestFlows(payoutRequestId);

    res.json({
      success: true,
      data: {
        payout_request: {
          id: payoutRequest.id,
          total_amount: payoutRequest.total_amount,
          currency: payoutRequest.currency,
          status: payoutRequest.status,
          partner_name: payoutRequest.partner_name
        },
        flows: flows
      },
    });
  } catch (err) {
    console.error("Помилка отримання користувачів для розподілу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання користувачів для розподілу",
    });
  }
};

/**
 * Отримання всіх розподілів для заявки на виплату
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllocationsByPayoutRequest = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки на виплату має бути числом",
      });
    }

    // Отримуємо розподіли та статистику
    const [allocations, stats] = await Promise.all([
      payoutAllocationModel.getAllocationsByPayoutRequest(payoutRequestId),
      payoutAllocationModel.getAllocationStats(payoutRequestId)
    ]);

    res.json({
      success: true,
      data: {
        allocations: allocations,
        stats: stats
      },
    });
  } catch (err) {
    console.error("Помилка отримання розподілів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання розподілів",
    });
  }
};

/**
 * Створення розподілу коштів для користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createAllocation = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const payoutRequestId = parseInt(req.params.payoutRequestId);
    const {
      user_id,
      flow_id,
      allocated_amount,
      percentage,
      description,
      notes
    } = req.body;

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки на виплату має бути числом",
      });
    }

    // Перевіряємо чи існує заявка на виплату
    const payoutRequest = await partnerPayoutModel.getPayoutRequestById(payoutRequestId);
    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку на виплату не знайдено",
      });
    }

    // Додаткова валідація сум
    if (allocated_amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Сума розподілу має бути більше 0",
      });
    }

    // Перевіряємо чи загальна сума розподілів не перевищує суму заявки
    const currentStats = await payoutAllocationModel.getAllocationStats(payoutRequestId);
    const totalAfterAddition = parseFloat(currentStats.total_allocated) + parseFloat(allocated_amount);
    
    if (totalAfterAddition > parseFloat(payoutRequest.total_amount)) {
      return res.status(400).json({
        success: false,
        message: `Загальна сума розподілів (${totalAfterAddition}) не може перевищувати суму заявки (${payoutRequest.total_amount})`,
      });
    }

    const allocationData = {
      payout_request_id: payoutRequestId,
      user_id,
      flow_id,
      allocated_amount,
      percentage,
      currency: payoutRequest.currency,
      description,
      notes,
      created_by: req.user.id
    };

    const allocation = await payoutAllocationModel.createAllocation(allocationData);

    res.status(201).json({
      success: true,
      data: allocation,
      message: "Розподіл коштів успішно створено",
    });
  } catch (err) {
    console.error("Помилка створення розподілу:", err);
    
    // Обробка помилки унікальності
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: "Розподіл для цього користувача вже існує",
      });
    }

    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення розподілу",
    });
  }
};

/**
 * Масове створення/оновлення розподілів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.bulkUpsertAllocations = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId);
    const { allocations } = req.body;

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки на виплату має бути числом",
      });
    }

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Розподіли мають бути передані як непустий масив",
      });
    }

    // Перевіряємо чи існує заявка на виплату
    const payoutRequest = await partnerPayoutModel.getPayoutRequestById(payoutRequestId);
    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку на виплату не знайдено",
      });
    }

    // Валідація кожного розподілу
    for (let i = 0; i < allocations.length; i++) {
      const allocation = allocations[i];
      
      if (!allocation.user_id || !allocation.allocated_amount) {
        return res.status(400).json({
          success: false,
          message: `Розподіл ${i + 1}: обов'язкові поля user_id та allocated_amount`,
        });
      }

      if (allocation.allocated_amount <= 0) {
        return res.status(400).json({
          success: false,
          message: `Розподіл ${i + 1}: сума має бути більше 0`,
        });
      }
    }

    // Перевіряємо загальну суму розподілів
    const totalAllocated = allocations.reduce((sum, allocation) => 
      sum + parseFloat(allocation.allocated_amount), 0
    );

    if (totalAllocated > parseFloat(payoutRequest.total_amount)) {
      return res.status(400).json({
        success: false,
        message: `Загальна сума розподілів (${totalAllocated}) не може перевищувати суму заявки (${payoutRequest.total_amount})`,
      });
    }

    const result = await payoutAllocationModel.bulkUpsertAllocations(
      payoutRequestId,
      allocations,
      req.user.id
    );

    res.json({
      success: true,
      data: result,
      message: `Успішно оброблено ${result.length} розподілів`,
    });
  } catch (err) {
    console.error("Помилка масового створення розподілів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення розподілів",
    });
  }
};

/**
 * Оновлення розподілу коштів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateAllocation = async (req, res) => {
  try {
    const allocationId = parseInt(req.params.allocationId);
    const updateData = {
      ...req.body,
      updated_by: req.user.id
    };

    if (isNaN(allocationId)) {
      return res.status(400).json({
        success: false,
        message: "ID розподілу має бути числом",
      });
    }

    // Додаткова валідація сум, якщо оновлюється allocated_amount
    if (updateData.allocated_amount !== undefined && updateData.allocated_amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Сума розподілу має бути більше 0",
      });
    }

    const allocation = await payoutAllocationModel.updateAllocation(allocationId, updateData);

    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: "Розподіл не знайдено",
      });
    }

    res.json({
      success: true,
      data: allocation,
      message: "Розподіл успішно оновлено",
    });
  } catch (err) {
    console.error("Помилка оновлення розподілу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення розподілу",
    });
  }
};

/**
 * Видалення розподілу коштів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deleteAllocation = async (req, res) => {
  try {
    const allocationId = parseInt(req.params.allocationId);

    if (isNaN(allocationId)) {
      return res.status(400).json({
        success: false,
        message: "ID розподілу має бути числом",
      });
    }

    const deleted = await payoutAllocationModel.deleteAllocation(allocationId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Розподіл не знайдено",
      });
    }

    res.json({
      success: true,
      message: "Розподіл успішно видалено",
    });
  } catch (err) {
    console.error("Помилка видалення розподілу:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення розподілу",
    });
  }
};

/**
 * Підтвердження всіх розподілів для заявки
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.confirmAllAllocations = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки на виплату має бути числом",
      });
    }

    // Перевіряємо чи існує заявка на виплату
    const payoutRequest = await partnerPayoutModel.getPayoutRequestById(payoutRequestId);
    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Заявку на виплату не знайдено",
      });
    }

    // Перевіряємо права доступу (тільки тімліди можуть підтверджувати)
    if (req.user.role !== 'teamlead' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Недостатньо прав для підтвердження розподілів",
      });
    }

    const confirmedCount = await payoutAllocationModel.confirmAllAllocations(
      payoutRequestId,
      req.user.id
    );

    res.json({
      success: true,
      data: {
        confirmed_count: confirmedCount
      },
      message: `Підтверджено ${confirmedCount} розподілів`,
    });
  } catch (err) {
    console.error("Помилка підтвердження розподілів:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час підтвердження розподілів",
    });
  }
};

/**
 * Отримання статистики розподілів для заявки
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllocationStats = async (req, res) => {
  try {
    const payoutRequestId = parseInt(req.params.payoutRequestId);

    if (isNaN(payoutRequestId)) {
      return res.status(400).json({
        success: false,
        message: "ID заявки на виплату має бути числом",
      });
    }

    const stats = await payoutAllocationModel.getAllocationStats(payoutRequestId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики розподілів:", err);
    res.status(500).json({
      success: false,
            message: "Помилка сервера під час отримання статистики розподілів",
    });
  }
};