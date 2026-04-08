const mockSendMessage = jest.fn().mockResolvedValue({ message_id: 42 });

jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage
  }));
});

jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('telegram', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';
    process.env.TELEGRAM_CHAT_ID = '-100999888777';
  });

  test('sendAlert calls sendMessage with correct chat ID and text', async () => {
    const { sendAlert } = require('../../shared/telegram');
    await sendAlert('*GAP ENCONTRADO*: Zapatos\nGap: 45%');

    expect(mockSendMessage).toHaveBeenCalledWith(
      '-100999888777',
      '*GAP ENCONTRADO*: Zapatos\nGap: 45%',
      { parse_mode: 'Markdown' }
    );
  });

  test('sendAlert logs success after sending', async () => {
    const logger = require('../../shared/logger');
    const { sendAlert } = require('../../shared/telegram');
    await sendAlert('Test alert');

    expect(logger.info).toHaveBeenCalledWith(
      'Telegram alert sent',
      expect.objectContaining({ chatId: '-100999888777' })
    );
  });

  test('sendAlert throws and logs on Telegram API error', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Telegram API error'));
    const logger = require('../../shared/logger');
    const { sendAlert } = require('../../shared/telegram');

    await expect(sendAlert('Test')).rejects.toThrow('Telegram API error');
    expect(logger.error).toHaveBeenCalled();
  });

  test('bot is created as singleton — TelegramBot constructor called once across calls', async () => {
    const TelegramBotLocal = require('node-telegram-bot-api');
    const { sendAlert } = require('../../shared/telegram');
    await sendAlert('first');
    await sendAlert('second');
    expect(TelegramBotLocal).toHaveBeenCalledTimes(1);
  });
});
