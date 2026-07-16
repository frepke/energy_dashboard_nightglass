/**
 * Tests for scripts/core/formatters.js
 * Formatting follows the active dashboard language stored in localStorage.
 */

import { afterEach, describe, it, expect } from 'vitest';
import {
  parseNum, parsePriceEuro, isNum, fmt, activeLocale, localeFromLang, formatNumber, formatDate,
  pad2, nlDate, hhmmFrom, minutesFromTime, fmtDayLength, fmtDayLengthTime, safeDate
} from '../scripts/core/formatters.js';

function mockStoredLang(lang) {
  globalThis.localStorage = {
    getItem: key => key === 'ed-lang' ? lang : null,
    setItem() {},
    removeItem() {},
  };
}

afterEach(() => {
  delete globalThis.localStorage;
});


// ---------------------------------------------------------------------------
// parseNum
// ---------------------------------------------------------------------------

describe('parseNum', () => {
  it('parses an integer string', () => {
    expect(parseNum('42')).toBe(42);
  });

  it('parses a float string', () => {
    expect(parseNum('3.14')).toBeCloseTo(3.14);
  });

  it('replaces comma with dot', () => {
    expect(parseNum('1,5')).toBeCloseTo(1.5);
  });

  it('extracts number from a mixed string', () => {
    expect(parseNum('123 W')).toBe(123);
  });

  it('returns 0 for null', () => {
    expect(parseNum(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseNum(undefined)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseNum('')).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(parseNum('abc')).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(parseNum('-5.5')).toBeCloseTo(-5.5);
  });

  it('parses a plain number', () => {
    expect(parseNum(7)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// parsePriceEuro
// ---------------------------------------------------------------------------

describe('parsePriceEuro', () => {
  it('parses numeric euro values', () => {
    expect(parsePriceEuro(0.2034)).toBeCloseTo(0.2034);
    expect(parsePriceEuro('0,2034')).toBeCloseTo(0.2034);
  });

  it('parses common display forms', () => {
    expect(parsePriceEuro('€ 0,20/kWh')).toBeCloseTo(0.20);
    expect(parsePriceEuro('20 ct/kWh')).toBeCloseTo(0.20);
  });

  it('returns null instead of silently converting invalid prices to zero', () => {
    expect(parsePriceEuro(null)).toBeNull();
    expect(parsePriceEuro('')).toBeNull();
    expect(parsePriceEuro('price missing')).toBeNull();
    expect(parsePriceEuro('abc 0.20')).toBeNull();
  });

  it('rejects implausible euro values that are likely unit mistakes', () => {
    expect(parsePriceEuro(13.09)).toBeNull();
    expect(parsePriceEuro('13.09')).toBeNull();
    expect(parsePriceEuro('1200 ct/kWh')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isNum
// ---------------------------------------------------------------------------

describe('isNum', () => {
  it('returns true for a finite number', () => {
    expect(isNum(42)).toBe(true);
  });

  it('returns true for zero', () => {
    expect(isNum(0)).toBe(true);
  });

  it('returns true for a negative number', () => {
    expect(isNum(-3.5)).toBe(true);
  });

  it('returns false for NaN', () => {
    expect(isNum(NaN)).toBe(false);
  });

  it('returns false for Infinity', () => {
    expect(isNum(Infinity)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNum(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNum(undefined)).toBe(false);
  });

  it('returns true for a numeric string (coerces to number)', () => {
    expect(isNum('42')).toBe(true); // Number('42') is 42 which is valid
  });
});

// ---------------------------------------------------------------------------
// fmt
// ---------------------------------------------------------------------------

describe('fmt.eur', () => {
  it('formats a positive amount', () => {
    expect(fmt.eur(1.5)).toBe('€ 1.50');
  });

  it('formats zero', () => {
    expect(fmt.eur(0)).toBe('€ 0.00');
  });

  it('formats a negative amount', () => {
    expect(fmt.eur(-2.25)).toBe('€ -2.25');
  });

  it('returns -- for null', () => {
    expect(fmt.eur(null)).toBe('--');
  });

  it('returns -- for undefined', () => {
    expect(fmt.eur(undefined)).toBe('--');
  });

  it('rounds values near zero to 0.00', () => {
    expect(fmt.eur(0.004)).toBe('€ 0.00');
  });
});

describe('fmt.eur3', () => {
  it('formats to 3 decimal places', () => {
    expect(fmt.eur3(1.236)).toBe('€ 1.236');
  });

  it('returns -- for null', () => {
    expect(fmt.eur3(null)).toBe('--');
  });
});

describe('fmt.kwh', () => {
  it('formats kWh with 3 decimals', () => {
    expect(fmt.kwh(1.5)).toBe('1.500 kWh');
  });

  it('uses the active English decimal separator by default', () => {
    expect(fmt.kwh(0.123)).toBe('0.123 kWh');
  });

  it('formats zero but returns placeholder for missing values', () => {
    expect(fmt.kwh(0)).toBe('0.000 kWh');
    expect(fmt.kwh(null)).toBe('--');
  });
});

describe('fmt.m3', () => {
  it('formats m³ with 3 decimals', () => {
    expect(fmt.m3(2.5)).toBe('2.500 m³');
  });
});

describe('fmt.ct', () => {
  it('formats cents from euro value', () => {
    expect(fmt.ct(0.25)).toBe('25.00 ct');
  });

  it('formats negative values with minus sign', () => {
    expect(fmt.ct(-0.05)).toBe('-5.00 ct');
  });

  it('returns -- for null', () => {
    expect(fmt.ct(null)).toBe('--');
  });
});

describe('locale-aware formatting', () => {
  it('maps app languages to browser locales', () => {
    expect(localeFromLang('en')).toBe('en-GB');
    expect(localeFromLang('nl')).toBe('nl-NL');
  });

  it('uses English formatting by default', () => {
    expect(activeLocale()).toBe('en-GB');
    expect(formatNumber(1234.5, 1)).toBe('1,234.5');
    expect(formatDate(new Date('2024-06-15T12:00:00Z'), { month: 'short', day: 'numeric' }, 'en-GB')).toContain('Jun');
  });

  it('switches decimals and grouping for Dutch', () => {
    mockStoredLang('nl');
    expect(activeLocale()).toBe('nl-NL');
    expect(fmt.eur(1234.5)).toBe('€ 1.234,50');
    expect(fmt.kwh(1.5)).toBe('1,500 kWh');
    expect(fmt.int(1234567)).toBe('1.234.567');
    expect(fmt.ctValue(-5)).toBe('-5,00 ct');
  });
});

// ---------------------------------------------------------------------------
// pad2
// ---------------------------------------------------------------------------

describe('pad2', () => {
  it('pads single-digit numbers', () => {
    expect(pad2(5)).toBe('05');
  });

  it('does not pad two-digit numbers', () => {
    expect(pad2(12)).toBe('12');
  });

  it('pads zero', () => {
    expect(pad2(0)).toBe('00');
  });
});

// ---------------------------------------------------------------------------
// nlDate
// ---------------------------------------------------------------------------

describe('nlDate', () => {
  it('returns a human-readable date string in English', () => {
    // Use a fixed date to avoid locale/timezone flakiness
    const d = new Date('2024-06-15T12:00:00Z');
    const result = nlDate(d, 'en-GB');
    // Check that it contains the year and month
    expect(result).toMatch(/2024/);
    expect(result).toContain('June');
  });
});

// ---------------------------------------------------------------------------
// hhmmFrom
// ---------------------------------------------------------------------------

describe('hhmmFrom', () => {
  it('extracts HH:MM from a time string', () => {
    expect(hhmmFrom('07:42:00')).toBe('07:42');
  });

  it('pads single-digit hours', () => {
    expect(hhmmFrom('7:05:00')).toBe('07:05');
  });

  it('returns --:-- for null', () => {
    expect(hhmmFrom(null)).toBe('--:--');
  });

  it('returns --:-- for an empty string', () => {
    expect(hhmmFrom('')).toBe('--:--');
  });

  it('returns --:-- for an invalid string', () => {
    expect(hhmmFrom('abc')).toBe('--:--');
  });
});

// ---------------------------------------------------------------------------
// minutesFromTime
// ---------------------------------------------------------------------------

describe('minutesFromTime', () => {
  it('converts "07:00" to 420 minutes', () => {
    expect(minutesFromTime('07:00')).toBe(420);
  });

  it('converts "00:30" to 30 minutes', () => {
    expect(minutesFromTime('00:30')).toBe(30);
  });

  it('returns null for null input', () => {
    expect(minutesFromTime(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(minutesFromTime('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fmtDayLength
// ---------------------------------------------------------------------------

describe('fmtDayLength', () => {
  it('calculates day length from sunrise to sunset', () => {
    expect(fmtDayLength('06:00', '22:00')).toBe('Day length: 16:00');
  });

  it('handles sub-hour minutes', () => {
    expect(fmtDayLength('07:15', '20:45')).toBe('Day length: 13:30');
  });

  it('returns placeholder when sunrise is missing', () => {
    expect(fmtDayLength(null, '20:00')).toBe('Day length: --:--');
  });

  it('returns placeholder when sunset is missing', () => {
    expect(fmtDayLength('06:00', null)).toBe('Day length: --:--');
  });

  it('returns 0 when sunset is before sunrise', () => {
    expect(fmtDayLength('20:00', '06:00')).toBe('Day length: 0:00');
  });
});

// ---------------------------------------------------------------------------
// fmtDayLengthTime
// ---------------------------------------------------------------------------

describe('fmtDayLengthTime', () => {
  it('returns the duration string without a prefix', () => {
    expect(fmtDayLengthTime('06:00', '22:00')).toBe('16:00');
  });

  it('handles sub-hour minutes', () => {
    expect(fmtDayLengthTime('07:15', '20:45')).toBe('13:30');
  });

  it('returns --:-- when sunrise is missing', () => {
    expect(fmtDayLengthTime(null, '20:00')).toBe('--:--');
  });

  it('returns --:-- when sunset is missing', () => {
    expect(fmtDayLengthTime('06:00', null)).toBe('--:--');
  });

  it('returns 0:00 when sunset is before sunrise', () => {
    expect(fmtDayLengthTime('20:00', '06:00')).toBe('0:00');
  });
});

// ---------------------------------------------------------------------------
// safeDate
// ---------------------------------------------------------------------------

describe('safeDate', () => {
  it('parses a local_datetime field', () => {
    const d = safeDate({ local_datetime: '2024-06-15 12:00:00' });
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2024);
  });

  it('parses a datetime field', () => {
    const d = safeDate({ datetime: '2024-06-15T12:00:00' });
    expect(d).toBeInstanceOf(Date);
  });

  it('returns null when no date field is present', () => {
    expect(safeDate({})).toBeNull();
  });

  it('returns null for a null item', () => {
    expect(safeDate(null)).toBeNull();
  });

  it('returns null for an unparseable date string', () => {
    expect(safeDate({ datetime: 'not-a-date' })).toBeNull();
  });
});
