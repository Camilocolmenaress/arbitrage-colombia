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
      { title: 'Audífonos Bluetooth', price: 80000, link: 'http://ml.co/1' },
      { title: 'Termo Stanley', price: 65000, link: 'http://ml.co/2' }
    ]);

    const { getTrendingFromML } = require('../../agents/trend-spotter/sources/mercadolibre');
    const results = await getTrendingFromML('audífonos bluetooth');

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('nombre');
    expect(results[0]).toHaveProperty('score');
    expect(results[0].score).toBe(0);
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

describe('trend-spotter/index', () => {
  const mockInsert = jest.fn().mockResolvedValue({ error: null });
  const mockFrom = jest.fn(() => ({ insert: mockInsert }));

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });

    jest.doMock('../../agents/trend-spotter/sources/google-trends', () => ({
      getTrendingProducts: jest.fn().mockResolvedValue([{ nombre: 'Tenis Nike', score: 50000 }])
    }));
    jest.doMock('../../agents/trend-spotter/sources/mercadolibre', () => ({
      getAllMLTrending: jest.fn().mockResolvedValue([{ nombre: 'Audífonos JBL', score: 200 }])
    }));
    jest.doMock('../../shared/supabase', () => ({
      getClient: jest.fn().mockReturnValue({ from: mockFrom })
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('run() inserts merged results into trending_products', async () => {
    const { run } = require('../../agents/trend-spotter/index');
    await run();

    expect(mockFrom).toHaveBeenCalledWith('trending_products');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ nombre: expect.any(String), fuente: expect.any(String) })
      ])
    );
  });

  test('run() does not throw if one source returns empty', async () => {
    jest.doMock('../../agents/trend-spotter/sources/google-trends', () => ({
      getTrendingProducts: jest.fn().mockResolvedValue([])
    }));

    const { run } = require('../../agents/trend-spotter/index');
    await expect(run()).resolves.not.toThrow();
  });

  test('run() returns early without inserting when all sources return empty', async () => {
    jest.doMock('../../agents/trend-spotter/sources/google-trends', () => ({
      getTrendingProducts: jest.fn().mockResolvedValue([])
    }));
    jest.doMock('../../agents/trend-spotter/sources/mercadolibre', () => ({
      getAllMLTrending: jest.fn().mockResolvedValue([])
    }));

    const { run } = require('../../agents/trend-spotter/index');
    await run();

    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('run() throws when Supabase insert returns an error', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB constraint violation' } });

    const { run } = require('../../agents/trend-spotter/index');
    await expect(run()).rejects.toThrow('DB constraint violation');
  });
});
