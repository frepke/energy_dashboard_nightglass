/**
 * Shared mutable runtime state.
 *
 * State management
 * ────────────────
 * LIVE_STATE is the single source of truth for all live energy readings.
 * Direct mutation is still possible for backwards compatibility, but all
 * production code should use setState() instead:
 *
 *   setState({ gridW: 318, gridDir: 'export' });
 *
 * setState() merges the patch into LIVE_STATE and dispatches a
 * 'state:change' CustomEvent on window with { detail: { patch, prev } }.
 * This makes state transitions traceable in DevTools and allows modules
 * to react to specific field changes without polling.
 *
 * Event shape:
 *   window.addEventListener('state:change', e => {
 *     const { patch, prev } = e.detail;
 *     // patch = the fields that changed (new values)
 *     // prev  = snapshot of those same fields before the update
 *   });
 */

export const PRICE_HISTORY_KEY = 'ed-price-history-v6';

/** Live energy readings — updated after every distribution refresh. */
export const LIVE_STATE = {
  gridW:          0,
  gridDir:        '',   // 'import' | 'export'
  houseW:         0,
  solarW:         0,
  localSolarW:    0,
  netToday:       null, // kWh: importToday - exportToday (for gridNet label)
  limitPct:       null, // 0-100 or null (for solarStatus label)
  gasYearValue:   null, // m³ (for gasYear label)
  gridExportYearKwh: null, // kWh exported to the grid in the current calendar year
  currentPriceCt: null,
  gridPriceCt:    null,
  priceForecast:  [],   // [{ ts: number, ct: number }]
  cheapestFuture: null,
  updatedAt:      null
};

const LIVE_STATE_KEYS = new Set(Object.keys(LIVE_STATE));

/**
 * Merges `patch` into LIVE_STATE and dispatches a 'state:change' event.
 *
 * Only keys present in patch are updated; unrelated fields are untouched.
 * The event is only dispatched when window is available (skipped in Node/test env).
 *
 * @param {Partial<typeof LIVE_STATE>} patch - Fields to update.
 */
export function setState(patch) {
  const prev = {};
  const safePatch = {};
  for (const key of Object.keys(patch)) {
    if (!LIVE_STATE_KEYS.has(key)) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(`[setState] Ignored unknown key: ${key}`);
      }
      continue;
    }
    prev[key] = LIVE_STATE[key];
    LIVE_STATE[key] = patch[key];
    safePatch[key] = patch[key];
  }
  if (typeof window !== 'undefined' && Object.keys(safePatch).length > 0) {
    window.dispatchEvent(new CustomEvent('state:change', { detail: { patch: safePatch, prev } }));
  }
}

/** Rolling history of observed forecast prices (max 168 entries). */
export const priceHistoryBuffer = [];

/**
 * Insight stabilization — candidate must appear STABLE_TICKS consecutive
 * times before it is shown, preventing flicker near thresholds.
 */
export const STABLE_TICKS = 3;
export const insightState = {
  buffer:    [],  // recent candidate objects
  lastShown: null // last object that cleared the stability gate
};
