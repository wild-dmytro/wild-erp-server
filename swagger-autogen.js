/**
 * Автоматична генерація Swagger документації
 * Оновлено відповідно до повної DB SCHEMA
 */

const swaggerAutogen = require('swagger-autogen')();

// Конфігурація документації
const doc = {
  info: {
    title: 'Finance Management System API',
    description: 'Документація REST API для системи управління фінансами та бізнес-розвитку',
    version: '1.0.0',
    contact: {
      name: 'API Support',
      email: 'support@company.com'
    }
  },
  host: 'localhost:5000',
  schemes: ['http', 'https'],
  consumes: ['application/json'],
  produces: ['application/json'],
  securityDefinitions: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT токен для автентифікації. Формат: Bearer {token}'
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'Операції з автентифікацією та авторизацією'
    },
    {
      name: 'Users',
      description: 'Управління користувачами системи'
    },
    {
      name: 'Departments',
      description: 'Управління відділами компанії'
    },
    {
      name: 'Teams',
      description: 'Управління командами в межах відділів'
    },
    {
      name: 'Requests',
      description: 'Управління заявками (витрати, поповнення агентів, зарплати)'
    },
    {
      name: 'Agents',
      description: 'Управління агентами та поповненнями'
    },
    {
      name: 'Salaries',
      description: 'Управління зарплатами та шаблонами зарплат'
    },
    {
      name: 'Reports',
      description: 'Звіти та статистика системи'
    },
    {
      name: 'Sheets',
      description: 'Інтеграція з Google Sheets'
    },
    {
      name: 'Telegram',
      description: 'Telegram розсилки та інтеграція'
    },
    {
      name: 'Partners',
      description: 'Управління партнерами (BizDev модуль)'
    },
    {
      name: 'Offers',
      description: 'Управління пропозиціями партнерів'
    },
    {
      name: 'Flows',
      description: 'Управління потоками трафіку'
    },
    {
      name: 'Brands',
      description: 'Управління брендами'
    },
    {
      name: 'Geos',
      description: 'Управління географічними регіонами'
    },
    {
      name: 'Payment Methods',
      description: 'Способи оплати'
    },
    {
      name: 'Traffic Sources',
      description: 'Джерела трафіку'
    },
    {
      name: 'Expense Types',
      description: 'Типи витрат по відділах'
    },
    {
      name: 'Investment Operations',
      description: 'Інвестиційні операції'
    }
  ],
  definitions: {
    // === CORE MODELS ===
    User: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        telegram_id: { type: 'integer', example: 123456789 },
        username: { type: 'string', example: 'john_doe' },
        first_name: { type: 'string', example: 'Іван' },
        last_name: { type: 'string', example: 'Петров' },
        role: { 
          type: 'string', 
          enum: ['user', 'teamlead', 'finance_manager', 'admin'],
          example: 'user' 
        },
        team_id: { type: 'integer', example: 1 },
        department_id: { type: 'integer', example: 1 },
        is_active: { type: 'boolean', example: true },
        table_id: { type: 'string', example: 'sheet_id_123' },
        position: { type: 'string', example: 'Розробник' },
        email: { type: 'string', example: 'ivan@company.com' },
        salary_wallet_address: { type: 'string', example: '0x1234...abcd' },
        salary_network: { 
          type: 'string', 
          enum: ['ethereum', 'polygon', 'binance', 'tron'],
          example: 'polygon' 
        },
        web_role: { type: 'string', example: 'developer' },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    Department: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Фінансовий відділ' },
        description: { type: 'string', example: 'Відділ управління фінансами' },
        type: { 
          type: 'string', 
          enum: ['finance', 'development', 'marketing', 'bizdev', 'admin'],
          example: 'finance' 
        },
        is_active: { type: 'boolean', example: true },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    Team: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Команда розробки' },
        department_id: { type: 'integer', example: 1 },
        additional_check: { type: 'boolean', example: false },
        additional_checker_id: { type: 'integer', example: 2 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    // === REQUEST MODELS ===
    Request: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        request_type: { 
          type: 'string', 
          enum: ['agent_refill', 'expenses', 'salary', 'investment'],
          example: 'expenses' 
        },
        user_id: { type: 'integer', example: 1 },
        teamlead_id: { type: 'integer', example: 2 },
        finance_manager_id: { type: 'integer', example: 3 },
        status: { 
          type: 'string', 
          enum: ['pending', 'approved_by_teamlead', 'approved_by_finance', 'completed', 'rejected_by_teamlead', 'rejected_by_finance', 'cancelled'],
          example: 'pending' 
        },
        team_id: { type: 'integer', example: 1 },
        department_id: { type: 'integer', example: 1 },
        additional_checker_id: { type: 'integer', example: 4 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    AgentRefillRequest: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        request_id: { type: 'integer', example: 1 },
        agent_id: { type: 'integer', example: 1 },
        server: { type: 'string', example: 'EU-Server-1' },
        amount: { type: 'number', format: 'decimal', example: 1000.50 },
        wallet_address: { type: 'string', example: '0x1234...abcd' },
        transaction_hash: { type: 'string', example: '0xabcd...1234' },
        fee: { type: 'number', example: 0.05 },
        network: { 
          type: 'string', 
          enum: ['ethereum', 'polygon', 'binance', 'tron'],
          example: 'polygon' 
        },
        token: { 
          type: 'string', 
          enum: ['USDT', 'USDC', 'ETH', 'BTC'],
          example: 'USDT' 
        },
        comment: { type: 'string', example: 'Поповнення для кампанії' },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    ExpenseRequest: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        request_id: { type: 'integer', example: 1 },
        purpose: { type: 'string', example: 'Закупівля обладнання' },
        seller_service: { type: 'string', example: 'TechStore LLC' },
        amount: { type: 'number', format: 'decimal', example: 1500.00 },
        network: { 
          type: 'string', 
          enum: ['ethereum', 'polygon', 'binance', 'tron'],
          example: 'ethereum' 
        },
        wallet_address: { type: 'string', example: '0x5678...efgh' },
        transaction_time: { type: 'string', example: '2024-01-15 15:30:00' },
        transaction_hash: { type: 'string', example: '0xefgh...5678' },
        expense_type_id: { type: 'integer', example: 1 },
        token: { 
          type: 'string', 
          enum: ['USDT', 'USDC', 'ETH', 'BTC'],
          example: 'USDC' 
        },
        comment: { type: 'string', example: 'Необхідне обладнання для офісу' },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    // === SALARY MODELS ===
    Salary: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        user_id: { type: 'integer', example: 1 },
        amount: { type: 'number', format: 'decimal', example: 25000.00 },
        month: { type: 'integer', minimum: 1, maximum: 12, example: 1 },
        year: { type: 'integer', example: 2024 },
        status: { 
          type: 'string', 
          enum: ['pending', 'approved', 'paid'],
          example: 'pending' 
        },
        approved_by: { type: 'integer', example: 2 },
        approved_at: { type: 'string', format: 'date-time', example: '2024-01-20T12:00:00Z' },
        paid_at: { type: 'string', format: 'date-time', example: '2024-01-25T09:00:00Z' },
        payment_transaction_hash: { type: 'string', example: '0x9999...8888' },
        payment_network: { 
          type: 'string', 
          enum: ['ethereum', 'polygon', 'binance', 'tron'],
          example: 'polygon' 
        },
        description: { type: 'string', example: 'Зарплата за січень 2024' },
        appeal: { type: 'string', example: 'Додаткова інформація' },
        finance_manager_id: { type: 'integer', example: 3 },
        payment_address: { type: 'string', example: '0xaaaa...bbbb' },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    SalaryTemplate: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        user_id: { type: 'integer', example: 1 },
        base_amount: { type: 'number', format: 'decimal', example: 20000.00 },
        is_active: { type: 'boolean', example: true },
        created_by: { type: 'integer', example: 2 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    // === AGENT MODELS ===
    Agent: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Agent Smith' },
        is_active: { type: 'boolean', example: true },
        fee: { type: 'number', example: 0.1 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    // === BIZDEV MODELS ===
    Partner: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'TechPartner LLC' },
        type: { 
          type: 'string', 
          enum: ['direct', 'affiliate', 'network'],
          example: 'direct' 
        },
        contact_telegram: { type: 'string', example: '@partner_manager' },
        contact_email: { type: 'string', example: 'contact@partner.com' },
        partner_link: { type: 'string', example: 'https://partner.tracking.link' },
        has_integration: { type: 'boolean', example: true },
        postback_type: { 
          type: 'string', 
          enum: ['none', 'server_to_server', 'pixel'],
          example: 'server_to_server' 
        },
        telegram_chat_link: { type: 'string', example: 'https://t.me/partner_chat' },
        description: { type: 'string', example: 'Надійний партнер з великим досвідом' },
        is_active: { type: 'boolean', example: true },
        created_by: { type: 'integer', example: 1 },
        kpi: { type: 'string', example: 'CPA $50, CR 2.5%' },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    Offer: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Finance App CPA' },
        partner_id: { type: 'integer', example: 1 },
        brand_id: { type: 'integer', example: 1 },
        conditions: { type: 'string', example: 'CPA $30 for deposit $100+' },
        kpi: { type: 'string', example: 'CR 3%, Quality 85%+' },
        description: { type: 'string', example: 'Фінансовий додаток для інвестицій' },
        is_active: { type: 'boolean', example: true },
        created_by: { type: 'integer', example: 1 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    Flow: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'FB Finance CPA' },
        offer_id: { type: 'integer', example: 1 },
        user_id: { type: 'integer', example: 1 },
        geo_id: { type: 'integer', example: 1 },
        team_id: { type: 'integer', example: 1 },
        partner_id: { type: 'integer', example: 1 },
        brand_id: { type: 'integer', example: 1 },
        traffic_source_id: { type: 'integer', example: 1 },
        status: { 
          type: 'string', 
          enum: ['active', 'paused', 'stopped'],
          example: 'active' 
        },
        budget_limit: { type: 'number', format: 'decimal', example: 5000.00 },
        daily_budget: { type: 'number', format: 'decimal', example: 200.00 },
        target_cpa: { type: 'number', format: 'decimal', example: 45.00 },
        actual_cpa: { type: 'number', format: 'decimal', example: 42.50 },
        conversion_rate: { type: 'number', format: 'decimal', example: 2.8 },
        notes: { type: 'string', example: 'Високоефективний потік' },
        created_by: { type: 'integer', example: 1 },
        updated_by: { type: 'integer', example: 1 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    Brand: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'TechBrand' },
        description: { type: 'string', example: 'Технологічний бренд' },
        is_active: { type: 'boolean', example: true },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    Geo: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'United States' },
        country_code: { type: 'string', example: 'US' },
        region: { type: 'string', example: 'North America' },
        is_active: { type: 'boolean', example: true },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    PaymentMethod: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Credit Card' },
        description: { type: 'string', example: 'Оплата кредитною картою' },
        is_active: { type: 'boolean', example: true },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    TrafficSource: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Facebook Ads' },
        description: { type: 'string', example: 'Реклама у Facebook' },
        is_active: { type: 'boolean', example: true },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    ExpenseType: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        name: { type: 'string', example: 'Офісне обладнання' },
        description: { type: 'string', example: 'Витрати на офісне обладнання' },
        department_id: { type: 'integer', example: 1 },
        is_active: { type: 'boolean', example: true },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    InvestmentOperation: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        title: { type: 'string', example: 'Інвестиція в стартап' },
        amount: { type: 'number', format: 'decimal', example: 50000.00 },
        currency: { 
          type: 'string', 
          enum: ['USD', 'EUR', 'BTC', 'ETH'],
          example: 'USD' 
        },
        operation_type: { 
          type: 'string', 
          enum: ['buy', 'sell', 'dividend', 'fee'],
          example: 'buy' 
        },
        operator: { 
          type: 'string', 
          enum: ['binance', 'kraken', 'coinbase', 'bank'],
          example: 'binance' 
        },
        description: { type: 'string', example: 'Інвестиція в перспективний стартап' },
        notes: { type: 'string', example: 'Додаткові нотатки' },
        additional_fees: { type: 'number', format: 'decimal', example: 100.00 },
        wallet_address: { type: 'string', example: '0xcccc...dddd' },
        created_by: { type: 'integer', example: 1 },
        updated_by: { type: 'integer', example: 1 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    // === TELEGRAM MODELS ===
    TelegramBroadcast: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        title: { type: 'string', example: 'Щомісячне повідомлення' },
        message: { type: 'string', example: 'Текст повідомлення для розсилки' },
        sender_id: { type: 'integer', example: 1 },
        target_type: { 
          type: 'string', 
          enum: ['all', 'department', 'team', 'specific_users'],
          example: 'department' 
        },
        target_departments: { 
          type: 'array', 
          items: { type: 'integer' },
          example: [1, 2] 
        },
        target_teams: { 
          type: 'array', 
          items: { type: 'integer' },
          example: [1, 3] 
        },
        target_users: { 
          type: 'array', 
          items: { type: 'integer' },
          example: [5, 7, 9] 
        },
        status: { 
          type: 'string', 
          enum: ['pending', 'in_progress', 'completed', 'failed'],
          example: 'pending' 
        },
        total_recipients: { type: 'integer', example: 50 },
        successful_sends: { type: 'integer', example: 48 },
        failed_sends: { type: 'integer', example: 2 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        started_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:35:00Z' },
        completed_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:40:00Z' }
      }
    },

    // === PAYOUT MODELS ===
    PartnerPayoutRequest: {
      type: 'object',
      properties: {
        id: { type: 'integer', example: 1 },
        partner_id: { type: 'integer', example: 1 },
        period_start: { type: 'string', format: 'date', example: '2024-01-01' },
        period_end: { type: 'string', format: 'date', example: '2024-01-31' },
        total_amount: { type: 'number', format: 'decimal', example: 15000.00 },
        currency: { 
          type: 'string', 
          enum: ['USD', 'EUR', 'BTC', 'ETH'],
          example: 'USD' 
        },
        status: { 
          type: 'string', 
          enum: ['draft', 'pending', 'approved', 'paid', 'rejected'],
          example: 'pending' 
        },
        description: { type: 'string', example: 'Виплата за січень 2024' },
        notes: { type: 'string', example: 'Додаткові нотатки' },
        wallet_address: { type: 'string', example: '0xeeee...ffff' },
        network: { 
          type: 'string', 
          enum: ['ethereum', 'polygon', 'binance', 'tron'],
          example: 'ethereum' 
        },
        team_id: { type: 'integer', example: 1 },
        created_by: { type: 'integer', example: 1 },
        approved_by: { type: 'integer', example: 2 },
        approved_at: { type: 'string', format: 'date-time', example: '2024-02-05T14:00:00Z' },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    // === STANDARD RESPONSES ===
    ApiResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Статус успішності запиту', example: true },
        message: { type: 'string', description: 'Повідомлення про результат', example: 'Операція виконана успішно' },
        data: { type: 'object', description: 'Дані відповіді' }
      }
    },

    ApiError: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Статус успішності запиту', example: false },
        message: { type: 'string', description: 'Повідомлення про помилку', example: 'Помилка валідації' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Поле з помилкою', example: 'name' },
              message: { type: 'string', description: 'Опис помилки', example: 'Назва є обов\'язковою' }
            }
          }
        }
      }
    },

    PaginationResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: { type: 'array', items: {} },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'integer', example: 1 },
            totalPages: { type: 'integer', example: 5 },
            totalItems: { type: 'integer', example: 50 },
            itemsPerPage: { type: 'integer', example: 10 },
            hasNextPage: { type: 'boolean', example: true },
            hasPrevPage: { type: 'boolean', example: false }
          }
        }
      }
    },

    // === STATISTICS MODELS ===
    DepartmentStats: {
      type: 'object',
      properties: {
        department_id: { type: 'integer', example: 1 },
        department_name: { type: 'string', example: 'IT Відділ' },
        total_users: { type: 'integer', example: 15 },
        active_users: { type: 'integer', example: 12 },
        total_requests: { type: 'integer', example: 45 },
        agent_refill_count: { type: 'integer', example: 20 },
        agent_refill_amount: { type: 'number', format: 'decimal', example: 25000.00 },
        expense_count: { type: 'integer', example: 25 },
        expense_amount: { type: 'number', format: 'decimal', example: 15000.00 },
        salary_count: { type: 'integer', example: 12 },
        salary_amount: { type: 'number', format: 'decimal', example: 240000.00 }
      }
    },

    FlowStats: {
      type: 'object',
      properties: {
        flow_id: { type: 'integer', example: 1 },
        user_id: { type: 'integer', example: 1 },
        date_from: { type: 'string', format: 'date', example: '2024-01-01' },
        date_to: { type: 'string', format: 'date', example: '2024-01-31' },
        clicks: { type: 'integer', example: 10000 },
        conversions: { type: 'integer', example: 250 },
        revenue: { type: 'number', format: 'decimal', example: 12500.00 },
        impressions: { type: 'integer', example: 100000 },
        leads: { type: 'integer', example: 500 },
        ctr: { type: 'number', format: 'decimal', example: 10.0 },
        cr: { type: 'number', format: 'decimal', example: 2.5 },
        created_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    },

    // === INPUT MODELS ===
    CreateUserInput: {
      type: 'object',
      required: ['telegram_id', 'username', 'first_name', 'last_name', 'role'],
      properties: {
        telegram_id: { type: 'integer', example: 123456789 },
        username: { type: 'string', example: 'john_doe' },
        first_name: { type: 'string', example: 'Іван' },
        last_name: { type: 'string', example: 'Петров' },
        role: { 
          type: 'string', 
          enum: ['user', 'teamlead', 'finance_manager', 'admin'],
          example: 'user' 
        },
        team_id: { type: 'integer', example: 1 },
        department_id: { type: 'integer', example: 1 },
        position: { type: 'string', example: 'Розробник' },
        email: { type: 'string', example: 'ivan@company.com' }
      }
    },

    CreateDepartmentInput: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Новий відділ' },
        description: { type: 'string', example: 'Опис нового відділу' },
        type: { 
          type: 'string', 
          enum: ['finance', 'development', 'marketing', 'bizdev', 'admin'],
          example: 'development' 
        }
      }
    },

    CreateRequestInput: {
      type: 'object',
      required: ['request_type'],
      properties: {
        request_type: { 
          type: 'string', 
          enum: ['agent_refill', 'expenses', 'salary', 'investment'],
          example: 'expenses' 
        }
      }
    },

    CreateAgentRefillInput: {
      type: 'object',
      required: ['agent_id', 'server', 'amount'],
      properties: {
        agent_id: { type: 'integer', example: 1 },
        server: { type: 'string', example: 'EU-Server-1' },
        amount: { type: 'number', format: 'decimal', example: 1000.00 },
        wallet_address: { type: 'string', example: '0x1234...abcd' },
        network: { 
          type: 'string', 
          enum: ['ethereum', 'polygon', 'binance', 'tron'],
          example: 'polygon' 
        },
        token: { 
          type: 'string', 
          enum: ['USDT', 'USDC', 'ETH', 'BTC'],
          example: 'USDT' 
        },
        comment: { type: 'string', example: 'Поповнення для кампанії' }
      }
    },

    CreateExpenseInput: {
      type: 'object',
      required: ['purpose', 'seller_service', 'amount', 'network', 'wallet_address'],
      properties: {
        purpose: { type: 'string', example: 'Закупівля обладнання' },
        seller_service: { type: 'string', example: 'TechStore LLC' },
        amount: { type: 'number', format: 'decimal', example: 1500.00 },
        network: { 
          type: 'string', 
          enum: ['ethereum', 'polygon', 'binance', 'tron'],
          example: 'ethereum' 
        },
        wallet_address: { type: 'string', example: '0x5678...efgh' },
        expense_type_id: { type: 'integer', example: 1 },
        token: { 
          type: 'string', 
          enum: ['USDT', 'USDC', 'ETH', 'BTC'],
          example: 'USDC' 
        },
        comment: { type: 'string', example: 'Необхідне обладнання' }
      }
    },

    CreatePartnerInput: {
      type: 'object',
      required: ['name', 'type'],
      properties: {
        name: { type: 'string', example: 'TechPartner LLC' },
        type: { 
          type: 'string', 
          enum: ['direct', 'affiliate', 'network'],
          example: 'direct' 
        },
        contact_telegram: { type: 'string', example: '@partner_manager' },
        contact_email: { type: 'string', example: 'contact@partner.com' },
        partner_link: { type: 'string', example: 'https://partner.tracking.link' },
        has_integration: { type: 'boolean', example: false },
        postback_type: { 
          type: 'string', 
          enum: ['none', 'server_to_server', 'pixel'],
          example: 'none' 
        },
        description: { type: 'string', example: 'Надійний партнер' },
        brands: { 
          type: 'array', 
          items: { type: 'integer' },
          example: [1, 2] 
        },
        geos: { 
          type: 'array', 
          items: { type: 'integer' },
          example: [1, 3, 5] 
        },
        payment_methods: { 
          type: 'array', 
          items: { type: 'integer' },
          example: [1, 2] 
        }
      }
    },

    CreateFlowInput: {
      type: 'object',
      required: ['name', 'offer_id'],
      properties: {
        name: { type: 'string', example: 'FB Finance CPA' },
        offer_id: { type: 'integer', example: 1 },
        geo_id: { type: 'integer', example: 1 },
        traffic_source_id: { type: 'integer', example: 1 },
        budget_limit: { type: 'number', format: 'decimal', example: 5000.00 },
        daily_budget: { type: 'number', format: 'decimal', example: 200.00 },
        target_cpa: { type: 'number', format: 'decimal', example: 45.00 },
        notes: { type: 'string', example: 'Новий потік для тестування' }
      }
    },

    // === AUTHENTICATION MODELS ===
    LoginInput: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string', example: 'admin' },
        password: { type: 'string', example: 'password123' }
      }
    },

    LoginResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Успішна авторизація' },
        data: {
          type: 'object',
          properties: {
            user: { $ref: '#/definitions/User' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            expiresIn: { type: 'string', example: '24h' }
          }
        }
      }
    },

    // === ENUM VALUES (для довідки) ===
    EnumValues: {
      type: 'object',
      properties: {
        user_roles: {
          type: 'array',
          items: { type: 'string' },
          example: ['user', 'teamlead', 'finance_manager', 'admin']
        },
        request_types: {
          type: 'array',
          items: { type: 'string' },
          example: ['agent_refill', 'expenses', 'salary', 'investment']
        },
        request_statuses: {
          type: 'array',
          items: { type: 'string' },
          example: ['pending', 'approved_by_teamlead', 'approved_by_finance', 'completed', 'rejected_by_teamlead', 'rejected_by_finance', 'cancelled']
        },
        salary_statuses: {
          type: 'array',
          items: { type: 'string' },
          example: ['pending', 'approved', 'paid']
        },
        networks: {
          type: 'array',
          items: { type: 'string' },
          example: ['ethereum', 'polygon', 'binance', 'tron']
        },
        tokens: {
          type: 'array',
          items: { type: 'string' },
          example: ['USDT', 'USDC', 'ETH', 'BTC']
        },
        partner_types: {
          type: 'array',
          items: { type: 'string' },
          example: ['direct', 'affiliate', 'network']
        },
        postback_types: {
          type: 'array',
          items: { type: 'string' },
          example: ['none', 'server_to_server', 'pixel']
        },
        department_types: {
          type: 'array',
          items: { type: 'string' },
          example: ['finance', 'development', 'marketing', 'bizdev', 'admin']
        },
        flow_statuses: {
          type: 'array',
          items: { type: 'string' },
          example: ['active', 'paused', 'stopped']
        },
        currencies: {
          type: 'array',
          items: { type: 'string' },
          example: ['USD', 'EUR', 'BTC', 'ETH']
        },
        investment_operations: {
          type: 'array',
          items: { type: 'string' },
          example: ['buy', 'sell', 'dividend', 'fee']
        },
        investment_operators: {
          type: 'array',
          items: { type: 'string' },
          example: ['binance', 'kraken', 'coinbase', 'bank']
        }
      }
    }
  }
};

