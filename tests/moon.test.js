import { describe, it, expect } from 'vitest';
import { moonInfo, moonEventTimeLabel, moonPhaseNameIcon, moonRenderOrientation, nextFullMoonDate, nextNewMoonDate, nextNewMoonLabel } from '../scripts/domain/moon.js';

describe('moonPhaseNameIcon', () => {
  it('returns new moon at phase 0', () => {
    expect(moonPhaseNameIcon(0).key).toBe('moon-new-moon');
    expect(moonPhaseNameIcon(0).icon).toBe('🌑');
  });

  it('returns new moon at phase 1 (wraps around)', () => {
    expect(moonPhaseNameIcon(1).key).toBe('moon-new-moon');
  });

  it('does not use the new moon label outside the narrow primary-phase window', () => {
    expect(moonPhaseNameIcon(0.02).key).toBe('moon-waxing-crescent');
  });

  it('uses the new moon label inside the narrow primary-phase window', () => {
    expect(moonPhaseNameIcon(0.005).key).toBe('moon-new-moon');
  });

  it('returns first quarter at phase 0.25', () => {
    expect(moonPhaseNameIcon(0.25).key).toBe('moon-first-quarter');
    expect(moonPhaseNameIcon(0.25).icon).toBe('🌓');
  });

  it('returns full moon at phase 0.5', () => {
    expect(moonPhaseNameIcon(0.5).key).toBe('moon-full-moon');
    expect(moonPhaseNameIcon(0.5).icon).toBe('🌕');
  });

  it('returns last quarter at phase 0.75', () => {
    expect(moonPhaseNameIcon(0.75).key).toBe('moon-last-quarter');
    expect(moonPhaseNameIcon(0.75).icon).toBe('🌗');
  });

  it('returns waxing crescent between new and first quarter', () => {
    expect(moonPhaseNameIcon(0.15).key).toBe('moon-waxing-crescent');
    expect(moonPhaseNameIcon(0.15).icon).toBe('🌒');
  });

  it('returns waxing gibbous between first quarter and full moon', () => {
    expect(moonPhaseNameIcon(0.38).key).toBe('moon-waxing-gibbous');
    expect(moonPhaseNameIcon(0.38).icon).toBe('🌔');
  });

  it('returns waning gibbous between full moon and last quarter', () => {
    expect(moonPhaseNameIcon(0.63).key).toBe('moon-waning-gibbous');
    expect(moonPhaseNameIcon(0.63).icon).toBe('🌖');
  });

  it('returns waning crescent between last quarter and new moon', () => {
    expect(moonPhaseNameIcon(0.88).key).toBe('moon-waning-crescent');
    expect(moonPhaseNameIcon(0.88).icon).toBe('🌘');
  });

  it('normalizes phase values above 1', () => {
    expect(moonPhaseNameIcon(1.5).key).toBe('moon-full-moon');
  });

  it('normalizes negative phase values', () => {
    const result = moonPhaseNameIcon(-0.5);
    expect(result.key).toBe('moon-full-moon');
  });
});


describe('moonInfo', () => {
  it('does not round near-full illumination up to 100.0%', () => {
    const info = moonInfo(new Date('2026-05-31T07:12:00Z'));
    expect(info.illum).toBe(99.8);
  });
});

describe('paired moonrise and moonset', () => {
  const location = { latitude: 51.596, longitude: 5.947 };

  it('shows the previous evening rise while the moon is still above the horizon', () => {
    const now = new Date('2026-11-02T12:00:00+01:00');
    const info = moonInfo(now, location);
    expect(Math.abs(info.rise - new Date('2026-11-01T22:54:00+01:00'))).toBeLessThan(60000);
    expect(Math.abs(info.set - new Date('2026-11-02T14:45:00+01:00'))).toBeLessThan(60000);
    expect(info.rise.getTime()).toBeLessThan(now.getTime());
    expect(info.set.getTime()).toBeGreaterThan(now.getTime());
  });

  it('switches both events to the next lunar period after moonset', () => {
    const now = new Date('2026-11-02T16:00:00+01:00');
    const info = moonInfo(now, location);
    expect(Math.abs(info.rise - new Date('2026-11-03T00:20:00+01:00'))).toBeLessThan(60000);
    expect(Math.abs(info.set - new Date('2026-11-03T15:00:00+01:00'))).toBeLessThan(60000);
    expect(info.rise.getTime()).toBeGreaterThan(now.getTime());
    expect(info.set.getTime()).toBeGreaterThan(info.rise.getTime());
  });

  it('pairs a late evening rise with the following day set, not the earlier set today', () => {
    const info = moonInfo(new Date('2026-11-01T23:30:00+01:00'), location);
    expect(info.rise.getTime()).toBeLessThan(info.set.getTime());
    expect(Math.abs(info.set - new Date('2026-11-02T14:45:00+01:00'))).toBeLessThan(60000);
  });

  it('switches at the rise and set without selecting a different lunar period early', () => {
    const next = moonInfo(new Date('2026-11-02T16:00:00+01:00'), location);
    for (const ms of [next.rise.getTime() - 60000, next.rise.getTime() + 60000, next.set.getTime() - 60000]) {
      const info = moonInfo(new Date(ms), location);
      expect(Math.abs(info.rise - next.rise)).toBeLessThan(1000);
      expect(Math.abs(info.set - next.set)).toBeLessThan(1000);
    }
    const afterSet = moonInfo(new Date(next.set.getTime() + 60000), location);
    expect(afterSet.rise.getTime()).toBeGreaterThan(next.set.getTime());
  });

  it('leaves genuinely unavailable crossings empty', () => {
    const info = moonInfo(new Date('2026-11-02T12:00:00Z'));
    expect(info.rise).toBeNull();
    expect(info.set).toBeNull();
  });
});

