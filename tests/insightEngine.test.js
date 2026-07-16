/**
 * Tests for scripts/domain/insightEngine.js
 *
 * resolveConfig is mocked so the module loads cleanly in Node.
 * LIVE_STATE is mutated directly in each test to simulate energy readings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  buildInsightContext,
  evaluateInsightStrategies,
  pickPrimaryInsight,
  EXPORT_STRONG_ADVANTAGE_CT,
} from '../scripts/domain/insightEngine.js';

import { LIVE_STATE, priceHistoryBuffer, insightState } from '../scripts/core/state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an array of hourly forecast entries starting at `startTs`. */
function makeHours(startTs, count, baseCt, override = {}) {
  return Array.from({ length: count }, (_, i) => ({
    ts: startTs + i * 3600000,
    ct: override[i] !== undefined ? override[i] : baseCt,
  }));
}

/** Aligns a timestamp to the start of its current hour. */
function hourStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/** Returns the timestamp for the start of tomorrow (midnight). */
function tomorrowStart() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Reset shared state before every test
// ---------------------------------------------------------------------------
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
// 1. buildInsightContext()
// ---------------------------------------------------------------------------

describe('buildInsightContext()', () => {
  it('detects inBestWindow when forecast includes cheapest consecutive block covering now', () => {
    const now = hourStart();
    // Cheap block at current hour and next two hours
    LIVE_STATE.priceForecast  = makeHours(now, 5, 30, { 0: 8, 1: 8, 2: 8 });
    LIVE_STATE.currentPriceCt = 8;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx = buildInsightContext();
    expect(ctx.inBestWindow).toBe(true);
  });

  it('detects cheaperLater when best window is after now', () => {
    const now = hourStart();
    // Expensive now, cheap block 3+ hours later
    LIVE_STATE.priceForecast  = makeHours(now, 8, 28, { 4: 10, 5: 10, 6: 10 });
    LIVE_STATE.currentPriceCt = 28;
    LIVE_STATE.gridDir        = 'import';

    const ctx = buildInsightContext();
    expect(ctx.cheaperLater).toBe(true);
  });



  it('detects a cheaper best window that starts within the next 30 minutes', () => {
    const originalDateNow = Date.now;
    const base = hourStart();
    const now = base + 39 * 60000;
    Date.now = vi.fn(() => now);
    vi.setSystemTime(now);

    try {
      // Current hour is 19.31 ct, the 4-hour best block starts at the next
      // hour and is much cheaper. This used to be ignored because it was
      // inside the old 30-minute later-window margin.
      LIVE_STATE.priceForecast = makeHours(base, 8, 19.31, {
        1: 13.23,
        2: 13.23,
        3: 13.23,
        4: 13.23,
      });
      LIVE_STATE.currentPriceCt = 19.31;
      LIVE_STATE.gridDir = 'import';
      LIVE_STATE.gridW = 300;

      const ctx = buildInsightContext();
      expect(ctx.bestWindowStartsSoon).toBe(true);
      expect(ctx.laterWindow).toBe(true);
      expect(ctx.cheaperLater).toBe(true);

      const result = evaluateInsightStrategies(ctx);
      expect(result.primaryAction).toBe('wait');
      expect(result.reasonCodes).toContain('best-window-starts-soon');
    } finally {
      Date.now = originalDateNow;
      vi.useRealTimers();
    }
  });

  it('correctly computes exportAdvantage from feedInReward minus price', () => {
    LIVE_STATE.currentPriceCt = 20;
    LIVE_STATE.solarW         = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 300;

    const ctx = buildInsightContext();
    // feedIn = (20 + 2) * 1.10 = 24.2; advantage = 24.2 - 20 = 4.2
    expect(ctx.exportAdvantage).toBeCloseTo(4.2, 1);
  });

  it('marks exportIsExceptional when advantage >= threshold', () => {
    // Need feedIn - price >= 5.0
    // feedIn = (price + 2) * 1.10 → solve for price:
    // (price + 2) * 1.10 - price >= 5 → 1.10*price + 2.2 - price >= 5 → 0.10*price >= 2.8 → price >= 28
    LIVE_STATE.currentPriceCt = 30; // (30+2)*1.10 = 35.2; 35.2-30 = 5.2 > 5.0
    LIVE_STATE.solarW         = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 300;

    const ctx = buildInsightContext();
    expect(ctx.exportIsExceptional).toBe(true);
  });

  it('does NOT mark exportIsExceptional when advantage is below threshold', () => {
    LIVE_STATE.currentPriceCt = 20; // advantage ≈ 4.2 < 5.0
    LIVE_STATE.solarW         = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 300;

    const ctx = buildInsightContext();
    expect(ctx.exportIsExceptional).toBe(false);
  });

  it('disables Zonnebonus eligibility after the annual export cap is reached', () => {
    LIVE_STATE.currentPriceCt = 32;
    LIVE_STATE.solarW         = 600;
    LIVE_STATE.localSolarW    = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 400;
    LIVE_STATE.gridExportYearKwh = 7500;

    const ctx = buildInsightContext();
    expect(ctx.zonne.annualLimitReached).toBe(true);
    expect(ctx.zonne.eligible).toBe(false);
    expect(ctx.exportIsExceptional).toBe(false);

    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).not.toBe('export-now');
  });
});

