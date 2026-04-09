require('dotenv').config();
const { analyzeProduct } = require('./analyzer');
const { notify } = require('./notifier');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

async function fetchProductNames() {
  const db = getClient();

  const [{ data: trending, error: e1 }, { data: evergreen, error: e2 }] = await Promise.all([
    db.from('trending_products').select('nombre'),
    db.from('evergreen_products').select('nombre')
  ]);

  if (e1) throw new Error(`trending_products read failed: ${e1.message}`);
  if (e2) throw new Error(`evergreen_products read failed: ${e2.message}`);

  const trendingItems = (trending || []).map(r => ({ nombre: r.nombre, fuente: 'trending' }));
  const evergreenItems = (evergreen || []).map(r => ({ nombre: r.nombre, fuente: 'evergreen' }));

  return [...trendingItems, ...evergreenItems];
}

async function run() {
  logger.info('Gap Finder started');

  const products = await fetchProductNames();

  if (products.length === 0) {
    logger.warn('Gap Finder: no products to analyze (trending and evergreen tables are empty)');
    return;
  }

  let found = 0;
  for (const product of products) {
    const gap = await analyzeProduct(product.nombre);
    if (gap) {
      await notify({ ...gap, fuente: product.fuente });
      found++;
    }
  }

  logger.info('Gap Finder completed', { analyzed: products.length, found });
}

if (require.main === module) {
  run().catch(err => {
    logger.error('Gap Finder crashed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { run };
