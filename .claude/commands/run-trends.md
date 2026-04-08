Run the Trend Spotter agent once manually to test it end-to-end.

Steps:
1. Verify `.env` exists and has SUPABASE_URL, SUPABASE_KEY, ML_BASE_URL, ML_SITE_ID
2. Run: `node agents/trend-spotter/index.js`
3. Check logs output for "Trend Spotter completed"
4. Verify rows were inserted in Supabase `trending_products` table
