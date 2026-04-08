# Arbitrage Colombia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-agent system that automatically identifies buy-cheap-on-MercadoLibre / sell-on-Facebook-Marketplace-Bucaramanga arbitrage opportunities and sends Telegram alerts when gap > 40%.

**Architecture:** Three independent agents (Trend Spotter, Evergreen Validator, Gap Finder) run on separate cron schedules, share a Supabase database as the data bus, and communicate through tables rather than direct calls. The Gap Finder reads from the other two tables and fires Telegram alerts. All shared infrastructure (DB client, ML client, Telegram, logger) lives in `/shared` and is never duplicated.

**Tech Stack:** Node.js 20+ · CommonJS · Supabase (PostgreSQL) · MercadoLibre API (public, no auth) · google-trends-api (unofficial) · node-telegram-bot-api · node-cron · axios · winston · Jest · PM2

---

## ⚠️ Pre-flight Notes

1. **Supabase project not found:** The `arbitrage-colombia` project does not appear in your Supabase org. Task 1 covers creating it via MCP.
2. **`googleapis` → replaced:** Google Trends is NOT part of the official Google APIs. Dependency replaced with `google-trends-api` (unofficial, battle-tested npm package).
3. **Execution scope:** The user has requested that **only Phase 1 (Tasks 1–7)** be executed now. Tasks 8–19 are fully planned but not yet built.

---

## File Map

```
arbitrage-colombia/
├── CLAUDE.md                              ← project context + rules
├── CLAUDE.local.md                        ← gitignored secrets reference
├── ecosystem.config.js                    ← PM2 process config
├── package.json
├── .env.example
├── .gitignore
│
├── .claude/
│   ├── settings.json
│   └── commands/
│       ├── run-trends.md
│       ├── run-evergreen.md
│       ├── run-gaps.md
│       └── deploy.md
│
├── shared/
│   ├── logger.js        ← winston singleton
│   ├── supabase.js      ← supabase client singleton
│   ├── ml-client.js     ← mercadolibre API wrapper
│   └── telegram.js      ← telegram alert sender
│
├── agents/
│   ├── trend-spotter/
│   │   ├── index.js                       ← runs agent, writes to trending_products
│   │   └── sources/
│   │       ├── google-trends.js           ← fetches trend scores from Google Trends CO
│   │       └── mercadolibre.js            ← fetches trending searches from ML
│   ├── evergreen-validator/
│   │   ├── index.js                       ← runs agent, writes to evergreen_products
│   │   └── sources/
│   │       ├── mercadolibre.js            ← fetches historical sales data
│   │       └── google-trends.js           ← checks long-term trend stability
│   └── gap-finder/
│       ├── index.js                       ← orchestrates analyzer + notifier
│       ├── analyzer.js                    ← calculates gap % per product
│       └── notifier.js                    ← sends Telegram alert for gaps > 40%
│
├── cron/
│   ├── cron.config.js   ← schedule constants
│   └── scheduler.js     ← registers all cron jobs
│
├── scripts/
│   ├── setup-db.sql     ← idempotent schema creation
│   └── test-agents.js   ← manual one-shot runner for all agents
│
└── tests/
    ├── shared/
    │   ├── logger.test.js
    │   ├── supabase.test.js
    │   ├── ml-client.test.js
    │   └── telegram.test.js
    └── agents/
        ├── trend-spotter.test.js
        ├── evergreen-validator.test.js
        └── gap-finder/
            ├── analyzer.test.js
            └── notifier.test.js
```

---

## PHASE 1 — Foundation & Shared Clients

---

### Task 1: Supabase Project + Database Schema

**Files:**
- Create: `scripts/setup-db.sql`

> Run this task manually via Supabase MCP or SQL editor.

- [ ] **Step 1.1: Create the Supabase project via MCP**

Ask Claude to run:
```
mcp__supabase__create_project with name="arbitrage-colombia", region="sa-east-1"
```
Wait for status `ACTIVE_HEALTHY` before continuing.

- [ ] **Step 1.2: Write setup-db.sql**

Create `scripts/setup-db.sql`:

