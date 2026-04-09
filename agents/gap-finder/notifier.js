require('dotenv').config();
const { sendAlert } = require('../../shared/telegram');
const { getClient } = require('../../shared/supabase');
const logger = require('../../shared/logger');

function formatCOP(amount) {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function buildAlertMessage(gap) {
  return [
    `*GAP DE ARBITRAJE ENCONTRADO*`,
    ``,
    `*Producto:* ${gap.nombre}`,
    `*Precio compra (ML):* $${formatCOP(gap.precio_compra)} COP`,
    `*Precio promedio:* $${formatCOP(gap.precio_promedio)} COP`,
    `*Gap:* ${gap.gap_porcentaje}%`,
    `*Fuente:* ${gap.fuente}`,
    `${gap.link}`
  ].join('\n');
}

async function notify(gap) {
  const { error } = await getClient()
    .from('arbitrage_gaps')
    .insert({
      nombre: gap.nombre,
      precio_compra: gap.precio_compra,
      precio_promedio: gap.precio_promedio,
      gap_porcentaje: gap.gap_porcentaje,
      link: gap.link,
      fuente: gap.fuente
    });

  if (error) {
    logger.error('notify: Supabase insert failed', { error: error.message });
    throw new Error(error.message);
  }

  const message = buildAlertMessage(gap);
  try {
    await sendAlert(message);
    logger.info('Gap alert sent', { nombre: gap.nombre, gap: gap.gap_porcentaje });
  } catch (err) {
    // DB row already saved — Telegram failure is non-fatal; don't abort the run loop
    logger.warn('notify: Telegram alert failed (gap saved to DB)', { nombre: gap.nombre, error: err.message });
  }
}

module.exports = { notify };
