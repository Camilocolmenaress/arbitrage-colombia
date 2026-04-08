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
