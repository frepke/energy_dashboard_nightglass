/**
 * Playwright-only mock state/bootstrap helpers.
 */

import { setState } from '../core/state.js';
import { renderBars, markBestWindowBars } from '../ui/chart.js';

export function initPlaywrightMock() {
  if (!window.__PLAYWRIGHT__) return false;

  if (window.__MOCK_PRICE_FORECAST__) {
    setState({
      priceForecast:  window.__MOCK_PRICE_FORECAST__,
      currentPriceCt: window.__MOCK_CURRENT_PRICE_CT__ ?? 19,
      gridW:          230,
      gridDir:        'import',
      houseW:         230,
      solarW:         0,
      localSolarW:    0,
      updatedAt:      Date.now(),
    });
  }

  const nowTs = Date.now();
  const rawBars = (window.__MOCK_PRICE_FORECAST__ || []).map(x => ({
    ts: x.ts,
    p: x.ct / 100,
    d: new Date(x.ts),
    ct: x.ct,
  }));

  if (!rawBars.length) return true;

  const vals = rawBars.map(x => x.p);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  renderBars(rawBars, nowTs, min, max);
  markBestWindowBars();
  return true;
}
