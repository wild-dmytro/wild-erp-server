// server/controllers/sheets.controller.js
const { 
  getSheetData, 
  getSheetDataByName,
  getSheetMetadata, 
  getSheetsList,
  getSheetInfo,
  checkSheetAccess,
  doesSheetExist,
  escapeSheetName
} = require('../config/googleSheets');
const { getUserById } = require('../models/user.model');
const ExcelJS = require('exceljs');

/**
 * Отримання даних Google Sheets для користувача
 * @route GET /api/sheets/user/:id
 */
const getUserSheetData = async (req, res) => {
  try {
    const { id } = req.params;
    const { range, sheet } = req.query;

    console.log(`Запит даних для користувача ${id}, аркуш: "${sheet}", діапазон: "${range}"`);

    // Отримуємо користувача з базі даних
    const user = await getUserById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    if (!user.table_id) {
      return res.status(404).json({
        success: false,
        message: 'У користувача немає прив\'язаної таблиці'
      });
    }

    // Перевіряємо доступ до таблиці
    const hasAccess = await checkSheetAccess(user.table_id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Немає доступу до таблиці користувача'
      });
    }

    let sheetData;
    let metadata;

    // Отримуємо дані залежно від того, чи вказано конкретний аркуш
    if (sheet) {
      console.log(`Запит даних з конкретного аркуша: "${sheet}"`);
      
      // Перевіряємо чи існує аркуш
      const sheetExists = await doesSheetExist(user.table_id, sheet);
      if (!sheetExists) {
        return res.status(404).json({
          success: false,
          message: `Аркуш "${sheet}" не знайдено в таблиці`
        });
      }

      // Отримуємо дані з конкретного аркуша
      const dataRange = range || 'A1:AJ17';
      [sheetData, metadata] = await Promise.all([
        getSheetDataByName(user.table_id, sheet, dataRange),
        getSheetMetadata(user.table_id)
      ]);
    } else {
      console.log('Запит даних з першого аркуша (за замовчуванням)');
      
      // Формуємо діапазон для читання з першого аркуша
      const rangeToRead = range || 'A1:AJ17';
      
      [sheetData, metadata] = await Promise.all([
        getSheetData(user.table_id, rangeToRead),
        getSheetMetadata(user.table_id)
      ]);
    }

    // Обробляємо дані для відправки
    const processedData = {
      headers: sheetData[0] || [],
      rows: sheetData.slice(1) || [],
      totalRows: sheetData.length - 1,
      totalColumns: sheetData[0] ? sheetData[0].length : 0,
      requestedSheet: sheet || null,
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name
      },
      sheet: {
        title: metadata.properties?.title || 'Без назви',
        spreadsheetId: user.table_id,
        sheets: metadata.sheets?.map(sheet => ({
          title: sheet.properties?.title || 'Без назви',
          sheetId: sheet.properties?.sheetId,
          index: sheet.properties?.index || 0,
          hidden: sheet.properties?.hidden || false,
          gridProperties: {
            rowCount: sheet.properties?.gridProperties?.rowCount || 1000,
            columnCount: sheet.properties?.gridProperties?.columnCount || 26,
            frozenRowCount: sheet.properties?.gridProperties?.frozenRowCount || 0,
            frozenColumnCount: sheet.properties?.gridProperties?.frozenColumnCount || 0
          }
        })) || []
      }
    };

    res.json({
      success: true,
      data: processedData
    });

  } catch (error) {
    console.error('Помилка при отриманні даних таблиці:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні даних таблиці',
      error: error.message
    });
  }
};

/**
 * Отримання списку аркушів таблиці користувача
 * @route GET /api/sheets/user/:id/sheets
 */