```sql
-- Run this once to initialize all tables.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS trending_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            TEXT        NOT NULL,
  score_tendencia   NUMERIC,
  fuente            TEXT        NOT NULL,  -- 'google_trends' | 'mercadolibre'
  fecha             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evergreen_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                TEXT        NOT NULL,
  ventas_historicas     INTEGER,
  estabilidad_tendencia NUMERIC,
  fecha_actualizacion   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arbitrage_gaps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT        NOT NULL,
  precio_compra    NUMERIC     NOT NULL,
  precio_promedio  NUMERIC     NOT NULL,
  gap_porcentaje   NUMERIC     NOT NULL,
  link             TEXT,
  fuente           TEXT,  -- 'trending' | 'evergreen'
  fecha            TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 1.3: Apply migration via MCP**

```
mcp__supabase__apply_migration with sql=<contents of setup-db.sql>
```

- [ ] **Step 1.4: Verify tables exist**

```
mcp__supabase__list_tables
```

Expected: `trending_products`, `evergreen_products`, `arbitrage_gaps` all appear.

- [ ] **Step 1.5: Commit**

```bash
git add scripts/setup-db.sql
git commit -m "feat: add Supabase schema for arbitrage-colombia"
```

---

### Task 2: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `CLAUDE.md`
- Create: `CLAUDE.local.md`

- [ ] **Step 2.1: Write package.json**

Create `package.json`:

```json
{
  "name": "arbitrage-colombia",
  "version": "1.0.0",
  "description": "3-agent arbitrage system: MercadoLibre → Facebook Marketplace Bucaramanga",
  "main": "cron/scheduler.js",
  "scripts": {
    "start": "node cron/scheduler.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "trends": "node agents/trend-spotter/index.js",
    "evergreen": "node agents/evergreen-validator/index.js",
    "gaps": "node agents/gap-finder/index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.4",
    "axios": "^1.8.4",
    "dotenv": "^16.5.0",
    "google-trends-api": "^4.9.2",
    "node-cron": "^3.0.3",
    "node-telegram-bot-api": "^0.66.0",
    "winston": "^3.17.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

- [ ] **Step 2.2: Write .env.example**

Create `.env.example`:

```env
# Supabase
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABCDEFabcdef
TELEGRAM_CHAT_ID=-100xxxxxxxxxx

# MercadoLibre
ML_SITE_ID=MCO
ML_BASE_URL=https://api.mercadolibre.com

# Business Rules
MAX_PRECIO_COMPRA=150000
MIN_GAP_PORCENTAJE=40
MIN_VENTAS_HISTORICAS=10

# Logging
LOG_LEVEL=info
```

- [ ] **Step 2.3: Write .gitignore**

Create `.gitignore`:

```
node_modules/
.env
CLAUDE.local.md
logs/
*.log
```

- [ ] **Step 2.4: Write CLAUDE.md**

Create `CLAUDE.md`:

```markdown
# arbitrage-colombia — CLAUDE.md

## Qué hace este proyecto

Sistema de 3 agentes automatizados que identifica oportunidades de arbitraje de productos en Colombia:
- Compra barata en MercadoLibre Colombia
- Vende en Facebook Marketplace Bucaramanga

## Stack

- Node.js 20+ · CommonJS
- Supabase (base de datos compartida entre agentes)
- MercadoLibre API pública (no requiere auth)
- google-trends-api (tendencias Colombia)
- node-telegram-bot-api (alertas)
- node-cron (schedules)
- PM2 (proceso en VPS DigitalOcean)

## Los 3 agentes

| Agente | Cron | Tabla Supabase |
|--------|------|----------------|
| Trend Spotter | cada 24h (6am) | trending_products |
| Evergreen Validator | cada 7 días (lunes 7am) | evergreen_products |
| Gap Finder | cada 4h | arbitrage_gaps |

## Reglas de negocio — NO cambiar sin confirmación explícita

- Precio máximo de compra: $150.000 COP (`MAX_PRECIO_COMPRA`)
- Gap mínimo para alertar: 40% (`MIN_GAP_PORCENTAJE`)
- Ventas mínimas históricas: 10 unidades (`MIN_VENTAS_HISTORICAS`)
- Solo productos con envío a Bucaramanga (Mercado Envíos, `shipping: 'me2'`)
- Categorías excluidas: motos (MCO1505), inmuebles (MCO1000), animales (MCO2225), joyería/oro (MCO3937), armas, adultos

## Convenciones de código — OBLIGATORIAS

- Siempre `async/await`, nunca callbacks
- Errores siempre a `logger.js`, nunca `console.log`
- Variables de entorno siempre desde `.env` (nunca hardcodeadas)
- Clientes compartidos solo en `/shared`, nunca duplicar
- Cada agente completamente independiente (no importar de otro agente)

## Flujo de datos

```
google-trends.js ─┐
                   ├─→ trend-spotter/index.js ──→ trending_products
mercadolibre.js  ─┘

mercadolibre.js  ─┐
                   ├─→ evergreen-validator/index.js ──→ evergreen_products
google-trends.js ─┘

trending_products  ─┐
                     ├─→ gap-finder/index.js → analyzer.js → notifier.js → Telegram
evergreen_products ─┘
```

## IMPORTANTE

Ante cualquier problema de planificación, estructura o decisión de arquitectura, usar
`/superpowers:writing-plans` antes de ejecutar.

Ante ejecución de tareas complejas o multi-paso, usar `/superpowers:execute-plan`
para mantener coherencia.

## Variables de entorno

Ver `.env.example` para todas las variables requeridas.
Nunca commitear `.env` — está en `.gitignore`.
```

- [ ] **Step 2.5: Write CLAUDE.local.md**

Create `CLAUDE.local.md` (this file is gitignored):

```markdown
# CLAUDE.local.md — Secrets & local config

Este archivo es gitignored. Referencia local para el desarrollador.

## Supabase

- Project: arbitrage-colombia
- URL: (pegar de .env)
- Anon key: (pegar de .env)

## Telegram

- Bot: @arbitrage_colombia_bot (o el nombre que uses)
- Chat ID: (pegar de .env)

## VPS DigitalOcean

- El proceso `arbitrage-colombia` corre con PM2
- No interferir con otros procesos existentes en el VPS
- Para ver procesos: `pm2 list`
- Para logs: `pm2 logs arbitrage-colombia`
```

- [ ] **Step 2.6: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 2.7: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore CLAUDE.md
git commit -m "feat: scaffold arbitrage-colombia project structure"
```

Note: Do NOT `git add CLAUDE.local.md` — it's gitignored.

---

### Task 3: shared/logger.js

**Files:**
- Create: `shared/logger.js`
- Create: `tests/shared/logger.test.js`

- [ ] **Step 3.1: Write the failing test**

Create `tests/shared/logger.test.js`:

```js
const path = require('path');

describe('logger', () => {
  let logger;

  beforeAll(() => {
    // Prevent winston from writing to disk during tests
    process.env.LOG_LEVEL = 'error';
    logger = require('../../shared/logger');
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
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
npx jest tests/shared/logger.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../shared/logger'`

- [ ] **Step 3.3: Implement shared/logger.js**

Create `shared/logger.js`:

```js
require('dotenv').config();
const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
    }),
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error'
    }),
    new transports.File({
      filename: path.join(logsDir, 'combined.log')
    })
  ]
});

module.exports = logger;
```

- [ ] **Step 3.4: Run test to confirm it passes**

```bash
npx jest tests/shared/logger.test.js --no-coverage
```

Expected: PASS — 3 tests passed

- [ ] **Step 3.5: Commit**

```bash
git add shared/logger.js tests/shared/logger.test.js
git commit -m "feat: add shared winston logger"
```

---

### Task 4: shared/supabase.js

**Files:**
- Create: `shared/supabase.js`
- Create: `tests/shared/supabase.test.js`

- [ ] **Step 4.1: Write the failing test**

Create `tests/shared/supabase.test.js`:

```js
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({ select: jest.fn(), insert: jest.fn() }))
  }))
}));

jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const { createClient } = require('@supabase/supabase-js');

describe('supabase client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key-abc123';
  });

  test('getClient returns a supabase client', () => {
    const { getClient } = require('../../shared/supabase');
    const client = getClient();
    expect(client).toBeDefined();
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key-abc123'
    );
  });

  test('getClient returns the same instance on second call (singleton)', () => {
    const { getClient } = require('../../shared/supabase');
    const c1 = getClient();
    const c2 = getClient();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(c1).toBe(c2);
  });

  test('getClient throws if SUPABASE_URL is missing', () => {
    delete process.env.SUPABASE_URL;
    const { getClient } = require('../../shared/supabase');
    expect(() => getClient()).toThrow('SUPABASE_URL and SUPABASE_KEY are required');
  });

  test('getClient throws if SUPABASE_KEY is missing', () => {
    delete process.env.SUPABASE_KEY;
    const { getClient } = require('../../shared/supabase');
    expect(() => getClient()).toThrow('SUPABASE_URL and SUPABASE_KEY are required');
  });
});
```

- [ ] **Step 4.2: Run test to confirm it fails**

```bash
npx jest tests/shared/supabase.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../shared/supabase'`

- [ ] **Step 4.3: Implement shared/supabase.js**

Create `shared/supabase.js`:

```js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

let client = null;

function getClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are required');
  }

  client = createClient(url, key);
  logger.info('Supabase client initialized');
  return client;
}

module.exports = { getClient };
```

- [ ] **Step 4.4: Run test to confirm it passes**

```bash
npx jest tests/shared/supabase.test.js --no-coverage
```

Expected: PASS — 4 tests passed

- [ ] **Step 4.5: Commit**

```bash
git add shared/supabase.js tests/shared/supabase.test.js
git commit -m "feat: add shared Supabase client singleton"
```

---

### Task 5: shared/ml-client.js

**Files:**
- Create: `shared/ml-client.js`
- Create: `tests/shared/ml-client.test.js`

- [ ] **Step 5.1: Write the failing test**

Create `tests/shared/ml-client.test.js`:

```js
jest.mock('axios');
jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const axios = require('axios');

describe('ml-client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.ML_SITE_ID = 'MCO';
    process.env.ML_BASE_URL = 'https://api.mercadolibre.com';
    process.env.MAX_PRECIO_COMPRA = '150000';
  });

  describe('searchProducts', () => {
    test('returns only items under MAX_PRECIO_COMPRA', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            { id: 'MCO1', title: 'Zapatos', price: 80000, category_id: 'MCO3530', permalink: 'http://ml.co/1' },
            { id: 'MCO2', title: 'Zapatos Premium', price: 200000, category_id: 'MCO3530', permalink: 'http://ml.co/2' }
          ]
        }
      });

      const { searchProducts } = require('../../shared/ml-client');
      const results = await searchProducts('zapatos');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('MCO1');
    });

    test('excludes forbidden categories', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            { id: 'MCO3', title: 'Moto Honda', price: 80000, category_id: 'MCO1505', permalink: 'http://ml.co/3' },
            { id: 'MCO4', title: 'Blusa', price: 60000, category_id: 'MCO3530', permalink: 'http://ml.co/4' }
          ]
        }
      });

      const { searchProducts } = require('../../shared/ml-client');
      const results = await searchProducts('ropa');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('MCO4');
    });

    test('calls ML API with correct params', async () => {
      axios.get.mockResolvedValue({ data: { results: [] } });

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('tenis');

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.mercadolibre.com/sites/MCO/search',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'tenis',
            limit: 50,
            shipping: 'me2'
          })
        })
      );
    });

    test('throws and logs on API error', async () => {
      const logger = require('../../shared/logger');
      axios.get.mockRejectedValue(new Error('Network error'));

      const { searchProducts } = require('../../shared/ml-client');
      await expect(searchProducts('fallo')).rejects.toThrow('Network error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getItemDetails', () => {
    test('returns item data for a valid ID', async () => {
      axios.get.mockResolvedValue({
        data: { id: 'MCO12345', title: 'Tenis Nike', price: 90000 }
      });

      const { getItemDetails } = require('../../shared/ml-client');
      const item = await getItemDetails('MCO12345');

      expect(item.id).toBe('MCO12345');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.mercadolibre.com/items/MCO12345'
      );
    });
  });
});
```

- [ ] **Step 5.2: Run test to confirm it fails**

```bash
npx jest tests/shared/ml-client.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../shared/ml-client'`

- [ ] **Step 5.3: Implement shared/ml-client.js**

Create `shared/ml-client.js`:

```js
require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const ML_BASE_URL = process.env.ML_BASE_URL || 'https://api.mercadolibre.com';
const ML_SITE_ID = process.env.ML_SITE_ID || 'MCO';
const MAX_PRECIO = parseInt(process.env.MAX_PRECIO_COMPRA || '150000', 10);

// MercadoLibre Colombia category IDs to exclude per business rules
const FORBIDDEN_CATEGORY_PREFIXES = [
  'MCO1505', // Motos y Accesorios
  'MCO1000', // Inmuebles
  'MCO2225', // Animales y Mascotas
  'MCO3937'  // Joyería y Relojes (includes gold)
];

function isForbiddenCategory(categoryId) {
  return FORBIDDEN_CATEGORY_PREFIXES.some(prefix =>
    categoryId && categoryId.startsWith(prefix)
  );
}

async function searchProducts(query, options = {}) {
  const { maxPrice = MAX_PRECIO, limit = 50 } = options;

  try {
    const response = await axios.get(`${ML_BASE_URL}/sites/${ML_SITE_ID}/search`, {
      params: {
        q: query,
        limit,
        shipping: 'me2', // Mercado Envíos — ships nationwide including Bucaramanga
        price_max: maxPrice
      }
    });

    const results = response.data.results
      .filter(item => item.price <= maxPrice)
      .filter(item => !isForbiddenCategory(item.category_id));

    logger.info('ML search completed', { query, found: results.length });
    return results;
  } catch (err) {
    logger.error('ML searchProducts failed', { query, error: err.message });
    throw err;
  }
}

async function getItemDetails(itemId) {
  try {
    const response = await axios.get(`${ML_BASE_URL}/items/${itemId}`);
    return response.data;
  } catch (err) {
    logger.error('ML getItemDetails failed', { itemId, error: err.message });
    throw err;
  }
}

module.exports = { searchProducts, getItemDetails };
```

- [ ] **Step 5.4: Run test to confirm it passes**

```bash
npx jest tests/shared/ml-client.test.js --no-coverage
```

Expected: PASS — 5 tests passed

- [ ] **Step 5.5: Commit**

```bash
git add shared/ml-client.js tests/shared/ml-client.test.js
git commit -m "feat: add shared MercadoLibre API client"
```

---

### Task 6: shared/telegram.js

**Files:**
- Create: `shared/telegram.js`
- Create: `tests/shared/telegram.test.js`

- [ ] **Step 6.1: Write the failing test**

Create `tests/shared/telegram.test.js`:

```js
const mockSendMessage = jest.fn().mockResolvedValue({ message_id: 42 });

jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage
  }));
});

jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const TelegramBot = require('node-telegram-bot-api');

describe('telegram', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token-123';
    process.env.TELEGRAM_CHAT_ID = '-100999888777';
  });

  test('sendAlert calls sendMessage with correct chat ID and text', async () => {
    const { sendAlert } = require('../../shared/telegram');
    await sendAlert('*GAP ENCONTRADO*: Zapatos\nGap: 45%');

    expect(mockSendMessage).toHaveBeenCalledWith(
      '-100999888777',
      '*GAP ENCONTRADO*: Zapatos\nGap: 45%',
      { parse_mode: 'Markdown' }
    );
  });

  test('sendAlert logs success after sending', async () => {
    const logger = require('../../shared/logger');
    const { sendAlert } = require('../../shared/telegram');
    await sendAlert('Test alert');

    expect(logger.info).toHaveBeenCalledWith(
      'Telegram alert sent',
      expect.objectContaining({ chatId: '-100999888777' })
    );
  });

  test('sendAlert throws and logs on Telegram API error', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Telegram API error'));
    const logger = require('../../shared/logger');
    const { sendAlert } = require('../../shared/telegram');

    await expect(sendAlert('Test')).rejects.toThrow('Telegram API error');
    expect(logger.error).toHaveBeenCalled();
  });

  test('bot is created as singleton — TelegramBot constructor called once across calls', async () => {
    const { sendAlert } = require('../../shared/telegram');
    await sendAlert('first');
    await sendAlert('second');
    expect(TelegramBot).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6.2: Run test to confirm it fails**

```bash
npx jest tests/shared/telegram.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../shared/telegram'`

- [ ] **Step 6.3: Implement shared/telegram.js**

Create `shared/telegram.js`:

```js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');

let bot = null;

function getBot() {
  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

async function sendAlert(message) {
  const chatId = process.env.TELEGRAM_CHAT_ID;

  try {
    await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown' });
    logger.info('Telegram alert sent', { chatId, length: message.length });
  } catch (err) {
    logger.error('Telegram sendAlert failed', { chatId, error: err.message });
    throw err;
  }
}

module.exports = { sendAlert };
```

- [ ] **Step 6.4: Run test to confirm it passes**

```bash
npx jest tests/shared/telegram.test.js --no-coverage
```

Expected: PASS — 4 tests passed

- [ ] **Step 6.5: Run the full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: PASS — all tests in `tests/shared/` passing

- [ ] **Step 6.6: Commit**

```bash
git add shared/telegram.js tests/shared/telegram.test.js
git commit -m "feat: add shared Telegram alert client"
```

---

### Task 7: .claude/ Commands Setup

**Files:**
- Create: `.claude/settings.json`
- Create: `.claude/commands/run-trends.md`
- Create: `.claude/commands/run-evergreen.md`
- Create: `.claude/commands/run-gaps.md`
- Create: `.claude/commands/deploy.md`

- [ ] **Step 7.1: Create .claude/settings.json**

Create `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npx jest *)",
      "Bash(node *)",
      "Bash(pm2 *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git push *)"
    ],
    "deny": []
  }
}
```

- [ ] **Step 7.2: Create run-trends command**

Create `.claude/commands/run-trends.md`:

```markdown
Run the Trend Spotter agent once manually to test it end-to-end.

Steps:
1. Verify `.env` exists and has SUPABASE_URL, SUPABASE_KEY, ML_BASE_URL, ML_SITE_ID
2. Run: `node agents/trend-spotter/index.js`
3. Check logs output for "Trend Spotter completed"
4. Verify rows were inserted in Supabase `trending_products` table
```

- [ ] **Step 7.3: Create run-evergreen command**

Create `.claude/commands/run-evergreen.md`:

```markdown
Run the Evergreen Validator agent once manually to test it end-to-end.

Steps:
1. Verify `.env` exists and has SUPABASE_URL, SUPABASE_KEY, ML_BASE_URL, ML_SITE_ID
2. Run: `node agents/evergreen-validator/index.js`
3. Check logs output for "Evergreen Validator completed"
4. Verify rows were inserted in Supabase `evergreen_products` table
```

- [ ] **Step 7.4: Create run-gaps command**

Create `.claude/commands/run-gaps.md`:

```markdown
Run the Gap Finder agent once manually to test it end-to-end.

Steps:
1. Verify `.env` exists and has all env vars including TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
2. Ensure trending_products and evergreen_products have at least some rows
3. Run: `node agents/gap-finder/index.js`
4. Check logs for "Gap Finder completed" and any "Gap alert sent" entries
5. Verify rows were inserted in Supabase `arbitrage_gaps` table
6. Check Telegram for any alert messages (if any gap > 40% was found)
```

- [ ] **Step 7.5: Create deploy command**

Create `.claude/commands/deploy.md`:

```markdown
Deploy arbitrage-colombia to DigitalOcean VPS via PM2.

Steps:
1. SSH into VPS: `ssh user@your-vps-ip`
2. Navigate to project: `cd ~/arbitrage-colombia`
3. Pull latest: `git pull origin main`
4. Install deps if needed: `npm install --production`
5. Copy .env: ensure .env is present (never commit it)
6. Start/restart with PM2: `pm2 restart arbitrage-colombia || pm2 start cron/scheduler.js --name arbitrage-colombia`
7. Save PM2 state: `pm2 save`
8. Verify running: `pm2 list` — status should be "online"
9. Check logs: `pm2 logs arbitrage-colombia --lines 20`
```

- [ ] **Step 7.6: Commit**

```bash
git add .claude/
git commit -m "feat: add Claude commands for running agents and deploying"
```

---

## PHASE 2 — Agents

> ⚠️ Do not build these until Phase 1 is complete and approved.

---

### Task 8: trend-spotter/sources/google-trends.js

**Files:**
- Create: `agents/trend-spotter/sources/google-trends.js`

> Uses `google-trends-api` package (unofficial). Returns an array of `{ nombre, score }` objects for top trending searches in Colombia.

- [ ] **Step 8.1: Write failing test**

Create `tests/agents/trend-spotter.test.js`:

```js
jest.mock('google-trends-api');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const googleTrends = require('google-trends-api');

describe('trend-spotter/sources/google-trends', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getTrendingProducts returns array of {nombre, score} objects', async () => {
    googleTrends.dailyTrends.mockResolvedValue(JSON.stringify({
      default: {
        trendingSearchesDays: [{
          trendingSearches: [
            {
              title: { query: 'zapatos nike' },
              formattedTraffic: '100K+'
            },
            {
              title: { query: 'audífonos bluetooth' },
              formattedTraffic: '50K+'
            }
          ]
        }]
      }
    }));

    const { getTrendingProducts } = require('../../../agents/trend-spotter/sources/google-trends');
    const results = await getTrendingProducts();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('nombre');
    expect(results[0]).toHaveProperty('score');
  });

  test('returns empty array and logs warn on API failure', async () => {
    const logger = require('../../../shared/logger');
    googleTrends.dailyTrends.mockRejectedValue(new Error('Google Trends down'));

    const { getTrendingProducts } = require('../../../agents/trend-spotter/sources/google-trends');
    const results = await getTrendingProducts();

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 8.2: Run test to confirm it fails**

```bash
npx jest tests/agents/trend-spotter.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../../agents/trend-spotter/sources/google-trends'`

- [ ] **Step 8.3: Implement**

Create `agents/trend-spotter/sources/google-trends.js`:

```js
require('dotenv').config();
const googleTrends = require('google-trends-api');
const logger = require('../../../shared/logger');

async function getTrendingProducts() {
  try {
    const raw = await googleTrends.dailyTrends({ geo: 'CO' });
    const data = JSON.parse(raw);

    const searches = data.default?.trendingSearchesDays?.[0]?.trendingSearches || [];

    const results = searches.map(item => ({
      nombre: item.title.query,
      score: parseTrafficString(item.formattedTraffic || '0')
    }));

    logger.info('Google Trends fetched', { count: results.length });
    return results;
  } catch (err) {
    logger.warn('Google Trends fetch failed — skipping source', { error: err.message });
    return [];
  }
}

// Converts "100K+" → 100000, "5M+" → 5000000, "500" → 500
function parseTrafficString(str) {
  const clean = str.replace(/[^0-9KMB.]/g, '');
  if (clean.endsWith('K')) return parseFloat(clean) * 1_000;
  if (clean.endsWith('M')) return parseFloat(clean) * 1_000_000;
  if (clean.endsWith('B')) return parseFloat(clean) * 1_000_000_000;
  return parseFloat(clean) || 0;
}

module.exports = { getTrendingProducts };
```

- [ ] **Step 8.4: Run test to confirm it passes**

```bash
npx jest tests/agents/trend-spotter.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 8.5: Commit**

```bash
git add agents/trend-spotter/sources/google-trends.js tests/agents/trend-spotter.test.js
git commit -m "feat: add trend-spotter google-trends source"
```

---

### Task 9: trend-spotter/sources/mercadolibre.js

**Files:**
- Create: `agents/trend-spotter/sources/mercadolibre.js`

- [ ] **Step 9.1: Write failing test**

Add to `tests/agents/trend-spotter.test.js` (inside a new `describe` block at the bottom):

```js
jest.mock('../../../shared/ml-client');
const { searchProducts } = require('../../../shared/ml-client');

describe('trend-spotter/sources/mercadolibre', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getTrendingFromML returns array of {nombre, score} objects', async () => {
    searchProducts.mockResolvedValue([
      { title: 'Audífonos Bluetooth', sold_quantity: 320, id: 'MCO1' },
      { title: 'Termo Stanley', sold_quantity: 210, id: 'MCO2' }
    ]);

    const { getTrendingFromML } = require('../../../agents/trend-spotter/sources/mercadolibre');
    const results = await getTrendingFromML('audífonos');

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('nombre');
    expect(results[0]).toHaveProperty('score');
    expect(results[0].score).toBe(320);
  });

  test('returns empty array on ML error', async () => {
    const logger = require('../../../shared/logger');
    searchProducts.mockRejectedValue(new Error('ML API down'));

    const { getTrendingFromML } = require('../../../agents/trend-spotter/sources/mercadolibre');
    const results = await getTrendingFromML('zapatos');

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9.2: Run test to confirm it fails**

```bash
npx jest tests/agents/trend-spotter.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../../../agents/trend-spotter/sources/mercadolibre'`

- [ ] **Step 9.3: Implement**

Create `agents/trend-spotter/sources/mercadolibre.js`:

```js
require('dotenv').config();
const { searchProducts } = require('../../../shared/ml-client');
const logger = require('../../../shared/logger');

// Seed keywords to discover what's trending on ML Colombia
const SEED_KEYWORDS = [
  'audífonos', 'zapatos', 'ropa', 'celular', 'mochila',
  'silla gamer', 'termo', 'cámara', 'teclado', 'perfume'
];

async function getTrendingFromML(keyword) {
  try {
    const items = await searchProducts(keyword);

    const results = items.map(item => ({
      nombre: item.title,
      score: item.sold_quantity || 0
    }));

    logger.info('ML trending fetched', { keyword, count: results.length });
    return results;
  } catch (err) {
    logger.warn('ML trending fetch failed — skipping', { keyword, error: err.message });
    return [];
  }
}

async function getAllMLTrending() {
  const allResults = [];
  for (const keyword of SEED_KEYWORDS) {
    const results = await getTrendingFromML(keyword);
    allResults.push(...results);
  }
  return allResults;
}

module.exports = { getTrendingFromML, getAllMLTrending };
```

- [ ] **Step 9.4: Run test to confirm it passes**

```bash
npx jest tests/agents/trend-spotter.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 9.5: Commit**

```bash
git add agents/trend-spotter/sources/mercadolibre.js
git commit -m "feat: add trend-spotter mercadolibre source"
```

---

### Task 10: trend-spotter/index.js

**Files:**
- Create: `agents/trend-spotter/index.js`

- [ ] **Step 10.1: Write failing test**

Add to `tests/agents/trend-spotter.test.js`:

```js
jest.mock('../../../agents/trend-spotter/sources/google-trends');
jest.mock('../../../agents/trend-spotter/sources/mercadolibre');
jest.mock('../../../shared/supabase');

const { getTrendingProducts: gtGoogleTrends } = require('../../../agents/trend-spotter/sources/google-trends');
const { getAllMLTrending } = require('../../../agents/trend-spotter/sources/mercadolibre');
const { getClient } = require('../../../shared/supabase');

describe('trend-spotter/index', () => {
  const mockInsert = jest.fn().mockResolvedValue({ error: null });
  const mockFrom = jest.fn(() => ({ insert: mockInsert }));

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    getClient.mockReturnValue({ from: mockFrom });
    gtGoogleTrends.mockResolvedValue([
      { nombre: 'Tenis Nike', score: 50000 }
    ]);
    getAllMLTrending.mockResolvedValue([
      { nombre: 'Audífonos JBL', score: 200 }
    ]);
  });

  test('run() inserts merged results into trending_products', async () => {
    const { run } = require('../../../agents/trend-spotter/index');
    await run();

    expect(mockFrom).toHaveBeenCalledWith('trending_products');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ nombre: expect.any(String), fuente: expect.any(String) })
      ])
    );
  });

  test('run() does not throw if one source fails', async () => {
    gtGoogleTrends.mockResolvedValue([]);
    getAllMLTrending.mockResolvedValue([{ nombre: 'Blusa', score: 100 }]);

    const { run } = require('../../../agents/trend-spotter/index');
    await expect(run()).resolves.not.toThrow();
  });
});
```

- [ ] **Step 10.2: Run test to confirm it fails**

```bash
npx jest tests/agents/trend-spotter.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 10.3: Implement**

