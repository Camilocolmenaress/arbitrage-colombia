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
