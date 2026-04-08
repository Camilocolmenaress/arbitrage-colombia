jest.mock('axios');
jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const axios = require('axios');

describe('ml-client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.ML_SITE_ID = 'MCO';
    process.env.ML_BASE_URL = 'https://api.mercadolibre.com';
    process.env.MAX_PRECIO_COMPRA = '150000';
  });

  describe('searchProducts', () => {
    test('returns only items under MAX_PRECIO_COMPRA', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            { id: 'MCO1', title: 'Zapatos', price: 80000, category_id: 'MCO3530', permalink: 'http://ml.co/1' },
            { id: 'MCO2', title: 'Zapatos Premium', price: 200000, category_id: 'MCO3530', permalink: 'http://ml.co/2' }
          ]
        }
      });

      const { searchProducts } = require('../../shared/ml-client');
      const results = await searchProducts('zapatos');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('MCO1');
    });

    test('excludes forbidden categories', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            { id: 'MCO3', title: 'Moto Honda', price: 80000, category_id: 'MCO1505', permalink: 'http://ml.co/3' },
            { id: 'MCO4', title: 'Blusa', price: 60000, category_id: 'MCO3530', permalink: 'http://ml.co/4' }
          ]
        }
      });

      const { searchProducts } = require('../../shared/ml-client');
      const results = await searchProducts('ropa');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('MCO4');
    });

    test('calls ML API with correct params', async () => {
      axios.get.mockResolvedValue({ data: { results: [] } });

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('tenis');

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.mercadolibre.com/sites/MCO/search',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'tenis',
            limit: 50,
            shipping: 'me2'
          })
        })
      );
    });

    test('throws and logs on API error', async () => {
      const logger = require('../../shared/logger');
      axios.get.mockRejectedValue(new Error('Network error'));

      const { searchProducts } = require('../../shared/ml-client');
      await expect(searchProducts('fallo')).rejects.toThrow('Network error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getItemDetails', () => {
    test('returns item data for a valid ID', async () => {
      axios.get.mockResolvedValue({
        data: { id: 'MCO12345', title: 'Tenis Nike', price: 90000 }
      });

      const { getItemDetails } = require('../../shared/ml-client');
      const item = await getItemDetails('MCO12345');

      expect(item.id).toBe('MCO12345');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.mercadolibre.com/items/MCO12345'
      );
    });
  });
});
