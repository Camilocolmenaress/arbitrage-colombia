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
