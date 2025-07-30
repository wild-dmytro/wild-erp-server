/**
 * Простий Basic Auth middleware для Swagger документації
 * Використовує логін і пароль з .env файлу
 */

/**
 * Basic Auth middleware для захисту Swagger документації
 */
const swaggerAuth = (req, res, next) => {
  // Отримуємо облікові дані з .env
  const SWAGGER_USERNAME = process.env.SWAGGER_USERNAME || 'admin';
  const SWAGGER_PASSWORD = process.env.SWAGGER_PASSWORD || 'admin123';
  
  // Отримуємо заголовок Authorization
  const authHeader = req.get('Authorization');
  
  // Перевіряємо чи є заголовок і чи починається з 'Basic '
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return requestBasicAuth(res);
  }
  
  try {
    // Декодуємо base64 облікові дані
    const base64Credentials = authHeader.slice(6); // Видаляємо 'Basic '
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    
    // Перевіряємо облікові дані
    if (username === SWAGGER_USERNAME && password === SWAGGER_PASSWORD) {
      console.log(`✅ Успішний вхід до Swagger: ${username} в ${new Date().toISOString()}`);
      return next();
    }
    
    console.log(`❌ Невдала спроба входу до Swagger: ${username} в ${new Date().toISOString()}`);
    return requestBasicAuth(res);
    
  } catch (error) {
    console.error('Помилка авторизації Swagger:', error);
    return requestBasicAuth(res);
  }
};

/**
 * Функція для запиту базової авторизації
 */
const requestBasicAuth = (res) => {
  res.set({
    'WWW-Authenticate': 'Basic realm="Swagger API Documentation"',
    'Content-Type': 'application/json'
  });
  
  res.status(401).json({
    success: false,
    message: 'Для доступу до документації потрібна авторизація',
    hint: 'Введіть логін і пароль'
  });
};

/**
 * Middleware для JSON endpoint (може мати ті ж правила або бути публічним)
 */
const swaggerJsonAuth = (req, res, next) => {
  // Якщо JSON endpoint має бути публічним
  if (process.env.SWAGGER_JSON_PUBLIC === 'true') {
    return next();
  }
  
  // Інакше використовуємо ту ж авторизацію
  return swaggerAuth(req, res, next);
};

module.exports = {
  swaggerAuth,
  swaggerJsonAuth
};