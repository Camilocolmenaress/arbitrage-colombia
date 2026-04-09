require('dotenv').config();
const { getAllEvergreenFromML } = require('./sources/mercadolibre');
const { getTrendStability } = require('./sources/google-trends');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

async function run() {
  logger.info('Evergreen Validator started');

  const mlProducts = await getAllEvergreenFromML();

  if (mlProducts.length === 0) {
    logger.warn('Evergreen Validator: no products with sufficient sales found');
    return;
  }

  const enriched = await Promise.all(
    mlProducts.map(async product => ({
      nombre: product.nombre,
      ventas_historicas: product.ventas_historicas,
      estabilidad_tendencia: await getTrendStability(product.nombre)
    }))
  );

  const { error } = await getClient()
    .from('evergreen_products')
    .insert(enriched);

  if (error) {
    logger.error('Evergreen Validator: Supabase insert failed', { error: error.message });
    throw new Error(error.message);
  }

  logger.info('Evergreen Validator completed', { inserted: enriched.length });
}

if (require.main === module) {
  run().catch(err => {
    logger.error('Evergreen Validator crashed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { run };
