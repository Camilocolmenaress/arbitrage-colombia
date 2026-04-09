jest.mock('../../../agents/gap-finder/analyzer');
jest.mock('../../../agents/gap-finder/notifier');
jest.mock('../../../shared/supabase');
jest.mock('../../../shared/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

describe('gap-finder/index', () => {
  const trendingRows = [{ nombre: 'Audífonos JBL' }];
  const evergreenRows = [{ nombre: 'Mochila Totto' }];

  const mockSelectTrending = jest.fn().mockResolvedValue({ data: trendingRows, error: null });
  const mockSelectEvergreen = jest.fn().mockResolvedValue({ data: evergreenRows, error: null });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockSelectTrending.mockResolvedValue({ data: trendingRows, error: null });
    mockSelectEvergreen.mockResolvedValue({ data: evergreenRows, error: null });

    let callCount = 0;
    const { getClient } = require('../../../shared/supabase');
    getClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => {
          callCount++;
          return callCount === 1 ? mockSelectTrending() : mockSelectEvergreen();
        })
      }))
    });

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    analyzeProduct.mockImplementation(async nombre => ({
      nombre,
      precio_compra: 50000,
      precio_promedio: 85000,
      gap_porcentaje: 70,
      link: 'http://ml.co/item'
    }));

    const { notify } = require('../../../agents/gap-finder/notifier');
    notify.mockResolvedValue(undefined);
  });

  test('run() reads both tables and calls analyzeProduct for each product', async () => {
    const { run } = require('../../../agents/gap-finder/index');
    await run();

    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    expect(analyzeProduct).toHaveBeenCalledWith('Audífonos JBL');
    expect(analyzeProduct).toHaveBeenCalledWith('Mochila Totto');
  });

  test('run() calls notify for each gap found with correct fuente', async () => {
    const { run } = require('../../../agents/gap-finder/index');
    await run();

    const { notify } = require('../../../agents/gap-finder/notifier');
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Audífonos JBL', fuente: 'trending' })
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Mochila Totto', fuente: 'evergreen' })
    );
  });

  test('run() skips products where analyzeProduct returns null', async () => {
    const { analyzeProduct } = require('../../../agents/gap-finder/analyzer');
    analyzeProduct.mockResolvedValue(null);

    const { run } = require('../../../agents/gap-finder/index');
    await run();

    const { notify } = require('../../../agents/gap-finder/notifier');
    expect(notify).not.toHaveBeenCalled();
  });
});
