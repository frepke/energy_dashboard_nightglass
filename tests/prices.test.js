/**
 * Tests for scripts/domain/prices.js
 *
 * resolveConfig is mocked so the module loads cleanly in Node.
 * state.js is imported directly — each test clears shared arrays before use.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock resolveConfig before any imports that depend on it.
vi.mock('../scripts/config/resolveConfig.js', () => ({
  CONTRACT_CFG: {
    zonnebonusAlwaysOn:              true,
    zonnebonusInkoopvergoedingCt:    2,
    zonnebonusPct:                   0.10,
    zonnebonusAnnualExportLimitKwh:  7500,
    daylightSolarThresholdW:         50,
    exportSolarThresholdW:           200,
  },
  CFG: {
    refresh: 1,
    forecastIdx: '',
    ws: false,
    usageIdx: '',
    selfSufficiencyIdx: '',
    selfConsumptionIdx: '',
    electricityPriceIdx: '',
    gasPriceIdx: '',
    inverterLimitIdx: '',
    vcKey: '',
    vcLocation: 'Amsterdam,NL',
    vcUnitGroup: 'metric',
    latitude: 52.379,
    longitude: 4.900,
    timezone: 'Europe/Amsterdam',
  },
  DOMOTICZ_CFG: {
    baseUrl: '',
    username: '',
    password: '',
    auth: 'basic',
    ws: false,
  },
  WEATHER_CFG: {
    apiKey: '',
    location: 'Amsterdam,NL',
    unitGroup: 'metric',
    latitude: 52.379,
    longitude: 4.900,
    timezone: 'Europe/Amsterdam',
  },
}));

import {
  pushPriceHistory,
  getDynamicThresholds,
  classifyPrice,
  bestWindow,
  expandCheapPlateau,
  activeDecisionWindow,
  getZonnebonusContext,
  stableAdvice,
} from '../scripts/domain/prices.js';

import { priceHistoryBuffer, LIVE_STATE, insightState } from '../scripts/core/state.js';

// Reset shared mutable state before each test.
beforeEach(() => {
  priceHistoryBuffer.length = 0;
  LIVE_STATE.priceForecast  = [];
  LIVE_STATE.gridW          = 0;
  LIVE_STATE.gridDir        = '';
  LIVE_STATE.houseW         = 0;
  LIVE_STATE.solarW         = 0;
  LIVE_STATE.localSolarW    = 0;
  LIVE_STATE.currentPriceCt = null;
  LIVE_STATE.gridPriceCt    = null;
  LIVE_STATE.cheapestFuture = null;
  LIVE_STATE.updatedAt      = null;
  LIVE_STATE.gridExportYearKwh = null;
  insightState.buffer       = [];
  insightState.lastShown    = null;
});

// ---------------------------------------------------------------------------
// pushPriceHistory
// ---------------------------------------------------------------------------

describe('pushPriceHistory', () => {
  it('appends valid ct entries to the history buffer', () => {
    pushPriceHistory([{ ct: 20 }, { ct: 25 }]);
    expect(priceHistoryBuffer).toEqual([20, 25]);
  });

  it('ignores entries with non-numeric ct', () => {
    pushPriceHistory([{ ct: null }, { ct: 'bad' }, { ct: 15 }]);
    expect(priceHistoryBuffer).toEqual([15]);
  });

  it('handles a non-array input gracefully', () => {
    expect(() => pushPriceHistory(null)).not.toThrow();
    expect(priceHistoryBuffer).toHaveLength(0);
  });

  it('trims the buffer to 168 entries (7 days × 24 h)', () => {
    // Fill with 170 entries then add 2 more
    for (let i = 0; i < 168; i++) priceHistoryBuffer.push(i);
    pushPriceHistory([{ ct: 200 }, { ct: 201 }]);
    expect(priceHistoryBuffer).toHaveLength(168);
    // The oldest values are evicted
    expect(priceHistoryBuffer[priceHistoryBuffer.length - 1]).toBe(201);
  });

  it('deduplicates timestamped entries instead of appending repeated forecasts', () => {
    const ts = Date.UTC(2026, 5, 6, 12);

    pushPriceHistory([{ ts, ct: 20 }, { ts: ts + 3600000, ct: 25 }]);
    pushPriceHistory([{ ts, ct: 21 }, { ts: ts + 3600000, ct: 25 }]);

    expect(priceHistoryBuffer).toEqual([21, 25]);
  });
});

// ---------------------------------------------------------------------------
// getDynamicThresholds
// ---------------------------------------------------------------------------

describe('getDynamicThresholds', () => {
  it('returns hard-coded defaults when history is thin (< 12 samples)', () => {
    pushPriceHistory([{ ct: 10 }, { ct: 20 }]);
    const t = getDynamicThresholds();
    expect(t.cheapCt).toBe(8);
    expect(t.expensiveCt).toBe(25);
  });

  it('returns dynamic thresholds when there are >= 12 samples', () => {
    const prices = [5, 5, 6, 7, 8, 10, 12, 14, 16, 20, 25, 30, 35];
    pushPriceHistory(prices.map(ct => ({ ct })));
    const t = getDynamicThresholds();
    // expensiveCt should reflect p80 ≥ 18
    expect(t.expensiveCt).toBeGreaterThanOrEqual(18);
    // cheapCt should be capped at 10
    expect(t.cheapCt).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// classifyPrice
// ---------------------------------------------------------------------------

describe('classifyPrice', () => {
  it('classifies a negative price as "negative"', () => {
    const result = classifyPrice(-5);
    expect(result.level).toBe('negative');
  });

  it('classifies null as "unknown"', () => {
    const result = classifyPrice(null);
    expect(result.level).toBe('unknown');
  });

  it('classifies a normal price (with thin history → defaults) as "normal" or "cheap"', () => {
    const result = classifyPrice(12); // between 8 cheap and 25 expensive defaults
    expect(['normal', 'cheap']).toContain(result.level);
  });

  it('classifies a price above the expensive threshold as "high" or "peak"', () => {
    // Provide forecast data so expensiveNow can be evaluated
    const now = Date.now();
    LIVE_STATE.priceForecast = Array.from({ length: 6 }, (_, i) => ({
      ts: now + i * 3600000,
      ct: i === 0 ? 30 : 10, // current hour is expensive relative to others
    }));
    const result = classifyPrice(30); // above default expensiveCt of 25
    expect(['high', 'peak']).toContain(result.level);
  });
});

// ---------------------------------------------------------------------------
// bestWindow
// ---------------------------------------------------------------------------

function makeHours(startTs, count, baseCt, override = {}) {
  return Array.from({ length: count }, (_, i) => ({
    ts: startTs + i * 3600000,
    ct: override[i] !== undefined ? override[i] : baseCt,
  }));
}

describe('bestWindow', () => {
  it('returns null when there are no future prices', () => {
    LIVE_STATE.priceForecast = [];
    expect(bestWindow(2)).toBeNull();
  });

  it('finds the cheapest 2-hour window', () => {
    const now = Date.now();
    // Cheap window at hours 2 and 3 (ct = 5)
    LIVE_STATE.priceForecast = makeHours(now, 6, 20, { 2: 5, 3: 5 });
    const w = bestWindow(2);
    expect(w).not.toBeNull();
    expect(w.avg).toBeCloseTo(5, 1);
  });

  it('returns null when fewer hours than needed', () => {
    const now = Date.now();
    LIVE_STATE.priceForecast = makeHours(now, 1, 10);
    expect(bestWindow(2)).toBeNull();
  });

  it('ignores non-continuous blocks (gaps > 2 minutes)', () => {
    const now = Date.now();
    // Two hours with a 2-hour gap between them — not continuous
    LIVE_STATE.priceForecast = [
      { ts: now,               ct: 5 },
      { ts: now + 7200000,     ct: 5 }, // 2 h gap → not contiguous
    ];
    const w = bestWindow(2);
    // Gap is exactly 2 h which is > 120_000 ms tolerance → no continuous pair
    expect(w).toBeNull();
  });

  it('treats one requested hour as four consecutive quarter-hour slots', () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 7, 1, 10, 7);
    const slotStart = Date.UTC(2026, 7, 1, 10, 0);
    vi.setSystemTime(now);
    LIVE_STATE.priceForecast = Array.from({ length: 12 }, (_, i) => ({
      ts: slotStart + i * 15 * 60000,
      endTs: slotStart + (i + 1) * 15 * 60000,
      intervalMinutes: 15,
      ct: i >= 4 && i < 8 ? 5 : 20,
    }));

    const w = bestWindow(1);
    expect(w.items).toHaveLength(4);
    expect(w.start).toBe(slotStart + 4 * 15 * 60000);
    expect(w.end).toBe(slotStart + 8 * 15 * 60000);
    expect(w.avg).toBe(5);
    vi.useRealTimers();
  });
});



// ---------------------------------------------------------------------------
// expandCheapPlateau / activeDecisionWindow
// ---------------------------------------------------------------------------

describe('expandCheapPlateau / activeDecisionWindow', () => {
  it('expands a 3-hour core window to a longer adjacent equal-price plateau', () => {
    const now = Date.now();
    LIVE_STATE.priceForecast = makeHours(now, 8, 30, {
      2: 13.07,
      3: 13.07,
      4: 13.07,
      5: 13.07,
      6: 13.07,
    });

    const core = bestWindow(3);
    const expanded = expandCheapPlateau(core);

    expect(core.items).toHaveLength(3);
    expect(expanded.items).toHaveLength(5);
    expect(expanded.start).toBe(now + 2 * 3600000);
    expect(expanded.end).toBe(now + 7 * 3600000);
    expect(expanded.plateauLength).toBe(5);
  });

  it('uses the exact requested usage window for the active decision highlight', () => {
    const now = Date.now();
    LIVE_STATE.priceForecast = makeHours(now, 8, 30, {
      2: 13.07,
      3: 13.07,
      4: 13.07,
      5: 13.07,
      6: 13.07,
    });

    const w = activeDecisionWindow(3);

    expect(w.items).toHaveLength(3);
    expect(w.highlightStart).toBe(now + 2 * 3600000);
    expect(w.highlightEnd).toBe(now + 5 * 3600000);
    expect(w.requestedHours).toBe(3);
  });

  it('does not expand across a clearly more expensive neighbouring hour', () => {
    const now = Date.now();
    LIVE_STATE.priceForecast = makeHours(now, 7, 30, {
      2: 13.07,
      3: 13.07,
      4: 13.07,
      5: 14.00,
    });

    const expanded = expandCheapPlateau(bestWindow(3));

    expect(expanded.items).toHaveLength(3);
    expect(expanded.end).toBe(now + 5 * 3600000);
  });
});

// ---------------------------------------------------------------------------
// getZonnebonusContext
// ---------------------------------------------------------------------------

describe('getZonnebonusContext', () => {
  it('marks export opportunity when solar surplus is available and eligible', () => {
    // High solar power (> 50 W threshold), exporting (true), price > 0 so baseFeedIn > 0
    const ctx = getZonnebonusContext(20, 500, 400, true);
    expect(ctx.eligible).toBe(true);
    expect(ctx.exportOpportunity).toBe(true);
  });

  it('returns not eligible when solar is below threshold', () => {
    const ctx = getZonnebonusContext(20, 10, 10, false);
    expect(ctx.eligible).toBe(false);
    expect(ctx.exportOpportunity).toBe(false);
  });

  it('calculates feedInRewardCt including zonnebonus', () => {
    // priceCt = 20 ct, inkoopvergoeding = 2 ct → baseFeedIn = 22 ct
    // bonus = 22 * 0.10 = 2.2 ct → feedIn = 24.2 ct
    const ctx = getZonnebonusContext(20, 500, 400, true);
    expect(ctx.feedInRewardCt).toBeCloseTo(24.2, 1);
  });

  it('handles null price gracefully', () => {
    const ctx = getZonnebonusContext(null, 500, 400, true);
    expect(ctx.feedInRewardCt).toBeNull();
    expect(ctx.eligible).toBe(false);
  });

  it('keeps Zonnebonus eligible while annual export is below the cap', () => {
    const ctx = getZonnebonusContext(20, 500, 400, true, 7400);
    expect(ctx.annualLimitKnown).toBe(true);
    expect(ctx.annualLimitReached).toBe(false);
    expect(ctx.remainingAnnualExportKwh).toBe(100);
    expect(ctx.eligible).toBe(true);
    expect(ctx.feedInRewardCt).toBeCloseTo(24.2, 1);
  });

  it('disables the Zonnebonus bonus when the annual export cap is reached', () => {
    const ctx = getZonnebonusContext(20, 500, 400, true, 7500);
    expect(ctx.annualLimitKnown).toBe(true);
    expect(ctx.annualLimitReached).toBe(true);
    expect(ctx.remainingAnnualExportKwh).toBe(0);
    expect(ctx.eligible).toBe(false);
    expect(ctx.exportOpportunity).toBe(false);
    expect(ctx.bonusCt).toBe(0);
    expect(ctx.feedInRewardCt).toBeCloseTo(22, 1);
  });

  it('uses LIVE_STATE.gridExportYearKwh as annual cap input when omitted', () => {
    LIVE_STATE.gridExportYearKwh = 7501;
    const ctx = getZonnebonusContext(20, 500, 400, true);
    expect(ctx.annualLimitReached).toBe(true);
    expect(ctx.eligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stableAdvice
// ---------------------------------------------------------------------------

describe('stableAdvice', () => {
  it('returns the first candidate immediately when lastShown is null and stability met', () => {
    const c = { mode: 'is-good', msg: 'fine', ico: '✓', actionPill: 'No action', actionClass: '' };
    // Two identical candidates → stable
    stableAdvice(c);
    const result = stableAdvice(c);
    expect(result.mode).toBe('is-good');
  });

  it('holds the previous stable advice when candidates differ (flicker guard)', () => {
    const c1 = { mode: 'is-good', actionKey: 'no-action', msg: 'fine' };
    const c2 = { mode: 'is-wait', actionKey: 'wait',      msg: 'wait' };

    // Establish a stable baseline
    stableAdvice(c1);
    stableAdvice(c1);
    stableAdvice(c1); // now stable (STABLE_TICKS=3)

    // Single different candidate should NOT override yet
    const held = stableAdvice(c2);
    expect(held.mode).toBe('is-good');
  });

  it('switches to the new advice after enough identical candidates flush old ones', () => {
    const c1 = { mode: 'is-good', actionKey: 'no-action', msg: 'fine' };
    const c2 = { mode: 'is-wait', actionKey: 'wait',      msg: 'wait' };

    // Establish c1 as stable
    stableAdvice(c1);
    stableAdvice(c1);
    stableAdvice(c1); // c1 is now lastShown

    // Four c2 calls flush the buffer (max size = STABLE_TICKS+1 = 4)
    stableAdvice(c2);
    stableAdvice(c2);
    stableAdvice(c2);
    const result = stableAdvice(c2); // now [c2,c2,c2,c2] → allSame → switch
    expect(result.mode).toBe('is-wait');
  });
});