// Файл для генерації документації
const outputFile = './swagger.json';

// Файли з маршрутами для аналізу (оновлений список)
const endpointsFiles = [
  './routes/auth.routes.js',
  './routes/users.routes.js',
  './routes/departments.routes.js',
  './routes/teams.routes.js',
  './routes/requests.routes.js',
  './routes/agents.routes.js',
  './routes/salaries.routes.js',
  './routes/reports.routes.js',
  './routes/sheets.routes.js',
  './routes/telegram.routes.js',
  './routes/expense.types.routes.js',
  './routes/investment.operations.routes.js',
  // BizDev модуль
  './routes/partners.routes.js',
  './routes/offers.routes.js',
  './routes/flows.routes.js',
  './routes/brands.routes.js',
  './routes/geos.routes.js',
  './routes/payment.methods.routes.js',
  './routes/traffic.sources.routes.js',
  './routes/partner.payment.routes.js',
  './routes/partner.payout.routes.js'
];

// Запуск генерації
swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  console.log('✅ Swagger документація згенерована успішно!');
  console.log('📄 Файл збережено як: swagger.json');
  console.log('📊 Включено моделі:');
  console.log('   • Core: Users, Departments, Teams, Requests');
  console.log('   • Finance: Salaries, Agents, Expenses, Investments');
  console.log('   • BizDev: Partners, Offers, Flows, Brands, Geos');
  console.log('   • Communication: Telegram, Reports, Sheets');
  console.log('   • Support: Payment Methods, Traffic Sources, Expense Types');
  console.log('🌐 Документація буде доступна за адресою: http://localhost:5000/api-docs');
  console.log('📋 JSON специфікація: http://localhost:5000/api-docs.json');
  console.log('🔐 Для доступу використовуйте логін/пароль з .env файлу');
});