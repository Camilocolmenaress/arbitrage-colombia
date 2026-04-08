jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({ select: jest.fn(), insert: jest.fn() }))
  }))
}));

jest.mock('../../shared/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('supabase client', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key-abc123';
  });

  test('getClient returns a supabase client', () => {
    // Require after resetModules to get fresh mock references
    const { createClient } = require('@supabase/supabase-js');
    const { getClient } = require('../../shared/supabase');
    const client = getClient();
    expect(client).toBeDefined();
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key-abc123'
    );
  });

  test('getClient returns the same instance on second call (singleton)', () => {
    const { createClient } = require('@supabase/supabase-js');
    const { getClient } = require('../../shared/supabase');
    const c1 = getClient();
    const c2 = getClient();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(c1).toBe(c2);
  });

  test('getClient throws if SUPABASE_URL is missing', () => {
    delete process.env.SUPABASE_URL;
    const { getClient } = require('../../shared/supabase');
    expect(() => getClient()).toThrow('SUPABASE_URL and SUPABASE_KEY are required');
  });

  test('getClient throws if SUPABASE_KEY is missing', () => {
    delete process.env.SUPABASE_KEY;
    const { getClient } = require('../../shared/supabase');
    expect(() => getClient()).toThrow('SUPABASE_URL and SUPABASE_KEY are required');
  });
});
