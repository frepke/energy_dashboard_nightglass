/**
 * Extra tests for scripts/domain/insightEngine.js
 *
 * Covers the previously uncovered strategy branches:
 *  - Rule 2:  best window ahead with negative average  → wait
 *  - Rule 6:  currently favourable price               → use-now
 *  - Rule 7:  high price + high import                 → hold
 *  - Rule 9:  low import, expensive, best window later → wait (low confidence)
 *  - Rule 10: low solar, expensive → wait / hold / no-action
 *  - Rule 10: low solar, cheaper later                 → wait
 *  - pickPrimaryInsight: plan-loads-later when export-now + laterWindow
 *  - pickPrimaryInsight: null secondary when primary is hold/no-action
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
    refresh: 1, forecastIdx: '', ws: false,
    usageIdx: '', selfSufficiencyIdx: '', selfConsumptionIdx: '',
    electricityPriceIdx: '', gasPriceIdx: '', inverterLimitIdx: '',
    vcKey: '', vcLocation: 'Amsterdam,NL', vcUnitGroup: 'metric',
    latitude: 52.379, longitude: 4.900, timezone: 'Europe/Amsterdam',
  },
  DOMOTICZ_CFG: { baseUrl: '', username: '', password: '', auth: 'basic', ws: false },
  WEATHER_CFG: { apiKey: '', location: 'Amsterdam,NL', unitGroup: 'metric',
    latitude: 52.379, longitude: 4.900, timezone: 'Europe/Amsterdam' },
}));

import {
  evaluateInsightStrategies,
  pickPrimaryInsight,
  EXPORT_STRONG_ADVANTAGE_CT,
  WAIT_THRESHOLD_CT,
} from '../scripts/domain/insightEngine.js';

// ── Shared ctx builder ────────────────────────────────────────────────────────

function makeThr() {
  return { cheapCt: 18, expensiveCt: 30, avgCt: 24 };
}

/**
 * Creates a minimal valid context. Override individual fields per test.
 */
function ctx(overrides = {}) {
  const base = {
    priceCt:              24,
    price:                { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
    bestBlock:            null,
    bestAvg:              null,
    inBestWindow:         false,
    laterWindow:          false,
    cheaperLater:         false,
    muchCheaperLater:     false,
    nowNearBest:          false,
    currentIsFavourable:  false,
    windowIsSignificant:  false,
    hasSolarSurplus:      false,
    zonne:                { eligible: false, feedInRewardCt: null },
    exportIsExceptional:  false,
    lowImport:            false,
    isImporting:          true,
    solarW:               200,
    gridW:                500,
    isTodayCheapestHour:  false,
    bestWindowIsToday:    false,
    _thr:                 makeThr(),
  };
  return { ...base, ...overrides };
}

// ── Rule 2: best window negative average later ────────────────────────────────

describe('Rule 2 — best window with negative average later', () => {
  it('returns wait (high confidence) when bestAvg < 0 and laterWindow is true', () => {
    const result = evaluateInsightStrategies(ctx({
      bestBlock:   { start: Date.now() + 7200000, avg: -5 },
      bestAvg:     -5,
      laterWindow: true,
    }));
    expect(result.primaryAction).toBe('wait');
    expect(result.confidence).toBe('high');
    expect(result.reasonCodes).toContain('best-window-negative-later');
  });

  it('does NOT fire rule 2 when bestAvg is positive', () => {
    const result = evaluateInsightStrategies(ctx({
      bestBlock:   { start: Date.now() + 7200000, avg: 18 },
      bestAvg:     18,
      laterWindow: true,
    }));
    expect(result.reasonCodes).not.toContain('best-window-negative-later');
  });

  it('does NOT fire rule 2 when laterWindow is false (best window is now)', () => {
    const result = evaluateInsightStrategies(ctx({
      bestBlock:   { start: Date.now() - 1000, avg: -3 },
      bestAvg:     -3,
      laterWindow: false,
    }));
    expect(result.reasonCodes).not.toContain('best-window-negative-later');
  });
});

// ── Rule 6: currently favourable price ───────────────────────────────────────

describe('Rule 6 — currently favourable price', () => {
  it('returns use-now (medium confidence) when price is favourable and not cheap later', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:             18,
      price:               { cheapNow: true, expensiveNow: false, level: 'cheap', avg: 24 },
      currentIsFavourable: true,
      cheaperLater:        false,
      nowNearBest:         false,
      isImporting:         true,
      solarW:              50,
    }));
    expect(result.primaryAction).toBe('use-now');
    expect(result.confidence).toBe('medium');
    expect(result.reasonCodes).toContain('currently-favourable');
  });

  it('does NOT fire rule 6 when price is expensive', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:             35,
      price:               { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      currentIsFavourable: true,
      cheaperLater:        false,
      nowNearBest:         false,
      isImporting:         true,
      solarW:              50,
    }));
    expect(result.reasonCodes).not.toContain('currently-favourable');
  });

  it('does NOT fire rule 6 when cheaper window is coming', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:             22,
      price:               { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      currentIsFavourable: true,
      cheaperLater:        true,
      nowNearBest:         false,
      bestBlock:           { start: Date.now() + 3600000, avg: 16 },
      bestAvg:             16,
      laterWindow:         true,
    }));
    expect(result.reasonCodes).not.toContain('currently-favourable');
  });

  it('does NOT fire rule 6 when not importing and solar is low', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:             18,
      price:               { cheapNow: true, expensiveNow: false, level: 'cheap', avg: 24 },
      currentIsFavourable: true,
      cheaperLater:        false,
      nowNearBest:         false,
      isImporting:         false,
      solarW:              50,   // exactly 50: condition is solarW > 100
    }));
    expect(result.reasonCodes).not.toContain('currently-favourable');
  });
});