// ---------------------------------------------------------------------------
// 2. evaluateInsightStrategies() — cheapest-window-first policy
// ---------------------------------------------------------------------------

describe('evaluateInsightStrategies()', () => {
  it('returns use-now for negative current price', () => {
    const now = hourStart();
    LIVE_STATE.priceForecast  = makeHours(now, 3, -5);
    LIVE_STATE.currentPriceCt = -3;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 400;

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('use-now');
    expect(result.reasonCodes).toContain('negative-price');
  });

  it('returns use-now when current time is inside the best window (HARD RULE)', () => {
    const now = hourStart();
    // Cheapest 3-hour block starts now
    LIVE_STATE.priceForecast  = makeHours(now, 6, 30, { 0: 10, 1: 10, 2: 10 });
    LIVE_STATE.currentPriceCt = 10;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('use-now');
    expect(result.reasonCodes).toContain('in-best-window');
  });

  it('returns wait when a significantly cheaper window exists later', () => {
    const now = hourStart();
    // Expensive now, cheap block later
    LIVE_STATE.priceForecast  = makeHours(now, 8, 28, { 4: 15, 5: 15, 6: 15 });
    LIVE_STATE.currentPriceCt = 28;
    LIVE_STATE.gridDir        = 'import';

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('wait');
    expect(result.reasonCodes).toContain('cheaper-later');
  });

  it('returns use-if-needed when current price is close to the best window', () => {
    const now = hourStart();
    // Cheap block starts 3 hours from now — guaranteed future regardless of wall-clock time.
    // A cheaper hour also exists today (ct:22) so isTodayCheapestHour=false for priceCt=24.
    // Gap of 1 ct (24-23) is below WAIT_THRESHOLD(2) → near-best, should return use-if-needed.
    const cheapStart = now + 3 * 3600000;
    LIVE_STATE.priceForecast  = [
      { ts: now,                  ct: 24 }, // current
      { ts: now + 3600000,        ct: 22 }, // cheaper hour today → isTodayCheapestHour=false
      { ts: now + 7200000,        ct: 25 }, // filler
      { ts: cheapStart,           ct: 23 },
      { ts: cheapStart + 3600000, ct: 23 },
      { ts: cheapStart + 7200000, ct: 23 },
    ];
    LIVE_STATE.currentPriceCt = 24; // 24 - 23 = 1 ct gap < WAIT_THRESHOLD(2) → near-best, not wait
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('use-if-needed');
    expect(result.reasonCodes).toContain('now-near-best');
  });

  it('returns hold when prices are high and import is large', () => {
    const now = hourStart();
    // Build 12 history samples for dynamic thresholds
    for (let i = 0; i < 12; i++) priceHistoryBuffer.push(10 + i);
    LIVE_STATE.priceForecast  = makeHours(now, 4, 35);
    LIVE_STATE.currentPriceCt = 35;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 1200; // large import

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('hold');
  });

  // -------------------------------------------------------------------------
  // Key policy tests: always-on Zonnebonus + export behaviour
  // -------------------------------------------------------------------------

  it('does NOT return export-now when inBestWindow is true (HARD RULE — regression)', () => {
    const now = hourStart();
    // Zonnebonus is always-on (from mock config), exporting with solar surplus
    LIVE_STATE.priceForecast  = makeHours(now, 6, 30, { 0: 10, 1: 10, 2: 10 });
    LIVE_STATE.currentPriceCt = 10;
    LIVE_STATE.solarW         = 500;
    LIVE_STATE.localSolarW    = 400;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 300; // has solar surplus > 100 W

    const ctx    = buildInsightContext();
    // Confirm we are in the best window and have export opportunity
    expect(ctx.inBestWindow).toBe(true);
    expect(ctx.hasSolarSurplus).toBe(true);
    expect(ctx.zonne.eligible).toBe(true);

    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('use-now');
    expect(result.primaryAction).not.toBe('export-now');
  });

  it('does NOT return export-now solely because zonne.eligible is true', () => {
    const now = hourStart();
    // Normal price, no exceptional advantage, but zonnebonus eligible with surplus
    LIVE_STATE.priceForecast  = makeHours(now, 4, 20);
    LIVE_STATE.currentPriceCt = 20; // feedIn = (20+2)*1.10 = 24.2; advantage = 4.2 < 5.0
    LIVE_STATE.solarW         = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 300;

    const ctx    = buildInsightContext();
    expect(ctx.zonne.eligible).toBe(true);
    expect(ctx.exportIsExceptional).toBe(false); // advantage < threshold

    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).not.toBe('export-now');
  });

  it('returns export-now only when export advantage is genuinely exceptional', () => {
    const now = hourStart();
    // High current price → high export advantage; uniform prices mean no meaningful
    // consumption window exists (windowIsSignificant = false, Rule 3 skipped).
    LIVE_STATE.priceForecast  = makeHours(now, 4, 32);
    LIVE_STATE.currentPriceCt = 32; // feedIn = (32+2)*1.10 = 37.4; advantage = 5.4 > 5.0
    LIVE_STATE.solarW         = 600;
    LIVE_STATE.localSolarW    = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 400;

    const ctx    = buildInsightContext();
    expect(ctx.exportIsExceptional).toBe(true);
    // On a uniform-price day windowIsSignificant is false (no spread → no meaningful window)
    expect(ctx.windowIsSignificant).toBe(false);
    expect(ctx.cheaperLater).toBe(false);

    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('export-now');
    expect(result.reasonCodes).toContain('export-exceptional');
  });

  it('prefers use-now over export-now when best window covers current hour even with high export price', () => {
    const now = hourStart();
    // Very high export price scenario — but current hour IS the best window
    LIVE_STATE.priceForecast  = makeHours(now, 6, 40, { 0: 12, 1: 12, 2: 12 });
    LIVE_STATE.currentPriceCt = 12;
    LIVE_STATE.solarW         = 600;
    LIVE_STATE.localSolarW    = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 400;

    const ctx    = buildInsightContext();
    expect(ctx.inBestWindow).toBe(true);
    expect(ctx.exportIsExceptional).toBe(false); // low price → low absolute advantage

    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('use-now');
  });
});

