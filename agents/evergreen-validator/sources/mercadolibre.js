require('dotenv').config();
const { searchProducts } = require('../../../shared/ml-client');
const logger = require('../../../shared/logger');

const EVERGREEN_KEYWORDS = [
  'audífonos bluetooth', 'consola videojuegos',
  'celular samsung', 'iphone', 'pc gamer',
  'silla gamer', 'teclado mecánico', 'gorra',
  'smartwatch', 'cargador inalámbrico',
  'parlante bluetooth', 'tablet', 'iPad',
  'case celular', 'mouse gamer'
];

async function getEvergreenFromML(keyword) {
  try {
    const items = await searchProducts(keyword);

    const results = items.map(item => ({
      nombre: item.title,
      ventas_historicas: 0, // not available from web scraping
      keyword // propagate source keyword for trend stability lookup
    }));

    logger.info('ML evergreen fetched', { keyword, count: results.length });
    return results;
  } catch (err) {
    logger.warn('ML evergreen fetch failed — skipping', { keyword, error: err.message });
    return [];
  }
}

async function getAllEvergreenFromML() {
  const settled = await Promise.allSettled(EVERGREEN_KEYWORDS.map(kw => getEvergreenFromML(kw)));
  return settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

module.exports = { getEvergreenFromML, getAllEvergreenFromML };