// ── Rule 7: high price + high import ─────────────────────────────────────────

describe('Rule 7 — high price and high import', () => {
  it('returns hold (high confidence) at peak price with gridW > 900', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:    36,
      price:      { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      gridW:      1200,
      isImporting: true,
    }));
    expect(result.primaryAction).toBe('hold');
    expect(result.confidence).toBe('high');
    expect(result.reasonCodes).toContain('high-price-high-import');
  });

  it('does NOT fire rule 7 when gridW is below threshold', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:    36,
      price:      { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      gridW:      400,
      isImporting: true,
    }));
    expect(result.reasonCodes).not.toContain('high-price-high-import');
  });

  it('does NOT fire rule 7 when not importing', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:    36,
      price:      { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      gridW:      1200,
      isImporting: false,
    }));
    expect(result.reasonCodes).not.toContain('high-price-high-import');
  });
});

// ── Rule 9: low import, expensive, best window later ─────────────────────────

describe('Rule 9 — low import, expensive, best window later', () => {
  it('returns wait (low confidence) when lowImport + expensiveNow + laterWindow', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:    32,
      price:      { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      lowImport:  true,
      isImporting: true,
      gridW:      300,
      bestBlock:  { start: Date.now() + 3600000, avg: 18 },
      bestAvg:    18,
      laterWindow: true,
    }));
    expect(result.primaryAction).toBe('wait');
    expect(result.confidence).toBe('low');
    expect(result.reasonCodes).toContain('low-import-expensive');
  });

  it('does NOT fire rule 9 when not lowImport', () => {
    const result = evaluateInsightStrategies(ctx({
      priceCt:    32,
      price:      { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      lowImport:  false,
      gridW:      1100,
      isImporting: true,
      bestBlock:  { start: Date.now() + 3600000, avg: 18 },
      bestAvg:    18,
      laterWindow: true,
    }));
    expect(result.reasonCodes).not.toContain('low-import-expensive');
  });
});

// ── Rule 10: low solar, near-expensive price ──────────────────────────────────

