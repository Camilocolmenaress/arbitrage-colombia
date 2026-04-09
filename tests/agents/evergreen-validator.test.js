jest.mock('../../shared/ml-client');
jest.mock('../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

describe('evergreen-validator/sources/mercadolibre', () => {
  const MIN_SALES = 10;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MIN_VENTAS_HISTORICAS = String(MIN_SALES);
  });

  test('getEvergreenFromML returns only products with sufficient sales', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    searchProducts.mockResolvedValue([
      { title: 'Mochila', sold_quantity: 500 },
      { title: 'Llavero', sold_quantity: 3 },
      { title: 'Camiseta', sold_quantity: 150 }
    ]);

    const { getEvergreenFromML } = require('../../agents/evergreen-validator/sources/mercadolibre');
    const results = await getEvergreenFromML('mochila');

    expect(results).toHaveLength(2);
    expect(results.every(r => r.ventas_historicas >= MIN_SALES)).toBe(true);
  });

  test('returns empty array on ML error', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    const logger = require('../../shared/logger');
    searchProducts.mockRejectedValue(new Error('ML down'));

    const { getEvergreenFromML } = require('../../agents/evergreen-validator/sources/mercadolibre');
    const results = await getEvergreenFromML('algo');

    expect(results).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });
});

jest.mock('google-trends-api');

describe('evergreen-validator/sources/google-trends', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('getTrendStability returns score between 0 and 100 for stable product', async () => {
    const googleTrends = require('google-trends-api');
    googleTrends.interestOverTime.mockResolvedValue(JSON.stringify({
      default: {
        timelineData: [
          { value: [80] }, { value: [85] }, { value: [78] },
          { value: [82] }, { value: [79] }, { value: [83] },
          { value: [81] }, { value: [84] }, { value: [80] },
          { value: [82] }, { value: [79] }, { value: [85] }
        ]
      }
    }));

    const { getTrendStability } = require('../../agents/evergreen-validator/sources/google-trends');
    const score = await getTrendStability('mochila');

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('returns 0 on Google Trends error', async () => {
    const googleTrends = require('google-trends-api');
    const logger = require('../../shared/logger');
    googleTrends.interestOverTime.mockRejectedValue(new Error('Rate limit'));

    const { getTrendStability } = require('../../agents/evergreen-validator/sources/google-trends');
    const score = await getTrendStability('algo');

    expect(score).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });
});