Create `agents/trend-spotter/index.js`:

```js
require('dotenv').config();
const { getTrendingProducts } = require('./sources/google-trends');
const { getAllMLTrending } = require('./sources/mercadolibre');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

async function run() {
  logger.info('Trend Spotter started');

  const [googleResults, mlResults] = await Promise.all([
    getTrendingProducts(),
    getAllMLTrending()
  ]);

  const rows = [
    ...googleResults.map(r => ({
      nombre: r.nombre,
      score_tendencia: r.score,
      fuente: 'google_trends'
    })),
    ...mlResults.map(r => ({
      nombre: r.nombre,
      score_tendencia: r.score,
      fuente: 'mercadolibre'
    }))
  ];

  if (rows.length === 0) {
    logger.warn('Trend Spotter: no products found from any source');
    return;
  }

  const { error } = await getClient()
    .from('trending_products')
    .insert(rows);

  if (error) {
    logger.error('Trend Spotter: Supabase insert failed', { error: error.message });
    throw new Error(error.message);
  }

  logger.info('Trend Spotter completed', { inserted: rows.length });
}

// Allow running directly: node agents/trend-spotter/index.js
if (require.main === module) {
  run().catch(err => {
    logger.error('Trend Spotter crashed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { run };
```

- [ ] **Step 10.4: Run test to confirm it passes**

