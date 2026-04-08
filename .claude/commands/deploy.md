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
