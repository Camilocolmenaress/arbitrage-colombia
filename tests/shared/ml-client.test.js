jest.mock('axios');
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
  });

  // Reusable helper: mock the OAuth token endpoint
  function mockToken(axios) {
    axios.post.mockResolvedValue({
      data: { access_token: 'test-token-abc', expires_in: 21600 }
    });
  }

  describe('OAuth token', () => {
    test('fetches token using client credentials grant', async () => {
      const axios = require('axios');
      mockToken(axios);
      axios.get.mockResolvedValue({ data: { results: [] } });

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('zapatos');

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.mercadolibre.com/oauth/token',
        expect.any(Object), // URLSearchParams body
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' })
        })
      );
    });

    test('attaches Authorization: Bearer header to search requests', async () => {
      const axios = require('axios');
      mockToken(axios);
      axios.get.mockResolvedValue({ data: { results: [] } });

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('zapatos');

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/search'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token-abc' })
        })
      );
    });

    test('caches token — only one POST for multiple requests', async () => {
      const axios = require('axios');
      mockToken(axios);
      axios.get.mockResolvedValue({ data: { results: [] } });

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('zapatos');
      await searchProducts('ropa');

      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('refreshes token when expired', async () => {
      const axios = require('axios');
      mockToken(axios);
      axios.get.mockResolvedValue({ data: { results: [] } });

      const now = Date.now();
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(now)              // set expiresAt on first fetch
        .mockReturnValueOnce(now + 22000000);  // check on second request → expired

      const { searchProducts } = require('../../shared/ml-client');
      await searchProducts('zapatos');
      await searchProducts('ropa');

      expect(axios.post).toHaveBeenCalledTimes(2);
      jest.restoreAllMocks();
    });
  });

  describe('searchProducts', () => {
    test('returns only items under MAX_PRECIO_COMPRA', async () => {
      const axios = require('axios');
      mockToken(axios);
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
      mockToken(axios);
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
      mockToken(axios);
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
      mockToken(axios);
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
      mockToken(axios);
      axios.get.mockResolvedValue({
        data: { id: 'MCO12345', title: 'Tenis Nike', price: 90000 }
      });

      const { getItemDetails } = require('../../shared/ml-client');
      const item = await getItemDetails('MCO12345');

      expect(item.id).toBe('MCO12345');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.mercadolibre.com/items/MCO12345',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token-abc' })
        })
      );
    });
  });
});
