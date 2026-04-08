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
