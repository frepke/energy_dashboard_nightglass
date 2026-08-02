/**
 * Config resolution — reads window.DASHBOARD_CONFIG + URL params.
 * All other modules import from here instead of accessing globals directly.
 */

const qs = new URLSearchParams(location.search);

// External config loaded by config.js (or config.example.js as fallback).
const EXT_CFG = window.DASHBOARD_CONFIG || {};

// Default observer location: Vierlingsbeek, NL.
// Used when config.js / URL params do not provide lat/lon, so the moon
// terminator is rotated for the user's local sky instead of a generic north-up view.
const DEFAULT_OBSERVER = {
  latitude: 51.596,
  longitude: 5.947,
  timezone: 'Europe/Amsterdam',
  visualCrossingLocation: 'Vierlingsbeek,NL'
};

// Domoticz connection settings
export const DOMOTICZ_CFG = Object.assign({
  baseUrl:  '',
  username: '',
  password: '',
  // 'basic' → Authorization: Basic header + user:pass in WebSocket URL.
  // 'none'  → no explicit auth; browser cookies/session via credentials: 'include'.
  auth: 'basic',
  // WebSocket is off by default — browsers often refuse Basic-auth WS connections.
  // Polling keeps the dashboard live without a blinking error. Set true if your setup supports it.
  ws: false
}, EXT_CFG.domoticz || {});

// Backwards-compatible shorthand fields in config.js
DOMOTICZ_CFG.baseUrl  = DOMOTICZ_CFG.baseUrl  || EXT_CFG.domoticzBaseUrl  || '';
DOMOTICZ_CFG.username = DOMOTICZ_CFG.username || EXT_CFG.domoticzUsername || EXT_CFG.username || '';
DOMOTICZ_CFG.password = DOMOTICZ_CFG.password || EXT_CFG.domoticzPassword || EXT_CFG.password || '';
DOMOTICZ_CFG.auth     = DOMOTICZ_CFG.auth     || EXT_CFG.domoticzAuth     || 'basic';

// Backwards-compatible shorthand for WebSocket.
// Important: DOMOTICZ_CFG.ws already has a default boolean value, so the old
// `typeof DOMOTICZ_CFG.ws !== 'boolean'` check accidentally ignored
// `window.DASHBOARD_CONFIG.domoticzWs = true`.
const hasNestedDomoticzWs = Boolean(
  EXT_CFG.domoticz && Object.prototype.hasOwnProperty.call(EXT_CFG.domoticz, 'ws')
);
if (!hasNestedDomoticzWs && EXT_CFG.domoticzWs !== undefined) {
  DOMOTICZ_CFG.ws = EXT_CFG.domoticzWs;
}

function truthyFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
}

DOMOTICZ_CFG.ws = truthyFlag(DOMOTICZ_CFG.ws);

// Weather settings — supported providers: 'visualcrossing', 'openweathermap', 'openmeteo', 'vierlingsbeek'
// Vierlingsbeek reads Domoticz plugin devices; no browser CORS proxy is needed.
const VIERLINGSBEEK_CFG = Object.assign({},
  EXT_CFG.vierlingsbeek || {},
  (EXT_CFG.domoticz && EXT_CFG.domoticz.vierlingsbeek) || {}
);

export const WEATHER_CFG = {
  provider:  EXT_CFG.weatherProvider          || 'visualcrossing',
  apiKey:    EXT_CFG.visualCrossingApiKey      || '',
  location:  EXT_CFG.visualCrossingLocation    || DEFAULT_OBSERVER.visualCrossingLocation,
  unitGroup: EXT_CFG.visualCrossingUnitGroup   || 'metric',
  owmKey:    EXT_CFG.openWeatherMapApiKey      || EXT_CFG.owmApiKey || '',
  owmUnits:  EXT_CFG.openWeatherMapUnits       || 'metric',
  latitude:  EXT_CFG.latitude  ?? EXT_CFG.lat  ?? DEFAULT_OBSERVER.latitude,
  longitude: EXT_CFG.longitude ?? EXT_CFG.lon  ?? EXT_CFG.lng ?? DEFAULT_OBSERVER.longitude,
  timezone:  EXT_CFG.timezone  || Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_OBSERVER.timezone,
};

function firstNonEmpty(...values) {
  return values.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
}

function optionalNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function refreshSeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function usageWindowHours(value) {
  if (String(value).toLowerCase().trim() === 'all') return 'all';
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.max(1, Math.min(24, Math.round(n))) : 4;
}

function fetchTimeoutMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.max(1000, Math.round(n)) : 10000;
}

