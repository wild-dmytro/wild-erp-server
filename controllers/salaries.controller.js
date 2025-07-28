const salaryModel = require("../models/salary.model");
const userModel = require("../models/user.model");
const { validationResult } = require("express-validator");

/**
 * Отримання списку всіх зарплат з фільтрацією та пагінацією
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllSalaries = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      month,
      year,
      userId,
      teamId,
      departmentId,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (
      month &&
      (isNaN(parseInt(month)) || parseInt(month) < 1 || parseInt(month) > 12)
    ) {
      errors.push({
        param: "month",
        msg: "Місяць має бути числом від 1 до 12",
      });
    }
    if (
      year &&
      (isNaN(parseInt(year)) || parseInt(year) < 2000 || parseInt(year) > 2100)
    ) {
      errors.push({
        param: "year",
        msg: "Рік має бути числом від 2000 до 2100",
      });
    }
    if (userId && isNaN(parseInt(userId))) {
      errors.push({ param: "userId", msg: "ID користувача має бути числом" });
    }
    if (teamId && isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "ID команди має бути числом" });
    }
    if (departmentId && isNaN(parseInt(departmentId))) {
      errors.push({ param: "departmentId", msg: "ID відділу має бути числом" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Перевірка прав доступу
    const currentUserId = req.userId;
    const currentUserRole = req.userRole;

    // Звичайні користувачі можуть бачити тільки свої зарплати
    if (currentUserRole === "user") {
      // Примусово встановлюємо userId на поточного користувача
      req.query.userId = currentUserId;
    }
    // Тімліди можуть бачити зарплати своєї команди
    else if (currentUserRole === "teamlead") {
      // Отримуємо команду тімліда
      const userDetails = await userModel.getUserById(currentUserId);
      if (userDetails && userDetails.team_id) {
        // Примусово встановлюємо teamId на команду тімліда
        req.query.teamId = userDetails.team_id;
      } else {
        return res.status(403).json({
          success: false,
          message: "Тімлід не призначений до команди",
        });
      }
    }
    // Адміністратори та фінансові менеджери можуть бачити всі зарплати

    // Отримання даних
    const result = await salaryModel.getAllSalaries({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      userId: userId ? parseInt(userId) : undefined,
      teamId: teamId ? parseInt(teamId) : undefined,
      departmentId: departmentId ? parseInt(departmentId) : undefined,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Помилка отримання зарплат:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання зарплат",
    });
  }
};

/**
 * Отримання деталей зарплати за ID
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getSalaryById = async (req, res) => {
  try {
    const salaryId = parseInt(req.params.id);

    if (isNaN(salaryId)) {
      return res.status(400).json({
        success: false,
        message: "ID зарплати має бути числом",
      });
    }

    // Отримання зарплати
    const salary = await salaryModel.getSalaryById(salaryId);

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Зарплату не знайдено",
      });
    }

    // Перевірка прав доступу
    const currentUserId = req.userId;
    const currentUserRole = req.userRole;

    // Звичайні користувачі можуть бачити тільки свої зарплати
    if (currentUserRole === "user" && salary.user_id !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: "Доступ заборонено",
      });
    }
    // Тімліди можуть бачити зарплати своєї команди
    else if (currentUserRole === "teamlead") {
      // Отримуємо команду тімліда
      const userDetails = await userModel.getUserById(currentUserId);
      if (!userDetails || userDetails.team_id !== salary.team_id) {
        return res.status(403).json({
          success: false,
          message: "Доступ заборонено. Ви не є тімлідом цієї команди",
        });
      }
    }
    // Адміністратори та фінансові менеджери можуть бачити всі зарплати

    res.json({
      success: true,
      data: salary,
    });
  } catch (err) {
    console.error(`Помилка отримання зарплати з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання зарплати",
    });
  }
};

/**
 * Створення нової зарплати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createSalary = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { user_id, amount, month, year, description } = req.body;

    // Додаткова валідація
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Місяць має бути від 1 до 12",
      });
    }

    // Перевірка існування користувача
    const user = await userModel.getUserById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // Перевірка прав доступу (тільки адміністратори та фінансові менеджери)
    const currentUserRole = req.userRole;
    if (!["admin", "finance_manager"].includes(currentUserRole)) {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено. Тільки адміністратори та фінансові менеджери можуть створювати зарплати",
      });
    }

    // Створення зарплати
    const newSalary = await salaryModel.createSalary({
      user_id,
      amount,
      month,
      year,
      description,
    });

    res.status(201).json({
      success: true,
      data: newSalary,
      message: "Зарплату успішно створено",
    });
  } catch (err) {
    if (err.message && err.message.includes("вже існує")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    console.error("Помилка створення зарплати:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення зарплати",
    });
  }
};

/**
 * Оновлення зарплати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateSalary = async (req, res) => {
  try {
    const salaryId = parseInt(req.params.id);

    if (isNaN(salaryId)) {
      return res.status(400).json({
        success: false,
        message: "ID зарплати має бути числом",
      });
    }

    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Отримання поточної зарплати
    const currentSalary = await salaryModel.getSalaryById(salaryId);
    if (!currentSalary) {
      return res.status(404).json({
        success: false,
        message: "Зарплату не знайдено",
      });
    }

    // Перевірка прав доступу (тільки адміністратори та фінансові менеджери)
    const currentUserRole = req.userRole;
    if (!["admin", "finance_manager"].includes(currentUserRole)) {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено. Тільки адміністратори та фінансові менеджери можуть оновлювати зарплати",
      });
    }

    // Перевірка статусу зарплати - не можна редагувати оплачені зарплати
    if (currentSalary.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Неможливо редагувати зарплату зі статусом 'paid'",
      });
    }

    // Оновлення зарплати
    const updatedSalary = await salaryModel.updateSalary(salaryId, {
      amount: req.body.amount,
      description: req.body.description,
    });

    if (!updatedSalary) {
      return res.status(400).json({
        success: false,
        message: "Немає даних для оновлення",
      });
    }

    res.json({
      success: true,
      data: updatedSalary,
      message: "Зарплату успішно оновлено",
    });
  } catch (err) {
    console.error(`Помилка оновлення зарплати з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення зарплати",
    });
  }
};

/**
 * Зміна статусу зарплати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateSalaryStatus = async (req, res) => {
  try {
    const salaryId = parseInt(req.params.id);

    if (isNaN(salaryId)) {
      return res.status(400).json({
        success: false,
        message: "ID зарплати має бути числом",
      });
    }

    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      status,
      transaction_hash,
      network,
      finance_manager,
      payment_network,
      payment_address,
    } = req.body;

    // Перевірка статусу
    const validStatuses = ["pending", "approved", "rejected", "paid"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Невірний статус. Допустимі значення: ${validStatuses.join(
          ", "
        )}`,
      });
    }

    // Отримання поточної зарплати
    const currentSalary = await salaryModel.getSalaryById(salaryId);
    if (!currentSalary) {
      return res.status(404).json({
        success: false,
        message: "Зарплату не знайдено",
      });
    }

    // Перевірка прав доступу
    const currentUserId = req.userId;
    const currentUserRole = req.userRole;

    // Тільки адміністратори та фінансові менеджери можуть змінювати статус зарплати
    if (!["admin", "finance_manager"].includes(currentUserRole)) {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено. Тільки адміністратори та фінансові менеджери можуть змінювати статус зарплати",
      });
    }

    // Дані для оплати (для статусу 'paid')
    let paymentDetails = {};
    if (status === "paid") {
      // Перевірка наявності адреси гаманця
      if (!currentSalary.salary_wallet_address) {
        return res.status(400).json({
          success: false,
          message:
            "Неможливо оплатити зарплату: відсутня адреса гаманця користувача",
        });
      }

      // Для статусу 'paid' потрібно вказати transaction_hash та network
      if (!transaction_hash || !finance_manager) {
        return res.status(400).json({
          success: false,
          message:
            "Для статусу 'paid' необхідно вказати transaction_hash та network",
        });
      }

      paymentDetails = {
        transaction_hash,
        finance_manager,
        payment_network,
        payment_address,
      };
    }

    console.log(paymentDetails);

    // Оновлення статусу зарплати
    const updatedSalary = await salaryModel.updateSalaryStatus(
      salaryId,
      status,
      currentUserId,
      paymentDetails
    );

    if (!updatedSalary) {
      return res.status(500).json({
        success: false,
        message: "Не вдалося оновити статус зарплати",
      });
    }

    res.json({
      success: true,
      data: updatedSalary,
      message: `Статус зарплати успішно змінено на "${status}"`,
    });
  } catch (err) {
    if (err.message && err.message.includes("Неможливо змінити статус")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    console.error(
      `Помилка оновлення статусу зарплати з ID ${req.params.id}:`,
      err
    );
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення статусу зарплати",
    });
  }
};

/**
 * Видалення зарплати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.deleteSalary = async (req, res) => {
  try {
    const salaryId = parseInt(req.params.id);

    if (isNaN(salaryId)) {
      return res.status(400).json({
        success: false,
        message: "ID зарплати має бути числом",
      });
    }

    // Отримання зарплати для перевірки
    const salary = await salaryModel.getSalaryById(salaryId);
    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Зарплату не знайдено",
      });
    }

    // Перевірка прав доступу (тільки адміністратори)
    const currentUserRole = req.userRole;
    if (currentUserRole !== "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено. Тільки адміністратори можуть видаляти зарплати",
      });
    }

    // Перевірка статусу зарплати - не можна видаляти оплачені зарплати
    // if (salary.status === "paid") {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Неможливо видалити зарплату зі статусом 'paid'",
    //   });
    // }

    // Видалення зарплати
    const result = await salaryModel.deleteSalary(salaryId);

    if (!result) {
      return res.status(500).json({
        success: false,
        message: "Не вдалося видалити зарплату",
      });
    }

    res.json({
      success: true,
      message: "Зарплату успішно видалено",
    });
  } catch (err) {
    console.error(`Помилка видалення зарплати з ID ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час видалення зарплати",
    });
  }
};

/**
 * Отримання статистики зарплат
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getSalaryStats = async (req, res) => {
  try {
    const { month, year, userId, teamId, departmentId } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (
      month &&
      (isNaN(parseInt(month)) || parseInt(month) < 1 || parseInt(month) > 12)
    ) {
      errors.push({
        param: "month",
        msg: "Місяць має бути числом від 1 до 12",
      });
    }
    if (
      year &&
      (isNaN(parseInt(year)) || parseInt(year) < 2000 || parseInt(year) > 2100)
    ) {
      errors.push({
        param: "year",
        msg: "Рік має бути числом від 2000 до 2100",
      });
    }
    if (teamId && isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "ID команди має бути числом" });
    }
    if (userId && isNaN(parseInt(userId))) {
      errors.push({ param: "userId", msg: "ID користувача має бути числом" });
    }
    if (departmentId && isNaN(parseInt(departmentId))) {
      errors.push({ param: "departmentId", msg: "ID відділу має бути числом" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Перевірка прав доступу
    const currentUserRole = req.userRole;
    const currentUserId = req.userId;

    // Тільки адміністратори та фінансові менеджери можуть бачити повну статистику
    if (!["admin", "finance_manager"].includes(currentUserRole)) {
      // Для тімлідів обмежуємо статистику їхньою командою
      if (currentUserRole === "teamlead") {
        const userDetails = await userModel.getUserById(currentUserId);
        if (userDetails && userDetails.team_id) {
          req.query.teamId = userDetails.team_id;
        } else {
          return res.status(403).json({
            success: false,
            message: "Тімлід не призначений до команди",
          });
        }
      } else {
        // Звичайні користувачі не мають доступу до статистики
        return res.status(403).json({
          success: false,
          message: "Доступ заборонено",
        });
      }
    }

    // Отримання статистики
    const stats = await salaryModel.getSalaryStats({
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      userId: userId ? parseInt(userId) : undefined,
      teamId: teamId ? parseInt(teamId) : undefined,
      departmentId: departmentId ? parseInt(departmentId) : undefined,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error("Помилка отримання статистики зарплат:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання статистики зарплат",
    });
  }
};

/**
 * Генерація зарплат для користувачів
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.generateSalaries = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { month, year, teamId, departmentId } = req.body;

    // Додаткова валідація
    if (month < 1 || month > 12 || !Number.isInteger(month)) {
      return res.status(400).json({
        success: false,
        message: "Місяць має бути цілим числом від 1 до 12",
      });
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Рік має бути цілим числом від 2000 до 2100",
      });
    }

    // Перевірка прав доступу (тільки адміністратори та фінансові менеджери)
    const currentUserRole = req.userRole;
    if (!["admin", "finance_manager"].includes(currentUserRole)) {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено. Тільки адміністратори та фінансові менеджери можуть генерувати зарплати",
      });
    }

    // Генерація зарплат
    const generatedSalaries = await salaryModel.generateSalaries(
      month,
      year,
      teamId ? parseInt(teamId) : undefined,
      departmentId ? parseInt(departmentId) : undefined
    );

    if (generatedSalaries.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "Не було створено жодної зарплати. Можливо, всі зарплати вже створені або немає активних користувачів з базовими зарплатами",
        data: [],
      });
    }

    res.status(201).json({
      success: true,
      message: `Успішно згенеровано ${generatedSalaries.length} зарплат`,
      data: generatedSalaries,
    });
  } catch (err) {
    console.error("Помилка генерації зарплат:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час генерації зарплат",
    });
  }
};

/**
 * Оновлення адреси гаманця користувача для зарплати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.updateUserSalaryWallet = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { wallet_address } = req.body;

    // Перевірка існування користувача
    const user = await userModel.getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // Перевірка прав доступу
    const currentUserId = req.userId;
    const currentUserRole = req.userRole;

    // Користувач може змінювати тільки свою адресу гаманця або якщо це адміністратор
    if (currentUserId !== userId && currentUserRole !== "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено. Ви можете змінювати тільки свою адресу гаманця",
      });
    }

    // Валідація адреси гаманця (базова перевірка на довжину та формат)
    // Тут можна додати більш складну валідацію залежно від типу мережі
    if (!wallet_address || wallet_address.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Невірний формат адреси гаманця",
      });
    }

    // Оновлення адреси гаманця
    const updatedUser = await salaryModel.updateUserSalaryWallet(
      userId,
      wallet_address
    );

    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        message: "Не вдалося оновити адресу гаманця",
      });
    }

    res.json({
      success: true,
      data: updatedUser,
      message: "Адресу гаманця успішно оновлено",
    });
  } catch (err) {
    console.error(
      `Помилка оновлення адреси гаманця для користувача з ID ${req.params.id}:`,
      err
    );
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час оновлення адреси гаманця",
    });
  }
};

/**
 * Отримання всіх шаблонів зарплат
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getAllSalaryTemplates = async (req, res) => {
  try {
    const {
      onlyActive = true,
      teamId,
      departmentId,
      page = 1,
      limit = 10,
    } = req.query;

    // Перевірка коректності параметрів
    const errors = [];
    if (teamId && isNaN(parseInt(teamId))) {
      errors.push({ param: "teamId", msg: "ID команди має бути числом" });
    }
    if (departmentId && isNaN(parseInt(departmentId))) {
      errors.push({ param: "departmentId", msg: "ID відділу має бути числом" });
    }
    if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
      errors.push({
        param: "page",
        msg: "Номер сторінки має бути позитивним числом",
      });
    }
    if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1)) {
      errors.push({ param: "limit", msg: "Ліміт має бути позитивним числом" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    // Перевірка прав доступу
    const currentUserRole = req.userRole;
    const currentUserId = req.userId;

    // Тільки адміністратори та фінансові менеджери можуть бачити всі шаблони
    if (!["admin", "finance_manager"].includes(currentUserRole)) {
      // Для тімлідів обмежуємо списком їхньої команди
      if (currentUserRole === "teamlead") {
        const userDetails = await userModel.getUserById(currentUserId);
        if (userDetails && userDetails.team_id) {
          req.query.teamId = userDetails.team_id;
        } else {
          return res.status(403).json({
            success: false,
            message: "Тімлід не призначений до команди",
          });
        }
      } else {
        // Звичайні користувачі не мають доступу до шаблонів
        return res.status(403).json({
          success: false,
          message: "Доступ заборонено",
        });
      }
    }

    // Отримання шаблонів
    const result = await salaryModel.getAllSalaryTemplates({
      onlyActive: onlyActive === "true" || onlyActive === true,
      teamId: teamId ? parseInt(teamId) : undefined,
      departmentId: departmentId ? parseInt(departmentId) : undefined,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
    });

    res.json({
      success: true,
      data: result.data,
      total: result.total,
    });
  } catch (err) {
    console.error("Помилка отримання шаблонів зарплат:", err);
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання шаблонів зарплат",
    });
  }
};

/**
 * Отримання шаблону зарплати для користувача
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.getSalaryTemplate = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Перевірка існування користувача
    const user = await userModel.getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // Перевірка прав доступу
    const currentUserId = req.userId;
    const currentUserRole = req.userRole;

    // Звичайні користувачі не можуть бачити шаблони зарплат
    if (currentUserRole === "user" && currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Доступ заборонено",
      });
    }

    // Отримання шаблону зарплати
    const template = await salaryModel.getSalaryTemplate(userId);

    res.json({
      success: true,
      data: template,
    });
  } catch (err) {
    console.error(
      `Помилка отримання шаблону зарплати для користувача з ID ${req.params.id}:`,
      err
    );
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час отримання шаблону зарплати",
    });
  }
};

/**
 * Створення або оновлення шаблону зарплати
 * @param {Object} req - Об'єкт запиту Express
 * @param {Object} res - Об'єкт відповіді Express
 */
exports.createOrUpdateSalaryTemplate = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "ID користувача має бути числом",
      });
    }

    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { base_amount } = req.body;

    // Перевірка існування користувача
    const user = await userModel.getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Користувача не знайдено",
      });
    }

    // Перевірка прав доступу (тільки адміністратори та фінансові менеджери)
    const currentUserRole = req.userRole;
    const currentUserId = req.userId;
    if (!["admin", "finance_manager"].includes(currentUserRole)) {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено. Тільки адміністратори та фінансові менеджери можуть створювати шаблони зарплати",
      });
    }

    // Створення або оновлення шаблону
    const template = await salaryModel.createOrUpdateSalaryTemplate(
      userId,
      base_amount,
      currentUserId
    );

    res.json({
      success: true,
      data: template,
      message: "Шаблон зарплати успішно створено/оновлено",
    });
  } catch (err) {
    console.error(
      `Помилка створення/оновлення шаблону зарплати для користувача з ID ${req.params.id}:`,
      err
    );
    res.status(500).json({
      success: false,
      message: "Помилка сервера під час створення/оновлення шаблону зарплати",
    });
  }
};
