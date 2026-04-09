jest.mock('../../../shared/ml-client');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

describe('gap-finder/analyzer', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MAX_PRECIO_COMPRA = '150000';
    process.env.MIN_GAP_PORCENTAJE = '40';
  });

  test('analyzeProduct returns gap data when gap >= MIN_GAP_PORCENTAJE', async () => {
    const { searchProducts } = require('../../../shared/ml-client');
    searchProducts.mockResolvedValue([
      { title: 'Audífonos X', price: 50000, permalink: 'http://ml.co/1' },
      { title: 'Audífonos Y', price: 80000, permalink: 'http://ml.co/2' },
      { title: 'Audífonos Z', price: 90000, permalink: 'http://ml.co/3' }
    ]);

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('Audífonos Bluetooth');

    // precio_compra = 50000 (min), precio_promedio ≈ 73333, gap ≈ 46.6%
    expect(result).not.toBeNull();
    expect(result.precio_compra).toBe(50000);
    expect(result.gap_porcentaje).toBeGreaterThanOrEqual(40);
    expect(result.link).toBe('http://ml.co/1');
  });

  test('analyzeProduct returns null when gap < MIN_GAP_PORCENTAJE', async () => {
    const { searchProducts } = require('../../../shared/ml-client');
    searchProducts.mockResolvedValue([
      { title: 'Camiseta A', price: 45000, permalink: 'http://ml.co/a' },
      { title: 'Camiseta B', price: 50000, permalink: 'http://ml.co/b' },
      { title: 'Camiseta C', price: 55000, permalink: 'http://ml.co/c' }
    ]);

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('Camiseta');

    // precio_compra = 45000, precio_promedio ≈ 50000, gap ≈ 11% → below 40%
    expect(result).toBeNull();
  });

  test('analyzeProduct returns null when fewer than 2 results', async () => {
    const { searchProducts } = require('../../../shared/ml-client');
    searchProducts.mockResolvedValue([
      { title: 'Producto Raro', price: 30000, permalink: 'http://ml.co/r' }
    ]);

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('Producto Raro');
    expect(result).toBeNull();
  });

  test('analyzeProduct returns null on ML error', async () => {
    const { searchProducts } = require('../../../shared/ml-client');
    const logger = require('../../../shared/logger');
    searchProducts.mockRejectedValue(new Error('ML down'));

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    const result = await analyzeProduct('algo');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});