describe('moonEventTimeLabel', () => {
  const now = new Date(2026, 10, 2, 12);

  it('labels previous and following calendar days in Dutch and English', () => {
    expect(moonEventTimeLabel(new Date(2026, 10, 1, 22, 54), now, 'nl-NL')).toBe('22:54 (−1 dag)');
    expect(moonEventTimeLabel(new Date(2026, 10, 3, 0, 20), now, 'en-GB')).toBe('00:20 (+1 day)');
    expect(moonEventTimeLabel(new Date(2026, 10, 4, 0, 20), now, 'nl-NL')).toBe('00:20 (+2 dagen)');
  });

  it('shows just the time today and a placeholder for missing values', () => {
    expect(moonEventTimeLabel(new Date(2026, 10, 2, 14, 45), now, 'nl-NL')).toBe('14:45');
    expect(moonEventTimeLabel(null, now, 'nl-NL')).toBe('--:--');
    expect(moonEventTimeLabel(new Date(NaN), now, 'nl-NL')).toBe('--:--');
  });

  it('uses calendar days across a daylight saving transition', () => {
    expect(moonEventTimeLabel(new Date(2026, 2, 29, 23, 30), new Date(2026, 2, 30, 0, 10), 'en-GB'))
      .toBe('23:30 (−1 day)');
  });
});

describe('nextNewMoonDate', () => {
  it('returns a Date object', () => {
    expect(nextNewMoonDate() instanceof Date).toBe(true);
  });

  it('returns a date in the future from now', () => {
    const now = new Date();
    const next = nextNewMoonDate(now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it('returns a date within one synodic period (~29.5 days)', () => {
    const now = new Date();
    const next = nextNewMoonDate(now);
    const diffDays = (next.getTime() - now.getTime()) / 86400000;
    expect(diffDays).toBeGreaterThan(0);
    expect(diffDays).toBeLessThanOrEqual(29.531);
  });

  it('returns near-zero phase for a known new moon date', () => {
    const next = nextNewMoonDate(new Date('2024-04-01T00:00:00Z'));
    const knownNewMoon = new Date('2024-04-08T18:21:00Z');
    const diffHours = Math.abs(next.getTime() - knownNewMoon.getTime()) / 3600000;
    expect(diffHours).toBeLessThan(4);

    const phase = moonInfo(next).value;
    expect(Math.min(phase, 1 - phase)).toBeLessThan(0.002);
  });
});

describe('nextFullMoonDate', () => {
  it('returns a Date object', () => {
    expect(nextFullMoonDate() instanceof Date).toBe(true);
  });

  it('returns a future date with phase near full moon', () => {
    const now = new Date('2024-04-15T00:00:00Z');
    const next = nextFullMoonDate(now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());

    const knownFullMoon = new Date('2024-04-23T23:49:00Z');
    const diffHours = Math.abs(next.getTime() - knownFullMoon.getTime()) / 3600000;
    expect(diffHours).toBeLessThan(4);

    expect(Math.abs(moonInfo(next).value - 0.5)).toBeLessThan(0.002);
  });
});

describe('nextNewMoonLabel', () => {
  it('returns a string starting with "New moon ·"', () => {
    const label = nextNewMoonLabel();
    expect(label).toMatch(/^New moon ·/);
  });

  it('contains a month abbreviation', () => {
    const label = nextNewMoonLabel();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    expect(months.some(m => label.includes(m))).toBe(true);
  });

  it('contains a day number', () => {
    const label = nextNewMoonLabel();
    expect(label).toMatch(/\d+/);
  });

  it('returns consistent result for the same input date', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    expect(nextNewMoonLabel(date)).toBe(nextNewMoonLabel(date));
  });
});


describe('moonRenderOrientation', () => {
  it('returns a finite orientation angle in radians', () => {
    const angle = moonRenderOrientation(new Date('2026-05-26T09:08:35Z'), { latitude: 52.379, longitude: 4.9 });
    expect(Number.isFinite(angle)).toBe(true);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(Math.PI * 2);
  });

  it('uses local observer coordinates to rotate the terminator', () => {
    const date = new Date('2026-05-26T09:08:35Z');
    const amsterdam = moonRenderOrientation(date, { latitude: 52.379, longitude: 4.9 });
    const sydney = moonRenderOrientation(date, { latitude: -33.8688, longitude: 151.2093 });
    expect(Math.abs(amsterdam - sydney)).toBeGreaterThan(0.01);
  });

  it('keeps a northern waxing gibbous illuminated on the right side', () => {
    const angle = moonRenderOrientation(new Date('2026-05-26T07:08:35Z'), { latitude: 52.379, longitude: 4.9 });
    expect(Math.cos(angle)).toBeGreaterThan(0);
  });

});
