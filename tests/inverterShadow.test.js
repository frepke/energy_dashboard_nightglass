import { describe, expect, it } from 'vitest';
import {
  ACTIVE_CONTROL_NOT_BEFORE,
  evaluateInverterShadow,
  loadShadowHistory,
  recordShadowDecision,
} from '../scripts/domain/inverterShadow.js';

const SLOT_START = new Date('2026-08-10T12:00:00Z').getTime();

function state(overrides = {}) {
  return {
    now: SLOT_START + 5 * 60_000,
    solarW: 5000,
    houseW: 1500,
    gridW: 3500,
    gridDir: 'export',
    confidence: 'low',
    priceForecast: [{
      ts: SLOT_START,
      endTs: SLOT_START + 15 * 60_000,
      intervalMinutes: 15,
      ct: 24,
      sellCt: -2,
    }],
    ...overrides,
  };
}

describe('read-only inverter shadow controller', () => {
  it('simulates curtailing surplus during a negative sale-price quarter', () => {
    const decision = evaluateInverterShadow(state());

    expect(decision.action).toBe('curtail-surplus');
    expect(decision.targetW).toBe(1500);
    expect(decision.suggestedLimitPct).toBe(30);
    expect(decision.estimatedEffectEur).toBeCloseTo(0.0175, 6);
    expect(decision.gates).toEqual({
      dateReady: false,
      confidenceReady: false,
      manualRelease: false,
    });
    expect(decision.realControlAllowed).toBe(false);
    expect(decision.commandSent).toBe(false);
  });

  it('keeps generation unrestricted when the sale price is not negative', () => {
    const decision = evaluateInverterShadow(state({
      priceForecast: [{
        ts: SLOT_START,
        endTs: SLOT_START + 15 * 60_000,
        sellCt: 1.65,
      }],
    }));

    expect(decision.action).toBe('unrestricted');
    expect(decision.suggestedLimitPct).toBe(100);
    expect(decision.estimatedEffectEur).toBe(0);
    expect(decision.commandSent).toBe(false);
  });

  it('does not suggest curtailment when the home is not exporting', () => {
    const decision = evaluateInverterShadow(state({ gridDir: 'import', gridW: 400 }));
    expect(decision.action).toBe('no-intervention');
    expect(decision.exportW).toBe(0);
  });

  it('never enables real control, even after the date and confidence gates pass', () => {
    const decision = evaluateInverterShadow(state({
      now: new Date('2027-01-02T12:05:00Z').getTime(),
      confidence: 'high',
      manualRelease: true,
      priceForecast: [{
        ts: new Date('2027-01-02T12:00:00Z').getTime(),
        endTs: new Date('2027-01-02T12:15:00Z').getTime(),
        sellCt: -2,
      }],
    }));

    expect(ACTIVE_CONTROL_NOT_BEFORE).toBe('2027-01-01');
    expect(decision.allFutureGatesReady).toBe(true);
    expect(decision.realControlAllowed).toBe(false);
    expect(decision.commandSent).toBe(false);
  });

  it('keeps one updated history record per price interval', () => {
    const values = new Map();
    const storage = {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    };
    const first = evaluateInverterShadow(state());
    const second = { ...first, exportW: 3000, estimatedEffectEur: 0.015 };

    expect(recordShadowDecision(first, storage, SLOT_START + 1)).toBe(true);
    expect(recordShadowDecision(second, storage, SLOT_START + 2)).toBe(true);

    const history = loadShadowHistory(storage);
    expect(history).toHaveLength(1);
    expect(history[0].exportW).toBe(3000);
    expect(history[0].commandSent).toBe(false);
  });
});
