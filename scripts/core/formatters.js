/** Number parsing, type guards, and language-aware display formatters. */

import { getLang } from '../i18n.js';

export function parseNum(v) {
  const m = String(v ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : 0;
}

/**
 * Strictly parses a price value in EUR/kWh.
 *
 * Forecast prices are expected as plain euro values (e.g. 0.2034). Unlike
 * parseNum(), this does not silently turn missing or unrelated strings into 0.
 * It also accepts common display forms such as "€ 0,20/kWh" and
 * "20 ct/kWh", and rejects implausibly large values that are likely
 * unit mistakes.
 *
 * @param {*} v
 * @returns {number|null} Euro/kWh value, or null when the input is not a price.
 */
function plausiblePriceEuro(n) {
  return Number.isFinite(n) && Math.abs(n) <= 5 ? n : null;
}

export function parsePriceEuro(v) {
  if (typeof v === 'number') return plausiblePriceEuro(v);
  if (v === null || v === undefined) return null;

  const raw = String(v).trim();
  if (!raw) return null;

  const normalized = raw.replace(',', '.');
  const match = normalized.match(
    /^\s*(?:€\s*)?(-?\d+(?:\.\d+)?)\s*(ct|cts|cent|cents|eur|euro|€)?\s*(?:\/\s*kwh|per\s+kwh)?\s*$/i,
  );

  if (!match) return null;

  const n = Number.parseFloat(match[1]);
  if (!Number.isFinite(n)) return null;

  const unit = String(match[2] || '').toLowerCase();
  const euro = unit.startsWith('ct') || unit.startsWith('cent') ? n / 100 : n;

  // Plain forecast values are EUR/kWh. Guard against unit-mismatched values
  // such as "13.09" intended as cents, while still allowing extreme but
  // plausible market values up to +/- 5 EUR/kWh.
  return plausiblePriceEuro(euro);
}

export function isNum(v) {
  return v !== null && v !== undefined && !Number.isNaN(Number(v)) && Number.isFinite(Number(v));
}

export function localeFromLang(lang) {
  return lang === 'nl' ? 'nl-NL' : 'en-GB';
}

export function activeLocale() {
  return localeFromLang(getLang());
}

function formatDecimal(value, options = {}) {
  if (!isNum(value)) return options.fallback ?? '--';
  const locale = options.locale || activeLocale();
  const minimumFractionDigits = Number.isInteger(options.minimumFractionDigits)
    ? options.minimumFractionDigits
    : 0;
  const maximumFractionDigits = Number.isInteger(options.maximumFractionDigits)
    ? options.maximumFractionDigits
    : minimumFractionDigits;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value));
}

function formatInteger(value, options = {}) {
  if (!isNum(value)) return options.fallback ?? '--';
  const locale = options.locale || activeLocale();
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(Number(value)));
}

export function formatNumber(value, fractionDigits = 0, locale = activeLocale()) {
  return formatDecimal(value, {
    locale,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function normalizeIntlFormatArgs(options = {}, locale) {
  const hasWrapperShape = Object.prototype.hasOwnProperty.call(options, 'format')
    || Object.prototype.hasOwnProperty.call(options, 'locale')
    || Object.prototype.hasOwnProperty.call(options, 'fallback');

  return hasWrapperShape
    ? { format: options.format, locale: options.locale || locale || activeLocale(), fallback: options.fallback }
    : { format: options, locale: locale || activeLocale(), fallback: undefined };
}

export function formatDate(date, options = {}, locale) {
  const d = date instanceof Date ? date : new Date(date);
  const args = normalizeIntlFormatArgs(options, locale);
  if (Number.isNaN(d.getTime())) return args.fallback ?? '--';
  return d.toLocaleDateString(args.locale, args.format || undefined);
}

export function formatTime(date, options = {}, locale) {
  const d = date instanceof Date ? date : new Date(date);
  const args = normalizeIntlFormatArgs(options, locale);
  if (Number.isNaN(d.getTime())) return args.fallback ?? '--:--';
  return d.toLocaleTimeString(args.locale, args.format || undefined);
}

export function formatDateTime(date, options = {}, locale) {
  const d = date instanceof Date ? date : new Date(date);
  const args = normalizeIntlFormatArgs(options, locale);
  if (Number.isNaN(d.getTime())) return args.fallback ?? '--';
  return d.toLocaleString(args.locale, args.format || undefined);
}

function signedDecimal(value, fractionDigits) {
  if (!isNum(value)) return '--';
  const n = Number(value);
  const roundedZero = Math.abs(n) < 0.5 * Math.pow(10, -fractionDigits);
  const sign = n < 0 && !roundedZero ? '-' : '';
  return sign + formatDecimal(roundedZero ? 0 : Math.abs(n), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export const fmt = {
  eur:  v => isNum(v) ? '€ ' + signedDecimal(v, 2) : '--',
  eur3: v => isNum(v) ? '€ ' + signedDecimal(v, 3) : '--',
  kwh:  v => isNum(v)
    ? formatDecimal(Number(v), { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kWh'
    : '--',
  m3:   v => isNum(v)
    ? formatDecimal(Number(v), { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' m³'
    : '--',
  ct:   v => isNum(v) ? signedDecimal(Number(v) * 100, 2) + ' ct' : '--',
  ctValue: v => isNum(v) ? signedDecimal(v, 2) + ' ct' : '--',
  ctRaw: v => isNum(v) ? signedDecimal(v, 2) + ' ct' : '--',
  int:  v => isNum(v) ? formatInteger(v) : '--',
  w:    v => isNum(v) ? formatInteger(Math.abs(Number(v))) + ' W' : '--',
  pct:  v => isNum(v) ? formatDecimal(Number(v), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '--',
};

/** Zero-pads a number to two digits. */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Formats a Date as a human-readable localised date string (e.g. "Saturday 15 June 2024").
 * @param {Date}   d        - The date to format.
 * @param {string} [locale] - BCP 47 locale string (e.g. 'nl-NL', 'en-GB'). Defaults to the active UI language.
 */
export function nlDate(d, locale = activeLocale()) {
  return formatDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, locale);
}

/** Extracts HH:MM from a time string like "07:42:00". */
export function hhmmFrom(value) {
  if (!value) return '--:--';
  const m = String(value).match(/(\d{1,2}):(\d{2})/);
  return m ? pad2(m[1]) + ':' + m[2] : '--:--';
}

/** Converts a time string like "07:42" to total minutes. */
export function minutesFromTime(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return m ? (+m[1] * 60 + +m[2]) : null;
}

/**
 * Returns just the HH:MM duration string between sunrise and sunset.
 * Returns '--:--' when either value is missing or unparseable.
 */
export function fmtDayLengthTime(sunrise, sunset) {
  const a = minutesFromTime(sunrise), b = minutesFromTime(sunset);
  if (a === null || b === null) return '--:--';
  const mins = Math.max(0, b - a);
  return Math.floor(mins / 60) + ':' + pad2(mins % 60);
}

/** Formats the day length from sunrise and sunset strings (English prefix). */
export function fmtDayLength(sunrise, sunset) {
  return 'Day length: ' + fmtDayLengthTime(sunrise, sunset);
}

/**
 * Extracts a Date from a forecast item that may use different field names.
 * Returns null when no valid date can be parsed.
 */
export function safeDate(item) {
  const raw = item && (item.local_datetime || item.localDatetime || item.datetime || item.datetimeValue);
  if (!raw) return null;
  const d = new Date(String(raw).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}