```bash
npx jest tests/agents/trend-spotter.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 10.5: Commit**

```bash
git add agents/trend-spotter/index.js
git commit -m "feat: complete Trend Spotter agent"
```

---

### Task 11: evergreen-validator/sources/mercadolibre.js

**Files:**
- Create: `agents/evergreen-validator/sources/mercadolibre.js`
- Create: `tests/agents/evergreen-validator.test.js`

- [ ] **Step 11.1: Write failing test**

Create `tests/agents/evergreen-validator.test.js`:

```js
jest.mock('../../../shared/ml-client');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const { searchProducts } = require('../../../shared/ml-client');

describe('evergreen-validator/sources/mercadolibre', () => {
  const MIN_SALES = 10;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MIN_VENTAS_HISTORICAS = String(MIN_SALES);
  });

  test('getEvergreenFromML returns only products with sufficient sales', async () => {
    searchProducts.mockResolvedValue([
      { title: 'Mochila', sold_quantity: 500 },
      { title: 'Llavero', sold_quantity: 3 },  // below min
      { title: 'Camiseta', sold_quantity: 150 }
    ]);

    const { getEvergreenFromML } = require('../../../agents/evergreen-validator/sources/mercadolibre');
    const results = await getEvergreenFromML('mochila');

    expect(results).toHaveLength(2);
    expect(results.every(r => r.ventas_historicas >= MIN_SALES)).toBe(true);
  });

  test('returns empty array on ML error', async () => {
    const logger = require('../../../shared/logger');
    searchProducts.mockRejectedValue(new Error('ML down'));

    const { getEvergreenFromML } = require('../../../agents/evergreen-validator/sources/mercadolibre');
    const results = await getEvergreenFromML('algo');

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 11.2: Run test to confirm it fails**

```bash
npx jest tests/agents/evergreen-validator.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 11.3: Implement**

Create `agents/evergreen-validator/sources/mercadolibre.js`:

```js
require('dotenv').config();
const { searchProducts } = require('../../../shared/ml-client');
const logger = require('../../../shared/logger');

const MIN_VENTAS = parseInt(process.env.MIN_VENTAS_HISTORICAS || '10', 10);

const EVERGREEN_KEYWORDS = [
  'mochila', 'silla de oficina', 'audífonos inalámbricos', 'termo acero',
  'mouse inalámbrico', 'lámpara led', 'organizador escritorio',
  'espejo maquillaje', 'porta celular auto', 'cargador inalámbrico'
];

async function getEvergreenFromML(keyword) {
  try {
    const items = await searchProducts(keyword);

    const results = items
      .filter(item => (item.sold_quantity || 0) >= MIN_VENTAS)
      .map(item => ({
        nombre: item.title,
        ventas_historicas: item.sold_quantity || 0
      }));

    logger.info('ML evergreen fetched', { keyword, count: results.length });
    return results;
  } catch (err) {
    logger.warn('ML evergreen fetch failed — skipping', { keyword, error: err.message });
    return [];
  }
}

async function getAllEvergreenFromML() {
  const allResults = [];
  for (const keyword of EVERGREEN_KEYWORDS) {
    const results = await getEvergreenFromML(keyword);
    allResults.push(...results);
  }
  return allResults;
}

module.exports = { getEvergreenFromML, getAllEvergreenFromML };
```

- [ ] **Step 11.4: Run test to confirm it passes**

```bash
npx jest tests/agents/evergreen-validator.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 11.5: Commit**

```bash
git add agents/evergreen-validator/sources/mercadolibre.js tests/agents/evergreen-validator.test.js
git commit -m "feat: add evergreen-validator mercadolibre source"
```

---

### Task 12: evergreen-validator/sources/google-trends.js

**Files:**
- Create: `agents/evergreen-validator/sources/google-trends.js`

- [ ] **Step 12.1: Write failing test**

Add to `tests/agents/evergreen-validator.test.js`:

```js
jest.mock('google-trends-api');
const googleTrends = require('google-trends-api');

describe('evergreen-validator/sources/google-trends', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getTrendStability returns score between 0 and 100 for stable product', async () => {
    // Mock 12-week interest over time data with consistently high values
    googleTrends.interestOverTime.mockResolvedValue(JSON.stringify({
      default: {
        timelineData: [
          { value: [80] }, { value: [85] }, { value: [78] },
          { value: [82] }, { value: [79] }, { value: [83] },
          { value: [81] }, { value: [84] }, { value: [80] },
          { value: [82] }, { value: [79] }, { value: [85] }
        ]
      }
    }));

    const { getTrendStability } = require('../../../agents/evergreen-validator/sources/google-trends');
    const score = await getTrendStability('mochila');

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('returns 0 on Google Trends error', async () => {
    const logger = require('../../../shared/logger');
    googleTrends.interestOverTime.mockRejectedValue(new Error('Rate limit'));

    const { getTrendStability } = require('../../../agents/evergreen-validator/sources/google-trends');
    const score = await getTrendStability('algo');

    expect(score).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 12.2: Run test to confirm it fails**

```bash
npx jest tests/agents/evergreen-validator.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 12.3: Implement**

Create `agents/evergreen-validator/sources/google-trends.js`:

```js
require('dotenv').config();
const googleTrends = require('google-trends-api');
const logger = require('../../../shared/logger');

// Returns a stability score 0-100.
// High score = consistent search volume over 12 weeks (evergreen).
// Low score = highly variable (possibly just trendy, not evergreen).
async function getTrendStability(keyword) {
  try {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 84); // 12 weeks back

    const raw = await googleTrends.interestOverTime({
      keyword,
      geo: 'CO',
      startTime
    });

    const data = JSON.parse(raw);
    const points = (data.default?.timelineData || []).map(p => p.value[0]);

    if (points.length === 0) return 0;

    const avg = points.reduce((a, b) => a + b, 0) / points.length;
    const variance = points.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / points.length;
    const stdDev = Math.sqrt(variance);

    // Stability = 100 - coefficient of variation (capped)
    const cv = avg > 0 ? (stdDev / avg) * 100 : 100;
    const stability = Math.max(0, Math.min(100, 100 - cv));

    logger.info('Trend stability computed', { keyword, stability: stability.toFixed(1) });
    return parseFloat(stability.toFixed(1));
  } catch (err) {
    logger.warn('getTrendStability failed — returning 0', { keyword, error: err.message });
    return 0;
  }
}

module.exports = { getTrendStability };
```

- [ ] **Step 12.4: Run test to confirm it passes**

```bash
npx jest tests/agents/evergreen-validator.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 12.5: Commit**

```bash
git add agents/evergreen-validator/sources/google-trends.js
git commit -m "feat: add evergreen-validator google-trends stability scorer"
```

---

### Task 13: evergreen-validator/index.js

**Files:**
- Create: `agents/evergreen-validator/index.js`

- [ ] **Step 13.1: Write failing test**

Add to `tests/agents/evergreen-validator.test.js`:

```js
jest.mock('../../../agents/evergreen-validator/sources/mercadolibre');
jest.mock('../../../agents/evergreen-validator/sources/google-trends');
jest.mock('../../../shared/supabase');

const { getAllEvergreenFromML } = require('../../../agents/evergreen-validator/sources/mercadolibre');
const { getTrendStability } = require('../../../agents/evergreen-validator/sources/google-trends');
const { getClient } = require('../../../shared/supabase');

describe('evergreen-validator/index', () => {
  const mockInsert = jest.fn().mockResolvedValue({ error: null });
  const mockFrom = jest.fn(() => ({ insert: mockInsert }));

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    getClient.mockReturnValue({ from: mockFrom });
    getAllEvergreenFromML.mockResolvedValue([
      { nombre: 'Mochila Totto', ventas_historicas: 400 }
    ]);
    getTrendStability.mockResolvedValue(75.5);
  });

  test('run() inserts rows into evergreen_products', async () => {
    const { run } = require('../../../agents/evergreen-validator/index');
    await run();

    expect(mockFrom).toHaveBeenCalledWith('evergreen_products');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          nombre: 'Mochila Totto',
          ventas_historicas: 400,
          estabilidad_tendencia: 75.5
        })
      ])
    );
  });
});
```

- [ ] **Step 13.2: Run test to confirm it fails**

```bash
npx jest tests/agents/evergreen-validator.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 13.3: Implement**

