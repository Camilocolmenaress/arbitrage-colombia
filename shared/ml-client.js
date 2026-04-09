require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');
const { updateEnvFile } = require('./env-writer');

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

// Current access token — initialized from env, updated on refresh
let currentToken = process.env.ML_ACCESS_TOKEN;

async function refreshAccessToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', process.env.ML_CLIENT_ID);
  params.append('client_secret', process.env.ML_CLIENT_SECRET);
  params.append('refresh_token', process.env.ML_REFRESH_TOKEN);

  const response = await axios.post(
    `${ML_BASE_URL}/oauth/token`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, refresh_token } = response.data;
  currentToken = access_token;
  process.env.ML_ACCESS_TOKEN = access_token;
  if (refresh_token) process.env.ML_REFRESH_TOKEN = refresh_token;

  const toSave = { ML_ACCESS_TOKEN: access_token };
  if (refresh_token) toSave.ML_REFRESH_TOKEN = refresh_token;
  updateEnvFile(toSave);

  logger.info('ML token refreshed');
  return access_token;
}

async function withRetryOnUnauthorized(requestFn) {
  try {
    return await requestFn(currentToken);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      const newToken = await refreshAccessToken();
      return await requestFn(newToken);
    }
    throw err;
  }
}

async function searchProducts(query, options = {}) {
  const { maxPrice = MAX_PRECIO, limit = 50 } = options;

  try {
    const results = await withRetryOnUnauthorized(async (token) => {
      const response = await axios.get(`${ML_BASE_URL}/sites/${ML_SITE_ID}/search`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: query,
          limit,
          shipping: 'me2', // Mercado Envíos — ships nationwide including Bucaramanga
          price_max: maxPrice
        }
      });
      return response.data.results
        .filter(item => item.price <= maxPrice)
        .filter(item => !isForbiddenCategory(item.category_id));
    });

    logger.info('ML search completed', { query, found: results.length });
    return results;
  } catch (err) {
    logger.error('ML searchProducts failed', { query, error: err.message });
    throw err;
  }
}

async function getItemDetails(itemId) {
  try {
    return await withRetryOnUnauthorized(async (token) => {
      const response = await axios.get(`${ML_BASE_URL}/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    });
  } catch (err) {
    logger.error('ML getItemDetails failed', { itemId, error: err.message });
    throw err;
  }
}

module.exports = { searchProducts, getItemDetails };
