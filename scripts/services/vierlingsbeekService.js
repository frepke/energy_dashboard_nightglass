/**
 * Weerstation Vierlingsbeek — Domoticz-backed live weather service.
 *
 * The browser no longer scrapes www.weerstationvierlingsbeek.nl directly. A
 * Domoticz Python plugin reads the public WeatherDisplay blocks server-side and
 * exposes them as normal Domoticz devices. This service reads those devices via
 * the existing Domoticz JSON API, so no local CORS proxy is needed for VB.
 *
 * Configure `domoticz.vierlingsbeek` in config.js when auto-detection cannot
 * find the devices, for example:
 *
 *   domoticz: {
 *     vierlingsbeek: { thbIdx: 337, windIdx: 338, rainTodayIdx: 339 }
 *   }
 *
 * Open-Meteo is still used as best-effort supplement for sunrise/sunset,
 * cloud cover, precipitation probability and a standardised condition string.
 */

import { CFG }         from '../config/resolveConfig.js';
import { api }         from './domoticzService.js';
import { fetchWeatherData as fetchOpenMeteo } from './openMeteoService.js';

export const WEATHER_TTL = 1 * 60 * 1000; // 1 minute — plugin updates every ~60 seconds

const DEVICE_CACHE_TTL = 55 * 1000;

const FIELD_TO_CFG_KEY = {
  thb:         'thbIdx',
  wind:        'windIdx',
  rainToday:   'rainTodayIdx',
  rainHour:    'rainHourIdx',
  rainRate:    'rainRateIdx',
  dewPoint:    'dewPointIdx',
  feelsLike:   'feelsLikeIdx',
  windAvg:     'windAvgIdx',
  windGustMax: 'windGustMaxIdx',
  tempMax:     'tempMaxIdx',
  tempMin:     'tempMinIdx',
};

const DETECTORS = {
  thb:         /temp\s*\/\s*hum\s*\/\s*baro|temp.*hum.*baro/i,
  wind:        /^wind\b|\bwind vb\b/i,
  rainToday:   /regen vandaag/i,
  rainHour:    /regen laatste uur/i,
  rainRate:    /regenintensiteit/i,
  dewPoint:    /dauwpunt/i,
  feelsLike:   /gevoelstemperatuur/i,
  windAvg:     /wind gemiddeld/i,
  windGustMax: /vlaag max/i,
  tempMax:     /temperatuur max/i,
  tempMin:     /temperatuur min/i,
};

function cleanNumber(value) {
  if (value === undefined || value === null) return undefined;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? n : undefined;
}

function cleanInt(value) {
  const n = cleanNumber(value);
  return n === undefined ? undefined : Math.round(n);
}

function configuredIdx(field) {
  const key = FIELD_TO_CFG_KEY[field];
  return CFG.vierlingsbeekIdx && CFG.vierlingsbeekIdx[key]
    ? String(CFG.vierlingsbeekIdx[key])
    : '';
}

function normaliseDevice(dev) {
  if (!dev || typeof dev !== 'object') return null;
  return {
    ...dev,
    idx:  String(dev.idx ?? dev.Idx ?? dev.ID ?? ''),
    name: String(dev.Name ?? dev.name ?? ''),
    data: String(dev.Data ?? dev.data ?? dev.sValue ?? dev.Status ?? ''),
  };
}

function looksLikeVierlingsbeek(dev) {
  const hay = `${dev.HardwareName || ''} ${dev.Name || ''} ${dev.Description || ''}`.toLowerCase();
  return hay.includes('vierlingsbeek') || /\bvb\b/.test(hay);
}

function detectDevices(list) {
  const out = {};
  const candidates = (list || [])
    .map(normaliseDevice)
    .filter(Boolean)
    .filter(looksLikeVierlingsbeek);

  for (const [field, pattern] of Object.entries(DETECTORS)) {
    out[field] = candidates.find(dev => pattern.test(dev.name)) || null;
  }

  return out;
}

async function fetchDetectedDevices() {
  const res = await api({ param: 'getdevices' }, DEVICE_CACHE_TTL);
  return detectDevices(res && res.result || []);
}

async function fetchVierlingsbeekDevices() {
  const configuredFields = Object.keys(FIELD_TO_CFG_KEY).filter(field => configuredIdx(field));

  if (configuredFields.length > 0) {
    // Build the full list of configured idx values and fetch them in one
    // batched request using a comma-separated rid parameter.
    const allFields = Object.keys(FIELD_TO_CFG_KEY);
    const ridMap = {};
    allFields.forEach(field => {
      const idx = configuredIdx(field);
      if (idx) ridMap[field] = idx;
    });

    const rids = Object.values(ridMap);
    if (!rids.length) return Object.fromEntries(allFields.map(f => [f, null]));

    const byIdx = {};
    try {
      const res = await api({ param: 'getdevices', rid: rids.join(',') }, DEVICE_CACHE_TTL);
      (res && res.result || []).forEach(dev => {
        const d = normaliseDevice(dev);
        if (d) byIdx[d.idx] = d;
      });
    } catch { /* return nulls below */ }

    return Object.fromEntries(allFields.map(field => {
      const idx = ridMap[field];
      return [field, idx ? (byIdx[idx] ?? null) : null];
    }));
  }

  return fetchDetectedDevices();
}

