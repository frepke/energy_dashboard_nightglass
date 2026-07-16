/**
 * OpenWeatherMap weather API — fetching + normalisation.
 *
 * Normalises the OWM response to the same { currentConditions, day } shape
 * that Visual Crossing returns, so the rest of the dashboard is provider-agnostic.
 *
 * Uses two OWM endpoints:
 *   - Current weather:   /data/2.5/weather   (current conditions)
 *   - Daily forecast:    /data/2.5/forecast   (3-hour steps, used for today's sunrise/sunset)
 *
 * Sunrise/sunset are taken from the /weather response (which includes them for
 * the current day) and exposed on both cc and day so weather.js can use either.
 */

import { CFG }         from '../config/resolveConfig.js';
import { cachedFetch } from './domoticzService.js';

export const WEATHER_TTL = 1 * 60 * 1000; // 1 minute

// ---- OWM condition code → normalised icon string -------------------------
// https://openweathermap.org/weather-conditions
function owmIconFromCode(id, isDay) {
  if (id >= 200 && id < 300) return 'storm';
  if (id >= 300 && id < 400) return 'rain';         // drizzle
  if (id >= 500 && id < 600) return 'rain';
  if (id >= 600 && id < 700) return 'snow';
  if (id === 701 || id === 741) return 'fog';        // mist / fog
  if (id >= 700 && id < 800) return 'fog';           // smoke, haze, dust, etc.
  if (id === 800) return isDay ? 'clear-day' : 'clear-night';
  if (id === 801 || id === 802) return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (id >= 803) return 'cloudy';
  return 'cloudy';
}

// ---- Convert OWM wind degrees to a cardinal label -----------------------
function owmConditionText(id) {
  if (id >= 200 && id < 300) return 'Thunderstorm';
  if (id >= 300 && id < 400) return 'Drizzle';
  if (id >= 500 && id < 600) return 'Rain';
  if (id >= 600 && id < 700) return 'Snow';
  if (id >= 700 && id < 800) return 'Fog';
  if (id === 800) return 'Clear';
  if (id === 801) return 'Few clouds';
  if (id === 802) return 'Partly cloudy';
  if (id >= 803) return 'Cloudy';
  return 'Cloudy';
}

// ---- ISO-time helper ("HH:MM:SS") from a Unix timestamp -----------------
function unixToTimeStr(unixSec, offsetSec = 0) {
  const d = new Date((unixSec + offsetSec) * 1000);
  // Use UTC because we've already applied the city's UTC offset manually.
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Fetches current conditions from OpenWeatherMap and returns a normalised
 * { currentConditions, day } object compatible with the Visual Crossing shape.
 */
export async function fetchWeatherData() {
  const key  = encodeURIComponent(CFG.owmKey || '');
  const lat  = encodeURIComponent(CFG.latitude  ?? 51.596);
  const lon  = encodeURIComponent(CFG.longitude ?? 5.947);
  const unit = CFG.owmUnits === 'imperial' ? 'imperial' : 'metric';

  const url = `https://api.openweathermap.org/data/2.5/weather`
    + `?lat=${lat}&lon=${lon}&appid=${key}&units=${unit}&lang=en`;

  const data = await cachedFetch(url, WEATHER_TTL, {
    cacheKey: `owm:${lat}:${lon}:${unit}`,
  });

  const weather   = (data.weather && data.weather[0]) || {};
  const main      = data.main || {};
  const wind      = data.wind || {};
  const sys       = data.sys  || {};
  const id        = weather.id || 800;
  const tzOffset  = data.timezone || 0;             // seconds east of UTC
  const isDay     = Date.now() / 1000 > sys.sunrise && Date.now() / 1000 < sys.sunset;

  const sunriseStr = sys.sunrise ? unixToTimeStr(sys.sunrise, tzOffset) : undefined;
  const sunsetStr  = sys.sunset  ? unixToTimeStr(sys.sunset,  tzOffset) : undefined;

  const currentConditions = {
    // Temperature and atmosphere
    temp:        main.temp,
    feelslike:   main.feels_like,
    humidity:    main.humidity,
    pressure:    main.pressure,
    visibility:  data.visibility !== null ? data.visibility / 1000 : undefined, // m → km
    cloudcover:  data.clouds ? data.clouds.all : undefined,  // %

    // Precipitation — OWM /weather gives 1h rain/snow volumes, not probability
    precip:      (data.rain && data.rain['1h']) || (data.snow && data.snow['1h']) || 0,
    precipprob:  undefined,  // not available from /weather endpoint

    // Wind — OWM gives m/s; dashboard expects km/h in metric mode
    windspeed:   unit === 'metric' && wind.speed !== null
                   ? Math.round(wind.speed * 3.6)
                   : wind.speed,
    windgust:    unit === 'metric' && wind.gust !== null
                   ? Math.round(wind.gust * 3.6)
                   : wind.gust,
    winddir:     wind.deg,

    // Condition
    conditions:  owmConditionText(id),
    icon:        owmIconFromCode(id, isDay),

    // Sun times (same day, local clock)
    sunrise:     sunriseStr,
    sunset:      sunsetStr,
  };

  // "day" shape: just needs sunrise/sunset + condition for the icon fallback
  const day = {
    sunrise:    sunriseStr,
    sunset:     sunsetStr,
    conditions: currentConditions.conditions,
    icon:       currentConditions.icon,
  };

  return { currentConditions, day };
}
