# Playwright Scraper — ML Client Replacement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken MercadoLibre API client with a Playwright web scraper that reads `listado.mercadolibre.com.co` directly.

**Architecture:** `shared/ml-client.js` becomes a headless Chromium scraper using Playwright. All downstream agents (`trend-spotter`, `evergreen-validator`, `gap-finder`) already call `searchProducts(query, { maxPrice })` — the call signature stays the same, only the return shape changes from `{ title, price, sold_quantity, permalink, ... }` (API) to `{ title, price, link }` (scraper). Three files need field-name fixes for that change.

**Tech Stack:** `playwright` (chromium), Jest (mocked browser for tests), Node.js 20+ CommonJS

---

## Impact Map — fields that change

| Consumer | Old field | New field | Action |
|---|---|---|---|
| `gap-finder/analyzer.js` | `item.permalink` | `item.link` | Fix line 34 |
| `trend-spotter/.../mercadolibre.js` | `item.sold_quantity` | not available | score = 0 (acceptable — no ranking data from scraper) |
| `evergreen-validator/.../mercadolibre.js` | `item.sold_quantity` filter | not available | Remove filter; set `ventas_historicas: 0` |
| Tests: `analyzer.test.js` | mock has `permalink` | should have `link` | Fix mock objects |
| Tests: `trend-spotter.test.js` | mock has `sold_quantity`, `score === 320` | `score === 0` | Fix mock + assertion |
| Tests: `evergreen-validator.test.js` | mock has `sold_quantity`, asserts filter | no filter | Fix mock + assertion |

---

## File Structure

**Rewrite:**
- `shared/ml-client.js` — Playwright scraper (replaces axios/OAuth version)
- `tests/shared/ml-client.test.js` — mock Playwright browser, no real network calls

**Modify:**
- `agents/gap-finder/analyzer.js:34` — `permalink` → `link`
- `agents/trend-spotter/sources/mercadolibre.js` — new SEED_KEYWORDS, `score: 0`
- `agents/evergreen-validator/sources/mercadolibre.js` — new EVERGREEN_KEYWORDS, drop sold_quantity filter
- `tests/agents/gap-finder/analyzer.test.js` — mock objects use `link` instead of `permalink`
- `tests/agents/trend-spotter.test.js` — mock data uses `{ title, price, link }`, `score === 0`
- `tests/agents/evergreen-validator.test.js` — mock data uses `{ title, price, link }`, remove sold_quantity assertion
- `.env.example` — remove 5 OAuth vars, add none
- `CLAUDE.md` — update ML data source section

**Delete:**
- `shared/env-writer.js` — only used by ml-auth.js; no longer needed
- `scripts/ml-auth.js` — OAuth setup script; no longer needed

---

## Task 1: Install Playwright

**Files:** `package.json` (modified by npm)

- [ ] **Step 1: Install playwright package**

```bash
npm install playwright
```

Expected: `playwright` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Install Chromium browser binary**

```bash
npx playwright install chromium
```

Expected: Downloads Chromium. Output ends with something like `✓ Chromium ... downloaded`.

---

## Task 2: Rewrite `shared/ml-client.js` — TDD

**Files:**
- Rewrite: `shared/ml-client.js`
- Rewrite: `tests/shared/ml-client.test.js`

### Step 1: Write failing tests

- [ ] **Step 1a: Write the new test file**

Replace `tests/shared/ml-client.test.js` entirely with:

```js
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
```

