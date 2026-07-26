import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom } from './utils/minidom.js';

describe('weather and sun source indicators', () => {
  beforeEach(() => {
    vi.resetModules();
    installMiniDom();
    globalThis.window = globalThis;
    globalThis.location = { search: '', protocol: 'http:' };
    globalThis.window.DASHBOARD_CONFIG = {};
    globalThis.localStorage = {
      getItem: () => 'en',
      setItem: () => {},
      removeItem: () => {},
    };
  });

  it('marks successful data stale only after its freshness window', async () => {
    const { resolveFreshnessState } = await import('../scripts/ui/weather.js');
    const success = 1_000_000;

    expect(resolveFreshnessState('live', success, success + 60_000, 120_000)).toBe('live');
    expect(resolveFreshnessState('live', success, success + 121_000, 120_000)).toBe('stale');
    expect(resolveFreshnessState('error', success, success + 500_000, 120_000)).toBe('error');
  });

  it('tracks one continuous sunrise-to-next-sunrise cycle', async () => {
    const { sunCycleSnapshot } = await import('../scripts/ui/weather.js');
    const noon = new Date(2026, 6, 15, 12, 0, 0);
    const snapshot = sunCycleSnapshot(noon, '06:00:00', '18:00:00', '18:01', '06:02', '05:58');

    expect(snapshot.state).toBe('day');
    expect(snapshot.progress).toBeCloseTo(6 / (24 + 2 / 60), 5);
    expect(snapshot.sunsetPosition).toBeCloseTo(12 / (24 + 2 / 60), 5);
    expect(snapshot.cycleEnd.getDate()).toBe(16);
    expect(snapshot.nextEvent).toBe('sunset');
    expect(snapshot.remainingMs).toBe(6 * 60 * 60 * 1000);
  });

  it('distinguishes night before sunrise and after sunset', async () => {
    const { sunCycleSnapshot } = await import('../scripts/ui/weather.js');

    const before = sunCycleSnapshot(new Date(2026, 6, 15, 4, 0, 0), '06:00', '18:00', '21:30', '06:02');
    const after = sunCycleSnapshot(new Date(2026, 6, 15, 22, 0, 0), '06:00', '18:00', '21:30', '06:02');

    expect(before).toMatchObject({
      state: 'night', phase: 'before-sunrise', nextEvent: 'sunrise', remainingMs: 2 * 60 * 60 * 1000,
    });
    expect(after).toMatchObject({
      state: 'night', phase: 'after-sunset', nextEvent: 'sunrise', remainingMs: (8 * 60 + 2) * 60 * 1000,
    });
    expect(before.progress).toBeGreaterThan(0);
    expect(before.progress).toBeLessThan(1);
    expect(after.progress).toBeGreaterThan(0);
    expect(after.progress).toBeLessThan(1);
    expect(after.nextEventAt.getDate()).toBe(16);
    expect(after.nextEventAt.getMinutes()).toBe(2);
  });

  it('formats the remaining daylight duration compactly in both languages', async () => {
    const { formatSunDuration } = await import('../scripts/ui/weather.js');

    expect(formatSunDuration((6 * 60 + 44) * 60_000, 'nl')).toBe('6u 44m');
    expect(formatSunDuration((6 * 60 + 44) * 60_000, 'en')).toBe('6h 44m');
    expect(formatSunDuration(42 * 60_000, 'nl')).toBe('42m');
    expect(formatSunDuration(null, 'nl')).toBe('--');
  });
});
