/**
 * Tests for chart colour utilities exported from scripts/ui/chart.js.
 * Only the pure colour functions are tested (no DOM needed).
 */

import { describe, it, expect, vi } from 'vitest';

// Mock browser-dependent modules so chart.js loads cleanly in Node.
vi.mock('../scripts/core/dom.js', () => ({ $: () => null, $$: () => [] }));
vi.mock('../scripts/config/resolveConfig.js', () => ({
  CONTRACT_CFG: { zonnebonusAlwaysOn: true, zonnebonusInkoopvergoedingCt: 2, zonnebonusPct: 0.10, daylightSolarThresholdW: 50, exportSolarThresholdW: 200 },
  CFG: {},
  DOMOTICZ_CFG: {},
  WEATHER_CFG: {},
}));

import { colorFor, hexToRgb, rgbToHex, mixHex } from '../scripts/ui/chart.js';

// ---------------------------------------------------------------------------
// colorFor
// ---------------------------------------------------------------------------

describe('colorFor', () => {
  it('returns blue for a negative price', () => {
    expect(colorFor(-0.01, -0.05, 0.3)).toBe('#36a8ff');
  });

  it('returns the cheapest colour (teal) at the bottom of the range', () => {
    expect(colorFor(0, 0, 1)).toBe('#00e0ba');
  });

  it('returns the peak colour (orange) at the top of the range', () => {
    expect(colorFor(1, 0, 1)).toBe('#ff5f00');
  });

  it('returns a mid-range colour for median price', () => {
    const c = colorFor(0.5, 0, 1);
    // At t=0.5 (between 0.44 and 0.62) it should be lime
    expect(c).toBe('#b9f020');
  });

  it('handles equal min and max without crashing', () => {
    // span collapses to 0.0001 guard — should not throw
    expect(() => colorFor(0.15, 0.15, 0.15)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// hexToRgb
// ---------------------------------------------------------------------------

describe('hexToRgb', () => {
  it('parses a 6-digit hex colour', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('parses a 3-digit shorthand hex colour', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('is case-insensitive', () => {
    expect(hexToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('returns null for a non-hex string', () => {
    expect(hexToRgb('red')).toBeNull();
  });

  it('returns null for an invalid length', () => {
    expect(hexToRgb('#12345')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(hexToRgb('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(hexToRgb(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rgbToHex
// ---------------------------------------------------------------------------

describe('rgbToHex', () => {
  it('converts pure red', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
  });

  it('converts pure green', () => {
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
  });

  it('clamps values below 0', () => {
    expect(rgbToHex(-10, 0, 0)).toBe('#000000');
  });

  it('clamps values above 255', () => {
    expect(rgbToHex(300, 0, 0)).toBe('#ff0000');
  });

  it('rounds fractional values', () => {
    expect(rgbToHex(127.6, 0, 0)).toBe('#800000');
  });
});

// ---------------------------------------------------------------------------
// mixHex
// ---------------------------------------------------------------------------

describe('mixHex', () => {
  it('returns the original colour at amount=0', () => {
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  it('returns the target colour at amount=1', () => {
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('blends halfway correctly', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('returns the base hex when base is invalid', () => {
    expect(mixHex('invalid', '#ffffff', 0.5)).toBe('invalid');
  });

  it('returns the base hex when target is invalid', () => {
    expect(mixHex('#ff0000', 'invalid', 0.5)).toBe('#ff0000');
  });
});
