const path = require('path');

describe('logger', () => {
  let logger;

  beforeAll(() => {
    process.env.LOG_LEVEL = 'error';
    logger = require('../../shared/logger');
    // Silence all transports to prevent disk writes and console noise during tests
    logger.transports.forEach(t => { t.silent = true; });
  });

  test('exports info, warn, error methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('info does not throw when called with string and meta', () => {
    expect(() => logger.info('test message', { key: 'value' })).not.toThrow();
  });

  test('error does not throw when called with an Error object', () => {
    expect(() => logger.error('something broke', new Error('test error'))).not.toThrow();
  });
});
