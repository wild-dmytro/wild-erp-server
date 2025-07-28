const db = require("../config/db");
const { TELEGRAM_API_URL } = require("../config/config");

/**
 * Отримує всі зарплати з фільтрацією та пагінацією
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {number} [options.page=1] - Номер сторінки
 * @param {number} [options.limit=10] - Кількість записів на сторінці
 * @param {string} [options.status] - Статус зарплати
 * @param {number} [options.month] - Місяць зарплати
 * @param {number} [options.year] - Рік зарплати
 * @param {number} [options.userId] - ID користувача
 * @param {number} [options.teamId] - ID команди
 * @param {number} [options.departmentId] - ID відділу
 * @returns {Promise<Object>} Об'єкт з даними та інформацією про пагінацію
 */
const getAllSalaries = async ({
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
}) => {
  const offset = (page - 1) * limit;

  // Побудова WHERE умов на основі фільтрів
  const conditions = ["TRUE"];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`s.status = $${paramIndex++}`);
    params.push(status);
  }

  if (month) {
    conditions.push(`s.month = $${paramIndex++}`);
    params.push(parseInt(month));
  }

  if (year) {
    conditions.push(`s.year = $${paramIndex++}`);
    params.push(parseInt(year));
  }

  if (userId) {
    conditions.push(`s.user_id = $${paramIndex++}`);
    params.push(parseInt(userId));
  }

  if (teamId) {
    conditions.push(`u.team_id = $${paramIndex++}`);
    params.push(parseInt(teamId));
  }

  if (departmentId) {
    conditions.push(`u.department_id = $${paramIndex++}`);
    params.push(parseInt(departmentId));
  }

  const whereClause = conditions.join(" AND ");

  // Валідація полів сортування
  const allowedSortFields = [
    "id",
    "amount",
    "month",
    "year",
    "status",
    "created_at",
    "updated_at",
    "paid_at",
  ];
  const validSortBy = allowedSortFields.includes(sortBy)
    ? `s.${sortBy}`
    : "s.created_at";
  const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

  // Виконання запиту для отримання даних з пагінацією
  const query = `
    SELECT 
      s.id,
      s.user_id,
      s.amount,
      s.month,
      s.year,
      s.status,
      s.created_at,
      s.updated_at,
      s.approved_by,
      s.approved_at,
      s.paid_at,
      s.payment_transaction_hash,
      s.payment_network,
      s.description,
      s.appeal,
      u.username,
      u.first_name,
      u.last_name,
      u.salary_wallet_address,
      u.salary_network,
      u.team_id,
      u.position,
      t.name as team_name,
      u.department_id,
      d.name as department_name,
      a.username as approved_by_username,
      a.first_name as approved_by_first_name,
      a.last_name as approved_by_last_name
    FROM 
      salaries s
    JOIN 
      users u ON s.user_id = u.id
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      departments d ON u.department_id = d.id
    LEFT JOIN 
      users a ON s.approved_by = a.id
    WHERE 
      ${whereClause}
    ORDER BY 
      ${validSortBy} ${validSortOrder}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  params.push(parseInt(limit), offset);

  // Виконання запиту для отримання загальної кількості результатів
  const countQuery = `
    SELECT 
      COUNT(*) as total
    FROM 
      salaries s
    JOIN 
      users u ON s.user_id = u.id
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      departments d ON u.department_id = d.id
    WHERE 
      ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    db.query(query, params),
    db.query(countQuery, params.slice(0, params.length - 2)),
  ]);

  const total = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  return {
    data: dataResult.rows,
    pagination: {
      total,
      totalPages,
      currentPage: parseInt(page),
      perPage: parseInt(limit),
    },
  };
};

/**
 * Отримує деталі зарплати за ID
 * @param {number} id - ID зарплати
 * @returns {Promise<Object|null>} Об'єкт зарплати або null
 */