const getUserSheetsList = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Запит списку аркушів для користувача ${id}`);

    // Отримуємо користувача
    const user = await getUserById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    if (!user.table_id) {
      return res.status(404).json({
        success: false,
        message: 'У користувача немає прив\'язаної таблиці'
      });
    }

    // Перевіряємо доступ до таблиці
    const hasAccess = await checkSheetAccess(user.table_id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Немає доступу до таблиці користувача'
      });
    }

    // Отримуємо список аркушів та метадані
    const [sheetsList, metadata] = await Promise.all([
      getSheetsList(user.table_id),
      getSheetMetadata(user.table_id)
    ]);

    res.json({
      success: true,
      data: {
        spreadsheetId: user.table_id,
        title: metadata.properties?.title || 'Без назви',
        sheetsCount: sheetsList.length,
        sheets: sheetsList
      }
    });

  } catch (error) {
    console.error('Помилка при отриманні списку аркушів:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні списку аркушів',
      error: error.message
    });
  }
};

/**
 * Отримання інформації про конкретний аркуш
 * @route GET /api/sheets/user/:id/sheet/:sheetName
 */
const getUserSheetInfo = async (req, res) => {
  try {
    const { id, sheetName } = req.params;

    console.log(`Запит інформації про аркуш "${sheetName}" для користувача ${id}`);

    // Отримуємо користувача
    const user = await getUserById(id);
    
    if (!user || !user.table_id) {
      return res.status(404).json({
        success: false,
        message: 'Користувача або таблицю не знайдено'
      });
    }

    // Отримуємо інформацію про аркуш
    const sheetInfo = await getSheetInfo(user.table_id, sheetName);

    if (!sheetInfo) {
      return res.status(404).json({
        success: false,
        message: `Аркуш "${sheetName}" не знайдено`
      });
    }

    res.json({
      success: true,
      data: sheetInfo
    });

  } catch (error) {
    console.error('Помилка при отриманні інформації про аркуш:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні інформації про аркуш',
      error: error.message
    });
  }
};

/**
 * Отримання конкретного діапазону даних
 * @route POST /api/sheets/user/:id/range
 */
const getUserSheetRange = async (req, res) => {
  try {
    const { id } = req.params;
    const { range, sheet } = req.body;

    if (!range) {
      return res.status(400).json({
        success: false,
        message: 'Діапазон не вказано'
      });
    }

    console.log(`Запит діапазону для користувача ${id}, аркуш: "${sheet}", діапазон: "${range}"`);

    // Отримуємо користувача
    const user = await getUserById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    if (!user.table_id) {
      return res.status(404).json({
        success: false,
        message: 'У користувача немає прив\'язаної таблиці'
      });
    }

    let sheetData;
    let fullRange;

    if (sheet) {
      // Перевіряємо чи існує аркуш
      const sheetExists = await doesSheetExist(user.table_id, sheet);
      if (!sheetExists) {
        return res.status(404).json({
          success: false,
          message: `Аркуш "${sheet}" не знайдено в таблиці`
        });
      }

      // Отримуємо дані з конкретного аркуша
      sheetData = await getSheetDataByName(user.table_id, sheet, range);
      fullRange = `${escapeSheetName(sheet)}!${range}`;
    } else {
      // Отримуємо дані з першого аркуша
      sheetData = await getSheetData(user.table_id, range);
      fullRange = range;
    }

    res.json({
      success: true,
      data: {
        range: fullRange,
        requestedSheet: sheet || null,
        rowCount: sheetData.length,
        columnCount: sheetData.length > 0 ? sheetData[0].length : 0,
        values: sheetData
      }
    });

  } catch (error) {
    console.error('Помилка при отриманні діапазону даних:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка при отриманні діапазону даних',
      error: error.message
    });
  }
};

/**
 * Експорт даних таблиці в різних форматах
 * @route GET /api/sheets/user/:id/export
 */
const exportUserSheetData = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'csv', sheet, range } = req.query;

    console.log(`Експорт для користувача ${id}, формат: ${format}, аркуш: "${sheet}", діапазон: "${range}"`);

    // Отримуємо користувача
    const user = await getUserById(id);
    
    if (!user || !user.table_id) {
      return res.status(404).json({
        success: false,
        message: 'Користувача або таблицю не знайдено'
      });
    }

    let sheetData;
    let metadata;

    if (sheet) {
      // Перевіряємо чи існує аркуш
      const sheetExists = await doesSheetExist(user.table_id, sheet);
      if (!sheetExists) {
        return res.status(404).json({
          success: false,
          message: `Аркуш "${sheet}" не знайдено в таблиці`
        });
      }

      // Отримуємо дані з конкретного аркуша
      const dataRange = range || 'A1:AJ17';
      [sheetData, metadata] = await Promise.all([
        getSheetDataByName(user.table_id, sheet, dataRange),
        getSheetMetadata(user.table_id)
      ]);
    } else {
      // Отримуємо дані з першого аркуша
      const rangeToRead = range || 'A1:AJ17';
      [sheetData, metadata] = await Promise.all([
        getSheetData(user.table_id, rangeToRead),
        getSheetMetadata(user.table_id)
      ]);
    }

    const sheetNameForFile = sheet || 'sheet';
    const filename = `${user.username}_${metadata.properties?.title || 'table'}_${sheetNameForFile}`;

    switch (format.toLowerCase()) {
      case 'csv':
        const csvContent = sheetData.map(row => 
          row.map(cell => {
            const cellValue = cell || '';
            return cellValue.toString().includes(',') || cellValue.toString().includes('"')
              ? `"${cellValue.toString().replace(/"/g, '""')}"`
              : cellValue.toString();
          }).join(',')
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send('\uFEFF' + csvContent); // Додаємо BOM для правильного відображення UTF-8
        break;

      case 'json':
        const headers = sheetData[0] || [];
        const jsonData = sheetData.slice(1).map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header || `column_${index + 1}`] = row[index] || '';
          });
          return obj;
        });

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json({
          metadata: {
            title: metadata.properties?.title,
            sheet: sheet || 'Перший аркуш',
            exported_at: new Date().toISOString(),
            user: user.username,
            total_rows: jsonData.length
          },
          data: jsonData
        });
        break;

      case 'xlsx':
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheet || 'Sheet1');

        // Додаємо дані
        if (sheetData.length > 0) {
          worksheet.addRows(sheetData);
          
          // Стилізуємо заголовки
          const headerRow = worksheet.getRow(1);
          headerRow.font = { bold: true };
          headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
          };
          
          // Автоширина стовпців
          worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
              const columnLength = cell.value ? cell.value.toString().length : 10;
              if (columnLength > maxLength) {
                maxLength = columnLength;
              }
            });
            column.width = Math.min(maxLength + 2, 50);
          });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
        
        await workbook.xlsx.write(res);
        res.end();
        break;

      default:
        res.status(400).json({
          success: false,
          message: 'Непідтримуваний формат. Доступні: csv, json, xlsx'
        });
    }

  } catch (error) {
    console.error('Помилка експорту:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка експорту даних',
      error: error.message
    });
  }
};