- [ ] **Step 1b: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=ml-client
```

Expected: FAIL — `Cannot find module '../../shared/ml-client'` errors or similar. These tests must fail before we implement.

### Step 2: Implement `shared/ml-client.js`

- [ ] **Step 2a: Write the scraper**

Replace `shared/ml-client.js` entirely with:

```js
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
```

- [ ] **Step 2b: Run ml-client tests**

```bash
npm test -- --testPathPattern=ml-client
```

Expected: 5 tests pass.

- [ ] **Step 2c: Commit**

```bash
git add shared/ml-client.js tests/shared/ml-client.test.js
git commit -m "feat: replace API client with Playwright web scraper"
```

---

## Task 3: Fix `analyzer.js` — `permalink` → `link`

**Files:**
- Modify: `agents/gap-finder/analyzer.js:34`
- Modify: `tests/agents/gap-finder/analyzer.test.js`

**Background:** `analyzer.js` currently reads `cheapestItem?.permalink` from the `searchProducts` result. The scraper returns `link`, not `permalink`. The test mock data also uses `permalink` — it needs to change to `link` so mocks match the real interface.

- [ ] **Step 1: Update mock data in analyzer test**

In `tests/agents/gap-finder/analyzer.test.js`, replace every `permalink:` with `link:` in the three mock arrays:

Test 1 mock (line ~16-19):
```js
searchProducts.mockResolvedValue([
  { title: 'Audífonos X', price: 30000, link: 'http://ml.co/1' },
  { title: 'Audífonos Y', price: 100000, link: 'http://ml.co/2' },
  { title: 'Audífonos Z', price: 110000, link: 'http://ml.co/3' }
]);
```

Test 2 mock (line ~34-38):
```js
searchProducts.mockResolvedValue([
  { title: 'Camiseta A', price: 45000, link: 'http://ml.co/a' },
  { title: 'Camiseta B', price: 50000, link: 'http://ml.co/b' },
  { title: 'Camiseta C', price: 55000, link: 'http://ml.co/c' }
]);
```

Test 3 mock (line ~49):
```js
searchProducts.mockResolvedValue([
  { title: 'Producto Raro', price: 30000, link: 'http://ml.co/r' }
]);
```

- [ ] **Step 2: Run analyzer tests to confirm failure**

```bash
npm test -- --testPathPattern=analyzer
```

Expected: FAIL — `expect(result.link).toBe('http://ml.co/1')` fails because analyzer still reads `permalink`.

- [ ] **Step 3: Fix `analyzer.js`**

In `agents/gap-finder/analyzer.js`, change line 34 from:
```js
link: cheapestItem?.permalink || null
```
to:
```js
link: cheapestItem?.link || null
```

- [ ] **Step 4: Run analyzer tests**

```bash
npm test -- --testPathPattern=analyzer
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agents/gap-finder/analyzer.js tests/agents/gap-finder/analyzer.test.js
git commit -m "fix: use item.link from scraper instead of item.permalink"
```

---

## Task 4: Update Trend Spotter — new keywords + scraper shape

**Files:**
- Modify: `agents/trend-spotter/sources/mercadolibre.js`
- Modify: `tests/agents/trend-spotter.test.js`

**Background:** `getTrendingFromML` reads `item.sold_quantity` for the `score` field. The scraper does not provide sales data. `score` becomes `0` for all scraper results — acceptable, since trending detection in this agent primarily comes from Google Trends. SEED_KEYWORDS also get replaced.

- [ ] **Step 1: Update the mock in trend-spotter test**

In `tests/agents/trend-spotter.test.js`, in the `getTrendingFromML` describe block, update the mock and assertion:

```js
test('getTrendingFromML returns array of {nombre, score} objects', async () => {
  const { searchProducts: sp } = require('../../shared/ml-client');
  sp.mockResolvedValue([
    { title: 'Audífonos Bluetooth', price: 80000, link: 'http://ml.co/1' },
    { title: 'Termo Stanley', price: 65000, link: 'http://ml.co/2' }
  ]);

  const { getTrendingFromML } = require('../../agents/trend-spotter/sources/mercadolibre');
  const results = await getTrendingFromML('audífonos bluetooth');

  expect(results).toHaveLength(2);
  expect(results[0]).toHaveProperty('nombre');
  expect(results[0]).toHaveProperty('score');
  expect(results[0].score).toBe(0);
});
```

- [ ] **Step 2: Run trend-spotter tests to confirm that one fails**

```bash
npm test -- --testPathPattern=trend-spotter
```

Expected: The `score === 0` assertion fails (currently `score === 320`).

- [ ] **Step 3: Update `agents/trend-spotter/sources/mercadolibre.js`**

Replace the file with:

```js
require('dotenv').config();
const { searchProducts } = require('../../../shared/ml-client');
const logger = require('../../../shared/logger');

const SEED_KEYWORDS = [
  'audífonos bluetooth', 'consola videojuegos',
  'celular samsung', 'iphone', 'pc gamer',
  'silla gamer', 'teclado mecánico', 'gorra',
  'smartwatch', 'cargador inalámbrico',
  'parlante bluetooth', 'tablet', 'iPad',
  'case celular', 'mouse gamer'
];

async function getTrendingFromML(keyword) {
  try {
    const items = await searchProducts(keyword);

    const results = items.map(item => ({
      nombre: item.title,
      score: 0 // sold_quantity not available from web scraping
    }));

    logger.info('ML trending fetched', { keyword, count: results.length });
    return results;
  } catch (err) {
    logger.warn('ML trending fetch failed — skipping', { keyword, error: err.message });
    return [];
  }
}

