/**
 * Domoticz API client — HTTP fetches, caching, and WebSocket URL construction.
 * Also handles device-ID resolution (energy dashboard devices + inverter limit).
 *
 * Cache design
 * ────────────
 * Uses a Map-based LRU (Least Recently Used) with two eviction triggers:
 *
 *  1. Capacity limit  — when the cache grows beyond MAX_CACHE_SIZE entries the
 *     least-recently-used entry is evicted immediately on every write.
 *  2. Periodic sweep  — every CACHE_SWEEP_INTERVAL ms a lightweight pass removes
 *     entries whose TTL has already elapsed, keeping memory usage flat for
 *     dashboards that run continuously for days.
 *
 * Map iteration order is insertion order in V8/SpiderMonkey.  Promoting a hit
 * to "most-recently used" is done with a delete-then-re-insert, which costs
 * O(1) and keeps the oldest entry at map.keys().next().value — the eviction
 * candidate.
 */

import { CFG, DOMOTICZ_CFG } from '../config/resolveConfig.js';

// ---- Cache constants ----

/** Default TTL — slightly under the 1-minute Domoticz poll interval. */
export const CACHE_TTL = 55_000;

/** Default network timeout for Domoticz/weather requests. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/** Maximum number of entries retained at any time (LRU eviction beyond this). */
export const MAX_CACHE_SIZE = 100;

/**
 * How often (ms) the background sweep removes stale entries.
 * Choosing 5 minutes balances GC pressure vs. memory growth.
 */
export const CACHE_SWEEP_INTERVAL = 5 * 60_000;

// ---- LRU cache implementation ----

/**
 * @typedef  {object} CacheEntry
 * @property {number} ts    - Timestamp of the fetch (Date.now()).
 * @property {number} ttl   - TTL that was active when this entry was stored.
 * @property {*}      data  - The parsed JSON response.
 */

/** @type {Map<string, CacheEntry>} */
const _cache = new Map();

let _sweepTimer = null;

/**
 * Schedules the next periodic sweep when one is not already pending.
 * The timer is non-blocking (unref-able in Node, no-op in browsers).
 */
function scheduleSweep() {
  if (_sweepTimer !== null) return;
  const id = setTimeout(() => {
    _sweepTimer = null;
    sweepExpired();
    if (_cache.size > 0) scheduleSweep();
  }, CACHE_SWEEP_INTERVAL);
  // In Node.js (test env) prevent the timer from keeping the process alive.
  if (id && typeof id.unref === 'function') id.unref();
  _sweepTimer = id;
}

/**
 * Removes all entries whose TTL has already elapsed.
 * Called automatically by the sweep timer; also exported for testing.
 *
 * @returns {number} Number of entries removed.
 */
export function sweepExpired() {
  const now     = Date.now();
  let   removed = 0;
  for (const [url, entry] of _cache) {
    if (now - entry.ts >= entry.ttl) {
      _cache.delete(url);
      removed++;
    }
  }
  return removed;
}

/**
 * Evicts the least-recently-used entry (= the first key in Map iteration order).
 * Only called when the cache is at MAX_CACHE_SIZE capacity.
 */
function evictLRU() {
  const oldest = _cache.keys().next().value;
  if (oldest !== undefined) _cache.delete(oldest);
}

/**
 * Stores or updates a cache entry, maintaining LRU order and the size cap.
 *
 * @param {string} url
 * @param {*}      data
 * @param {number} ttl
 */
function cacheSet(url, data, ttl) {
  // Delete first so re-inserting an existing key moves it to tail (MRU position).
  _cache.delete(url);
  if (_cache.size >= MAX_CACHE_SIZE) evictLRU();
  _cache.set(url, { ts: Date.now(), ttl, data });
  scheduleSweep();
}

/**
 * Returns a live (but shallow) snapshot of cache internals for debugging.
 *
 * @returns {{ size: number, entries: Array<{ url: string, age: number, ttl: number }> }}
 */
export function getCacheStats() {
  const now = Date.now();
  return {
    size:    _cache.size,
    entries: Array.from(_cache.entries()).map(([url, e]) => ({
      url,
      age: now - e.ts,
      ttl: e.ttl,
    })),
  };
}

/**
 * Removes all entries from the cache and cancels the pending sweep timer.
 * Intended for use in tests and after a hard configuration reload.
 */
export function clearCache() {
  _cache.clear();
  if (_sweepTimer !== null) {
    clearTimeout(_sweepTimer);
    _sweepTimer = null;
  }
}

