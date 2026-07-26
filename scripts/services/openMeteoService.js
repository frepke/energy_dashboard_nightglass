/**
 * Open-Meteo weather API — fetching + normalisation.
 *
 * Open-Meteo is free for non-commercial use, requires no API key, and uses
 * the KNMI HARMONIE-AROME model for the Netherlands (2 km resolution, updated
 * hourly). The `best_match` model selector picks the highest-resolution model
 * available for any given location worldwide.
 *
 * Normalises the response to the same { currentConditions, day } shape that
 * Visual Crossing and OpenWeatherMap return, so the rest of the dashboard is
 * provider-agnostic.
 *
 * API docs: https://open-meteo.com/en/docs
 * WMO weather codes: https://open-meteo.com/en/docs#weathervariables
 */

import { CFG }         from '../config/resolveConfig.js';
import { cachedFetch } from './domoticzService.js';

export const WEATHER_TTL = 10 * 60 * 1000; // 10 minutes (model updates every hour)

// ---- WMO weather code → normalised icon string ---------------------------
// https://open-meteo.com/en/docs#weathervariables (WMO Weather interpretation codes)
function omIconFromCode(code, isDay) {
  if (code === 0)                          return isDay ? 'clear-day'            : 'clear-night';
  if (code === 1 || code === 2)            return isDay ? 'partly-cloudy-day'    : 'partly-cloudy-night';
  if (code === 3)                          return 'cloudy';
  if (code === 45 || code === 48)          return 'fog';
  if (code === 51 || code === 53)          return 'rain';   // light / moderate drizzle
  if (code === 55)                         return 'rain';   // dense drizzle
  if (code === 56 || code === 57)          return 'snow';   // freezing drizzle
  if (code === 61 || code === 63)          return 'rain';   // slight / moderate rain
  if (code === 65)                         return 'rain';   // heavy rain
  if (code === 66 || code === 67)          return 'snow';   // freezing rain
  if (code === 71 || code === 73)          return 'snow';   // slight / moderate snow
  if (code === 75 || code === 77)          return 'snow';   // heavy snow / snow grains
  if (code === 80 || code === 81)          return 'rain';   // slight / moderate showers
  if (code === 82)                         return 'rain';   // violent showers
  if (code === 85 || code === 86)          return 'snow';   // snow showers
  if (code === 95)                         return 'storm';  // thunderstorm
  if (code === 96 || code === 99)          return 'storm';  // thunderstorm with hail
  return 'cloudy';
}

// ---- WMO weather code → human-readable condition text -------------------
function omConditionText(code) {
  if (code === 0)              return 'Clear';
  if (code === 1)              return 'Mainly clear';
  if (code === 2)              return 'Partially cloudy';
  if (code === 3)              return 'Overcast';
  if (code === 45)             return 'Fog';
  if (code === 48)             return 'Icy fog';
  if (code === 51)             return 'Light Drizzle';
  if (code === 53)             return 'Drizzle';
  if (code === 55)             return 'Heavy Drizzle';
  if (code === 56 || code === 57) return 'Freezing Drizzle';
  if (code === 61)             return 'Light Rain';
  if (code === 63)             return 'Rain';
  if (code === 65)             return 'Heavy Rain';
  if (code === 66 || code === 67) return 'Freezing Rain';
  if (code === 71)             return 'Light Snow';
  if (code === 73)             return 'Snow';
  if (code === 75)             return 'Heavy Snow';
  if (code === 77)             return 'Snow grains';
  if (code === 80)             return 'Light Showers';
  if (code === 81)             return 'Showers';
  if (code === 82)             return 'Heavy Showers';
  if (code === 85)             return 'Light Snow showers';
  if (code === 86)             return 'Snow showers';
  if (code === 95)             return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return 'Overcast';
}

