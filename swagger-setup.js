/**
 * Простий setup для Swagger документації
 * Використовує автоматично згенерований swagger.json
 */

const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');

let swaggerDocument = {};

// Завантажуємо згенерований swagger.json якщо він існує
const swaggerPath = path.join(__dirname, 'swagger.json');

if (fs.existsSync(swaggerPath)) {
  try {
    swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));
    console.log('✅ Swagger документація завантажена з swagger.json');
  } catch (error) {
    console.error('❌ Помилка завантаження swagger.json:', error.message);
    console.log('💡 Запустіть: npm run swagger-autogen для генерації документації');
  }
} else {
  console.log('📄 swagger.json не знайдено');
  console.log('💡 Запустіть: npm run swagger-autogen для генерації документації');
  
  // Базова конфігурація якщо файл не існує
  swaggerDocument = {
    openapi: '3.0.0',
    info: {
      title: 'Finance Management System API',
      version: '1.0.0',
      description: 'Документація REST API для системи управління фінансами'
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Локальний сервер розробки'
      }
    ],
    paths: {
      '/': {
        get: {
          summary: 'Головна сторінка API',
          responses: {
            '200': {
              description: 'Успішна відповідь'
            }
          }
        }
      }
    }
  };
}

// Опції для swagger-ui
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    docExpansion: 'none',
    filter: true,
    showRequestDuration: true,
    syntaxHighlight: {
      activate: true,
      theme: 'monokai'
    },
    tryItOutEnabled: true
  },
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6; font-size: 2rem; }
    .swagger-ui .info .description { font-size: 1.1rem; margin: 20px 0; }
    .swagger-ui .scheme-container { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
  `,
  customSiteTitle: 'Finance Management API Documentation',
  customfavIcon: '/favicon.ico'
};

module.exports = {
  swaggerDocument,
  swaggerUi,
  swaggerOptions,
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(swaggerDocument, swaggerOptions)
};