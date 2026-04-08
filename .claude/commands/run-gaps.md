Run the Gap Finder agent once manually to test it end-to-end.

Steps:
1. Verify `.env` exists and has all env vars including TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
2. Ensure trending_products and evergreen_products have at least some rows
3. Run: `node agents/gap-finder/index.js`
4. Check logs for "Gap Finder completed" and any "Gap alert sent" entries
5. Verify rows were inserted in Supabase `arbitrage_gaps` table
6. Check Telegram for any alert messages (if any gap > 40% was found)
