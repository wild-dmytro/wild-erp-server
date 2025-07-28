// server/services/telegram.service.js
const axios = require('axios');
const telegramModel = require('../models/telegram.model');

class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN не знайдено в змінних оточення');
    }
  }

  /**
   * Відправити повідомлення одному користувачу
   * @param {string|number} chatId - Telegram chat ID
   * @param {string} message - Текст повідомлення
   * @returns {Promise<Object>} Результат відправки
   */
  async sendMessage(chatId, message) {
    try {
      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }, {
        timeout: 30000
      });
      
      return {
        success: true,
        data: response.data
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.description || error.message
      };
    }
  }

  /**
   * Виконати розсилку повідомлень
   * @param {number} broadcastId - ID розсилки
   * @returns {Promise<Object>} Результат виконання розсилки
   */
  async executeBroadcast(broadcastId) {
    try {
      // Оновити статус розсилки на "in_progress"
      await telegramModel.updateBroadcastStatus(broadcastId, 'in_progress');
      
      // Отримати дані розсилки
      const broadcast = await telegramModel.getBroadcastById(broadcastId);
      if (!broadcast) {
        throw new Error('Розсилку не знайдено');
      }
      
      // Отримати список отримувачів для відправки
      const details = await telegramModel.getBroadcastDetailsForExecution(broadcastId);
      
      let successCount = 0;
      let failCount = 0;
      
      console.log(`Починаємо розсилку ${broadcastId} для ${details.length} отримувачів`);
      
      // Відправити повідомлення кожному отримувачу
      for (const detail of details) {
        try {
          const result = await this.sendMessage(detail.telegram_id, broadcast.message);
          
          if (result.success) {
            await telegramModel.updateBroadcastDetail(detail.detail_id, 'sent');
            successCount++;
            console.log(`✓ Повідомлення відправлено користувачу ${detail.telegram_id}`);
          } else {
            await telegramModel.updateBroadcastDetail(detail.detail_id, 'failed', result.error);
            failCount++;
            console.log(`✗ Помилка відправки користувачу ${detail.telegram_id}: ${result.error}`);
          }
          
        } catch (error) {
          await telegramModel.updateBroadcastDetail(detail.detail_id, 'failed', error.message);
          failCount++;
          console.log(`✗ Виняток при відправці користувачу ${detail.telegram_id}: ${error.message}`);
        }
        
        // Затримка між повідомленнями (щоб не перевищити ліміти Telegram)
        await this.delay(100);
      }
      
      // Оновити результати розсилки
      await telegramModel.updateBroadcastStatus(broadcastId, 'completed', {
        successful_sends: successCount,
        failed_sends: failCount
      });
      
      console.log(`Розсилку ${broadcastId} завершено. Успішно: ${successCount}, Помилки: ${failCount}`);
      
      return {
        broadcastId,
        totalSent: successCount,
        totalFailed: failCount,
        totalRecipients: details.length
      };
      
    } catch (error) {
      // Позначити розсилку як невдалу
      await telegramModel.updateBroadcastStatus(broadcastId, 'failed');
      console.error(`Помилка виконання розсилки ${broadcastId}:`, error);
      throw error;
    }
  }

  /**
   * Затримка виконання
   * @param {number} ms - Мілісекунди затримки
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Перевірити валідність Telegram ID
   * @param {string|number} telegramId - Telegram ID
   * @returns {boolean} Чи валідний ID
   */
  isValidTelegramId(telegramId) {
    const id = parseInt(telegramId);
    return !isNaN(id) && id > 0;
  }

  /**
   * Отримати інформацію про бота
   * @returns {Promise<Object>} Інформація про бота
   */
  async getBotInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      return {
        success: true,
        data: response.data.result
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.description || error.message
      };
    }
  }

  /**
   * Тестова відправка повідомлення
   * @param {string|number} chatId - Telegram chat ID
   * @param {string} message - Текст повідомлення
   * @returns {Promise<Object>} Результат тесту
   */
  async testMessage(chatId, message = 'Тестове повідомлення від ERP системи') {
    if (!this.isValidTelegramId(chatId)) {
      return {
        success: false,
        error: 'Невалідний Telegram ID'
      };
    }

    return await this.sendMessage(chatId, message);
  }
}

module.exports = new TelegramService();