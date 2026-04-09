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
      waitForSelector: jest.fn().mockResolvedValue(null),
      $$eval: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(null)
    };
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(null)
    };

    const playwright = require('playwright');
    playwright.chromium.launch.mockResolvedValue(mockBrowser);
  });

  test('navigates to correct ML Colombia URL for query', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('audífonos bluetooth');

    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://listado.mercadolibre.com.co/aud%C3%ADfonos%20bluetooth'
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

  test('returns [] when page has no matching selector (timeout)', async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));

    const { searchProducts } = require('../../shared/ml-client');
    const results = await searchProducts('xyzproductonexiste');

    expect(results).toEqual([]);
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