function parseThb(dev) {
  if (!dev) return {};
  const data = dev.data || '';
  const parts = data.split(',').map(v => v.trim());

  return {
    temp:     cleanNumber(dev.Temp ?? dev.Temperature ?? parts[0]),
    humidity: cleanInt(dev.Humidity ?? dev.Hum ?? parts[1]),
    pressure: cleanNumber(dev.Barometer ?? dev.Pressure ?? dev.BarometerValue ?? parts[2]),
  };
}

function ms10ToKmh(value) {
  const n = cleanNumber(value);
  return n === undefined ? undefined : Math.round((n / 10) * 3.6 * 10) / 10;
}

function parseWind(dev) {
  if (!dev) return {};
  const data = dev.data || '';
  const parts = data.split(';').map(v => v.trim());

  // Domoticz Wind sValue uses speed/gust in m/s * 10. The dashboard displays
  // km/h, matching the station plugin's custom wind sensors.
  const rawSpeed = parts[2] !== undefined ? parts[2] : (dev.Speed ?? dev.WindSpeed);
  const rawGust  = parts[3] !== undefined ? parts[3] : (dev.Gust ?? dev.WindGust);

  return {
    winddir:     cleanInt(dev.Direction ?? dev.WindDir ?? parts[0]),
    winddirText: dev.DirectionStr || dev.DirectionText || parts[1] || undefined,
    windspeed:   ms10ToKmh(rawSpeed),
    windgust:    ms10ToKmh(rawGust),
    temp:        cleanNumber(dev.Temp ?? parts[4]),
    feelslike:   cleanNumber(dev.Chill ?? dev.FeelsLike ?? parts[5]),
  };
}

function customValue(dev) {
  if (!dev) return undefined;
  return cleanNumber(dev.sValue ?? dev.Data ?? dev.data);
}

function deriveIcon(cc, omIcon) {
  if (omIcon) return omIcon;
  if ((cc.preciprate ?? 0) > 0.5) return 'rain';
  if ((cc.precip ?? 0) > 0) return 'rain';
  if ((cc.windgust ?? 0) > 60) return 'wind';
  return 'partly-cloudy-day';
}

/**
 * Fetches live Vierlingsbeek data from Domoticz plugin devices and returns a
 * normalised { currentConditions, day } object.
 */
export async function fetchWeatherData() {
  const devices = await fetchVierlingsbeekDevices();
  const thb     = parseThb(devices.thb);
  const wind    = parseWind(devices.wind);

  if (thb.temp === undefined && thb.humidity === undefined && wind.windspeed === undefined) {
    throw new Error('Vierlingsbeek Domoticz devices not found; configure domoticz.vierlingsbeek idx overrides');
  }

  let om = null;
  try {
    const omData = await fetchOpenMeteo();
    om = omData.currentConditions;
  } catch { /* Open-Meteo is best-effort — Domoticz plugin data still shown */ }

  const currentConditions = {
    temp:        thb.temp ?? wind.temp,
    feelslike:   customValue(devices.feelsLike) ?? wind.feelslike ?? thb.temp,
    humidity:    thb.humidity,
    dewpoint:    customValue(devices.dewPoint),
    tempmax:     customValue(devices.tempMax),
    tempmin:     customValue(devices.tempMin),

    pressure:    thb.pressure ?? om?.pressure,
    cloudcover:  om?.cloudcover,
    precipprob:  om?.precipprob,

    precip:      customValue(devices.rainHour) ?? 0,
    precipday:   customValue(devices.rainToday),
    preciprate:  customValue(devices.rainRate),

    windspeed:   wind.windspeed,
    windgust:    wind.windgust,
    windgustmax: customValue(devices.windGustMax),
    windavg:     customValue(devices.windAvg),
    winddir:     wind.winddir,
    winddirText: wind.winddirText,

    conditions:  om?.conditions ?? 'Overcast',
    icon:        deriveIcon({
      precip: customValue(devices.rainHour),
      preciprate: customValue(devices.rainRate),
      windgust: wind.windgust,
    }, om?.icon),
    stationConditions: null,

    sunrise:     om?.sunrise,
    sunset:      om?.sunset,
    previousSunrise: om?.previousSunrise,
    previousSunset: om?.previousSunset,
    nextSunrise: om?.nextSunrise,

    stationName: 'Vierlingsbeek NB',
    measuredAt:  devices.thb?.LastUpdate || devices.wind?.LastUpdate || devices.thb?.LastSeen || devices.wind?.LastSeen,
  };

  const day = {
    sunrise:    om?.sunrise,
    sunset:     om?.sunset,
    previousSunrise: om?.previousSunrise,
    previousSunset: om?.previousSunset,
    nextSunrise: om?.nextSunrise,
    conditions: om?.conditions ?? 'Overcast',
    icon:       om?.icon ?? 'cloudy',
  };

  return { currentConditions, day };
}
