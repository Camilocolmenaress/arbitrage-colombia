require('dotenv').config();
const { searchProducts } = require('../../../shared/ml-client');
const logger = require('../../../shared/logger');

const MIN_VENTAS = parseInt(process.env.MIN_VENTAS_HISTORICAS || '10', 10);

const EVERGREEN_KEYWORDS = [
  'mochila', 'silla de oficina', 'audífonos inalámbricos', 'termo acero',
  'mouse inalámbrico', 'lámpara led', 'organizador escritorio',
  'espejo maquillaje', 'porta celular auto', 'cargador inalámbrico'
];

async function getEvergreenFromML(keyword) {
  try {
    const items = await searchProducts(keyword);

    const results = items
      .filter(item => (item.sold_quantity || 0) >= MIN_VENTAS)
      .map(item => ({
        nombre: item.title,
        ventas_historicas: item.sold_quantity || 0
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
