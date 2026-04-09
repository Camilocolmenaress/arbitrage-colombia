#!/usr/bin/env node
/**
 * Debug script to diagnose Playwright scraper issues.
 * Does NOT require tests — just run it and inspect the output.
 *
 * Usage:
 *   node scripts/debug-scraper.js
 *   node scripts/debug-scraper.js "celular samsung"
 */
require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

const QUERY = process.argv[2] || 'audífonos';
const SCREENSHOT_PATH = '/tmp/ml-debug.png';

const URLS = [
  `https://listado.mercadolibre.com.co/${encodeURIComponent(QUERY)}`,
  `https://www.mercadolibre.com.co/`
];

(async () => {
  console.log(`\n=== ML Scraper Debug ===`);
  console.log(`Query: "${QUERY}"\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security'
    ]
  });

  for (const url of URLS) {
    console.log(`--- Trying URL: ${url}`);
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-CO,es;q=0.9'
    });

    try {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const title = await page.title();
      console.log(`Page title: ${title}`);

      await page.screenshot({ path: SCREENSHOT_PATH });
      console.log(`Screenshot saved to ${SCREENSHOT_PATH}`);

      const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 1000));
      console.log(`\nFirst 1000 chars of body HTML:\n${bodyHtml}\n`);

      try {
        await page.waitForSelector('li.ui-search-layout__item', { timeout: 15000 });
        const count = await page.$$eval('li.ui-search-layout__item', els => els.length);
        console.log(`✓ Found ${count} result item(s) with selector "li.ui-search-layout__item"`);
      } catch {
        console.log(`✗ Selector "li.ui-search-layout__item" not found within 15s`);
      }
    } catch (err) {
      console.error(`Error loading ${url}: ${err.message}`);
    } finally {
      await page.close();
    }

    console.log('');
  }

  await browser.close();
  console.log('Done. Check /tmp/ml-debug.png for last screenshot.');
})().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
