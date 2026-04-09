require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('./logger');

chromium.use(StealthPlugin());

const MAX_PRECIO = parseInt(process.env.MAX_PRECIO_COMPRA || '150000', 10);

// Allow tests to set SCRAPE_DELAY_MS=0 to skip the delay
function getDelay() {
  const override = process.env.SCRAPE_DELAY_MS;
  if (override !== undefined) return parseInt(override, 10);
  return 1500 + Math.floor(Math.random() * 1500);
}

async function searchProducts(query, options = {}) {
  const { maxPrice = MAX_PRECIO } = options;
  let browser;

  try {
    await new Promise(r => setTimeout(r, getDelay()));

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security'
      ]
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-CO,es;q=0.9'
    });

    // Simulate human search — avoids bot detection on listado subdomain
    await page.goto('https://www.mercadolibre.com.co/');
    await page.waitForLoadState('networkidle');
    logger.info('ML page title: ' + await page.title());

    // Always capture page state for debugging
    try { await page.screenshot({ path: '/tmp/ml-debug.png' }); } catch (_) {}

    const inputSelector = 'input[name="as_word"], input[type="search"], #cb1-edit';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.fill(inputSelector, query);
    await page.keyboard.press('Enter');

    try {
      await page.waitForSelector('li.ui-search-layout__item', { timeout: 15000 });
    } catch {
      try {
        const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
        logger.warn('ML scrape: no results after search', { query, html: bodyHtml });
      } catch (_) {}
      return [];
    }

    const items = await page.$$eval('li.ui-search-layout__item', (els) =>
      els.map(el => {
        const titleEl = el.querySelector('.poly-component__title');
        const priceEl = el.querySelector('.andes-money-amount__fraction');
        const linkEl =
          el.querySelector('a.poly-component__title') ||
          el.querySelector('a[href*="articulo.mercadolibre.com.co"]');

        const title = titleEl?.textContent?.trim() || '';
        const priceText = (priceEl?.textContent?.trim() || '0').replace(/\./g, '');
        const price = parseInt(priceText, 10);
        const link = linkEl?.href || '';

        return { title, price, link };
      }).filter(item => item.title && item.price > 0)
    );

    const results = items
      .filter(item => item.price <= maxPrice)
      .slice(0, 50);

    logger.info('ML scrape completed', { query, found: results.length });
    return results;
  } catch (err) {
    logger.warn('ML scrape failed — returning empty', { query, error: err.message });
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchProducts };
