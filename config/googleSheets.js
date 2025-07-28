// config/googleSheets.js
const { google } = require('googleapis');
const path = require('path');

// Налаштування service account
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../credentials/service-account.json');

/**
 * Створення авторизованого клієнта Google Sheets API
 */
const createAuthClient = async () => {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_PATH,
      scopes: SCOPES,
    });

    const authClient = await auth.getClient();
    return authClient;
  } catch (error) {
    console.error('Помилка авторизації Google API:', error);
    throw new Error(`Помилка авторизації: ${error.message}`);
  }
};

/**
 * Створення клієнта Google Sheets
 */
const createSheetsClient = async () => {
  try {
    const authClient = await createAuthClient();
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: authClient 
    });
    return sheets;
  } catch (error) {
    console.error('Помилка створення Sheets клієнта:', error);
    throw error;
  }
};

/**
 * Правильне екранування назви аркуша
 * @param {string} sheetName - Назва аркуша
 * @returns {string} Екранована назва аркуша
 */
const escapeSheetName = (sheetName) => {
  if (!sheetName) return '';
  
  // Якщо назва містить спеціальні символи, пробіли або починається з цифри, 
  // потрібно взяти її в одинарні лапки
  if (/[\s'!]/.test(sheetName) || /^\d/.test(sheetName)) {
    return `'${sheetName.replace(/'/g, "''")}'`;
  }
  
  return sheetName;
};

/**
 * Отримання даних з Google Sheets
 * @param {string} spreadsheetId - ID таблиці
 * @param {string} range - Діапазон для читання (наприклад, 'A1:Z1000')
 * @returns {Promise<Array>} Дані таблиці
 */
const getSheetData = async (spreadsheetId, range = 'A1:AJ17') => {
  try {
    console.log(`Отримання даних з таблиці ${spreadsheetId}, діапазон: ${range}`);
    
    const sheets = await createSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });

    console.log(`Отримано ${response.data.values?.length || 0} рядків даних з діапазону: ${range}`);
    return response.data.values || [];
  } catch (error) {
    console.error('Помилка при отриманні даних з Google Sheets:', error);
    console.error('Запитуваний діапазон:', range);
    
    if (error.code === 404) {
      throw new Error('Таблицю не знайдено або немає доступу до неї');
    } else if (error.code === 403) {
      throw new Error('Відсутні права доступу до таблиці');
    } else if (error.code === 400) {
      throw new Error(`Неправильний діапазон "${range}" або ID таблиці. Перевірте назву аркуша.`);
    }
    
    throw new Error(`Не вдається отримати дані з таблиці: ${error.message}`);
  }
};

/**
 * Отримання метаданих таблиці
 * @param {string} spreadsheetId - ID таблиці
 * @returns {Promise<Object>} Метадані таблиці
 */
const getSheetMetadata = async (spreadsheetId) => {
  try {
    console.log(`Отримання метаданих для таблиці ${spreadsheetId}`);
    
    const sheets = await createSheetsClient();
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties,sheets(properties(sheetId,title,index,sheetType,gridProperties,hidden))',
      includeGridData: false
    });

    console.log(`Отримано метадані для таблиці "${response.data.properties?.title}"`);
    console.log(`Кількість аркушів: ${response.data.sheets?.length || 0}`);

    // Додаткова перевірка структури даних
    if (!response.data.sheets || response.data.sheets.length === 0) {
      console.warn('Не знайдено жодного аркуша в таблиці');
    }

    return response.data;
  } catch (error) {
    console.error('Помилка при отриманні метаданих таблиці:', error);
    
    if (error.code === 404) {
      throw new Error('Таблицю не знайдено або немає доступу до неї');
    } else if (error.code === 403) {
      throw new Error('Відсутні права доступу до таблиці');
    } else if (error.code === 400) {
      throw new Error('Неправильний ID таблиці');
    }
    
    throw new Error(`Не вдається отримати метадані таблиці: ${error.message}`);
  }
};

/**
 * Отримання списку всіх аркушів
 * @param {string} spreadsheetId - ID таблиці
 * @returns {Promise<Array>} Список аркушів
 */
