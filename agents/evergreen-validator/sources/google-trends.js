require('dotenv').config();
const googleTrends = require('google-trends-api');
const logger = require('../../../shared/logger');

async function getTrendStability(keyword) {
  try {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 84); // 12 weeks back

    const raw = await googleTrends.interestOverTime({
      keyword,
      geo: 'CO',
      startTime
    });

    const data = JSON.parse(raw);
    const points = (data.default?.timelineData || []).map(p => p.value[0]);

    if (points.length === 0) return 0;

    const avg = points.reduce((a, b) => a + b, 0) / points.length;
    const variance = points.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / points.length;
    const stdDev = Math.sqrt(variance);

    const cv = avg > 0 ? (stdDev / avg) * 100 : 100;
    const stability = Math.max(0, Math.min(100, 100 - cv));

    logger.info('Trend stability computed', { keyword, stability: stability.toFixed(1) });
    return parseFloat(stability.toFixed(1));
  } catch (err) {
    logger.warn('getTrendStability failed — returning 0', { keyword, error: err.message });
    return 0;
  }
}

module.exports = { getTrendStability };