/**
 * Пошук в таблиці користувача
 * @route POST /api/sheets/user/:id/search
 */
const searchInUserSheet = async (req, res) => {
  try {
    const { id } = req.params;
    const { query, sheet, caseSensitive = false, exactMatch = false } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Пошуковий запит не може бути порожнім'
      });
    }

    console.log(`Пошук для користувача ${id}, запит: "${query}", аркуш: "${sheet}"`);

    // Отримуємо користувача
    const user = await getUserById(id);
    
    if (!user || !user.table_id) {
      return res.status(404).json({
        success: false,
        message: 'Користувача або таблицю не знайдено'
      });
    }

    let sheetData;

    if (sheet) {
      // Перевіряємо чи існує аркуш
      const sheetExists = await doesSheetExist(user.table_id, sheet);
      if (!sheetExists) {
        return res.status(404).json({
          success: false,
          message: `Аркуш "${sheet}" не знайдено в таблиці`
        });
      }

      // Отримуємо дані з конкретного аркуша
      sheetData = await getSheetDataByName(user.table_id, sheet, 'A1:AJ17');
    } else {
      // Отримуємо дані з першого аркуша
      sheetData = await getSheetData(user.table_id, 'A1:AJ17');
    }

    const searchQuery = caseSensitive ? query.trim() : query.trim().toLowerCase();
    const results = [];

    sheetData.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        if (cell) {
          const cellValue = caseSensitive ? cell.toString() : cell.toString().toLowerCase();
          const matches = exactMatch 
            ? cellValue === searchQuery
            : cellValue.includes(searchQuery);

          if (matches) {
            results.push({
              row: rowIndex + 1,
              column: cellIndex + 1,
              columnName: sheetData[0] ? sheetData[0][cellIndex] : `Column ${cellIndex + 1}`,
              value: cell.toString(),
              context: row.slice(0, 5) // Показуємо перші 5 стовпців для контексту
            });
          }
        }
      });
    });

    res.json({
      success: true,
      data: {
        query: query.trim(),
        searchedSheet: sheet || 'Перший аркуш',
        totalResults: results.length,
        results: results.slice(0, 100), // Обмежуємо до 100 результатів
        hasMoreResults: results.length > 100
      }
    });

  } catch (error) {
    console.error('Помилка пошуку:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка пошуку',
      error: error.message
    });
  }
};

