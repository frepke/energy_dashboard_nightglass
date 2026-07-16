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

  const url =
    'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/' +
    loc +
    '?unitGroup=' + unitGroup +
    '&include=current,days' +
    '&key='       + encodeURIComponent(CFG.vcKey) +
    '&contentType=json';

  // Cache key excludes the API key — only location + unit group identify the response.
  const data = await cachedFetch(url, WEATHER_TTL, {
    cacheKey: 'weather:' + loc + ':' + unitGroup,
  });

  const cc  = data.currentConditions || {};
  const day = (data.days && data.days[0]) || cc;
  return { currentConditions: cc, day };
}
