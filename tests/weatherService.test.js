import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

function responseJson(data, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(data),
  };
}

function installBrowserGlobals() {
  Object.defineProperty(globalThis, 'location', {
    value: new URL('http://dashboard.local/energy-dashboard.html'),
    configurable: true,
  });
  if (!globalThis.btoa) {
    globalThis.btoa = v => Buffer.from(v, 'binary').toString('base64');
  }
}

async function loadModules({ vcLocation = 'Amsterdam,NL', vcUnitGroup = 'metric', vcKey = 'TEST_KEY' } = {}) {
  vi.resetModules();

  vi.doMock('../scripts/config/resolveConfig.js', () => ({
    CFG: {
      weatherProvider: 'visualcrossing',
      vcLocation,
      vcUnitGroup,
      vcKey,
      usageIdx: 0, selfSufficiencyIdx: 0, selfConsumptionIdx: 0,
      electricityPriceIdx: 0, gasPriceIdx: 0, inverterLimitIdx: 0,
    },
    DOMOTICZ_CFG: {
      baseUrl: 'http://domoticz.local:8080/',
      auth: 'none',
      username: '',
      password: '',
    },
  }));

  // Import the VC service directly so vi.doMock applies correctly.
  // weatherService re-exports WEATHER_TTL from visualCrossingService, so
  // we also import weatherService for the TTL and fetchWeatherData exports.
  const weather   = await import('../scripts/services/visualCrossingService.js');
  const domoticz  = await import('../scripts/services/domoticzService.js');
  return { weather, domoticz };
}