// ---------------------------------------------------------------------------
// 3. pickPrimaryInsight() — secondary context
// ---------------------------------------------------------------------------

describe('pickPrimaryInsight()', () => {
  it('adds export-attractive-context as secondary when primary is use-now and surplus present', () => {
    const now = hourStart();
    LIVE_STATE.priceForecast  = makeHours(now, 6, 30, { 0: 10, 1: 10, 2: 10 });
    LIVE_STATE.currentPriceCt = 10;
    LIVE_STATE.solarW         = 500;
    LIVE_STATE.localSolarW    = 400;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 300;

    const ctx    = buildInsightContext();
    const result = pickPrimaryInsight(ctx);
    expect(result.primaryAction).toBe('use-now');
    expect(result.secondaryContext).toBe('export-attractive-context');
  });

  it('adds export-while-waiting as secondary when primary is wait and surplus present', () => {
    const now = hourStart();
    LIVE_STATE.priceForecast  = makeHours(now, 8, 28, { 4: 15, 5: 15, 6: 15 });
    LIVE_STATE.currentPriceCt = 28;
    LIVE_STATE.solarW         = 500;
    LIVE_STATE.localSolarW    = 400;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 300;

    const ctx    = buildInsightContext();
    const result = pickPrimaryInsight(ctx);
    expect(result.primaryAction).toBe('wait');
    expect(result.secondaryContext).toBe('export-while-waiting');
  });

  it('adds plan-loads-later as secondary when primary is export-now', () => {
    const now = hourStart();
    LIVE_STATE.priceForecast  = makeHours(now, 8, 32, { 5: 15, 6: 15, 7: 15 });
    LIVE_STATE.currentPriceCt = 32; // feedIn ≈ 37.4, advantage ≈ 5.4 > 5.0
    LIVE_STATE.solarW         = 600;
    LIVE_STATE.localSolarW    = 500;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 400;

    const ctx    = buildInsightContext();
    // ensure cheap later window doesn't trigger 'wait' first
    const result = pickPrimaryInsight(ctx);
    // May be 'wait' if cheaper-later kicks in — verify the secondary context is coherent
    if (result.primaryAction === 'export-now') {
      expect(result.secondaryContext).toBe('plan-loads-later');
    } else {
      // cheaper-later dominated → secondary export context
      expect(['export-while-waiting', null]).toContain(result.secondaryContext);
    }
  });

  it('has null secondary context when no export opportunity exists', () => {
    const now = hourStart();
    LIVE_STATE.priceForecast  = makeHours(now, 4, 20);
    LIVE_STATE.currentPriceCt = 20;
    LIVE_STATE.solarW         = 0;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx    = buildInsightContext();
    const result = pickPrimaryInsight(ctx);
    expect(result.secondaryContext).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Stability across small differences
// ---------------------------------------------------------------------------

describe('Advice stability across small price differences', () => {
  it('does not cause a wait flip when price is within 1.5 ct of the best window', () => {
    // Start forecast 1 minute from now so all entries are included by
    // activeDecisionWindow's 30-min recency filter.
    // Cheap block is 4+ hours later but only 1 ct cheaper → not cheaperLater.
    const base = Date.now() + 60000;
    LIVE_STATE.priceForecast  = makeHours(base, 8, 22, { 5: 21, 6: 21, 7: 21 });
    LIVE_STATE.currentPriceCt = 22; // 22 - 21 = 1 ct < WAIT_THRESHOLD_CT; near-best only
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    // 1 ct difference must NOT trigger wait.
    // Result is use-now (today cheapest) or use-if-needed (cheaper window today),
    // depending on whether the cheap block falls within today's day boundary.
    expect(result.primaryAction).not.toBe('wait');
    expect(['use-if-needed', 'use-now']).toContain(result.primaryAction);
  });

  it('does not flip to export when current hour is the cheapest window of the day', () => {
    // Start the cheapest block at the current hour so the test is independent
    // of wall-clock minute/second timing and coverage instrumentation speed.
    const base = hourStart();
    LIVE_STATE.priceForecast  = makeHours(base, 6, 30, { 0: 18, 1: 18, 2: 18 });
    LIVE_STATE.currentPriceCt = 18;
    LIVE_STATE.solarW         = 400;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 250;

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('use-now'); // best window wins; no flip to export
    expect(result.primaryAction).not.toBe('export-now');
  });
});

// ---------------------------------------------------------------------------
// 5. Regression: screenshot scenario (14:00, price 24.17 ct, exporting)
// ---------------------------------------------------------------------------

describe('Regression: screenshot scenario', () => {
  it('returns use-now (not export-now) when 14:00 is the cheapest window of the day', () => {
    // Simulate a typical day: cheaper midday, expensive evening
    // Current time: 14:00 — in the cheapest block
    const now = hourStart();
    // Build a forecast where hour 0 (now=14:00) is in the cheap block
    const forecast = makeHours(now, 10, 36, {
      0: 24, 1: 24, 2: 26,   // 14:00-16:00 cheapest
      7: 38, 8: 39, 9: 38,   // 21:00-23:00 expensive evening
    });
    LIVE_STATE.priceForecast  = forecast;
    LIVE_STATE.currentPriceCt = 24;     // current price as in screenshot
    LIVE_STATE.solarW         = 382;    // 382 W solar as in screenshot
    LIVE_STATE.localSolarW    = 119;
    LIVE_STATE.gridDir        = 'export';
    LIVE_STATE.gridW          = 263;    // 263 W export as in screenshot

    const ctx    = buildInsightContext();

    // The cheap block covers now — must be in best window
    expect(ctx.inBestWindow).toBe(true);
    // Zonnebonus is eligible (always-on, solar > 50 W, price > 0)
    expect(ctx.zonne.eligible).toBe(true);
    // Has solar surplus
    expect(ctx.hasSolarSurplus).toBe(true);

    const result = evaluateInsightStrategies(ctx);

    // CRITICAL: cheapest-window-first → USE NOW, not EXPORT NOW
    expect(result.primaryAction).toBe('use-now');
    expect(result.primaryAction).not.toBe('export-now');
    expect(result.reasonCodes).toContain('in-best-window');
  });
});

// ---------------------------------------------------------------------------
// 6. Wording precision: cheapest-hour, in-best-window, near-best, tomorrow
// ---------------------------------------------------------------------------

describe('Wording precision: isTodayCheapestHour, bestWindowIsToday/Tomorrow', () => {
  /** Returns the timestamp for the start of tomorrow (midnight). */
  function tomorrowStart() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  it('sets isTodayCheapestHour=true when current price equals today minimum', () => {
    const now = hourStart();
    const tomorrow = tomorrowStart();
    // All today hours at 22, tomorrow hours at 21 — current (22) IS today's cheapest
    const forecast = [
      { ts: now,                ct: 22 },
      { ts: now + 3600000,      ct: 25 },
      { ts: now + 7200000,      ct: 26 },
      { ts: tomorrow,           ct: 21 },
      { ts: tomorrow + 3600000, ct: 21 },
      { ts: tomorrow + 7200000, ct: 21 },
    ];
    LIVE_STATE.priceForecast  = forecast;
    LIVE_STATE.currentPriceCt = 22;

    const ctx = buildInsightContext();
    expect(ctx.isTodayCheapestHour).toBe(true);
    expect(ctx.bestWindowIsTomorrow).toBe(true);
    expect(ctx.bestWindowIsToday).toBe(false);
  });

  it('sets isTodayCheapestHour=false when a cheaper hour exists today', () => {
    const now = hourStart();
    // Build forecast with a cheaper hour at +1h (not +2h) so it reliably falls
    // within the same calendar day regardless of what time the test runs.
    // current=25ct, next hour=20ct (cheaper today) → isTodayCheapestHour must be false.
    LIVE_STATE.priceForecast  = makeHours(now, 5, 25, { 1: 20 });
    LIVE_STATE.currentPriceCt = 25;

    const ctx = buildInsightContext();
    expect(ctx.isTodayCheapestHour).toBe(false);
  });

  it('returns use-now with today-cheapest-hour when current is cheapest today, tomorrow only slightly cheaper', () => {
    // Exact bug-report scenario: current hour is cheapest today,
    // best window is tomorrow (only 1 ct cheaper → no WAIT),
    // old code produced use-if-needed with "today's best window" text.
    const now = hourStart();
    const tomorrow = tomorrowStart();
    const forecast = [
      { ts: now,                ct: 24 },  // current — cheapest today
      { ts: now + 3600000,      ct: 26 },
      { ts: now + 7200000,      ct: 28 },
      { ts: tomorrow,           ct: 23 },  // tomorrow avg 23 — only 1 ct cheaper → no WAIT
      { ts: tomorrow + 3600000, ct: 23 },
      { ts: tomorrow + 7200000, ct: 23 },
    ];
    LIVE_STATE.priceForecast  = forecast;
    LIVE_STATE.currentPriceCt = 24;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx = buildInsightContext();
    expect(ctx.isTodayCheapestHour).toBe(true);
    expect(ctx.bestWindowIsTomorrow).toBe(true);
    expect(ctx.cheaperLater).toBe(false);  // 24 - 23 = 1 ct < WAIT_THRESHOLD

    const result = evaluateInsightStrategies(ctx);
    // Must be use-now, NOT use-if-needed
    expect(result.primaryAction).toBe('use-now');
    expect(result.reasonCodes).toContain('today-cheapest-hour');
    expect(result.reasonCodes).not.toContain('now-near-best');
  });

  it('returns use-if-needed when near-best but NOT today cheapest (cheaper window today)', () => {
    const now = hourStart();
    // Cheap block at the last 3 hours of today — always future, always same calendar day.
    const cheapStart = tomorrowStart() - 3 * 3600000;
    LIVE_STATE.priceForecast  = [
      { ts: now,                  ct: 25 },
      { ts: cheapStart,           ct: 23 },
      { ts: cheapStart + 3600000, ct: 23 },
      { ts: cheapStart + 7200000, ct: 23 },
    ];
    LIVE_STATE.currentPriceCt = 24; // 24 - 23 = 1 ct < WAIT_THRESHOLD; near-best only
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    // Must NOT be wait (delta too small); today-cheapest-hour must not fire
    expect(result.primaryAction).not.toBe('wait');
    expect(result.reasonCodes).not.toContain('today-cheapest-hour');
  });

  it('returns wait when tomorrow window is significantly cheaper', () => {
    const now = hourStart();
    const tomorrow = tomorrowStart();
    // Current 28 ct, tomorrow best avg 21 ct → delta 7 ct > WAIT_THRESHOLD (2 ct)
    const forecast = [
      { ts: now,                ct: 28 },
      { ts: now + 3600000,      ct: 29 },
      { ts: tomorrow,           ct: 21 },
      { ts: tomorrow + 3600000, ct: 21 },
      { ts: tomorrow + 7200000, ct: 21 },
    ];
    LIVE_STATE.priceForecast  = forecast;
    LIVE_STATE.currentPriceCt = 28;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx = buildInsightContext();
    expect(ctx.bestWindowIsTomorrow).toBe(true);
    expect(ctx.cheaperLater).toBe(true);

    const result = evaluateInsightStrategies(ctx);
    expect(result.primaryAction).toBe('wait');
    expect(result.reasonCodes).toContain('cheaper-later');
  });

  it('never produces use-if-needed when today-cheapest-hour fires', () => {
    const now = hourStart();
    const tomorrow = tomorrowStart();
    const forecast = [
      { ts: now,                ct: 22 },
      { ts: now + 3600000,      ct: 24 },
      { ts: tomorrow,           ct: 21 },
      { ts: tomorrow + 3600000, ct: 21 },
      { ts: tomorrow + 7200000, ct: 21 },
    ];
    LIVE_STATE.priceForecast  = forecast;
    LIVE_STATE.currentPriceCt = 22;
    LIVE_STATE.gridDir        = 'import';
    LIVE_STATE.gridW          = 200;

    const ctx    = buildInsightContext();
    const result = evaluateInsightStrategies(ctx);
    // Must be use-now when current is today's cheapest
    expect(result.primaryAction).toBe('use-now');
    expect(result.reasonCodes).toContain('today-cheapest-hour');
  });
});