// ---- ISO-time helper ("HH:MM:SS") from a date string like "2025-06-12T06:13" ----
function isoStrToTimeStr(isoStr) {
  if (!isoStr) return undefined;
  // isoStr is local time — just extract the HH:MM part
  const t = isoStr.split('T')[1];
  if (!t) return undefined;
  const [hh, mm] = t.split(':');
  return `${hh.padStart(2, '0')}:${(mm || '00').padStart(2, '0')}:00`;
}

/**
 * Fetches current conditions from Open-Meteo and returns a normalised
 * { currentConditions, day } object compatible with the Visual Crossing shape.
 *
 * No API key required. Uses the KNMI seamless model for NL locations (best
 * accuracy), with automatic fallback to the global best_match model worldwide.
 */
export async function fetchWeatherData() {
  const lat = CFG.latitude  ?? 51.596;
  const lon = CFG.longitude ?? 5.947;

  const params = [
    `latitude=${encodeURIComponent(lat)}`,
    `longitude=${encodeURIComponent(lon)}`,
    // Current conditions
    'current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
    // Daily — for sunrise/sunset
    'daily=sunrise,sunset,precipitation_probability_max',
    'wind_speed_unit=kmh',
    'timezone=auto',
    // Use KNMI HARMONIE-AROME for NL (2 km); falls back gracefully elsewhere
    'models=knmi_seamless',
    'past_days=1',
    'forecast_days=2',
  ].join('&');

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  const data = await cachedFetch(url, WEATHER_TTL, {
    cacheKey: `openmeteo:${lat}:${lon}`,
  });

  const cur   = data.current  || {};
  const daily = data.daily    || {};

  const code  = cur.weather_code ?? 0;
  const isDay = cur.is_day === 1;

  // Sunrise/sunset come as ISO strings like "2025-06-12T06:13"
  const dayIndex = Math.max(0, (daily.time || []).findIndex((value) => value === new Date().toLocaleDateString('en-CA')));
  const sunriseStr = isoStrToTimeStr(daily.sunrise && daily.sunrise[dayIndex]);
  const sunsetStr  = isoStrToTimeStr(daily.sunset  && daily.sunset[dayIndex]);
  const previousSunsetStr = isoStrToTimeStr(daily.sunset && daily.sunset[Math.max(0, dayIndex - 1)]);
  const nextSunriseStr = isoStrToTimeStr(daily.sunrise && daily.sunrise[Math.min((daily.sunrise?.length || 1) - 1, dayIndex + 1)]);

  const currentConditions = {
    // Temperature and atmosphere
    temp:        cur.temperature_2m,
    feelslike:   cur.apparent_temperature,
    humidity:    cur.relative_humidity_2m,
    pressure:    cur.pressure_msl ?? cur.surface_pressure,
    cloudcover:  cur.cloud_cover,
    visibility:  undefined,               // not in Open-Meteo current endpoint

    // Precipitation
    precip:      cur.precipitation ?? 0,
    precipprob:  daily.precipitation_probability_max
                   ? daily.precipitation_probability_max[0]
                   : undefined,

    // Wind — already in km/h (wind_speed_unit=kmh)
    windspeed:   cur.wind_speed_10m   !== null && cur.wind_speed_10m   !== undefined ? Math.round(cur.wind_speed_10m)   : undefined,
    windgust:    cur.wind_gusts_10m   !== null && cur.wind_gusts_10m   !== undefined ? Math.round(cur.wind_gusts_10m)   : undefined,
    winddir:     cur.wind_direction_10m,

    // Condition
    conditions:  omConditionText(code),
    icon:        omIconFromCode(code, isDay),

    // Sun times
    sunrise:     sunriseStr,
    sunset:      sunsetStr,
    previousSunset: previousSunsetStr,
    nextSunrise: nextSunriseStr,
  };

  const day = {
    sunrise:    sunriseStr,
    sunset:     sunsetStr,
    previousSunset: previousSunsetStr,
    nextSunrise: nextSunriseStr,
    conditions: currentConditions.conditions,
    icon:       currentConditions.icon,
  };

  return { currentConditions, day };
}
