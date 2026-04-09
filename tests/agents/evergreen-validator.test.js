jest.mock('../../shared/ml-client');
jest.mock('../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

describe('evergreen-validator/sources/mercadolibre', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MIN_VENTAS_HISTORICAS = '10';
  });

  test('getEvergreenFromML returns all scraped products (no sold_quantity filter)', async () => {
    const { searchProducts } = require('../../shared/ml-client');
    searchProducts.mockResolvedValue([
      { title: 'Mochila', price: 80000, link: 'http://ml.co/1' },
      { title: 'Silla Gamer', price: 120000, link: 'http://ml.co/2' }
    ]);

    const { getEvergreenFromML } = require('../../agents/evergreen-validator/sources/mercadolibre');
    const results = await getEvergreenFromML('mochila');

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('nombre', 'Mochila');
    expect(results[0]).toHaveProperty('ventas_historicas', 0);
    expect(results[0]).toHaveProperty('keyword', 'mochila');
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

    // Values 78-85 have ~3% CV → stability ~97; assert tightly
    expect(score).toBeGreaterThan(90);
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

jest.mock('../../shared/supabase');

describe('evergreen-validator/index', () => {
  const mockInsert = jest.fn().mockResolvedValue({ error: null });
  const mockFrom = jest.fn(() => ({ insert: mockInsert }));

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });

    jest.doMock('../../agents/evergreen-validator/sources/mercadolibre', () => ({
      getAllEvergreenFromML: jest.fn().mockResolvedValue([
        { nombre: 'Mochila Totto', ventas_historicas: 400, keyword: 'mochila' }
      ])
    }));
    jest.doMock('../../agents/evergreen-validator/sources/google-trends', () => ({
      getTrendStability: jest.fn().mockResolvedValue(75.5)
    }));
    jest.doMock('../../shared/supabase', () => ({
      getClient: jest.fn().mockReturnValue({ from: mockFrom })
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('run() inserts rows into evergreen_products with correct schema', async () => {
    const { run } = require('../../agents/evergreen-validator/index');
    await run();

    expect(mockFrom).toHaveBeenCalledWith('evergreen_products');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          nombre: 'Mochila Totto',
          ventas_historicas: 400,
          estabilidad_tendencia: 75.5
        })
      ])
    );
  });

  test('run() returns early without inserting when no ML products found', async () => {
    jest.doMock('../../agents/evergreen-validator/sources/mercadolibre', () => ({
      getAllEvergreenFromML: jest.fn().mockResolvedValue([])
    }));

    const { run } = require('../../agents/evergreen-validator/index');
    await run();

    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('run() throws when Supabase insert returns an error', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } });

    const { run } = require('../../agents/evergreen-validator/index');
    await expect(run()).rejects.toThrow('DB error');
  });
});