const ENERGY_LOGGER_EXT = Object.assign({
  enabled: true,
  baseUrl: '',
  refreshSeconds: 60,
  timeoutMs: 8000,
}, EXT_CFG.energyLogger || {});

const energyLoggerEnabledParam = qs.get('energyLoggerEnabled') ?? qs.get('energyLogger');

/** Read-only energy-logger advice endpoint configuration. */
export const ENERGY_LOGGER_CFG = {
  enabled: energyLoggerEnabledParam === null
    ? ENERGY_LOGGER_EXT.enabled !== false
    : truthyFlag(energyLoggerEnabledParam),
  // Empty means: same hostname as the dashboard, port 8787.
  baseUrl: firstNonEmpty(qs.get('energyLoggerUrl'), qs.get('loggerUrl'), ENERGY_LOGGER_EXT.baseUrl),
  refreshSeconds: Math.max(15, refreshSeconds(firstNonEmpty(
    qs.get('energyLoggerRefresh'),
    ENERGY_LOGGER_EXT.refreshSeconds,
    60,
  ))),
  timeoutMs: fetchTimeoutMs(firstNonEmpty(
    qs.get('energyLoggerTimeoutMs'),
    ENERGY_LOGGER_EXT.timeoutMs,
    8000,
  )),
};

function vierlingsbeekIdxConfig() {
  const cfg = Object.assign({}, VIERLINGSBEEK_CFG);
  const aliases = {
    thbIdx:         ['vbThbIdx', 'vierlingsbeekThbIdx'],
    windIdx:        ['vbWindIdx', 'vierlingsbeekWindIdx'],
    rainTodayIdx:   ['vbRainTodayIdx', 'vierlingsbeekRainTodayIdx'],
    rainHourIdx:    ['vbRainHourIdx', 'vierlingsbeekRainHourIdx'],
    rainRateIdx:    ['vbRainRateIdx', 'vierlingsbeekRainRateIdx'],
    dewPointIdx:    ['vbDewPointIdx', 'vierlingsbeekDewPointIdx'],
    feelsLikeIdx:   ['vbFeelsLikeIdx', 'vierlingsbeekFeelsLikeIdx'],
    windAvgIdx:     ['vbWindAvgIdx', 'vierlingsbeekWindAvgIdx'],
    windGustMaxIdx: ['vbWindGustMaxIdx', 'vierlingsbeekWindGustMaxIdx'],
    tempMaxIdx:     ['vbTempMaxIdx', 'vierlingsbeekTempMaxIdx'],
    tempMinIdx:     ['vbTempMinIdx', 'vierlingsbeekTempMinIdx'],
  };

  for (const [key, names] of Object.entries(aliases)) {
    const queryName = key.replace(/Idx$/, '');
    cfg[key] = firstNonEmpty(
      qs.get(key),
      qs.get('vb' + key.charAt(0).toUpperCase() + key.slice(1)),
      qs.get('vierlingsbeek' + key.charAt(0).toUpperCase() + key.slice(1)),
      qs.get(queryName),
      cfg[key],
      ...names.map(name => EXT_CFG[name])
    );
  }

  return cfg;
}

