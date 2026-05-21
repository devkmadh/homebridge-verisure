const { getOverview, clearOverviewCache, getCacheKey } = require('./overviewCache');

describe('overviewCache', () => {
  afterEach(() => {
    clearOverviewCache();
  });

  it('returns cached overview within ttl', async () => {
    const installation = {
      giid: 'abc',
      config: { alias: 'Home' },
      client: jest.fn().mockResolvedValue({ installation: { doorlocks: [] } }),
    };

    await getOverview(installation, 60000);
    await getOverview(installation, 60000);

    expect(installation.client).toHaveBeenCalledTimes(1);
  });

  it('uses installation alias as cache key fallback', () => {
    expect(getCacheKey({ config: { alias: 'Site' } })).toBe('Site');
  });
});