/**
 * Fetches `url`, returning a cached response when available and unexpired.
 *
 * A cache hit promotes the entry to most-recently-used (LRU tail).
 * A cache miss performs a real fetch, stores the response, and starts the
 * sweep timer if it is not already running.
 *
 * @param {string} url               - URL to fetch (also used as cache key by default).
 * @param {number} [ttl=CACHE_TTL]   - How long the response stays valid (ms).
 * @param {object} [options={}]      - Passed to `fetch()`.
 * @param {string} [options.cacheKey] - Override the cache key. Useful when the fetch
 *   URL contains volatile segments (e.g. API keys) that should not be part of the key.
 *   The actual network request always uses `url`.
 * @returns {Promise<*>}  Parsed JSON response.
 * @throws  {Error}       On non-2xx HTTP status or network failure.
 */
function normalizedTimeoutMs(value) {
  const configured = value ?? CFG.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const ms = Number(configured);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

function timeoutError(ms) {
  return new Error('Fetch timeout after ' + ms + ' ms');
}

function fetchWithTimeout(url, options, timeoutMs) {
  const ms = normalizedTimeoutMs(timeoutMs);
  if (!ms) return fetch(url, options);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const externalSignal = options && options.signal;
  let timeoutId = null;

  const fetchOpts = controller
    ? Object.assign({}, options, { signal: controller.signal })
    : options;

  let removeExternalAbort = null;
  if (controller && externalSignal) {
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) {
      abortFromExternal();
    } else if (typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
      removeExternalAbort = () => externalSignal.removeEventListener('abort', abortFromExternal);
    }
  }

  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      if (controller) controller.abort();
      reject(timeoutError(ms));
    }, ms);
    if (timeoutId && typeof timeoutId.unref === 'function') timeoutId.unref();
  });

  const fetchPromise = fetch(url, fetchOpts);
  // If timeout wins the race and fetch later rejects because of abort, this
  // prevents an unhandled rejection while preserving the raced result below.
  fetchPromise.catch(() => {});

  return Promise.race([fetchPromise, timeoutPromise])
    .catch(err => {
      if (timedOut) throw timeoutError(ms);
      throw err;
    })
    .finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (removeExternalAbort) removeExternalAbort();
    });
}

/**
 * Fetches `url`, returning a cached response when available and unexpired.
 *
 * A cache hit promotes the entry to most-recently-used (LRU tail).
 * A cache miss performs a real fetch, stores the response, and starts the
 * sweep timer if it is not already running.
 *
 * @param {string} url               - URL to fetch (also used as cache key by default).
 * @param {number} [ttl=CACHE_TTL]   - How long the response stays valid (ms).
 * @param {object} [options={}]      - Passed to `fetch()`.
 * @param {string} [options.cacheKey] - Override the cache key. Useful when the fetch
 *   URL contains volatile segments (e.g. API keys) that should not be part of the key.
 *   The actual network request always uses `url`.
 * @param {number} [options.timeoutMs] - Request timeout in ms. Defaults to CFG.fetchTimeoutMs or 10s.
 * @returns {Promise<*>}  Parsed JSON response.
 * @throws  {Error}       On non-2xx HTTP status, timeout, or network failure.
 */
export function cachedFetch(url, ttl = CACHE_TTL, options = {}) {
  const { cacheKey: overrideKey, timeoutMs, ...fetchOpts } = options;
  const key = overrideKey || url;
  const ttlMs = Number(ttl);
  const useCache = Number.isFinite(ttlMs) && ttlMs > 0;

  if (!useCache) {
    // ttl=0 means force-fresh: bypass the cache and remove any stale entry
    // with the same key so a later cached call cannot reuse old data.
    _cache.delete(key);
  } else {
    const now = Date.now();
    const hit = _cache.get(key);

    if (hit && now - hit.ts < hit.ttl) {
      // Promote to MRU position so frequently-accessed entries are never evicted.
      _cache.delete(key);
      _cache.set(key, hit);
      return Promise.resolve(hit.data);
    }
  }

  return fetchWithTimeout(url, Object.assign({ cache: 'no-store' }, fetchOpts), timeoutMs)
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
      return r.json();
    })
    .then(data => {
      if (useCache) cacheSet(key, data, ttlMs);
      return data;
    });
}