// Merged runtime config (URL params override config.js values)
export const CFG = {
  refresh:             refreshSeconds(firstNonEmpty(qs.get('refresh'), EXT_CFG.refresh, 1)),
  fetchTimeoutMs:      fetchTimeoutMs(firstNonEmpty(qs.get('fetchTimeoutMs'), qs.get('timeout'), EXT_CFG.fetchTimeoutMs, 10000)),
  usageWindowHours:    usageWindowHours(firstNonEmpty(qs.get('usageWindowHours'), qs.get('hours'), EXT_CFG.usageWindowHours, 3)),
  forecastIdx:         firstNonEmpty(qs.get('forecastIdx'), qs.get('forecastJsonIdx'), qs.get('fidx'), DOMOTICZ_CFG.forecastIdx, EXT_CFG.forecastIdx),
  ws:                  qs.has('ws') ? qs.get('ws') !== '0' : DOMOTICZ_CFG.ws === true,
  usageIdx:            firstNonEmpty(qs.get('usageIdx'), DOMOTICZ_CFG.usageIdx, EXT_CFG.usageIdx),
  selfSufficiencyIdx:  firstNonEmpty(qs.get('selfSufficiencyIdx'), DOMOTICZ_CFG.selfSufficiencyIdx, EXT_CFG.selfSufficiencyIdx),
  selfConsumptionIdx:  firstNonEmpty(qs.get('selfConsumptionIdx'), DOMOTICZ_CFG.selfConsumptionIdx, EXT_CFG.selfConsumptionIdx),
  electricityPriceIdx: firstNonEmpty(qs.get('electricityPriceIdx'), qs.get('electricityIdx'), DOMOTICZ_CFG.electricityPriceIdx, EXT_CFG.electricityPriceIdx),
  gasPriceIdx:         firstNonEmpty(qs.get('gasPriceIdx'), qs.get('gasIdx'), DOMOTICZ_CFG.gasPriceIdx, EXT_CFG.gasPriceIdx),
  inverterLimitIdx:    firstNonEmpty(qs.get('inverterLimitIdx'), qs.get('limitIdx'), DOMOTICZ_CFG.inverterLimitIdx, EXT_CFG.inverterLimitIdx),
  vcKey:               firstNonEmpty(qs.get('vcKey'), qs.get('visualCrossingKey'), WEATHER_CFG.apiKey),
  vcLocation:          firstNonEmpty(qs.get('vcLocation'), qs.get('location'), WEATHER_CFG.location),
  vcUnitGroup:         firstNonEmpty(qs.get('vcUnitGroup'), WEATHER_CFG.unitGroup),
  weatherProvider:     firstNonEmpty(qs.get('weatherProvider'), WEATHER_CFG.provider, 'visualcrossing'),
  owmKey:              firstNonEmpty(qs.get('owmKey'), WEATHER_CFG.owmKey),
  owmUnits:            firstNonEmpty(qs.get('owmUnits'), WEATHER_CFG.owmUnits, 'metric'),
  vierlingsbeekIdx:    vierlingsbeekIdxConfig(),
  latitude:            optionalNumber(firstNonEmpty(qs.get('lat'), qs.get('latitude'), WEATHER_CFG.latitude)),
  longitude:           optionalNumber(firstNonEmpty(qs.get('lon'), qs.get('lng'), qs.get('longitude'), WEATHER_CFG.longitude)),
  timezone:            firstNonEmpty(qs.get('tz'), qs.get('timezone'), WEATHER_CFG.timezone),
};

// Zonneplan/contract calculation settings
export const CONTRACT_CFG = {
  zonnebonusAlwaysOn:          EXT_CFG.zonnebonusAlwaysOn !== false,
  // Feed-in reward = (market price + inkoopvergoeding) * (1 + bonusPct)
  zonnebonusInkoopvergoedingCt: Number.isFinite(+EXT_CFG.zonnebonusInkoopvergoedingCt) ? +EXT_CFG.zonnebonusInkoopvergoedingCt : 2,
  zonnebonusPct:                Number.isFinite(+EXT_CFG.zonnebonusPct)                 ? +EXT_CFG.zonnebonusPct                 : 0.10,
  zonnebonusAnnualExportLimitKwh: Number.isFinite(+EXT_CFG.zonnebonusAnnualExportLimitKwh) ? +EXT_CFG.zonnebonusAnnualExportLimitKwh : 7500,
  daylightSolarThresholdW:      Number.isFinite(+EXT_CFG.daylightSolarThresholdW)      ? +EXT_CFG.daylightSolarThresholdW      : 50,
  exportSolarThresholdW:        Number.isFinite(+EXT_CFG.exportSolarThresholdW)        ? +EXT_CFG.exportSolarThresholdW        : 200
};

// ---- Config validation ----
// Run once at startup. Shows a visible warning banner if required fields are missing.
export function validateConfig() {
  const errors = [];

  // Empty baseUrl is a valid and useful same-origin mode when the dashboard is
  // served by Domoticz itself. Only warn for file://, where same-origin cannot
  // resolve to Domoticz's /json.htm endpoint.
  if (!DOMOTICZ_CFG.baseUrl && location.protocol === 'file:') {
    errors.push('domoticz.baseUrl is missing — set it when opening the dashboard from file:// or another web server');
  }

  if (errors.length === 0) return;

  // Show a dismissible banner at the top of the page
  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#b91c1c', 'color:#fff', 'font:700 13px/1.4 system-ui,sans-serif',
    'padding:10px 48px 10px 16px', 'white-space:pre-wrap',
  ].join(';');
  banner.textContent = '⚠ Dashboard configuration incomplete:\n' + errors.join('\n');

  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'position:absolute;top:8px;right:12px;background:none;border:none;color:#fff;font-size:16px;cursor:pointer;';
  close.onclick = () => banner.remove();
  banner.appendChild(close);

  document.body.prepend(banner);
}
