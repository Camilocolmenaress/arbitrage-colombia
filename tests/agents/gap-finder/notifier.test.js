jest.mock('../../../shared/telegram');
jest.mock('../../../shared/supabase');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

describe('gap-finder/notifier', () => {
  const mockInsert = jest.fn().mockResolvedValue({ error: null });
  const mockFrom = jest.fn(() => ({ insert: mockInsert }));

  const sampleGap = {
    nombre: 'Audífonos Bluetooth',
    precio_compra: 50000,
    precio_promedio: 85000,
    gap_porcentaje: 70,
    link: 'http://ml.co/item/1',
    fuente: 'trending'
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });

    const { getClient } = require('../../../shared/supabase');
    getClient.mockReturnValue({ from: mockFrom });

    const { sendAlert } = require('../../../shared/telegram');
    sendAlert.mockResolvedValue({ message_id: 1 });
  });

  test('notify() saves gap to Supabase and sends Telegram alert', async () => {
    const { notify } = require('../../../agents/gap-finder/notifier');
    await notify(sampleGap);

    expect(mockFrom).toHaveBeenCalledWith('arbitrage_gaps');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Audífonos Bluetooth',
        gap_porcentaje: 70
      })
    );
    const { sendAlert } = require('../../../shared/telegram');
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining('Audífonos Bluetooth')
    );
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining('70%')
    );
  });

  test('notify() message contains purchase price and link', async () => {
    const { notify } = require('../../../agents/gap-finder/notifier');
    await notify(sampleGap);

    const { sendAlert } = require('../../../shared/telegram');
    const message = sendAlert.mock.calls[0][0];
    expect(message).toContain('50.000');
    expect(message).toContain('http://ml.co/item/1');
  });

  test('notify() inserts to DB before sending Telegram alert', async () => {
    const callOrder = [];
    mockInsert.mockImplementation(async () => {
      callOrder.push('db');
      return { error: null };
    });
    const { sendAlert } = require('../../../shared/telegram');
    sendAlert.mockImplementation(async () => { callOrder.push('telegram'); });

    const { notify } = require('../../../agents/gap-finder/notifier');
    await notify(sampleGap);

    expect(callOrder).toEqual(['db', 'telegram']);
  });

  test('notify() throws if Supabase insert fails', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } });

    const { notify } = require('../../../agents/gap-finder/notifier');
    await expect(notify(sampleGap)).rejects.toThrow('DB error');

    const { sendAlert } = require('../../../shared/telegram');
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
