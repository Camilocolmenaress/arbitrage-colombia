require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');

let bot = null;

function getBot() {
  if (!bot) {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

async function sendAlert(message) {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  try {
    await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown' });
    logger.info('Telegram alert sent', { chatId, length: message.length });
  } catch (err) {
    logger.error('Telegram sendAlert failed', { chatId, error: err.message });
    throw err;
  }
}

module.exports = { sendAlert };
