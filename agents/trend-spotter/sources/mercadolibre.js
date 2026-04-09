require('dotenv').config();
const { searchProducts } = require('../../../shared/ml-client');
const logger = require('../../../shared/logger');

const SEED_KEYWORDS = [
  'audífonos bluetooth', 'consola videojuegos',
  'celular samsung', 'iphone', 'pc gamer',
  'silla gamer', 'teclado mecánico', 'gorra',
  'smartwatch', 'cargador inalámbrico',
  'parlante bluetooth', 'tablet', 'iPad',
  'case celular', 'mouse gamer'
];

async function getTrendingFromML(keyword) {
  try {
    const items = await searchProducts(keyword);

    const results = items.map(item => ({
      nombre: item.title,
      score: 0 // sold_quantity not available from web scraping
    }));

    logger.info('ML trending fetched', { keyword, count: results.length });
    return results;
  } catch (err) {
    logger.warn('ML trending fetch failed — skipping', { keyword, error: err.message });
    return [];
  }
}

async function getAllMLTrending() {
  const settled = await Promise.allSettled(SEED_KEYWORDS.map(kw => getTrendingFromML(kw)));
  return settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

module.exports = { getTrendingFromML, getAllMLTrending };
