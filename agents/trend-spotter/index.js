require('dotenv').config();
const { getTrendingProducts } = require('./sources/google-trends');
const { getAllMLTrending } = require('./sources/mercadolibre');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

async function run() {
  logger.info('Trend Spotter started');

  const [googleResults, mlResults] = await Promise.all([
    getTrendingProducts(),
    getAllMLTrending()
  ]);

  const rows = [
    ...googleResults.map(r => ({
      nombre: r.nombre,
      score_tendencia: r.score,
      fuente: 'google_trends'
    })),
    ...mlResults.map(r => ({
      nombre: r.nombre,
      score_tendencia: r.score,
      fuente: 'mercadolibre'
    }))
  ];

  if (rows.length === 0) {
    logger.warn('Trend Spotter: no products found from any source');
    return;
  }

  const { error } = await getClient()
    .from('trending_products')
    .insert(rows);

  if (error) {
    logger.error('Trend Spotter: Supabase insert failed', { error: error.message });
    throw new Error(error.message);
  }

  logger.info('Trend Spotter completed', { inserted: rows.length });
}

// Allow running directly: node agents/trend-spotter/index.js
if (require.main === module) {
  run().catch(err => {
    logger.error('Trend Spotter crashed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { run };