const getSalaryById = async (id) => {
  const query = `
    SELECT 
      s.id,
      s.user_id,
      s.amount,
      s.month,
      s.year,
      s.status,
      s.created_at,
      s.updated_at,
      s.approved_by,
      s.approved_at,
      s.paid_at,
      s.payment_transaction_hash,
      s.payment_network,
      s.description,
      u.username,
      u.first_name,
      u.last_name,
      u.salary_wallet_address,
      u.salary_network,
      u.team_id,
      t.name as team_name,
      u.department_id,
      d.name as department_name,
      a.username as approved_by_username,
      a.first_name as approved_by_first_name,
      a.last_name as approved_by_last_name
    FROM 
      salaries s
    JOIN 
      users u ON s.user_id = u.id
    LEFT JOIN 
      teams t ON u.team_id = t.id
    LEFT JOIN 
      departments d ON u.department_id = d.id
    LEFT JOIN 
      users a ON s.approved_by = a.id
    WHERE 
      s.id = $1
  `;

  const result = await db.query(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Створює нову зарплату
 * @param {Object} salaryData - Дані зарплати
 * @param {number} salaryData.user_id - ID користувача
 * @param {number} salaryData.amount - Сума зарплати
 * @param {number} salaryData.month - Місяць (1-12)
 * @param {number} salaryData.year - Рік
 * @param {string} [salaryData.description] - Опис
 * @returns {Promise<Object>} Створений об'єкт зарплати
 */
const createSalary = async (salaryData) => {
  const { user_id, amount, month, year, description = null } = salaryData;

  // Перевірка на існування зарплати за цей місяць і рік для користувача
  const existingResult = await db.query(
    "SELECT id FROM salaries WHERE user_id = $1 AND month = $2 AND year = $3",
    [user_id, month, year]
  );

  if (existingResult.rows.length > 0) {
    throw new Error(
      `Зарплата за ${month}/${year} для користувача з ID ${user_id} вже існує`
    );
  }

  // Створення зарплати
  const query = `
    INSERT INTO salaries (
      user_id, amount, month, year, status, description
    )
    VALUES ($1, $2, $3, $4, 'pending', $5)
    RETURNING *
  `;

  const result = await db.query(query, [
    user_id,
    amount,
    month,
    year,
    description,
  ]);
  return result.rows[0];
};

/**
 * Оновлює зарплату
 * @param {number} id - ID зарплати
 * @param {Object} salaryData - Дані для оновлення
 * @param {number} [salaryData.amount] - Сума зарплати
 * @param {string} [salaryData.description] - Опис
 * @returns {Promise<Object|null>} Оновлений об'єкт зарплати або null
 */
const updateSalary = async (id, salaryData) => {
  const allowedFields = ["amount", "description"];
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  // Формування SET частини запиту
  allowedFields.forEach((field) => {
    if (salaryData[field] !== undefined) {
      setClauses.push(`${field} = $${paramIndex++}`);
      values.push(salaryData[field]);
    }
  });

  if (setClauses.length === 0) {
    return null; // Немає даних для оновлення
  }

  // Додавання updated_at
  setClauses.push("updated_at = NOW()");

  // Додавання ID зарплати
  values.push(id);

  const query = `
    UPDATE salaries
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await db.query(query, values);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Змінює статус зарплати
 * @param {number} id - ID зарплати
 * @param {string} newStatus - Новий статус ('pending', 'approved', 'rejected', 'paid')
 * @param {number} [approverId] - ID користувача, який схвалив/відхилив зарплату
 * @param {Object} [paymentDetails] - Деталі оплати (для статусу 'paid')
 * @returns {Promise<Object|null>} Оновлений об'єкт зарплати або null
 */
const updateSalaryStatus = async (
  id,
  newStatus,
  approverId = null,
  paymentDetails = {}
) => {
  const validStatuses = [
    "pending",
    "approved",
    "rejected",
    "paid",
    "confirmed",
  ];

  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Невірний статус: ${newStatus}`);
  }

  // Отримання поточного статусу та даних зарплати
  const currentResult = await db.query(
    "SELECT s.*, u.telegram_id, u.first_name, u.last_name, u.salary_wallet_address, " +
      "u.department_id, u.team_id FROM salaries s " +
      "JOIN users u ON s.user_id = u.id " +
      "WHERE s.id = $1",
    [id]
  );

  if (currentResult.rows.length === 0) {
    return null; // Зарплату не знайдено
  }

  const salary = currentResult.rows[0];

  // Формування SET частини запиту
  const setClauses = ["status = $1", "updated_at = NOW()"];
  const values = [newStatus]; // Починаємо з newStatus
  let paramIndex = 2;

  // Додаємо approved_by та approved_at при схваленні
  if (newStatus === "approved" && approverId) {
    setClauses.push(`approved_by = $${paramIndex++}`, "approved_at = NOW()");
    values.push(approverId);
  }

  // Додаємо деталі оплати при зміні статусу на 'paid'
  if (newStatus === "paid") {
    setClauses.push("paid_at = NOW()");

    if (paymentDetails.transaction_hash) {
      setClauses.push(`payment_transaction_hash = $${paramIndex++}`);
      values.push(paymentDetails.transaction_hash);
    }

    if (paymentDetails.finance_manager) {
      setClauses.push(`finance_manager_id = $${paramIndex++}`);
      values.push(paymentDetails.finance_manager);
    }

    if (paymentDetails.payment_network) {
      setClauses.push(`payment_network = $${paramIndex++}`);
      values.push(paymentDetails.payment_network);
    }

    if (paymentDetails.payment_address) {
      setClauses.push(`payment_address = $${paramIndex++}`);
      values.push(paymentDetails.payment_address);
    }
  }

  // Додаємо id в кінець
  setClauses.push(`id = $${paramIndex}`);
  values.push(id);

  const query = `
          UPDATE salaries
          SET ${setClauses.join(", ")}
          WHERE id = $${paramIndex}
          RETURNING *
        `;

  const result = await db.query(query, values);
  const updatedSalary = result.rows.length > 0 ? result.rows[0] : null;

  console.log(updatedSalary);

  // Якщо статус змінено на "approved", надсилаємо повідомлення користувачу в Telegram
  if (newStatus === "approved" && updatedSalary && salary.telegram_id) {
    try {
      // Отримуємо додаткові дані про відділ і команду
      const [departmentResult, teamResult] = await Promise.all([
        salary.department_id
          ? db.query("SELECT name FROM departments WHERE id = $1", [
              salary.department_id,
            ])
          : { rows: [] },
        salary.team_id
          ? db.query("SELECT name FROM teams WHERE id = $1", [salary.team_id])
          : { rows: [] },
      ]);

      const departmentName =
        departmentResult.rows.length > 0 ? departmentResult.rows[0].name : null;
      const teamName =
        teamResult.rows.length > 0 ? teamResult.rows[0].name : null;

      // Форматуємо місяць та рік
      const monthNames = [
        "Січень",
        "Лютий",
        "Березень",
        "Квітень",
        "Травень",
        "Червень",
        "Липень",
        "Серпень",
        "Вересень",
        "Жовтень",
        "Листопад",
        "Грудень",
      ];
      const monthName = monthNames[updatedSalary.month - 1];

      // Форматуємо суму з двома десятковими знаками
      const formattedAmount = parseInt(updatedSalary.amount);

      // Підготовка даних для надсилання через Telegram API
      const telegramData = {
        chat_id: salary.telegram_id,
        parse_mode: "Markdown",
        text: `
🔔 *Зарплату схвалено!*

Вашу зарплату за ${monthName} ${updatedSalary.year} було схвалено.

💵 *Сума:* $${formattedAmount}
👤 *Отримувач:* ${salary.first_name} ${salary.last_name || ""}
${departmentName ? `🏢 *Відділ:* ${departmentName}` : ""}
${teamName ? `👥 *Команда:* ${teamName}` : ""}
${salary.description ? `ℹ️ *Деталі:* ${salary.description}` : ""}
${
  salary.salary_wallet_address
    ? `💼 *Адреса гаманця:* \`${salary.salary_wallet_address}\``
    : "⚠️ *Адреса гаманця не вказана!*"
}

Для отримання коштів натисніть "Підтвердити". Якщо дані некоректні, скористайтесь опцією "Оскаржити".

Зарплату буде виплачено протягом 1-2 робочих днів після підтвердження.
            `,
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              {
                text: "✅ Підтвердити",
                callback_data: `confirm_salary_${updatedSalary.id}`,
              },
            ],
            [
              {
                text: "⚠️ Оскаржити",
                callback_data: `dispute_salary_${updatedSalary.id}`,
              },
            ],
            [
              {
                text: "🔄 Змінити адресу гаманця",
                callback_data: `change_wallet_${updatedSalary.id}`,
              },
            ],
          ],
        }),
      };

      // Відправка повідомлення через Telegram API
      const telegramResponse = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(telegramData),
      });

      if (!telegramResponse.ok) {
        throw new Error(
          `Помилка Telegram API: ${telegramResponse.status} ${telegramResponse.statusText}`
        );
      }

      const telegramResult = await telegramResponse.json();

      // Зберігаємо інформацію про надіслане повідомлення
      if (telegramResult.ok) {
        console.log(
          `Надіслано повідомлення про схвалення зарплати користувачу ${salary.telegram_id}`
        );
      }
    } catch (error) {
      console.error("Помилка при надсиланні повідомлення в Telegram:", error);
    }
  }

  // Якщо статус змінено на "paid", надсилаємо повідомлення користувачу в Telegram про оплату
  if (newStatus === "paid" && updatedSalary && salary.telegram_id) {
    try {
      // Форматуємо місяць та рік
      const monthNames = [
        "Січень",
        "Лютий",
        "Березень",
        "Квітень",
        "Травень",
        "Червень",
        "Липень",
        "Серпень",
        "Вересень",
        "Жовтень",
        "Листопад",
        "Грудень",
      ];
      const monthName = monthNames[updatedSalary.month - 1];

      // Форматуємо суму
      const formattedAmount = parseInt(updatedSalary.amount);

      // Підготовка даних для надсилання через Telegram API
      const telegramData = {
        chat_id: salary.telegram_id,
        parse_mode: "Markdown",
        text: `
💰 *Зарплату виплачено!*

Вітаємо! Вашу зарплату за ${monthName} ${updatedSalary.year} було успішно виплачено.

💵 *Сума:* $${formattedAmount}

Кошти було відправлено на ваш гаманець. Дякуємо за вашу роботу!
          `,
      };

      // Відправка повідомлення через Telegram API
      const telegramResponse = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(telegramData),
      });

      if (!telegramResponse.ok) {
        throw new Error(
          `Помилка Telegram API: ${telegramResponse.status} ${telegramResponse.statusText}`
        );
      }

      const telegramResult = await telegramResponse.json();

      // Зберігаємо інформацію про надіслане повідомлення
      if (telegramResult.ok) {
        console.log(
          `Надіслано повідомлення про виплату зарплати користувачу ${salary.telegram_id}`
        );
      }
    } catch (error) {
      console.error(error);
      console.error("Помилка при надсиланні повідомлення в Telegram:", error);
    }
  }

  return updatedSalary;
};

/**
 * Видаляє зарплату
 * @param {number} id - ID зарплати
 * @returns {Promise<boolean>} true, якщо видалення успішне, інакше false
 */
const deleteSalary = async (id) => {
  const result = await db.query(
    "DELETE FROM salaries WHERE id = $1 RETURNING id",
    [id]
  );
  return result.rows.length > 0;
};

/**
 * Отримує статистику зарплат
 * @param {Object} options - Опції для фільтрації
 * @param {number} [options.month] - Місяць
 * @param {number} [options.year] - Рік
 * @param {number} [options.teamId] - ID команди
 * @param {number} [options.departmentId] - ID відділу
 * @returns {Promise<Object>} Об'єкт зі статистикою
 */
const getSalaryStats = async ({
  month,
  year,
  userId,
  teamId,
  departmentId,
}) => {
  const conditions = ["TRUE"];
  const params = [];
  let paramIndex = 1;

  if (month) {
    conditions.push(`s.month = $${paramIndex++}`);
    params.push(parseInt(month));
  }

  if (year) {
    conditions.push(`s.year = $${paramIndex++}`);
    params.push(parseInt(year));
  }

  if (userId) {
    conditions.push(`s.user_id = $${paramIndex++}`);
    params.push(parseInt(userId));
  }

  if (teamId) {
    conditions.push(`u.team_id = $${paramIndex++}`);
    params.push(parseInt(teamId));
  }

  if (departmentId) {
    conditions.push(`u.department_id = $${paramIndex++}`);
    params.push(parseInt(departmentId));
  }

  const whereClause = conditions.join(" AND ");

  const query = `
    SELECT 
      COUNT(*) as total_count,
      SUM(CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN s.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN s.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
      SUM(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
      SUM(CASE WHEN s.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
      SUM(s.amount) as total_amount,
      SUM(CASE WHEN s.status = 'pending' THEN s.amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN s.status = 'approved' THEN s.amount ELSE 0 END) as approved_amount,
      SUM(CASE WHEN s.status = 'confirmed' THEN s.amount ELSE 0 END) as confirmed_amount,
      SUM(CASE WHEN s.status = 'rejected' THEN s.amount ELSE 0 END) as rejected_amount,
      SUM(CASE WHEN s.status = 'paid' THEN s.amount ELSE 0 END) as paid_amount,
      AVG(CASE WHEN s.status = 'paid' THEN s.amount END) as average_paid_salary,
      AVG(s.amount) as average_salary
    FROM 
      salaries s
    JOIN 
      users u ON s.user_id = u.id
    WHERE 
      ${whereClause}
  `;

  const result = await db.query(query, params);
  return result.rows[0];
};

/**
 * Генерує зарплати для всіх активних користувачів
 * @param {number} month - Місяць (1-12)
 * @param {number} year - Рік
 * @param {number} [teamId] - ID команди (опціонально)
 * @param {number} [departmentId] - ID відділу (опціонально)
 * @returns {Promise<Array>} Масив створених зарплат
 */
const generateSalaries = async (
  month,
  year,
  teamId = null,
  departmentId = null
) => {
  // Перевірка на валідність місяця та року
  if (month < 1 || month > 12 || !Number.isInteger(month)) {
    throw new Error("Невірний місяць. Має бути ціле число від 1 до 12");
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Невірний рік. Має бути ціле число від 2000 до 2100");
  }

  // Умови для вибору користувачів
  const userConditions = ["u.is_active = true"];
  const userParams = [month, year];
  let paramIndex = 3;

  if (teamId) {
    userConditions.push(`u.team_id = $${paramIndex++}`);
    userParams.push(teamId);
  }

  if (departmentId) {
    userConditions.push(`u.department_id = $${paramIndex++}`);
    userParams.push(departmentId);
  }

  const userWhereClause = userConditions.join(" AND ");

  // Отримання користувачів з їх шаблонами зарплат
  const usersQuery = `
    SELECT 
      u.id as user_id, 
      COALESCE(st.base_amount, 0) as base_amount
    FROM 
      users u
    LEFT JOIN 
      salary_templates st ON u.id = st.user_id AND st.is_active = true
    LEFT JOIN 
      salaries s ON u.id = s.user_id AND s.month = $1 AND s.year = $2
    WHERE 
      ${userWhereClause} AND s.id IS NULL
  `;

  const usersResult = await db.query(usersQuery, userParams);

  if (usersResult.rows.length === 0) {
    return []; // Немає користувачів для генерації зарплат
  }

  // Створення зарплат для кожного користувача
  const createPromises = usersResult.rows.map(async (user) => {
    if (user.base_amount <= 0) {
      return null; // Пропускаємо користувачів без встановленої базової зарплати
    }

    try {
      return await createSalary({
        user_id: user.user_id,
        amount: user.base_amount,
        month,
        year,
        description: `Автоматично згенерована зарплата за ${month}/${year}`,
      });
    } catch (error) {
      console.error(
        `Помилка створення зарплати для користувача ${user.user_id}:`,
        error
      );
      return null;
    }
  });

  const results = await Promise.all(createPromises);
  return results.filter(Boolean); // Відфільтровуємо null значення
};

/**
 * Отримує дані шаблону зарплати для користувача
 * @param {number} userId - ID користувача
 * @returns {Promise<Object|null>} Шаблон зарплати або null
 */
const getSalaryTemplate = async (userId) => {
  const query = `
    SELECT * FROM salary_templates 
    WHERE user_id = $1 AND is_active = true
  `;

  const result = await db.query(query, [userId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Створює або оновлює шаблон зарплати для користувача
 * @param {number} userId - ID користувача
 * @param {number} baseAmount - Базова сума зарплати
 * @param {number} createdBy - ID користувача, який створив/оновив шаблон
 * @returns {Promise<Object>} Створений або оновлений шаблон зарплати
 */
const createOrUpdateSalaryTemplate = async (userId, baseAmount, createdBy) => {
  // Перевірка наявності шаблону
  const existingTemplate = await getSalaryTemplate(userId);

  if (existingTemplate) {
    // Оновлення існуючого шаблону
    const updateQuery = `
      UPDATE salary_templates
      SET base_amount = $1, updated_at = NOW(), created_by = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await db.query(updateQuery, [
      baseAmount,
      createdBy,
      existingTemplate.id,
    ]);
    return result.rows[0];
  } else {
    // Створення нового шаблону
    const createQuery = `
      INSERT INTO salary_templates (user_id, base_amount, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await db.query(createQuery, [userId, baseAmount, createdBy]);
    return result.rows[0];
  }
};

/**
 * Оновлює адресу гаманця користувача для зарплати
 * @param {number} userId - ID користувача
 * @param {string} walletAddress - Адреса гаманця
 * @returns {Promise<Object|null>} Оновлений користувач або null
 */
const updateUserSalaryWallet = async (userId, walletAddress) => {
  const query = `
    UPDATE users
    SET salary_wallet_address = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING id, username, first_name, last_name, salary_wallet_address
  `;

  const result = await db.query(query, [walletAddress, userId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Отримує всі шаблони зарплат з підтримкою пагінації
 * @param {Object} options - Опції для фільтрації та пагінації
 * @param {boolean} [options.onlyActive=true] - Тільки активні шаблони
 * @param {number} [options.teamId] - ID команди
 * @param {number} [options.departmentId] - ID відділу
 * @param {number} [options.page=1] - Номер сторінки (1-based)
 * @param {number} [options.limit=10] - Кількість записів на сторінці
 * @returns {Promise<{ data: Array, total: number }>} Об'єкт із масивом шаблонів і загальною кількістю
 */
const getAllSalaryTemplates = async ({
  onlyActive = true,
  teamId,
  departmentId,
  page = 1,
  limit = 10,
} = {}) => {
  const conditions = ["TRUE"];
  const params = [];
  let paramIndex = 1;

  if (onlyActive) {
    conditions.push(`st.is_active = true`);
  }

  if (teamId) {
    conditions.push(`u.team_id = $${paramIndex++}`);
    params.push(parseInt(teamId));
  }

  if (departmentId) {
    conditions.push(`u.department_id = $${paramIndex++}`);
    params.push(parseInt(departmentId));
  }

  const whereClause = conditions.join(" AND ");

  // Запит для отримання шаблонів із пагінацією
  const dataQuery = `
      SELECT 
        st.id,
        st.user_id,
        st.base_amount,
        st.is_active,
        st.created_at,
        st.updated_at,
        st.created_by,
        u.username,
        u.first_name,
        u.last_name,
        u.salary_wallet_address,
        u.team_id,
        t.name as team_name,
        u.department_id,
        d.name as department_name,
        c.username as created_by_username,
        c.first_name as created_by_first_name,
        c.last_name as created_by_last_name
      FROM 
        salary_templates st
      JOIN 
        users u ON st.user_id = u.id
      LEFT JOIN 
        teams t ON u.team_id = t.id
      LEFT JOIN 
        departments d ON u.department_id = d.id
      LEFT JOIN 
        users c ON st.created_by = c.id
      WHERE 
        ${whereClause}
      ORDER BY 
        u.first_name, u.last_name
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

  // Запит для підрахунку загальної кількості
  const countQuery = `
      SELECT COUNT(*) as total
      FROM 
        salary_templates st
      JOIN 
        users u ON st.user_id = u.id
      LEFT JOIN 
        teams t ON u.team_id = t.id
      LEFT JOIN 
        departments d ON u.department_id = d.id
      WHERE 
        ${whereClause}
    `;

  // Додаємо параметри для LIMIT і OFFSET
  const offset = (page - 1) * limit;
  params.push(limit, offset);

  // Виконуємо обидва запити
  const [dataResult, countResult] = await Promise.all([
    db.query(dataQuery, params),
    db.query(countQuery, params.slice(0, params.length - 2)), // Без LIMIT і OFFSET для count
  ]);

  return {
    data: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10) || 0,
  };
};

module.exports = {
  getAllSalaries,
  getSalaryById,
  createSalary,
  updateSalary,
  updateSalaryStatus,
  deleteSalary,
  getSalaryStats,
  generateSalaries,
  getSalaryTemplate,
  createOrUpdateSalaryTemplate,
  updateUserSalaryWallet,
  getAllSalaryTemplates,
};
