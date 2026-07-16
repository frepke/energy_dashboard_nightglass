import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

function responseJson(data, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(data)
  };
}

function installBrowserGlobals(url = 'http://dashboard.local/energy-dashboard.html') {
  Object.defineProperty(globalThis, 'location', {
    value: new URL(url),
    configurable: true
  });

  if (!globalThis.btoa) {
    globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
  }
}

async function loadService({ cfg = {}, domoticzCfg = {} } = {}) {
  vi.resetModules();

  vi.doMock('../scripts/config/resolveConfig.js', () => ({
    CFG: {
      fetchTimeoutMs: 10_000,
      usageIdx: 0,
      selfSufficiencyIdx: 0,
      selfConsumptionIdx: 0,
      electricityPriceIdx: 0,
      gasPriceIdx: 0,
      inverterLimitIdx: 0,
      ...cfg
    },
    DOMOTICZ_CFG: {
      baseUrl: 'http://domoticz.local:8080/',
      auth: 'none',
      username: '',
      password: '',
      ...domoticzCfg
    }
  }));

  return import('../scripts/services/domoticzService.js');
}

describe('domoticzService', () => {
  beforeEach(() => {
    installBrowserGlobals();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('builds normalized Domoticz HTTP and WebSocket URLs', async () => {
    const service = await loadService({
      domoticzCfg: {
        baseUrl: 'https://domoticz.example.test:8443///',
        auth: 'none'
      }
    });

    expect(service.domoticzBaseUrl()).toBe('https://domoticz.example.test:8443');
    expect(service.domoticzUrl('/json.htm?type=command')).toBe(
      'https://domoticz.example.test:8443/json.htm?type=command'
    );

    const ws = new URL(service.domoticzWebSocketUrl());

    expect(ws.protocol).toBe('wss:');
    expect(ws.host).toBe('domoticz.example.test:8443');
    expect(ws.pathname).toBe('/json');
    expect(ws.search).toBe('');
  });

  it('uses root-relative API URLs in same-origin Domoticz mode', async () => {
    const service = await loadService({
      domoticzCfg: {
        baseUrl: '',
        auth: 'none'
      }
    });

    expect(service.domoticzUrl('json.htm?type=command')).toBe('/json.htm?type=command');
    expect(service.domoticzUrl('/json.htm?type=command')).toBe('/json.htm?type=command');
  });

  it('adds credentials to the WebSocket URL when basic auth is configured', async () => {
    const service = await loadService({
      domoticzCfg: {
        baseUrl: 'http://domoticz.example.test',
        auth: 'basic',
        username: 'demo',
        password: 'secret'
      }
    });

    const ws = new URL(service.domoticzWebSocketUrl());

    expect(ws.protocol).toBe('ws:');
    expect(ws.username).toBe('demo');
    expect(ws.password).toBe('secret');
    expect(ws.pathname).toBe('/json');
  });

  it('caches successful fetches until the TTL expires', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    globalThis.fetch.mockResolvedValue(responseJson({ result: 'cached' }));

    const service = await loadService();

    await expect(service.cachedFetch('http://domoticz.local/json.htm', 55_000)).resolves.toEqual({
      result: 'cached'
    });

    now = 2_000;

    await expect(service.cachedFetch('http://domoticz.local/json.htm', 55_000)).resolves.toEqual({
      result: 'cached'
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    now = 60_001;

    await service.cachedFetch('http://domoticz.local/json.htm', 55_000);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache reads and invalidates stale entries when ttl is 0', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    globalThis.fetch
      .mockResolvedValueOnce(responseJson({ version: 1 }))
      .mockResolvedValueOnce(responseJson({ version: 2 }))
      .mockResolvedValueOnce(responseJson({ version: 3 }))
      .mockResolvedValueOnce(responseJson({ version: 4 }));

    const service = await loadService();

    await expect(service.cachedFetch('http://host/live', 55_000)).resolves.toEqual({ version: 1 });
    expect(service.getCacheStats().size).toBe(1);

    now = 2_000;
    await expect(service.cachedFetch('http://host/live', 0)).resolves.toEqual({ version: 2 });
    expect(service.getCacheStats().size).toBe(0);

    now = 3_000;
    await expect(service.cachedFetch('http://host/live', 55_000)).resolves.toEqual({ version: 3 });
    expect(service.getCacheStats().size).toBe(1);

    now = 4_000;
    await expect(service.cachedFetch('http://host/live', 0)).resolves.toEqual({ version: 4 });
    expect(service.getCacheStats().size).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('throws a clear error for non-OK HTTP responses', async () => {
    globalThis.fetch.mockResolvedValue(responseJson({}, 503, 'Unavailable'));

    const service = await loadService();

    await expect(service.cachedFetch('http://domoticz.local/json.htm')).rejects.toThrow(
      'HTTP 503 Unavailable'
    );
  });

  it('aborts and rejects a hung fetch after the configured timeout', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch.mockImplementation(() => new Promise(() => {}));

      const service = await loadService();
      const promise = service.cachedFetch('http://domoticz.local/slow', 0, { timeoutMs: 250 });
      const expectation = expect(promise).rejects.toThrow('Fetch timeout after 250 ms');

      await vi.advanceTimersByTimeAsync(251);

      await expectation;
      const signal = globalThis.fetch.mock.calls[0][1].signal;
      expect(signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds API URLs and sends Basic Auth headers', async () => {
    globalThis.fetch.mockResolvedValue(responseJson({ status: 'OK' }));

    const service = await loadService({
      domoticzCfg: {
        baseUrl: 'http://domoticz.local:8080',
        auth: 'basic',
        username: 'müss',
        password: 'päss'
      }
    });

    await service.api({ param: 'getdevices', rid: '1,2' }, 0);

    const [url, options] = globalThis.fetch.mock.calls[0];

    expect(url).toBe(
      'http://domoticz.local:8080/json.htm?type=command&param=getdevices&rid=1%2C2'
    );
    expect(options.cache).toBe('no-store');
    expect(options.credentials).toBe('include');
    expect(options.headers.Authorization).toBe(
      'Basic ' + btoa(unescape(encodeURIComponent('müss:päss')))
    );
  });

  it('resolves and caches energy dashboard device IDs', async () => {
    globalThis.fetch.mockResolvedValue(
      responseJson({
        result: {
          ESettings: {
            idP1: '1',
            idSolar: '2',
            idGas: '3',
            idUsage: '4',
            idSelfSufficiency: '5',
            idSelfConsumption: '6',
            idInverterLimit: '7'
          }
        }
      })
    );

    const service = await loadService({
      cfg: {
        electricityPriceIdx: '8',
        gasPriceIdx: '9'
      }
    });

    await expect(service.ensureDeviceIds()).resolves.toEqual({
      p1: '1',
      solar: '2',
      gas: '3',
      usage: '4',
      selfSufficiency: '5',
      selfConsumption: '6',
      electricityPrice: '8',
      gasPrice: '9',
      inverterLimit: '7'
    });

    await service.ensureDeviceIds();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('auto-detects the inverter limit device when settings do not provide one', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(
        responseJson({
          result: {
            ESettings: {
              idP1: '1',
              idSolar: '2',
              idGas: '3'
            }
          }
        })
      )
      .mockResolvedValueOnce(
        responseJson({
          result: [
            { idx: '10', Name: 'Random switch', Data: 'Off' },
            { idx: '42', Name: 'PV inverter active power limit', Data: '100%' }
          ]
        })
      );

    const service = await loadService();

    const ids = await service.ensureDeviceIds();

    expect(ids.inverterLimit).toBe('42');
  });

  it('resets cached device IDs', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    globalThis.fetch
      .mockResolvedValueOnce(
        responseJson({
          result: {
            ESettings: {
              idP1: '1',
              idSolar: '2',
              idInverterLimit: '7'
            }
          }
        })
      )
      .mockResolvedValueOnce(
        responseJson({
          result: {
            ESettings: {
              idP1: '11',
              idSolar: '22',
              idInverterLimit: '77'
            }
          }
        })
      );

    const service = await loadService();

    expect((await service.ensureDeviceIds()).p1).toBe('1');

    service.resetDeviceIds();
    now = 60_001;

    expect((await service.ensureDeviceIds()).p1).toBe('11');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns null for missing or failed yearly gas history and sums valid rows', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    globalThis.fetch.mockResolvedValueOnce(
      responseJson({
        result: [{ v: '1.5' }, { v: 'bad' }, { v: '2.25' }]
      })
    );

    const service = await loadService();

    await expect(service.fetchYearGas('3')).resolves.toBe(3.75);

    now = 60_001;
    globalThis.fetch.mockRejectedValueOnce(new Error('network down'));

    await expect(service.fetchYearGas('3')).resolves.toBeNull();

    now = 120_002;
    globalThis.fetch.mockResolvedValueOnce(responseJson({ result: [] }));

    await expect(service.fetchYearGas('3')).resolves.toBeNull();
  });

  it('extracts yearly grid export from Domoticz P1 v3/v4 history rows', async () => {
    const service = await loadService();

    expect(service.exportKwhFromHistoryRow({ v: '10', v2: '20', v3: '1.5', v4: '2.25' })).toBe(3.75);
    expect(service.exportKwhFromHistoryRow({ export1: '4', export2: '5,5' })).toBe(9.5);
    expect(service.exportKwhFromHistoryRow({ v: '10' })).toBeNull();
  });

  it('fetches this year grid export and returns null when export fields are unavailable', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    globalThis.fetch.mockResolvedValueOnce(responseJson({
      result: [
        { d: '2026-01', v: '100', v2: '120', v3: '10', v4: '5' },
        { d: '2026-02', v: '90',  v2: '110', v3: '8',  v4: '7' },
      ]
    }));

    const service = await loadService();
    await expect(service.fetchYearGridExport('1')).resolves.toBe(30);

    now = 60_001;
    globalThis.fetch.mockResolvedValueOnce(responseJson({ result: [{ v: '100' }] }));
    await expect(service.fetchYearGridExport('1')).resolves.toBeNull();
  });

  it('finds a forecast device by JSON payload and respects a known ID', async () => {
    const service = await loadService();

    await expect(service.findForecastDevice('99')).resolves.toBe('99');

    globalThis.fetch.mockResolvedValueOnce(
      responseJson({
        result: [
          { idx: '1', Data: 'not json' },
          { idx: '2', Data: '{"hours":[]}' },
          { idx: '3', Data: '{"hours":[{"price":0.21}]}' }
        ]
      })
    );

    await expect(service.findForecastDevice('')).resolves.toBe('3');
  });

  it('returns an empty forecast device ID when no matching device exists', async () => {
    globalThis.fetch.mockResolvedValue(
      responseJson({
        result: [
          { idx: '1', Data: '' },
          { idx: '2', Data: '{"other":true}' },
          { idx: '3', Data: '{broken json' }
        ]
      })
    );

    const service = await loadService();

    await expect(service.findForecastDevice()).resolves.toBe('');
  });

  // ---- LRU cache behaviour ----

  describe('LRU cache', () => {
    it('exports the cache constants with the expected values', async () => {
      const service = await loadService();
      expect(service.CACHE_TTL).toBe(55_000);
      expect(service.DEFAULT_FETCH_TIMEOUT_MS).toBe(10_000);
      expect(service.MAX_CACHE_SIZE).toBe(100);
      expect(service.CACHE_SWEEP_INTERVAL).toBe(5 * 60_000);
    });

    it('getCacheStats reports size 0 on a fresh module', async () => {
      const service = await loadService();
      const stats   = service.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it('getCacheStats reflects a stored entry with correct url, age and ttl', async () => {
      let now = 10_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      globalThis.fetch.mockResolvedValue(responseJson({ ok: true }));

      const service = await loadService();
      await service.cachedFetch('http://host/a', 55_000);

      now = 12_000; // 2 s later
      const stats = service.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries[0].url).toBe('http://host/a');
      expect(stats.entries[0].ttl).toBe(55_000);
      expect(stats.entries[0].age).toBe(2_000);
    });

    it('clearCache empties the cache and forces a network fetch on the next call', async () => {
      globalThis.fetch.mockResolvedValue(responseJson({ v: 1 }));

      const service = await loadService();
      await service.cachedFetch('http://host/x', 55_000);
      expect(service.getCacheStats().size).toBe(1);

      service.clearCache();
      expect(service.getCacheStats().size).toBe(0);

      // After clearing, the next call must hit the network again.
      await service.cachedFetch('http://host/x', 55_000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('promotes a cache hit to MRU so it survives the next eviction', async () => {
      vi.spyOn(Date, 'now').mockImplementation(() => 1_000);
      const service        = await loadService();
      const { MAX_CACHE_SIZE } = service;

      // Fill the cache to capacity with urls /0 … /(MAX-1).
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        globalThis.fetch.mockResolvedValueOnce(responseJson({ i }));
        await service.cachedFetch(`http://host/${i}`, 55_000);
      }
      expect(service.getCacheStats().size).toBe(MAX_CACHE_SIZE);

      // Touch url /0 (current LRU) to promote it to MRU — no extra network call.
      await service.cachedFetch('http://host/0', 55_000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(MAX_CACHE_SIZE);

      // Adding one more entry evicts the new LRU (/1), not /0.
      globalThis.fetch.mockResolvedValueOnce(responseJson({ i: MAX_CACHE_SIZE }));
      await service.cachedFetch(`http://host/${MAX_CACHE_SIZE}`, 55_000);

      const urls = service.getCacheStats().entries.map(e => e.url);
      expect(urls).toContain('http://host/0');
      expect(urls).not.toContain('http://host/1');
      expect(service.getCacheStats().size).toBe(MAX_CACHE_SIZE);
    });

    it('evicts the oldest (LRU) entry when MAX_CACHE_SIZE is exceeded', async () => {
      vi.spyOn(Date, 'now').mockImplementation(() => 1_000);
      const service        = await loadService();
      const { MAX_CACHE_SIZE } = service;

      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        globalThis.fetch.mockResolvedValueOnce(responseJson({ i }));
        await service.cachedFetch(`http://host/${i}`, 55_000);
      }

      // One extra entry must push the oldest (/0) out.
      globalThis.fetch.mockResolvedValueOnce(responseJson({ i: MAX_CACHE_SIZE }));
      await service.cachedFetch(`http://host/${MAX_CACHE_SIZE}`, 55_000);

      const urls = service.getCacheStats().entries.map(e => e.url);
      expect(service.getCacheStats().size).toBe(MAX_CACHE_SIZE);
      expect(urls).not.toContain('http://host/0');
      expect(urls).toContain(`http://host/${MAX_CACHE_SIZE}`);
    });

    it('sweepExpired removes only entries whose TTL has elapsed', async () => {
      let now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      globalThis.fetch
        .mockResolvedValueOnce(responseJson({ id: 'short' }))
        .mockResolvedValueOnce(responseJson({ id: 'long'  }));

      const service = await loadService();
      await service.cachedFetch('http://host/short', 5_000);   // expires at 6 000
      await service.cachedFetch('http://host/long',  60_000);  // expires at 61 000

      now = 7_000; // short-TTL entry expired; long-TTL entry still valid
      const removed = service.sweepExpired();

      expect(removed).toBe(1);
      const urls = service.getCacheStats().entries.map(e => e.url);
      expect(urls).not.toContain('http://host/short');
      expect(urls).toContain('http://host/long');
    });

    it('sweepExpired returns 0 when all entries are still within their TTL', async () => {
      vi.spyOn(Date, 'now').mockImplementation(() => 1_000);
      globalThis.fetch.mockResolvedValue(responseJson({ v: 1 }));

      const service = await loadService();
      await service.cachedFetch('http://host/a', 55_000);
      await service.cachedFetch('http://host/b', 55_000);

      expect(service.sweepExpired()).toBe(0);
      expect(service.getCacheStats().size).toBe(2);
    });

    it('does not serve a stale entry after its TTL has elapsed', async () => {
      let now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      globalThis.fetch
        .mockResolvedValueOnce(responseJson({ version: 1 }))
        .mockResolvedValueOnce(responseJson({ version: 2 }));

      const service = await loadService();
      await expect(service.cachedFetch('http://host/q', 5_000)).resolves.toEqual({ version: 1 });

      now = 8_000; // past the 5 000 ms TTL
      await expect(service.cachedFetch('http://host/q', 5_000)).resolves.toEqual({ version: 2 });
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
