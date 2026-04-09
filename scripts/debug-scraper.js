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

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'es-CO,es;q=0.9'
  });

  try {
    console.log('--- Step 1: Navigate to homepage');
    await page.goto('https://www.mercadolibre.com.co/');
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    console.log(`Page title: ${title}`);

    await page.screenshot({ path: SCREENSHOT_PATH });
    console.log(`Screenshot saved to ${SCREENSHOT_PATH}`);

    const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 1000));
    console.log(`\nFirst 1000 chars of body HTML:\n${bodyHtml}\n`);

    console.log('--- Step 2: Find search input');
    const inputSelector = 'input[name="as_word"], input[type="search"], #cb1-edit';
    try {
      await page.waitForSelector(inputSelector, { timeout: 10000 });
      console.log(`✓ Search input found`);
    } catch {
      console.log(`✗ Search input not found within 10s`);
      await browser.close();
      return;
    }

    console.log(`--- Step 3: Type "${QUERY}" and press Enter`);
    await page.fill(inputSelector, QUERY);
    await page.keyboard.press('Enter');

    console.log('--- Step 4: Wait for results');
    try {
      await page.waitForSelector('li.ui-search-layout__item', { timeout: 15000 });
      const count = await page.$$eval('li.ui-search-layout__item', els => els.length);
      console.log(`✓ Found ${count} result item(s) with selector "li.ui-search-layout__item"`);

      await page.screenshot({ path: SCREENSHOT_PATH });
      console.log(`Screenshot updated to ${SCREENSHOT_PATH}`);
    } catch {
      console.log(`✗ Results selector "li.ui-search-layout__item" not found within 15s`);

      const resultHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 1000));
      console.log(`\nHTML after search:\n${resultHtml}\n`);

      await page.screenshot({ path: SCREENSHOT_PATH });
      console.log(`Screenshot saved to ${SCREENSHOT_PATH}`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
  } finally {
    await page.close();
    await browser.close();
  }

  console.log('\nDone. Check /tmp/ml-debug.png for last screenshot.');
})().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
