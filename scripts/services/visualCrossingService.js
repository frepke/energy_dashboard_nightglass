/**
 * Visual Crossing weather API — fetching only.
 * Rendering is handled by ui/weather.js.
 *
 * WEATHER_TTL is exported so weatherService.js (and via it, main.js) can use
 * the same value for the poll interval, keeping cache TTL and poll in sync.
 */

import { CFG }         from '../config/resolveConfig.js';
import { cachedFetch } from './domoticzService.js';

/** How long a weather response is cached — and how often main.js re-polls. */
export const WEATHER_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches current conditions and today's day data from Visual Crossing.
 *
 * The cache key uses only location and unit group, deliberately excluding the
 * API key. This means rotating a key does not leave a stale response pinned
 * under the old key URL — the next fetch always wins on a key change.
 *
 * @returns {Promise<{ currentConditions: object, day: object }>}
 * @throws  {Error} On HTTP error or network failure.
 */
export async function fetchWeatherData() {
  const loc       = encodeURIComponent(CFG.vcLocation || 'Vierlingsbeek,NL');
  const unitGroup = encodeURIComponent(CFG.vcUnitGroup);

  const dateKey = (offsetDays = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const yesterday = dateKey(-1);
  const tomorrow = dateKey(1);

  const url =
    'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/' +
    loc + '/' + yesterday + '/' + tomorrow +
    '?unitGroup=' + unitGroup +
    '&include=current,days' +
    '&key='       + encodeURIComponent(CFG.vcKey) +
    '&contentType=json';

  // Cache key excludes the API key — only location + unit group identify the response.
  const data = await cachedFetch(url, WEATHER_TTL, {
    cacheKey: 'weather:' + loc + ':' + unitGroup,
  });

  const cc = data.currentConditions || {};
  const days = data.days || [];
  const todayKey = dateKey(0);
  const todayIndex = Math.max(0, days.findIndex((item) => item.datetime === todayKey));
  const day = days[todayIndex] || days[0] || cc;
  const previousDay = days[Math.max(0, todayIndex - 1)] || {};
  const nextDay = days[Math.min(days.length - 1, todayIndex + 1)] || {};
  day.previousSunset = previousDay.sunset || null;
  day.nextSunrise = nextDay.sunrise || null;
  return { currentConditions: cc, day };
}
