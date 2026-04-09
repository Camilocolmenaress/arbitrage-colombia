require('dotenv').config();
const { searchProducts } = require('../../shared/ml-client');
const logger = require('../../shared/logger');

const MAX_PRECIO = parseInt(process.env.MAX_PRECIO_COMPRA || '150000', 10);
const MIN_GAP = parseFloat(process.env.MIN_GAP_PORCENTAJE || '40');

async function analyzeProduct(nombre) {
  try {
    const items = await searchProducts(nombre, { maxPrice: MAX_PRECIO });

    if (items.length < 2) {
      logger.info('analyzeProduct: insufficient results', { nombre, found: items.length });
      return null;
    }

    const prices = items.map(i => i.price).sort((a, b) => a - b);
    const precioCompra = prices[0];
    const precioPromedio = prices.reduce((a, b) => a + b, 0) / prices.length;
    const gapPorcentaje = parseFloat(
      (((precioPromedio - precioCompra) / precioCompra) * 100).toFixed(2)
    );

    if (gapPorcentaje < MIN_GAP) {
      return null;
    }

    const cheapestItem = items.find(i => i.price === precioCompra);

    const gap = {
      nombre,
      precio_compra: precioCompra,
      precio_promedio: parseFloat(precioPromedio.toFixed(0)),
      gap_porcentaje: gapPorcentaje,
      link: cheapestItem?.permalink || null
    };

    logger.info('Gap found', gap);
    return gap;
  } catch (err) {
    logger.error('analyzeProduct failed', { nombre, error: err.message });
    return null;
  }
}

module.exports = { analyzeProduct };
