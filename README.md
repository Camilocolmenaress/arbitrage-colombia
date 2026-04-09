# arbitrage-colombia

3-agent system that finds arbitrage opportunities between MercadoLibre Colombia and Facebook Marketplace Bucaramanga.

Runs **locally on macOS** via launchd. MercadoLibre blocks datacenter IPs — a residential IP is required.

## How it works

| Agent | Schedule | Writes to |
|-------|----------|-----------|
| Trend Spotter | Daily 6am COL | `trending_products` |
| Evergreen Validator | Mondays 7am COL | `evergreen_products` |
| Gap Finder | Every 4 hours | `arbitrage_gaps` + Telegram |

The Gap Finder reads from both tables, finds products where the cheapest ML listing is ≥50% below the average market price, and sends a Telegram alert.

## Requirements

- Node.js 20+
- macOS (launchd)
- A Telegram bot and chat ID
- A Supabase project with the schema from `scripts/setup-db.sql`

## Setup

**1. Clone and install dependencies**

```bash
git clone https://github.com/Camilocolmenaress/arbitrage-colombia.git
cd arbitrage-colombia
npm install
```

**2. Configure environment**

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:

```
SUPABASE_URL
SUPABASE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

> MercadoLibre data is scraped directly — no API credentials required.

**3. Initialize the database**

Run `scripts/setup-db.sql` in your Supabase SQL editor.

**4. Install as a background service**

```bash
bash scripts/install-launchd.sh
```

This creates `~/Library/LaunchAgents/com.arbitrage-colombia.plist`, starts the scheduler immediately, and configures it to restart on login.

Logs: `~/Library/Logs/arbitrage-colombia.log`

## Service management

```bash
# View live logs
tail -f ~/Library/Logs/arbitrage-colombia.log

# Stop the service
bash scripts/stop-local.sh

# Start the service
bash scripts/start-local.sh

# Remove the service completely
bash scripts/uninstall-launchd.sh
```

## Manual test run

Run any agent manually without the cron schedule:

```bash
node scripts/test-agents.js all        # all agents
node scripts/test-agents.js trends     # Trend Spotter only
node scripts/test-agents.js evergreen  # Evergreen Validator only
node scripts/test-agents.js gaps       # Gap Finder only
```

## Tests

```bash
npm test
```

## Business rules

- Max purchase price: $150.000 COP
- Minimum gap to alert: 50% — `((avg - min) / avg) * 100`
- Minimum historical sales: 10 units
- Shipping: Mercado Envíos only (covers Bucaramanga)
- Excluded categories: motos, inmuebles, animales, joyería/oro
