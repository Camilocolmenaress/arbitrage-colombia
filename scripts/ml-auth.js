#!/usr/bin/env node
/**
 * MercadoLibre OAuth2 authorization_code flow.
 * Run once to get ML_ACCESS_TOKEN and ML_REFRESH_TOKEN, then save them to .env.
 *
 * Usage: node scripts/ml-auth.js
 */
require('dotenv').config();
const readline = require('readline');
const axios = require('axios');
const { updateEnvFile } = require('../shared/env-writer');

const ML_BASE_URL = process.env.ML_BASE_URL || 'https://api.mercadolibre.com';
const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const REDIRECT_URI = process.env.ML_REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: ML_CLIENT_ID and ML_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

if (!REDIRECT_URI) {
  console.error('ERROR: ML_REDIRECT_URI must be set in .env (must match the redirect URI registered in your ML app)');
  process.exit(1);
}

const AUTH_URL =
  `https://auth.mercadolibre.com.co/authorization` +
  `?response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n=== MercadoLibre OAuth2 Setup ===\n');
console.log('1. Open this URL in your browser:\n');
console.log(`   ${AUTH_URL}\n`);
console.log('2. Log in and approve access.');
console.log('3. You will be redirected to your redirect URI.');
console.log('   Copy the "code" query parameter from the URL.');
console.log('   Example: https://yourredirect.com?code=TG-XXXXXXXXXXXX\n');

rl.question('Paste the authorization code here: ', async (code) => {
  rl.close();
  code = code.trim();

  if (!code) {
    console.error('ERROR: No code provided.');
    process.exit(1);
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);

    const response = await axios.post(
      `${ML_BASE_URL}/oauth/token`,
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token } = response.data;

    updateEnvFile({ ML_ACCESS_TOKEN: access_token, ML_REFRESH_TOKEN: refresh_token });

    console.log('\n✓ Tokens saved to .env');
    console.log('  ML_ACCESS_TOKEN and ML_REFRESH_TOKEN updated.\n');
    console.log('You can now run: node scripts/test-agents.js all\n');
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`\nERROR: Token exchange failed — ${msg}`);
    process.exit(1);
  }
});