Create `agents/evergreen-validator/index.js`:

```js
require('dotenv').config();
const { getAllEvergreenFromML } = require('./sources/mercadolibre');
const { getTrendStability } = require('./sources/google-trends');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

async function run() {
  logger.info('Evergreen Validator started');

  const mlProducts = await getAllEvergreenFromML();

  if (mlProducts.length === 0) {
    logger.warn('Evergreen Validator: no products with sufficient sales found');
    return;
  }

  const enriched = await Promise.all(
    mlProducts.map(async product => ({
      nombre: product.nombre,
      ventas_historicas: product.ventas_historicas,
      estabilidad_tendencia: await getTrendStability(product.nombre)
    }))
  );

  const { error } = await getClient()
    .from('evergreen_products')
    .insert(enriched);

  if (error) {
    logger.error('Evergreen Validator: Supabase insert failed', { error: error.message });
    throw new Error(error.message);
  }

  logger.info('Evergreen Validator completed', { inserted: enriched.length });
}

if (require.main === module) {
  run().catch(err => {
    logger.error('Evergreen Validator crashed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { run };
```

- [ ] **Step 13.4: Run test to confirm it passes**

```bash
npx jest tests/agents/evergreen-validator.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 13.5: Commit**

```bash
git add agents/evergreen-validator/index.js
git commit -m "feat: complete Evergreen Validator agent"
```

---

### Task 14: gap-finder/analyzer.js

**Files:**
- Create: `agents/gap-finder/analyzer.js`
- Create: `tests/agents/gap-finder/analyzer.test.js`

- [ ] **Step 14.1: Write failing test**

Create `tests/agents/gap-finder/analyzer.test.js`:

```js
jest.mock('../../../shared/ml-client');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const { searchProducts } = require('../../../shared/ml-client');