const getSheetsList = async (spreadsheetId) => {
  try {
    const metadata = await getSheetMetadata(spreadsheetId);
    
    return metadata.sheets?.map(sheet => ({
      title: sheet.properties?.title || 'Без назви',
      sheetId: sheet.properties?.sheetId,
      index: sheet.properties?.index || 0,
      sheetType: sheet.properties?.sheetType || 'GRID',
      hidden: sheet.properties?.hidden || false,
      gridProperties: {
        rowCount: sheet.properties?.gridProperties?.rowCount || 1000,
        columnCount: sheet.properties?.gridProperties?.columnCount || 26,
        frozenRowCount: sheet.properties?.gridProperties?.frozenRowCount || 0,
        frozenColumnCount: sheet.properties?.gridProperties?.frozenColumnCount || 0
      }
    })) || [];
  } catch (error) {
    console.error('Помилка при отриманні списку аркушів:', error);
    throw error;
  }
};

/**
 * Перевірка доступу до таблиці
 * @param {string} spreadsheetId - ID таблиці
 * @returns {Promise<boolean>} Чи є доступ до таблиці
 */
const checkSheetAccess = async (spreadsheetId) => {
  try {
    await getSheetMetadata(spreadsheetId);
    return true;
  } catch (error) {
    console.error(`Немає доступу до таблиці ${spreadsheetId}:`, error.message);
    return false;
  }
};

/**
 * Надання доступу service account до таблиці
 * @param {string} spreadsheetId - ID таблиці
 * @param {string} serviceAccountEmail - Email service account
 */
const shareSheetWithServiceAccount = async (spreadsheetId, serviceAccountEmail) => {
  try {
    const authClient = await createAuthClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: 'reader',
        type: 'user',
        emailAddress: serviceAccountEmail
      }
    });

    console.log(`Доступ надано service account ${serviceAccountEmail} до таблиці ${spreadsheetId}`);
  } catch (error) {
    console.error('Помилка при наданні доступу:', error);
    throw error;
  }
};

/**
 * Отримання інформації про конкретний аркуш
 * @param {string} spreadsheetId - ID таблиці
 * @param {string} sheetName - Назва аркуша
 * @returns {Promise<Object|null>} Інформація про аркуш
 */
const getSheetInfo = async (spreadsheetId, sheetName) => {
  try {
    const sheets = await getSheetsList(spreadsheetId);
    return sheets.find(sheet => sheet.title === sheetName) || null;
  } catch (error) {
    console.error(`Помилка при отриманні інформації про аркуш "${sheetName}":`, error);
    throw error;
  }
};

/**
 * Перевірка існування аркуша з вказаною назвою
 * @param {string} spreadsheetId - ID таблиці
 * @param {string} sheetName - Назва аркуша
 * @returns {Promise<boolean>} Чи існує аркуш
 */
const doesSheetExist = async (spreadsheetId, sheetName) => {
  try {
    const sheetsList = await getSheetsList(spreadsheetId);
    return sheetsList.some(sheet => sheet.title === sheetName);
  } catch (error) {
    console.error(`Помилка при перевірці існування аркуша "${sheetName}":`, error);
    return false;
  }
};

/**
 * Отримання даних з конкретного аркуша
 * @param {string} spreadsheetId - ID таблиці
 * @param {string} sheetName - Назва аркуша
 * @param {string} range - Діапазон (без назви аркуша, наприклад 'A1:Z100')
 * @returns {Promise<Array>} Дані аркуша
 */
const getSheetDataByName = async (spreadsheetId, sheetName, range = 'A1:AJ17') => {
  try {
    // Перевіряємо чи існує аркуш
    const exists = await doesSheetExist(spreadsheetId, sheetName);
    if (!exists) {
      throw new Error(`Аркуш "${sheetName}" не знайдено в таблиці`);
    }

    // Формуємо правильний діапазон з екранованою назвою аркуша
    const escapedSheetName = escapeSheetName(sheetName);
    const fullRange = `${escapedSheetName}!${range}`;
    
    console.log(`Запит даних з аркуша: ${sheetName}, повний діапазон: ${fullRange}`);
    
    return await getSheetData(spreadsheetId, fullRange);
  } catch (error) {
    console.error(`Помилка при отриманні даних з аркуша "${sheetName}":`, error);
    throw error;
  }
};

module.exports = {
  createAuthClient,
  createSheetsClient,
  getSheetData,
  getSheetDataByName,
  getSheetMetadata,
  getSheetsList,
  getSheetInfo,
  checkSheetAccess,
  shareSheetWithServiceAccount,
  escapeSheetName,
  doesSheetExist
};