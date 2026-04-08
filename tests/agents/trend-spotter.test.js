jest.mock('google-trends-api');
jest.mock('../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

describe('trend-spotter/sources/google-trends', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getTrendingProducts returns array of {nombre, score} objects', async () => {
    // Require after resetModules to get fresh mock references
    const googleTrends = require('google-trends-api');
    googleTrends.dailyTrends.mockResolvedValue(JSON.stringify({
      default: {
        trendingSearchesDays: [{
          trendingSearches: [
            {
              title: { query: 'zapatos nike' },
              formattedTraffic: '100K+'
            },
            {
              title: { query: 'audífonos bluetooth' },
              formattedTraffic: '50K+'
            }
          ]
        }]
      }
    }));

    const { getTrendingProducts } = require('../../agents/trend-spotter/sources/google-trends');
    const results = await getTrendingProducts();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('nombre');
    expect(results[0]).toHaveProperty('score');
  });

  test('returns empty array and logs warn on API failure', async () => {
    // Require after resetModules to get fresh mock references
    const googleTrends = require('google-trends-api');
    const logger = require('../../shared/logger');
    googleTrends.dailyTrends.mockRejectedValue(new Error('Google Trends down'));

    const { getTrendingProducts } = require('../../agents/trend-spotter/sources/google-trends');
    const results = await getTrendingProducts();

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
