require('dotenv').config();
const { chromium } = require('playwright');
const logger = require('./logger');

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

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const url = `https://listado.mercadolibre.com.co/${encodeURIComponent(query)}`;
    await page.goto(url);

    try {
      await page.waitForSelector('.ui-search-result', { timeout: 10000 });
    } catch {
      logger.warn('ML scrape: no results found', { query });
      return [];
    }

    const items = await page.$$eval('.ui-search-result', (els) =>
      els.map(el => {
        const titleEl =
          el.querySelector('.poly-component__title') ||
          el.querySelector('h2.ui-search-item__title');
        const priceEl = el.querySelector('.andes-money-amount__fraction');
        const linkEl = el.querySelector('a.ui-search-result__content');

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
