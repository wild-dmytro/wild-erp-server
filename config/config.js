const dotenv = require("dotenv");

dotenv.config();

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

module.exports = {
  TELEGRAM_API_URL
};