/**
 * Отримання статистики таблиці
 * @route GET /api/sheets/user/:id/stats
 */
const getUserSheetStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { sheet } = req.query;

    console.log(`Статистика для користувача ${id}, аркуш: "${sheet}"`);

    // Отримуємо користувача
    const user = await getUserById(id);
    
    if (!user || !user.table_id) {
      return res.status(404).json({
        success: false,
        message: 'Користувача або таблицю не знайдено'
      });
    }

    let sheetData;
    let metadata;
    let sheetsList;

    if (sheet) {
      // Перевіряємо чи існує аркуш
      const sheetExists = await doesSheetExist(user.table_id, sheet);
      if (!sheetExists) {
        return res.status(404).json({
          success: false,
          message: `Аркуш "${sheet}" не знайдено в таблиці`
        });
      }

      // Отримуємо дані з конкретного аркуша
      [sheetData, metadata, sheetsList] = await Promise.all([
        getSheetDataByName(user.table_id, sheet, 'A1:AJ17'),
        getSheetMetadata(user.table_id),
        getSheetsList(user.table_id)
      ]);
    } else {
      // Отримуємо дані з першого аркуша
      [sheetData, metadata, sheetsList] = await Promise.all([
        getSheetData(user.table_id, 'A1:AJ17'),
        getSheetMetadata(user.table_id),
        getSheetsList(user.table_id)
      ]);
    }

    const headers = sheetData[0] || [];
    const rows = sheetData.slice(1);

    // Обчислюємо статистику
    const stats = {
      general: {
        title: metadata.properties?.title || 'Без назви',
        analyzedSheet: sheet || 'Перший аркуш',
        totalSheets: sheetsList.length,
        totalRows: rows.length,
        totalColumns: headers.length,
        nonEmptyRows: rows.filter(row => row.some(cell => cell && cell.toString().trim() !== '')).length,
        lastUpdated: metadata.properties?.lastEditedTime || null
      },
      columns: headers.map((header, index) => {
        const columnData = rows.map(row => row[index]).filter(cell => cell !== undefined && cell !== null && cell !== '');
        const numbers = columnData.filter(cell => !isNaN(parseFloat(cell))).map(cell => parseFloat(cell));
        
        return {
          name: header || `Column ${index + 1}`,
          index: index + 1,
          totalValues: columnData.length,
          emptyValues: rows.length - columnData.length,
          uniqueValues: new Set(columnData).size,
          dataTypes: {
            numbers: numbers.length,
            text: columnData.length - numbers.length
          },
          statistics: numbers.length > 0 ? {
            min: Math.min(...numbers),
            max: Math.max(...numbers),
            avg: Math.round((numbers.reduce((sum, num) => sum + num, 0) / numbers.length) * 100) / 100,
            sum: numbers.reduce((sum, num) => sum + num, 0)
          } : null
        };
      }),
      sheets: sheetsList
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Помилка отримання статистики:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання статистики',
      error: error.message
    });
  }
};

module.exports = {
  getUserSheetData,
  getUserSheetsList,
  getUserSheetInfo,
  getUserSheetRange,
  exportUserSheetData,
  searchInUserSheet,
  getUserSheetStats
};