// ---- Text variant of cachedFetch (for HTML/plain-text endpoints) --------
// Identical to cachedFetch but parses the response as text instead of JSON.
export function cachedFetchText(url, ttl = CACHE_TTL, options = {}) {
  const { cacheKey: overrideKey, timeoutMs, ...fetchOpts } = options;
  const key = overrideKey ? overrideKey + ':text' : url + ':text';
  const ttlMs = Number(ttl);
  const useCache = Number.isFinite(ttlMs) && ttlMs > 0;

  if (!useCache) {
    _cache.delete(key);
  } else {
    const now = Date.now();
    const hit = _cache.get(key);
    if (hit && now - hit.ts < hit.ttl) {
      _cache.delete(key);
      _cache.set(key, hit);
      return Promise.resolve(hit.data);
    }
  }

  return fetchWithTimeout(url, Object.assign({ cache: 'no-store' }, fetchOpts), timeoutMs)
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
      return r.text();
    })
    .then(data => {
      if (useCache) cacheSet(key, data, ttlMs);
      return data;
    });
}

// ---- URL helpers ----

export function domoticzBaseUrl() {
  return String(DOMOTICZ_CFG.baseUrl || '').replace(/\/+$/, '');
}

export function domoticzUrl(pathAndQuery) {
  const base = domoticzBaseUrl();
  const path = String(pathAndQuery || '').replace(/^\/+/, '');
  // Empty baseUrl means same-origin Domoticz mode. Use a root-relative URL so
  // /json.htm resolves correctly even when the dashboard lives in a subfolder.
  return base ? base + '/' + path : '/' + path;
}

export function domoticzWebSocketUrl() {
  const base   = domoticzBaseUrl();
  const source = base || location.origin;
  const u      = new URL(source, location.href);
  u.protocol   = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname   = '/json';
  u.search     = ''; // Domoticz WebSocket endpoint; JSON API queries go through WS messages.
  u.hash       = '';
  if (DOMOTICZ_CFG.auth !== 'none' && DOMOTICZ_CFG.username && DOMOTICZ_CFG.password) {
    // Browsers cannot send custom Authorization headers over WebSocket.
    // Encoding credentials in the URL is the practical Basic-auth fallback for Domoticz.
    u.username = DOMOTICZ_CFG.username;
    u.password = DOMOTICZ_CFG.password;
  }
  return u.toString();
}

// ---- Auth ----

function basicAuthValue(username, password) {
  // Unicode-safe btoa, handles special characters in credentials.
  return 'Basic ' + btoa(unescape(encodeURIComponent(String(username) + ':' + String(password))));
}

function fetchOptions(extra = {}) {
  const headers = Object.assign({}, extra.headers || {});
  if (DOMOTICZ_CFG.auth !== 'none' && DOMOTICZ_CFG.username && DOMOTICZ_CFG.password) {
    headers.Authorization = basicAuthValue(DOMOTICZ_CFG.username, DOMOTICZ_CFG.password);
  }
  return Object.assign({}, extra, {
    cache:       extra.cache       || 'no-store',
    credentials: extra.credentials || 'include',
    headers
  });
}

// ---- API calls ----

/** Cached Domoticz JSON API call. Use ttl=0 for a live (uncached) request. */
export function api(params, ttl = CACHE_TTL) {
  const url = domoticzUrl('json.htm?' + new URLSearchParams(Object.assign({ type: 'command' }, params)));
  return cachedFetch(url, ttl, fetchOptions());
}

/** Force-fresh API call — bypasses the cache. Used after a WebSocket push. */
export function apiLive(params) {
  return api(params, 0);
}

// ---- Device ID resolution ----

let deviceIds = null;

function looksLikeLimitDevice(d) {
  const hay = String([d.Name, d.name, d.Description, d.Type, d.SubType, d.Data, d.Status]
    .filter(Boolean).join(' ')).toLowerCase();
  return (hay.includes('inverter') || hay.includes('omvormer') || hay.includes('pv') || hay.includes('solar'))
      && (hay.includes('limit') || hay.includes('limited') || hay.includes('knijp') || hay.includes('geknepen')
          || hay.includes('active power') || hay.includes('power limit') || hay.includes('vermogen'));
}

async function autoDetectInverterLimitIdx() {
  try {
    const d   = await api({ param: 'getdevices' });
    const hit = (d && d.result || []).find(looksLikeLimitDevice);
    return hit ? hit.idx : -1;
  } catch { return -1; }
}

/**
 * Resolves and caches Domoticz energy device IDs.
 * Falls back to URL-param overrides where configured.
 */