async function getAllMLTrending() {
  const settled = await Promise.allSettled(SEED_KEYWORDS.map(kw => getTrendingFromML(kw)));
  return settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

module.exports = { getTrendingFromML, getAllMLTrending };
```

- [ ] **Step 4: Run trend-spotter tests**

```bash
npm test -- --testPathPattern=trend-spotter
```

Expected: All trend-spotter tests pass.

- [ ] **Step 5: Commit**

```bash
git add agents/trend-spotter/sources/mercadolibre.js tests/agents/trend-spotter.test.js
git commit -m "feat: update trend-spotter to scraper interface + new SEED_KEYWORDS"
```

---

## Task 5: Update Evergreen Validator — new keywords + remove sold_quantity filter

**Files:**
- Modify: `agents/evergreen-validator/sources/mercadolibre.js`
- Modify: `tests/agents/evergreen-validator.test.js`

**Background:** `getEvergreenFromML` filters `item.sold_quantity >= MIN_VENTAS`. The scraper does not provide sales data — this filter would silently drop all results (`undefined >= 10` is `false`). We remove the filter and set `ventas_historicas: 0`. EVERGREEN_KEYWORDS also get replaced.

- [ ] **Step 1: Update mock and assertions in evergreen test**

In `tests/agents/evergreen-validator.test.js`, in the `getEvergreenFromML` describe block, replace both tests:

```js
test('getEvergreenFromML returns all scraped products (no sold_quantity filter)', async () => {
  const { searchProducts } = require('../../shared/ml-client');
  searchProducts.mockResolvedValue([
    { title: 'Mochila', price: 80000, link: 'http://ml.co/1' },
    { title: 'Silla Gamer', price: 120000, link: 'http://ml.co/2' }
  ]);

  const { getEvergreenFromML } = require('../../agents/evergreen-validator/sources/mercadolibre');
  const results = await getEvergreenFromML('mochila');

  expect(results).toHaveLength(2);
  expect(results[0]).toHaveProperty('nombre', 'Mochila');
  expect(results[0]).toHaveProperty('ventas_historicas', 0);
  expect(results[0]).toHaveProperty('keyword', 'mochila');
});

test('returns empty array on ML error', async () => {
  const { searchProducts } = require('../../shared/ml-client');
  const logger = require('../../shared/logger');
  searchProducts.mockRejectedValue(new Error('ML down'));

  const { getEvergreenFromML } = require('../../agents/evergreen-validator/sources/mercadolibre');
  const results = await getEvergreenFromML('algo');

  expect(results).toEqual([]);
  expect(logger.warn).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run evergreen tests to confirm failures**

```bash
npm test -- --testPathPattern=evergreen
```

Expected: Failures in `getEvergreenFromML` describe block.

- [ ] **Step 3: Update `agents/evergreen-validator/sources/mercadolibre.js`**

Replace the file with:

```js
require('dotenv').config();
const { searchProducts } = require('../../../shared/ml-client');
const logger = require('../../../shared/logger');

const EVERGREEN_KEYWORDS = [
  'audífonos bluetooth', 'consola videojuegos',
  'celular samsung', 'iphone', 'pc gamer',
  'silla gamer', 'teclado mecánico', 'gorra',
  'smartwatch', 'cargador inalámbrico',
  'parlante bluetooth', 'tablet', 'iPad',
  'case celular', 'mouse gamer'
];

async function getEvergreenFromML(keyword) {
  try {
    const items = await searchProducts(keyword);

    const results = items.map(item => ({
      nombre: item.title,
      ventas_historicas: 0, // not available from web scraping
      keyword // propagate source keyword for trend stability lookup
    }));

    logger.info('ML evergreen fetched', { keyword, count: results.length });
    return results;
  } catch (err) {
    logger.warn('ML evergreen fetch failed — skipping', { keyword, error: err.message });
    return [];
  }
}

async function getAllEvergreenFromML() {
  const settled = await Promise.allSettled(EVERGREEN_KEYWORDS.map(kw => getEvergreenFromML(kw)));
  return settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

module.exports = { getEvergreenFromML, getAllEvergreenFromML };
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass. Note the final count — it will be slightly different from 46 due to the ml-client rewrite.

- [ ] **Step 5: Commit**

```bash
git add agents/evergreen-validator/sources/mercadolibre.js tests/agents/evergreen-validator.test.js
git commit -m "feat: update evergreen-validator to scraper interface + new EVERGREEN_KEYWORDS"
```

---

## Task 6: Remove OAuth artifacts + clean `.env.example`

**Files:**
- Delete: `shared/env-writer.js`
- Delete: `scripts/ml-auth.js`
- Modify: `.env.example`

- [ ] **Step 1: Delete unused files**

```bash
git rm shared/env-writer.js scripts/ml-auth.js
```

Expected: Files staged for deletion.

- [ ] **Step 2: Update `.env.example`**

Remove the following lines from `.env.example`:
```
ML_CLIENT_ID=your-ml-client-id
ML_CLIENT_SECRET=your-ml-client-secret
ML_REDIRECT_URI=https://your-registered-redirect-uri
ML_ACCESS_TOKEN=
ML_REFRESH_TOKEN=
```

The ML section should become:
```
# MercadoLibre
ML_SITE_ID=MCO
ML_BASE_URL=https://api.mercadolibre.com
```

Wait — `ML_SITE_ID` and `ML_BASE_URL` are not used by the scraper either. Remove the entire ML section except for a comment:

```
# MercadoLibre (web scraping — no API credentials required)
# Scrapes: https://listado.mercadolibre.com.co/{query}
```

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: remove OAuth artifacts and unused env vars"
```

---

## Task 7: Update `CLAUDE.md` and memory

**Files:**
- Modify: `CLAUDE.md`
- Modify: `/Users/camilocolmenares/.claude/projects/-Users-camilocolmenares/memory/project_arbitrage_colombia.md`

- [ ] **Step 1: Update Stack section in `CLAUDE.md`**

Change:
```
- MercadoLibre API con OAuth2 (authorization_code — `scripts/ml-auth.js` para setup inicial)
```
To:
```
- MercadoLibre: Playwright web scraping de listado.mercadolibre.com.co (NO la API — bloqueada en abril 2025)
```

- [ ] **Step 2: Update Estado de implementación table in `CLAUDE.md`**

Replace:
```
| OAuth2 ML auth (authorization_code) | — | ✅ COMPLETA (46/46 tests) |
```
With:
```
| Playwright web scraper (reemplaza API) | — | ✅ COMPLETA |
```

- [ ] **Step 3: Add scraping note to CLAUDE.md Decisiones técnicas section**

Add to the "Decisiones técnicas adicionales" list:
```
- ML data source: Playwright web scraping de listado.mercadolibre.com.co — NOT the API. Reason: ML blocked API access in April 2025
- `SCRAPE_DELAY_MS` env var: si se define, sobreescribe el delay aleatorio (0 en tests, vacío en producción = 1500-3000ms)
- `shared/env-writer.js` y `scripts/ml-auth.js` eliminados — ya no se necesitan sin OAuth
- `sold_quantity` no disponible en scraping: `score = 0` en trend-spotter, `ventas_historicas = 0` en evergreen-validator
```

- [ ] **Step 4: Update memory file**

In `/Users/camilocolmenares/.claude/projects/-Users-camilocolmenares/memory/project_arbitrage_colombia.md`, update the relevant lines to reflect:
- OAuth removed; Playwright scraper in place
- New SEED_KEYWORDS and EVERGREEN_KEYWORDS (15 keywords each)
- `env-writer.js` and `ml-auth.js` deleted
- ML_CLIENT_ID/SECRET/ACCESS_TOKEN/REFRESH_TOKEN/REDIRECT_URI removed from .env.example

- [ ] **Step 5: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — ML data source is now Playwright scraper"
```

---

## Task 8: Final verification + push

- [ ] **Step 1: Full test run**

```bash
npm test
```

Expected: All tests pass. Record the final test count.

- [ ] **Step 2: Verify deleted files are gone**

```bash
ls shared/env-writer.js scripts/ml-auth.js 2>&1
```

Expected: `No such file or directory` for both.

- [ ] **Step 3: Verify .env.example has no OAuth vars**

```bash
grep -E "ML_CLIENT|ML_ACCESS|ML_REFRESH|ML_REDIRECT" .env.example
```

Expected: no output.

- [ ] **Step 4: Push to branch and main**

```bash
git push
git push origin claude/priceless-hamilton:main
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| `npm install playwright` + `npx playwright install chromium` | Task 1 |
| Rewrite `shared/ml-client.js` with Playwright scraper | Task 2 |
| `searchProducts` returns `{ title, price, link }` | Task 2 |
| Navigate to `listado.mercadolibre.com.co/{encodeURIComponent(query)}` | Task 2 |
| Wait for `.ui-search-result` | Task 2 |
| Extract `.poly-component__title` or `h2.ui-search-item__title` | Task 2 |
| Extract `.andes-money-amount__fraction` (remove dots, parse int) | Task 2 |
| Extract `a.ui-search-result__content` href | Task 2 |
| Filter `price <= maxPrice` | Task 2 |
| Random delay 1500-3000ms | Task 2 |
| Close browser after each search | Task 2 |
| Return max 50 results | Task 2 |
| Page fail or no results → return [] never throw | Task 2 |
| Update SEED_KEYWORDS (15 new keywords, both agents) | Tasks 4 + 5 |
| Remove all OAuth/token code | Tasks 2 + 6 |
| Remove OAuth env vars from .env.example | Task 6 |
| Tests mock Playwright — no real browser | Task 2 |
| Update CLAUDE.md and memory.md | Task 7 |

All requirements covered. No gaps found.

**Placeholder scan:** None found — all code blocks contain real implementation.

**Type consistency:** `{ title, price, link }` is the scraper return shape, used consistently in Task 2 (impl), Tasks 3-5 (mock updates), and Task 6 (env cleanup).
