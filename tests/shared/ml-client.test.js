jest.mock('axios');
jest.mock('../../shared/env-writer');
jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('ml-client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.ML_SITE_ID = 'MCO';
    process.env.ML_BASE_URL = 'https://api.mercadolibre.com';
    process.env.MAX_PRECIO_COMPRA = '150000';
    process.env.ML_CLIENT_ID = 'test-client-id';
    process.env.ML_CLIENT_SECRET = 'test-client-secret';
    process.env.ML_ACCESS_TOKEN = 'current-access-token';
    process.env.ML_REFRESH_TOKEN = 'current-refresh-token';
  });

  describe('Bearer token from env', () => {
    test('attaches ML_ACCESS_TOKEN as Bearer header to search requests', async () => {
      const axios = require('axios');
      axios.get.mockResolvedValue({ data: { results: [] } });

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('zapatos');

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/search'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer current-access-token' })
        })
      );
    });

    test('attaches ML_ACCESS_TOKEN as Bearer header to item requests', async () => {
      const axios = require('axios');
      axios.get.mockResolvedValue({ data: { id: 'MCO12345', title: 'Tenis', price: 90000 } });

      const { getItemDetails } = require('../../shared/ml-client');
      await getItemDetails('MCO12345');

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/items/MCO12345'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer current-access-token' })
        })
      );
    });
  });

  describe('401 auto-refresh', () => {
    test('on 401, refreshes token and retries with new token', async () => {
      const axios = require('axios');
      const error401 = new Error('Unauthorized');
      error401.response = { status: 401 };

      axios.get
        .mockRejectedValueOnce(error401)
        .mockResolvedValueOnce({ data: { results: [] } });

      axios.post.mockResolvedValue({
        data: { access_token: 'new-access-token', refresh_token: 'new-refresh-token' }
      });

      const { searchProducts } = require('../../shared/ml-client');
      const results = await searchProducts('zapatos');

      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(axios.get).toHaveBeenLastCalledWith(
        expect.stringContaining('/search'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer new-access-token' })
        })
      );
      expect(results).toEqual([]);
    });

    test('on 401, saves new tokens to .env', async () => {
      const axios = require('axios');
      const { updateEnvFile } = require('../../shared/env-writer');

      const error401 = new Error('Unauthorized');
      error401.response = { status: 401 };

      axios.get
        .mockRejectedValueOnce(error401)
        .mockResolvedValueOnce({ data: { results: [] } });

      axios.post.mockResolvedValue({
        data: { access_token: 'new-access-token', refresh_token: 'new-refresh-token' }
      });

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('zapatos');

      expect(updateEnvFile).toHaveBeenCalledWith(
        expect.objectContaining({ ML_ACCESS_TOKEN: 'new-access-token' })
      );
    });
  });

  describe('searchProducts', () => {
    test('returns only items under MAX_PRECIO_COMPRA', async () => {
      const axios = require('axios');
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
      const axios = require('axios');
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
      const axios = require('axios');
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
      const axios = require('axios');
      const logger = require('../../shared/logger');
      axios.get.mockRejectedValue(new Error('Network error'));

      const { searchProducts } = require('../../shared/ml-client');
      await expect(searchProducts('fallo')).rejects.toThrow('Network error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getItemDetails', () => {
    test('returns item data with Authorization header', async () => {
      const axios = require('axios');
      axios.get.mockResolvedValue({
        data: { id: 'MCO12345', title: 'Tenis Nike', price: 90000 }
      });

      const { getItemDetails } = require('../../shared/ml-client');
      const item = await getItemDetails('MCO12345');

      expect(item.id).toBe('MCO12345');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.mercadolibre.com/items/MCO12345',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer current-access-token' })
        })
      );
    });
  });
});
