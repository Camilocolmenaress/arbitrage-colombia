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

jest.mock('../../shared/ml-client');

describe('trend-spotter/sources/mercadolibre', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getTrendingFromML returns array of {nombre, score} objects', async () => {
    const { searchProducts: sp } = require('../../shared/ml-client');
    sp.mockResolvedValue([
      { title: 'Audífonos Bluetooth', sold_quantity: 320, id: 'MCO1' },
      { title: 'Termo Stanley', sold_quantity: 210, id: 'MCO2' }
    ]);

    const { getTrendingFromML } = require('../../agents/trend-spotter/sources/mercadolibre');
    const results = await getTrendingFromML('audífonos');

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('nombre');
    expect(results[0]).toHaveProperty('score');
    expect(results[0].score).toBe(320);
  });

  test('returns empty array on ML error', async () => {
    const { searchProducts: sp } = require('../../shared/ml-client');
    const logger = require('../../shared/logger');
    sp.mockRejectedValue(new Error('ML API down'));

    const { getTrendingFromML } = require('../../agents/trend-spotter/sources/mercadolibre');
    const results = await getTrendingFromML('zapatos');

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});