describe('gap-finder/analyzer', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MAX_PRECIO_COMPRA = '150000';
    process.env.MIN_GAP_PORCENTAJE = '40';
  });

  test('analyzeProduct returns gap data when gap >= MIN_GAP_PORCENTAJE', async () => {
    searchProducts.mockResolvedValue([
      { title: 'Audífonos X', price: 50000, permalink: 'http://ml.co/1' },
      { title: 'Audífonos Y', price: 80000, permalink: 'http://ml.co/2' },
      { title: 'Audífonos Z', price: 90000, permalink: 'http://ml.co/3' }
    ]);

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('Audífonos Bluetooth');

    // precio_compra = 50000 (min), precio_promedio ≈ 73333
    // gap = ((73333 - 50000) / 50000) * 100 ≈ 46.6%
    expect(result).not.toBeNull();
    expect(result.precio_compra).toBe(50000);
    expect(result.gap_porcentaje).toBeGreaterThanOrEqual(40);
    expect(result.link).toBe('http://ml.co/1');
  });

  test('analyzeProduct returns null when gap < MIN_GAP_PORCENTAJE', async () => {
    searchProducts.mockResolvedValue([
      { title: 'Camiseta A', price: 45000, permalink: 'http://ml.co/a' },
      { title: 'Camiseta B', price: 50000, permalink: 'http://ml.co/b' },
      { title: 'Camiseta C', price: 55000, permalink: 'http://ml.co/c' }
    ]);

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('Camiseta');

    // precio_compra = 45000, precio_promedio ≈ 50000, gap ≈ 11% → below 40%
    expect(result).toBeNull();
  });

  test('analyzeProduct returns null when fewer than 2 results', async () => {
    searchProducts.mockResolvedValue([
      { title: 'Producto Raro', price: 30000, permalink: 'http://ml.co/r' }
    ]);

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('Producto Raro');
    expect(result).toBeNull();
  });

  test('analyzeProduct returns null on ML error', async () => {
    const logger = require('../../../shared/logger');
    searchProducts.mockRejectedValue(new Error('ML down'));

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('algo');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 14.2: Run test to confirm it fails**

```bash
npx jest tests/agents/gap-finder/analyzer.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 14.3: Implement**

Create `agents/gap-finder/analyzer.js`:

```js
require('dotenv').config();
const { searchProducts } = require('../../shared/ml-client');
const logger = require('../../shared/logger');

const MAX_PRECIO = parseInt(process.env.MAX_PRECIO_COMPRA || '150000', 10);
const MIN_GAP = parseFloat(process.env.MIN_GAP_PORCENTAJE || '40');

async function analyzeProduct(nombre) {
  try {
    const items = await searchProducts(nombre, { maxPrice: MAX_PRECIO });

    if (items.length < 2) {
      logger.info('analyzeProduct: insufficient results', { nombre, found: items.length });
      return null;
    }

    const prices = items.map(i => i.price).sort((a, b) => a - b);
    const precioCompra = prices[0];
    const precioPromedio = prices.reduce((a, b) => a + b, 0) / prices.length;
    const gapPorcentaje = parseFloat(
      (((precioPromedio - precioCompra) / precioCompra) * 100).toFixed(2)
    );

    if (gapPorcentaje < MIN_GAP) {
      return null;
    }

    const cheapestItem = items.find(i => i.price === precioCompra);

    const gap = {
      nombre,
      precio_compra: precioCompra,
      precio_promedio: parseFloat(precioPromedio.toFixed(0)),
      gap_porcentaje: gapPorcentaje,
      link: cheapestItem?.permalink || null
    };

    logger.info('Gap found', gap);
    return gap;
  } catch (err) {
    logger.error('analyzeProduct failed', { nombre, error: err.message });
    return null;
  }
}

module.exports = { analyzeProduct };
```

- [ ] **Step 14.4: Run test to confirm it passes**

```bash
npx jest tests/agents/gap-finder/analyzer.test.js --no-coverage
```

Expected: PASS — 4 tests passed

- [ ] **Step 14.5: Commit**

```bash
git add agents/gap-finder/analyzer.js tests/agents/gap-finder/analyzer.test.js
git commit -m "feat: add gap-finder price analyzer"
```

---

### Task 15: gap-finder/notifier.js

**Files:**
- Create: `agents/gap-finder/notifier.js`
- Create: `tests/agents/gap-finder/notifier.test.js`

- [ ] **Step 15.1: Write failing test**

Create `tests/agents/gap-finder/notifier.test.js`:

```js
jest.mock('../../../shared/telegram');
jest.mock('../../../shared/supabase');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const { sendAlert } = require('../../../shared/telegram');
const { getClient } = require('../../../shared/supabase');

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
    getClient.mockReturnValue({ from: mockFrom });
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

    const message = sendAlert.mock.calls[0][0];
    expect(message).toContain('50.000');
    expect(message).toContain('http://ml.co/item/1');
  });

  test('notify() throws if Supabase insert fails', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } });

    const { notify } = require('../../../agents/gap-finder/notifier');
    await expect(notify(sampleGap)).rejects.toThrow('DB error');
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 15.2: Run test to confirm it fails**

