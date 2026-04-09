require('dotenv').config();
const { searchProducts } = require('../../shared/ml-client');
const logger = require('../../shared/logger');

const MAX_PRECIO = parseInt(process.env.MAX_PRECIO_COMPRA || '150000', 10);
const MIN_GAP = parseFloat(process.env.MIN_GAP_PORCENTAJE || '50');

async function analyzeProduct(nombre) {
  try {
    const items = await searchProducts(nombre, { maxPrice: MAX_PRECIO });

    if (items.length < 2) {
      logger.info('analyzeProduct: insufficient results', { nombre, found: items.length });
      return null;
    }

    const cheapestItem = items.reduce((min, i) => i.price < min.price ? i : min);
    const precioCompra = cheapestItem.price;
    const precioPromedio = items.reduce((s, i) => s + i.price, 0) / items.length;
    const gapPorcentaje = parseFloat(
      (((precioPromedio - precioCompra) / precioPromedio) * 100).toFixed(2)
    );

    if (gapPorcentaje < MIN_GAP) {
      return null;
    }

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
