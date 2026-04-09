Run the Evergreen Validator agent once manually to test it end-to-end.

Steps:
1. Verify `.env` exists and has SUPABASE_URL, SUPABASE_KEY
2. Run: `node agents/evergreen-validator/index.js`
3. Check logs output for "Evergreen Validator completed"
4. Verify rows were inserted in Supabase `evergreen_products` table