```bash
npx jest tests/agents/gap-finder/notifier.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 15.3: Implement**

Create `agents/gap-finder/notifier.js`:

```js
require('dotenv').config();
const { sendAlert } = require('../../shared/telegram');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

function formatCOP(amount) {
  return amount.toLocaleString('es-CO');
}

function buildAlertMessage(gap) {
  return [
    `🔥 *GAP DE ARBITRAJE ENCONTRADO*`,
    ``,
    `📦 *Producto:* ${gap.nombre}`,
    `💰 *Precio compra (ML):* $${formatCOP(gap.precio_compra)} COP`,
    `📊 *Precio promedio:* $${formatCOP(gap.precio_promedio)} COP`,
    `📈 *Gap:* ${gap.gap_porcentaje}%`,
    `🏷️ *Fuente:* ${gap.fuente}`,
    `🔗 ${gap.link}`
  ].join('\n');
}

async function notify(gap) {
  const { error } = await getClient()
    .from('arbitrage_gaps')
    .insert({
      nombre: gap.nombre,
      precio_compra: gap.precio_compra,
      precio_promedio: gap.precio_promedio,
      gap_porcentaje: gap.gap_porcentaje,
      link: gap.link,
      fuente: gap.fuente
    });

  if (error) {
    logger.error('notify: Supabase insert failed', { error: error.message });
    throw new Error(error.message);
  }

  const message = buildAlertMessage(gap);
  await sendAlert(message);

  logger.info('Gap alert sent', { nombre: gap.nombre, gap: gap.gap_porcentaje });
}

module.exports = { notify };
```

- [ ] **Step 15.4: Run test to confirm it passes**

```bash
npx jest tests/agents/gap-finder/notifier.test.js --no-coverage
```

Expected: PASS — 3 tests passed

- [ ] **Step 15.5: Commit**

```bash
git add agents/gap-finder/notifier.js tests/agents/gap-finder/notifier.test.js
git commit -m "feat: add gap-finder notifier (Supabase insert + Telegram alert)"
```

---

### Task 16: gap-finder/index.js

**Files:**
- Create: `agents/gap-finder/index.js`

- [ ] **Step 16.1: Write failing test**

Add to `tests/agents/gap-finder/analyzer.test.js` (or create a separate `gap-finder-index.test.js`):

Create `tests/agents/gap-finder/index.test.js`:

```js
jest.mock('../../../agents/gap-finder/analyzer');
jest.mock('../../../agents/gap-finder/notifier');
jest.mock('../../../shared/supabase');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
const { notify } = require('../../../agents/gap-finder/notifier');
const { getClient } = require('../../../shared/supabase');

