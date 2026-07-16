import { describe, expect, it, vi } from 'vitest';

vi.mock('../scripts/services/domoticzService.js', () => ({
  api: vi.fn(),
  ensureDeviceIds: vi.fn(),
}));

vi.mock('../scripts/i18n.js', () => ({
  getLocale: () => 'nl-NL',
  t: key => key,
}));

import {
  buildHistoryGeometry,
  deriveHouseHistory,
  deriveKpiHistories,
  historyValueFromRow,
  parseDomoticzHistoryRows,
  parseHistoryTimestamp,
} from '../scripts/ui/deviceHistoryWatermarks.js';

const HOUR = 60 * 60_000;

describe('Nightglass Domoticz history watermarks', () => {
  it('parses signed P1 net energy from v/v2 and v3/v4 without double counting', () => {
    expect(historyValueFromRow('grid', {
      v: '2.4',
      v2: '1.1',
      v3: '0.8',
      v4: '0.2',
    })).toBeCloseTo(2.5);
  });

  it('supports P1 return tariff aliases r1/r2', () => {
    expect(historyValueFromRow('grid', {
      v1: '1.4',
      v2: '0.6',
      r1: '2.0',
      r2: '0.5',
    })).toBeCloseTo(-0.5);
  });

  it('supports the compact v/r P1 day-graph fields', () => {
    expect(historyValueFromRow('grid', {
      v: '175',
      r: '950',
    })).toBe(-775);
  });

  it('keeps percentage history within a truthful 0–100 range', () => {
    expect(historyValueFromRow('selfSuff', { v: '112.5' })).toBe(100);
    expect(historyValueFromRow('selfCons', { v: '-8' })).toBe(0);
  });

  it('parses Domoticz timestamps without relying on Safari date guessing', () => {
    const timestamp = parseHistoryTimestamp('2026-07-15 14:30:00');
    const date = new Date(timestamp);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(30);
  });

  it('sorts and deduplicates Domoticz rows by their real timestamp', () => {
    const points = parseDomoticzHistoryRows('solar', [
      { d: '2026-07-15 12:00:00', v: '3.2' },
      { d: '2026-07-15 10:00:00', v: '1.1' },
      { d: '2026-07-15 12:00:00', v: '3.4' },
    ]);

    expect(points).toHaveLength(2);
    expect(points[0].v).toBe(1.1);
    expect(points[1].v).toBe(3.4);
    expect(points[0].t).toBeLessThan(points[1].t);
  });

  it('derives house history only from aligned real grid and solar points', () => {
    const start = new Date('2026-07-15T08:00:00Z').getTime();
    const house = deriveHouseHistory(
      [
        { t: start, v: 1.2 },
        { t: start + HOUR, v: -1.5 },
      ],
      [
        { t: start, v: 0.8 },
        { t: start + HOUR, v: 2.4 },
      ],
    );

    expect(house[0].v).toBeCloseTo(2);
    expect(house[1].v).toBeCloseTo(0.9);
  });

  it('derives self-sufficiency and self-consumption from the same aligned histories', () => {
    const start = new Date('2026-07-15T08:00:00Z').getTime();
    const result = deriveKpiHistories(
      [
        { t: start, v: 4 },
        { t: start + HOUR, v: 1 },
      ],
      [
        { t: start, v: 2 },
        { t: start + HOUR, v: 3 },
      ],
    );

    expect(result.selfSuff.map(point => point.v)).toEqual([50, 100]);
    expect(result.selfCons[0].v).toBeCloseTo(100);
    expect(result.selfCons[1].v).toBeCloseTo(100 / 3);
  });

  it('uses a signed symmetric grid scale and closes the area on the zero line', () => {
    const start = new Date('2026-07-15T08:00:00Z').getTime();
    const geometry = buildHistoryGeometry('grid', [
      { t: start, v: -2 },
      { t: start + HOUR, v: 1 },
      { t: start + 2 * HOUR, v: 3 },
    ]);

    expect(geometry.scale.min).toBe(-geometry.scale.max);
    expect(geometry.zeroY).toBeGreaterThan(5);
    expect(geometry.zeroY).toBeLessThan(54);
    expect(geometry.area).toContain(`,${geometry.zeroY.toFixed(2)}`);
    expect(geometry.positiveLine).toContain('L');
    expect(geometry.negativeLine).toContain('L');
    expect(geometry.positiveArea).toContain('Z');
    expect(geometry.negativeArea).toContain('Z');
  });

  it('keeps percentage geometry on a fixed 0–100 scale', () => {
    const start = new Date('2026-07-15T08:00:00Z').getTime();
    const geometry = buildHistoryGeometry('selfSuff', [
      { t: start, v: 25 },
      { t: start + HOUR, v: 75 },
    ]);

    expect(geometry.scale).toEqual({ min: 0, max: 100 });
    expect(geometry.coords[0].y).toBeGreaterThan(geometry.coords[1].y);
  });
});
