jest.mock('playwright-extra', () => ({
  chromium: {
    launch: jest.fn(),
    use: jest.fn()
  }
}));
jest.mock('puppeteer-extra-plugin-stealth', () => jest.fn(() => ({})));
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
      title: jest.fn().mockResolvedValue('Mercado Libre Colombia'),
      waitForSelector: jest.fn().mockResolvedValue(null),
      fill: jest.fn().mockResolvedValue(null),
      keyboard: { press: jest.fn().mockResolvedValue(null) },
      $$eval: jest.fn().mockResolvedValue([]),
      evaluate: jest.fn().mockResolvedValue('<div>debug html</div>'),
      screenshot: jest.fn().mockResolvedValue(null),
      setExtraHTTPHeaders: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(null)
    };
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(null)
    };

    const playwright = require('playwright-extra');
    playwright.chromium.launch.mockResolvedValue(mockBrowser);
  });

  test('navigates to www.mercadolibre.com.co homepage', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('audífonos bluetooth');

    expect(mockPage.goto).toHaveBeenCalledWith('https://www.mercadolibre.com.co/');
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

  test('waits for search input with multi-selector', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('celular');

    expect(mockPage.waitForSelector).toHaveBeenCalledWith(
      'input[name="as_word"], input[type="search"], #cb1-edit',
      expect.objectContaining({ timeout: 10000 })
    );
  });

  test('fills search input with query and presses Enter', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('audífonos bluetooth');

    expect(mockPage.fill).toHaveBeenCalledWith(
      'input[name="as_word"], input[type="search"], #cb1-edit',
      'audífonos bluetooth'
    );
    expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
  });

  test('waits for li.ui-search-layout__item with 15s timeout after search', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('celular');

    // The second waitForSelector call is for results (first is for input)
    const calls = mockPage.waitForSelector.mock.calls;
    const resultCall = calls.find(c => c[0] === 'li.ui-search-layout__item');
    expect(resultCall).toBeDefined();
    expect(resultCall[1]).toMatchObject({ timeout: 15000 });
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

  test('returns [] when results selector not found', async () => {
    // input found, but results selector times out
    mockPage.waitForSelector
      .mockResolvedValueOnce(null)  // input selector
      .mockRejectedValueOnce(new Error('Timeout')); // results selector

    const { searchProducts } = require('../../shared/ml-client');
    const results = await searchProducts('xyzproductonexiste');

    expect(results).toEqual([]);
  });

  test('launches chromium with stealth anti-bot args', async () => {
    const playwright = require('playwright-extra');
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('algo');

    expect(playwright.chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        args: expect.arrayContaining([
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security'
        ])
      })
    );
  });

  test('sets custom User-Agent and Accept-Language headers', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('algo');

    expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        'User-Agent': expect.stringContaining('Mozilla/5.0'),
        'Accept-Language': 'es-CO,es;q=0.9'
      })
    );
  });

  test('returns [] on browser launch error — never throws', async () => {
    const playwright = require('playwright-extra');
    playwright.chromium.launch.mockRejectedValue(new Error('Chromium crash'));

    const { searchProducts } = require('../../shared/ml-client');
    const results = await searchProducts('algo');

    expect(results).toEqual([]);
  });

  test('closes browser after search even on error', async () => {
    mockPage.waitForSelector
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Timeout'));

    const { searchProducts } = require('../../shared/ml-client');
    await searchProducts('algo');

    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