describe('gap-finder/index', () => {
  const trendingRows = [
    { nombre: 'Audífonos JBL', fuente: 'google_trends' }
  ];
  const evergreenRows = [
    { nombre: 'Mochila Totto', fuente: 'evergreen' }
  ];

  const mockSelectTrending = jest.fn().mockResolvedValue({ data: trendingRows, error: null });
  const mockSelectEvergreen = jest.fn().mockResolvedValue({ data: evergreenRows, error: null });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    let callCount = 0;
    getClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => {
          callCount++;
          return callCount === 1 ? mockSelectTrending() : mockSelectEvergreen();
        })
      }))
    });

    analyzeProduct.mockImplementation(async nombre => ({
      nombre,
      precio_compra: 50000,
      precio_promedio: 85000,
      gap_porcentaje: 70,
      link: 'http://ml.co/item',
      fuente: 'trending'
    }));

    notify.mockResolvedValue(undefined);
  });

  test('run() reads both tables and calls analyzeProduct for each unique product', async () => {
    const { run } = require('../../../agents/gap-finder/index');
    await run();

    expect(analyzeProduct).toHaveBeenCalledWith('Audífonos JBL');
    expect(analyzeProduct).toHaveBeenCalledWith('Mochila Totto');
  });

  test('run() calls notify for each gap found', async () => {
    const { run } = require('../../../agents/gap-finder/index');
    await run();

    expect(notify).toHaveBeenCalledTimes(2);
  });

  test('run() skips products where analyzeProduct returns null', async () => {
    analyzeProduct.mockResolvedValue(null);

    const { run } = require('../../../agents/gap-finder/index');
    await run();

    expect(notify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 16.2: Run test to confirm it fails**

```bash
npx jest tests/agents/gap-finder/index.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 16.3: Implement**

Create `agents/gap-finder/index.js`:

```js
require('dotenv').config();
const { analyzeProduct } = require('./analyzer');
const { notify } = require('./notifier');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

async function fetchProductNames() {
  const db = getClient();

  const [{ data: trending, error: e1 }, { data: evergreen, error: e2 }] = await Promise.all([
    db.from('trending_products').select('nombre'),
    db.from('evergreen_products').select('nombre')
  ]);

  if (e1) throw new Error(`trending_products read failed: ${e1.message}`);
  if (e2) throw new Error(`evergreen_products read failed: ${e2.message}`);

  const trendingItems = (trending || []).map(r => ({ nombre: r.nombre, fuente: 'trending' }));
  const evergreenItems = (evergreen || []).map(r => ({ nombre: r.nombre, fuente: 'evergreen' }));

  return [...trendingItems, ...evergreenItems];
}

async function run() {
  logger.info('Gap Finder started');

  const products = await fetchProductNames();

  if (products.length === 0) {
    logger.warn('Gap Finder: no products to analyze (trending and evergreen tables are empty)');
    return;
  }

  let found = 0;
  for (const product of products) {
    const gap = await analyzeProduct(product.nombre);
    if (gap) {
      await notify({ ...gap, fuente: product.fuente });
      found++;
    }
  }

  logger.info('Gap Finder completed', { analyzed: products.length, found });
}

if (require.main === module) {
  run().catch(err => {
    logger.error('Gap Finder crashed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { run };
```

- [ ] **Step 16.4: Run test to confirm it passes**

```bash
npx jest tests/agents/gap-finder/index.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 16.5: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: ALL tests pass

- [ ] **Step 16.6: Commit**

```bash
git add agents/gap-finder/index.js tests/agents/gap-finder/index.test.js
git commit -m "feat: complete Gap Finder agent"
```

---

## PHASE 3 — Orchestration & Deployment

---

### Task 17: Cron Scheduler

**Files:**
- Create: `cron/cron.config.js`
- Create: `cron/scheduler.js`

- [ ] **Step 17.1: Implement cron.config.js**

Create `cron/cron.config.js`:

```js
module.exports = {
  TREND_SPOTTER: '0 6 * * *',     // Every day at 6:00am COL
  EVERGREEN_VALIDATOR: '0 7 * * 1', // Every Monday at 7:00am COL
  GAP_FINDER: '0 */4 * * *'        // Every 4 hours
};
```

- [ ] **Step 17.2: Implement scheduler.js**

Create `cron/scheduler.js`:

```js
require('dotenv').config();
const cron = require('node-cron');
const { TREND_SPOTTER, EVERGREEN_VALIDATOR, GAP_FINDER } = require('./cron.config');
const logger = require('../shared/logger');

const { run: runTrendSpotter } = require('../agents/trend-spotter/index');
const { run: runEvergreenValidator } = require('../agents/evergreen-validator/index');
const { run: runGapFinder } = require('../agents/gap-finder/index');

function scheduleAgent(name, schedule, runFn) {
  cron.schedule(schedule, async () => {
    logger.info(`[CRON] ${name} triggered`);
    try {
      await runFn();
    } catch (err) {
      logger.error(`[CRON] ${name} failed`, { error: err.message });
    }
  }, {
    timezone: 'America/Bogota'
  });
  logger.info(`[CRON] ${name} scheduled`, { schedule });
}

scheduleAgent('Trend Spotter', TREND_SPOTTER, runTrendSpotter);
scheduleAgent('Evergreen Validator', EVERGREEN_VALIDATOR, runEvergreenValidator);
scheduleAgent('Gap Finder', GAP_FINDER, runGapFinder);

logger.info('[CRON] Scheduler running. All agents scheduled.');
```

- [ ] **Step 17.3: Commit**

```bash
git add cron/cron.config.js cron/scheduler.js
git commit -m "feat: add cron scheduler for all 3 agents"
```

---

### Task 18: Manual Test Script

**Files:**
- Create: `scripts/test-agents.js`

- [ ] **Step 18.1: Implement test-agents.js**

Create `scripts/test-agents.js`:

```js
require('dotenv').config();
const logger = require('../shared/logger');

const { run: runTrendSpotter } = require('../agents/trend-spotter/index');
const { run: runEvergreenValidator } = require('../agents/evergreen-validator/index');
const { run: runGapFinder } = require('../agents/gap-finder/index');

const AGENT = process.argv[2]; // 'trends' | 'evergreen' | 'gaps' | 'all'

async function main() {
  logger.info('Manual test run started', { agent: AGENT || 'all' });

  if (!AGENT || AGENT === 'trends' || AGENT === 'all') {
    logger.info('--- Running Trend Spotter ---');
    await runTrendSpotter();
  }

  if (!AGENT || AGENT === 'evergreen' || AGENT === 'all') {
    logger.info('--- Running Evergreen Validator ---');
    await runEvergreenValidator();
  }

  if (!AGENT || AGENT === 'gaps' || AGENT === 'all') {
    logger.info('--- Running Gap Finder ---');
    await runGapFinder();
  }

  logger.info('Manual test run completed');
}

main().catch(err => {
  logger.error('Test run failed', { error: err.message });
  process.exit(1);
});
```

Usage:
```bash
node scripts/test-agents.js all       # run all
node scripts/test-agents.js trends    # run only trend spotter
node scripts/test-agents.js evergreen # run only evergreen validator
node scripts/test-agents.js gaps      # run only gap finder
```

- [ ] **Step 18.2: Commit**

```bash
git add scripts/test-agents.js
git commit -m "feat: add manual test-agents script"
```

---

### Task 19: PM2 Config + Deployment

**Files:**
- Create: `ecosystem.config.js`

- [ ] **Step 19.1: Create ecosystem.config.js**

Create `ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'arbitrage-colombia',
      script: 'cron/scheduler.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      }
    }
  ]
};
```

- [ ] **Step 19.2: Deploy to VPS**

SSH into VPS and run:

```bash
# Clone the repo (first time)
git clone https://github.com/your-user/arbitrage-colombia.git ~/arbitrage-colombia
cd ~/arbitrage-colombia

# Or pull latest (subsequent deploys)
git pull origin main

# Install production deps
npm install --production

# Create .env from .env.example and fill in values
cp .env.example .env
nano .env  # fill in SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 state so it survives reboots
pm2 save
pm2 startup  # follow instructions to run on system boot

# Verify
pm2 list
pm2 logs arbitrage-colombia --lines 30
```

- [ ] **Step 19.3: Verify no interference with existing processes**

```bash
pm2 list
```

Expected: `arbitrage-colombia` appears in the list. Confirm no other processes were disrupted.

- [ ] **Step 19.4: Commit**

```bash
git add ecosystem.config.js
git commit -m "feat: add PM2 ecosystem config for production deployment"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Covered By |
|---|---|
| Trend Spotter — Google Trends CO | Task 8 |
| Trend Spotter — ML API | Task 9 |
| Trend Spotter — writes trending_products | Task 10 |
| Trend Spotter — cron 24h | Task 17 |
| Evergreen Validator — ML historical sales | Task 11 |
| Evergreen Validator — Google Trends stability | Task 12 |
| Evergreen Validator — writes evergreen_products | Task 13 |
| Evergreen Validator — cron 7 days | Task 17 |
| Gap Finder — reads trending + evergreen | Task 16 |
| Gap Finder — calls ML per product | Task 14 |
| Gap Finder — calculates min/avg/gap% | Task 14 |
| Gap Finder — writes arbitrage_gaps | Task 15 |
| Gap Finder — Telegram alert when gap > 40% | Task 15 |
| Gap Finder — cron 4h | Task 17 |
| Max price $150k | shared/ml-client.js (Task 5) + analyzer.js (Task 14) |
| Min gap 40% | analyzer.js (Task 14) |
| Min ventas 10 units | evergreen-validator source (Task 11) |
| Shipping to Bucaramanga | shared/ml-client.js `shipping: 'me2'` (Task 5) |
| Exclude forbidden categories | shared/ml-client.js (Task 5) |
| DB schema | Task 1 |
| PM2 + DigitalOcean deploy | Task 19 |
| .claude/ commands | Task 7 |
| CLAUDE.md | Task 2 |
| .env.example | Task 2 |
| Shared clients never duplicated | Enforced by architecture |
| No console.log, always logger | Enforced by linter/convention |

### No Placeholders Found ✓

### Type Consistency Check

- `analyzeProduct(nombre: string)` → returns `{nombre, precio_compra, precio_promedio, gap_porcentaje, link}` or `null`
- `notify(gap: {..., fuente: string})` — `fuente` added at call site in `gap-finder/index.js` ✓
- `getClient()` returns Supabase client — consistent across all usages ✓
- `sendAlert(message: string)` — called with pre-built string in `notifier.js` ✓
- `getTrendingProducts()` returns `{nombre, score}[]` — consumed correctly in `trend-spotter/index.js` ✓
- `getAllMLTrending()` returns `{nombre, score}[]` — consumed correctly ✓
- `getEvergreenFromML(keyword)` / `getAllEvergreenFromML()` returns `{nombre, ventas_historicas}[]` ✓
- `getTrendStability(keyword)` returns `number` — stored as `estabilidad_tendencia` ✓