describe('Rule 10 — low solar, near-expensive price', () => {
  it('returns wait via rule 4 (not rule 10) when cheaperLater is true — rule 4 has higher priority', () => {
    // Rule 4 (cheaperLater) fires before rule 10 can be reached.
    // This is intentional — cheapest-window-first policy.
    const _thr = makeThr();
    const result = evaluateInsightStrategies(ctx({
      solarW:       10,
      priceCt:      22,
      price:        { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      isImporting:  true,
      cheaperLater: true,
      bestBlock:    { start: Date.now() + 3600000, avg: 16 },
      bestAvg:      16,
      laterWindow:  true,
      _thr,
    }));
    expect(result.primaryAction).toBe('wait');
    expect(result.reasonCodes).toContain('cheaper-later');
    expect(result.reasonCodes).not.toContain('low-solar-expensive');
  });

  it('returns hold (low confidence) when low solar, expensive, no cheaper window', () => {
    const _thr = makeThr();
    const result = evaluateInsightStrategies(ctx({
      solarW:      5,
      priceCt:     32,
      price:       { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      isImporting: true,
      cheaperLater: false,
      gridW:       400,  // lowImport but no bestBlock so rule 9 won't fire
      lowImport:   false,
      _thr,
    }));
    expect(result.primaryAction).toBe('hold');
    expect(result.confidence).toBe('low');
    expect(result.reasonCodes).toContain('low-solar-expensive');
  });

  it('returns no-action (low confidence) when low solar, near-expensive, no cheaper window, not expensiveNow', () => {
    const _thr = makeThr();
    const result = evaluateInsightStrategies(ctx({
      solarW:      0,
      priceCt:     22,
      price:       { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      isImporting: true,
      cheaperLater: false,
      _thr,
    }));
    expect(result.primaryAction).toBe('no-action');
    expect(result.reasonCodes).toContain('low-solar-expensive');
  });

  it('does NOT fire rule 10 when solarW > 30', () => {
    const _thr = makeThr();
    const result = evaluateInsightStrategies(ctx({
      solarW:      50,
      priceCt:     22,
      price:       { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      isImporting: true,
      cheaperLater: false,
      _thr,
    }));
    expect(result.reasonCodes).not.toContain('low-solar-expensive');
  });

  it('does NOT fire rule 10 when not importing', () => {
    const _thr = makeThr();
    const result = evaluateInsightStrategies(ctx({
      solarW:      10,
      priceCt:     22,
      price:       { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      isImporting: false,
      cheaperLater: false,
      _thr,
    }));
    expect(result.reasonCodes).not.toContain('low-solar-expensive');
  });
});

// ── Rule 11: fallback ─────────────────────────────────────────────────────────

describe('Rule 11 — fallback', () => {
  it('returns no-action when no other rule applies', () => {
    const result = evaluateInsightStrategies(ctx({
      solarW:       200,
      priceCt:      24,
      price:        { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      isImporting:  false,
      cheaperLater: false,
    }));
    expect(result.primaryAction).toBe('no-action');
    expect(result.reasonCodes).toContain('fallback');
  });
});

// ── pickPrimaryInsight secondary context ──────────────────────────────────────

describe('pickPrimaryInsight — secondary context', () => {
  it('adds plan-loads-later when primary is export-now and laterWindow exists', () => {
    // export-now fires via rule 8: hasSolarSurplus + eligible + exportIsExceptional
    const result = pickPrimaryInsight(ctx({
      hasSolarSurplus:     true,
      zonne:               { eligible: true, feedInRewardCt: 30 },
      exportIsExceptional: true,
      bestBlock:           { start: Date.now() + 3600000, avg: 18 },
      bestAvg:             18,
      laterWindow:         true,
      // Ensure no higher-priority rule fires
      priceCt:             24,
      price:               { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      inBestWindow:        false,
      windowIsSignificant: false,
      cheaperLater:        false,
      nowNearBest:         false,
      currentIsFavourable: false,
      isImporting:         false,
      gridW:               500,
      lowImport:           false,
      solarW:              400,
      isTodayCheapestHour: false,
    }));
    expect(result.primaryAction).toBe('export-now');
    expect(result.secondaryContext).toBe('plan-loads-later');
  });

  it('has null secondaryContext when primary is hold', () => {
    const result = pickPrimaryInsight(ctx({
      priceCt:    36,
      price:      { cheapNow: false, expensiveNow: true, level: 'peak', avg: 24 },
      gridW:      1200,
      isImporting: true,
    }));
    expect(result.primaryAction).toBe('hold');
    expect(result.secondaryContext).toBeNull();
  });

  it('has null secondaryContext when primary is no-action', () => {
    const result = pickPrimaryInsight(ctx());
    expect(result.primaryAction).toBe('no-action');
    expect(result.secondaryContext).toBeNull();
  });

  it('adds export-attractive-context for use-if-needed when solar surplus present', () => {
    const result = pickPrimaryInsight(ctx({
      priceCt:             20,
      price:               { cheapNow: false, expensiveNow: false, level: 'normal', avg: 24 },
      nowNearBest:         true,
      bestBlock:           { start: Date.now() + 3600000, avg: 19 },
      bestAvg:             19,
      hasSolarSurplus:     true,
      zonne:               { eligible: true, feedInRewardCt: 28 },
      exportIsExceptional: false,
      cheaperLater:        false,
      currentIsFavourable: false,
    }));
    expect(result.primaryAction).toBe('use-if-needed');
    expect(result.secondaryContext).toBe('export-attractive-context');
  });
});