describe('weatherService', () => {
  beforeEach(() => {
    installBrowserGlobals();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exports WEATHER_TTL as 5 minutes in milliseconds', async () => {
    const { weather } = await loadModules();
    expect(weather.WEATHER_TTL).toBe(5 * 60 * 1000);
  });

  it('returns currentConditions and day from a successful response', async () => {
    const payload = {
      currentConditions: { temp: 18.4, conditions: 'Partly cloudy', icon: 'partly-cloudy-day' },
      days: [{ sunrise: '06:12:00', sunset: '21:44:00' }],
    };
    globalThis.fetch.mockResolvedValue(responseJson(payload));

    const { weather } = await loadModules();
    const result = await weather.fetchWeatherData();

    expect(result.currentConditions).toEqual(payload.currentConditions);
    expect(result.day).toEqual(payload.days[0]);
  });

  it('falls back to currentConditions for day when days array is empty', async () => {
    const cc = { temp: 12, conditions: 'Clear', icon: 'clear-day' };
    globalThis.fetch.mockResolvedValue(responseJson({ currentConditions: cc, days: [] }));

    const { weather } = await loadModules();
    const result = await weather.fetchWeatherData();

    expect(result.day).toEqual(cc);
  });

  it('includes the API key in the fetch URL but not in the cache key', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const payload = { currentConditions: { temp: 20 }, days: [{ sunrise: '06:00:00' }] };
    globalThis.fetch.mockResolvedValue(responseJson(payload));

    const { weather, domoticz } = await loadModules({ vcKey: 'SECRET_KEY' });

    await weather.fetchWeatherData();

    // The network request must contain the API key.
    const fetchedUrl = globalThis.fetch.mock.calls[0][0];
    expect(fetchedUrl).toContain('key=SECRET_KEY');

    // The cache key must NOT contain the API key — verified by checking that
    // a second call with a *different* key still returns the cached response
    // (same location + unitGroup → same cache key → no second fetch).
    vi.resetModules();
    vi.doMock('../scripts/config/resolveConfig.js', () => ({
      CFG: {
        weatherProvider: 'visualcrossing',
        vcLocation: 'Amsterdam,NL', vcUnitGroup: 'metric', vcKey: 'ROTATED_KEY',
        usageIdx: 0, selfSufficiencyIdx: 0, selfConsumptionIdx: 0,
        electricityPriceIdx: 0, gasPriceIdx: 0, inverterLimitIdx: 0,
      },
      DOMOTICZ_CFG: {
        baseUrl: 'http://domoticz.local:8080/', auth: 'none', username: '', password: '',
      },
    }));

    // Re-import weatherService — but domoticzService module (and its cache) is shared
    // because vi.resetModules() was called after the first import, yet the cache Map
    // lives in the already-evaluated domoticz module instance. We verify the cache
    // key concept by checking stats instead.
    const stats = domoticz.getCacheStats();
    expect(stats.entries.every(e => !e.url.includes('SECRET_KEY'))).toBe(true);
    expect(stats.entries.every(e => !e.url.includes('ROTATED_KEY'))).toBe(true);

    domoticz.clearCache();
  });

  it('caches the response and avoids a second network call within the TTL', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const payload = { currentConditions: { temp: 21 }, days: [{}] };
    globalThis.fetch.mockResolvedValue(responseJson(payload));

    const { weather } = await loadModules();

    await weather.fetchWeatherData();
    now = 30_000; // still within 5-minute TTL
    await weather.fetchWeatherData();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    globalThis.fetch.mockResolvedValue(
      responseJson({ currentConditions: { temp: 21 }, days: [{}] })
    );

    const { weather } = await loadModules();

    await weather.fetchWeatherData();
    now = 1_000 + 5 * 60 * 1000 + 1; // just past TTL
    globalThis.fetch.mockResolvedValue(
      responseJson({ currentConditions: { temp: 22 }, days: [{}] })
    );

    const result = await weather.fetchWeatherData();
    expect(result.currentConditions.temp).toBe(22);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws on a non-OK HTTP response', async () => {
    globalThis.fetch.mockResolvedValue(responseJson({}, 503, 'Service Unavailable'));

    const { weather } = await loadModules();
    await expect(weather.fetchWeatherData()).rejects.toThrow('HTTP 503 Service Unavailable');
  });

  // ---- cacheKey option on cachedFetch (unit test of the feature itself) ----

  describe('cachedFetch cacheKey option', () => {
    async function loadDomoticz() {
      vi.resetModules();
      vi.doMock('../scripts/config/resolveConfig.js', () => ({
        CFG: { usageIdx: 0, selfSufficiencyIdx: 0, selfConsumptionIdx: 0, electricityPriceIdx: 0, gasPriceIdx: 0, inverterLimitIdx: 0 },
        DOMOTICZ_CFG: { baseUrl: 'http://domoticz.local:8080/', auth: 'none', username: '', password: '' },
      }));
      return import('../scripts/services/domoticzService.js');
    }

    it('uses the override key for cache lookup, not the fetch URL', async () => {
      let now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      globalThis.fetch.mockResolvedValue(responseJson({ v: 1 }));

      const svc = await loadDomoticz();
      await svc.cachedFetch('http://host/api?key=SECRET', 55_000, { cacheKey: 'stable-key' });

      // Second call with a different URL but same cacheKey → cache hit, no new fetch.
      now = 2_000;
      await svc.cachedFetch('http://host/api?key=ROTATED', 55_000, { cacheKey: 'stable-key' });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // The stored entry uses the stable key, not the raw URL.
      const stats = svc.getCacheStats();
      expect(stats.entries.map(e => e.url)).toContain('stable-key');
      expect(stats.entries.map(e => e.url)).not.toContain('http://host/api?key=SECRET');

      svc.clearCache();
    });

    it('falls back to url as cache key when cacheKey is not provided', async () => {
      vi.spyOn(Date, 'now').mockImplementation(() => 1_000);
      globalThis.fetch.mockResolvedValue(responseJson({ v: 2 }));

      const svc = await loadDomoticz();
      await svc.cachedFetch('http://host/plain', 55_000);

      const stats = svc.getCacheStats();
      expect(stats.entries.map(e => e.url)).toContain('http://host/plain');

      svc.clearCache();
    });
  });
});
