jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() }
}));
jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('ml-client (Playwright scraper)', () => {
  let mockPage, mockBrowser;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MAX_PRECIO_COMPRA = '150000';
    process.env.SCRAPE_DELAY_MS = '0'; // disable delay in tests

    mockPage = {
      goto: jest.fn().mockResolvedValue(null),
      waitForLoadState: jest.fn().mockResolvedValue(null),
      title: jest.fn().mockResolvedValue('MercadoLibre Colombia'),
      waitForSelector: jest.fn().mockResolvedValue(null),
      $$eval: jest.fn().mockResolvedValue([]),
      evaluate: jest.fn().mockResolvedValue('<div>debug html</div>'),
      screenshot: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(null)
    };
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(null)
    };

    const playwright = require('playwright');
    playwright.chromium.launch.mockResolvedValue(mockBrowser);
  });

  test('navigates to encoded listado.mercadolibre.com.co URL', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('audífonos bluetooth');

    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://listado.mercadolibre.com.co/aud%C3%ADfonos%20bluetooth'
    );
  });

  test('waits for networkidle after page load', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('celular');

    expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
  });

  test('logs page title after navigation', async () => {
    const logger = require('../../shared/logger');
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('celular');

    expect(mockPage.title).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('ML page title:'));
  });

  test('always saves screenshot to /tmp/ml-debug.png', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('algo');

    expect(mockPage.screenshot).toHaveBeenCalledWith({ path: '/tmp/ml-debug.png' });
  });

  test('waits for li.ui-search-layout__item with 15s timeout', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('celular');

    expect(mockPage.waitForSelector).toHaveBeenCalledWith(
      'li.ui-search-layout__item',
      expect.objectContaining({ timeout: 15000 })
    );
  });

  test('returns array of { title, price, link } filtered by maxPrice', async () => {
    mockPage.$$eval.mockResolvedValue([
      { title: 'Audífonos JBL', price: 80000, link: 'http://ml.co/1' },
      { title: 'Audífonos Sony', price: 200000, link: 'http://ml.co/2' }
    ]);

    const { searchProducts } = require('../../shared/ml-client');
    const results = await searchProducts('audífonos', { maxPrice: 150000 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ title: 'Audífonos JBL', price: 80000, link: 'http://ml.co/1' });
  });

  test('returns [] when selector not found on any URL (tries both)', async () => {
    // Reject on every waitForSelector call → both URLs tried, both fail
    mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));

    const { searchProducts } = require('../../shared/ml-client');
    const results = await searchProducts('xyzproductonexiste');

    expect(results).toEqual([]);
    expect(mockPage.waitForSelector).toHaveBeenCalledTimes(2); // tried both URLs
  });

  test('returns [] on browser launch error — never throws', async () => {
    const playwright = require('playwright');
    playwright.chromium.launch.mockRejectedValue(new Error('Chromium crash'));

    const { searchProducts } = require('../../shared/ml-client');
    const results = await searchProducts('algo');

    expect(results).toEqual([]);
  });

  test('closes browser after search even on error', async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));

    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('algo');

    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
