require('dotenv').config();
const googleTrends = require('google-trends-api');
const logger = require('../../../shared/logger');

async function getTrendingProducts() {
  try {
    const raw = await googleTrends.dailyTrends({ geo: 'CO' });
    const data = JSON.parse(raw);

    const searches = data.default?.trendingSearchesDays?.[0]?.trendingSearches || [];

    const results = searches.map(item => ({
      nombre: item.title.query,
      score: parseTrafficString(item.formattedTraffic || '0')
    }));

    logger.info('Google Trends fetched', { count: results.length });
    return results;
  } catch (err) {
    logger.warn('Google Trends fetch failed — skipping source', { error: err.message });
    return [];
  }
}

// Converts "100K+" → 100000, "5M+" → 5000000, "500" → 500
function parseTrafficString(str) {
  const clean = str.replace(/[^0-9KMB.]/g, '');
  if (clean.endsWith('K')) return parseFloat(clean) * 1_000;
  if (clean.endsWith('M')) return parseFloat(clean) * 1_000_000;
  if (clean.endsWith('B')) return parseFloat(clean) * 1_000_000_000;
  return parseFloat(clean) || 0;
}

module.exports = { getTrendingProducts };