export async function ensureDeviceIds() {
  if (deviceIds) return deviceIds;
  const data = await api({ param: 'getenergydashboarddevices' });
  const s    = data && data.result && data.result.ESettings;
  if (!s) throw new Error('no Domoticz energy settings');
  deviceIds = {
    p1:              s.idP1              || -1,
    solar:           s.idSolar           || -1,
    gas:             s.idGas             || -1,
    usage:           CFG.usageIdx            || s.idUsage            || -1,
    selfSufficiency: CFG.selfSufficiencyIdx  || s.idSelfSufficiency  || -1,
    selfConsumption: CFG.selfConsumptionIdx  || s.idSelfConsumption  || -1,
    electricityPrice: CFG.electricityPriceIdx || -1,
    gasPrice:        CFG.gasPriceIdx          || -1,
    inverterLimit:   CFG.inverterLimitIdx     || s.idInverterLimit || s.idInverterActivePowerLimit || s.idSolarLimit || -1,
  };
  if (String(deviceIds.inverterLimit) === '-1') {
    deviceIds.inverterLimit = await autoDetectInverterLimitIdx();
  }
  return deviceIds;
}

/** Resets the cached device IDs (e.g. after a config change). */
export function resetDeviceIds() {
  deviceIds = null;
}

/** Fetches this year's total gas usage from the Domoticz history graph. */
export async function fetchYearGas(idx) {
  try {
    const d    = await api({ param: 'graph', sensor: 'counter', idx, range: 'year', actyear: new Date().getFullYear() });
    const rows = d && d.result;
    if (!rows || !rows.length) return null;
    return rows.reduce((a, r) => a + (Number.parseFloat(r.v) || 0), 0);
  } catch { return null; }
}

function parseHistoryNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function firstHistoryNumber(row, names) {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(row, name)) continue;
    const n = parseHistoryNumber(row[name]);
    if (n !== null) return n;
  }
  return null;
}

/**
 * Extracts exported kWh from one Domoticz electricity history row.
 *
 * Common P1 graph rows expose import as v/v2 and return/export as v3/v4.
 * Named fields are accepted as a defensive fallback for plugin/custom sensors.
 * A plain `v` fallback is intentionally avoided here because that usually means
 * consumption for electricity counters, unlike gas where v is the wanted value.
 */
export function exportKwhFromHistoryRow(row) {
  if (!row || typeof row !== 'object') return null;

  const t1 = parseHistoryNumber(row.v3);
  const t2 = parseHistoryNumber(row.v4);
  if (t1 !== null || t2 !== null) return (t1 || 0) + (t2 || 0);

  const namedSumA = [
    firstHistoryNumber(row, ['return1', 'returned1', 'export1', 'exported1', 'delivery1', 'delivered1', 'r1']),
    firstHistoryNumber(row, ['return2', 'returned2', 'export2', 'exported2', 'delivery2', 'delivered2', 'r2']),
  ];
  if (namedSumA.some(v => v !== null)) return namedSumA.reduce((a, v) => a + (v || 0), 0);

  return firstHistoryNumber(row, [
    'return', 'returned', 'export', 'exported', 'delivered', 'delivery',
    'usageDelivered', 'usage_delivered', 'counterDelivered', 'counter_delivered'
  ]);
}

/** Fetches this year's grid export from the Domoticz P1 history graph. */
export async function fetchYearGridExport(idx) {
  try {
    const d    = await api({ param: 'graph', sensor: 'counter', idx, range: 'year', actyear: new Date().getFullYear() });
    const rows = d && d.result;
    if (!rows || !rows.length) return null;

    const values = rows
      .map(exportKwhFromHistoryRow)
      .filter(v => v !== null && Number.isFinite(Number(v)));

    if (!values.length) return null;
    return values.reduce((a, v) => a + Number(v), 0);
  } catch { return null; }
}

/**
 * Discovers the Domoticz device that holds the price forecast JSON.
 * Returns the device idx string, or '' when not found.
 */
export async function findForecastDevice(knownId) {
  if (knownId) return knownId;
  const d    = await api({ param: 'getdevices' });
  const list = d && d.result || [];
  for (const dev of list) {
    const raw = dev.Data || dev.sValue || dev.Status || '';
    if (!raw || String(raw).trim()[0] !== '{') continue;
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j.hours) && j.hours.length) return String(dev.idx);
    } catch { /* skip invalid device */ }
  }
  return '';
}
