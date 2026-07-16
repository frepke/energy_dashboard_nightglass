/**
 * Synchronises this standalone dashboard with the Nightglass theme settings
 * used by Domoticz.
 *
 * Sources, in priority order:
 *   1. ngThemeSettings in localStorage (contains live/manual changes)
 *   2. Domoticz ThemeSettings.Nightglass (saved server-side settings)
 *   3. legacy ngTheme_settings user variable
 *   4. bundled Nightglass defaults
 *
 * The controller maps Nightglass's dark/light colour fields onto the dashboard
 * tokens and keeps them up to date when another Domoticz tab changes settings.
 */

import { api } from '../services/domoticzService.js';
import { NIGHTGLASS_MODE_KEY, NIGHTGLASS_SETTINGS_KEY } from './nightglassThemeKeys.js';

export { NIGHTGLASS_MODE_KEY, NIGHTGLASS_SETTINGS_KEY } from './nightglassThemeKeys.js';

export const NIGHTGLASS_DEFAULTS = Object.freeze({
  accentColor:       '#4e9af1',
  dangerColor:       '#e05555',
  warningColor:      '#f0a832',
  successColor:      '#4caf7d',
  accentColorLight:  '#2a7de1',
  dangerColorLight:  '#d63b3b',
  warningColorLight: '#c07818',
  successColorLight: '#2e8c58',
  bgColor:           '#23252f',
  surfaceColor:      '#2a2b35',
  borderColor:       '#33354a',
  textColor:         '#e2e4ed',
  pageBgColor:       '#1b1d25',
  bgColorLight:      '#ffffff',
  surfaceColorLight: '#f5f6fa',
  borderColorLight:  '#d0d3dc',
  textColorLight:    '#1a1c24',
  pageBgColorLight:  '#f0f2f5',
  themeMode:         'toggle',
  defaultMode:       'dark',
});

const COLOR_KEYS = Object.freeze([
  'accentColor', 'dangerColor', 'warningColor', 'successColor',
  'accentColorLight', 'dangerColorLight', 'warningColorLight', 'successColorLight',
  'bgColor', 'surfaceColor', 'borderColor', 'textColor', 'pageBgColor',
  'bgColorLight', 'surfaceColorLight', 'borderColorLight', 'textColorLight', 'pageBgColorLight',
]);

let activeSettings = { ...NIGHTGLASS_DEFAULTS };
let mutationObserver = null;
let focusHandler = null;
let visibilityHandler = null;
let storageHandler = null;
let refreshPromise = null;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function normalizeHex(value, fallback = '#000000') {
  const raw = String(value || '').trim();
  const short = raw.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(fallback) ? fallback.toLowerCase() : '#000000';
}

export function hexToRgb(hex) {
  const value = normalizeHex(hex);
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function rgbString(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

function rgbToHex({ r, g, b }) {
  const part = value => clampByte(value).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function mixHex(a, b, amount = 0.5) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const t = Math.max(0, Math.min(1, Number(amount) || 0));
  return rgbToHex({
    r: left.r + (right.r - left.r) * t,
    g: left.g + (right.g - left.g) * t,
    b: left.b + (right.b - left.b) * t,
  });
}

function lighten(hex, amount = 0.12) {
  return mixHex(hex, '#ffffff', amount);
}

function darken(hex, amount = 0.12) {
  return mixHex(hex, '#000000', amount);
}

function rgba(hex, alpha) {
  return `rgba(${rgbString(hex)}, ${alpha})`;
}

function parseSettingsValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') return parseSettingsValue(parsed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeNightglassSettings(input) {
  const source = parseSettingsValue(input) || {};
  const normalized = { ...NIGHTGLASS_DEFAULTS, ...source };

  for (const key of COLOR_KEYS) {
    normalized[key] = normalizeHex(normalized[key], NIGHTGLASS_DEFAULTS[key]);
  }

  if (!['toggle', 'auto', 'dark', 'light'].includes(normalized.themeMode)) {
    normalized.themeMode = NIGHTGLASS_DEFAULTS.themeMode;
  }
  if (!['dark', 'light'].includes(normalized.defaultMode)) {
    normalized.defaultMode = NIGHTGLASS_DEFAULTS.defaultMode;
  }

  return normalized;
}

export function readNightglassSettingsFromStorage(storage = globalThis.localStorage) {
  try {
    return parseSettingsValue(storage?.getItem?.(NIGHTGLASS_SETTINGS_KEY));
  } catch {
    return null;
  }
}

function resolvedModeFromDocument() {
  return document.documentElement?.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function dashboardTokens(settingsInput, mode = 'dark') {
  const settings = normalizeNightglassSettings(settingsInput);
  const light = mode === 'light';

  const accent = light ? settings.accentColorLight : settings.accentColor;
  const danger = light ? settings.dangerColorLight : settings.dangerColor;
  const warning = light ? settings.warningColorLight : settings.warningColor;
  const success = light ? settings.successColorLight : settings.successColor;
  const page = light ? settings.pageBgColorLight : settings.pageBgColor;
  const nav = light ? settings.bgColorLight : settings.bgColor;
  const card = light ? settings.surfaceColorLight : settings.surfaceColor;
  const border = light ? settings.borderColorLight : settings.borderColor;
  const text = light ? settings.textColorLight : settings.textColor;

  const textStrong = light ? darken(text, 0.08) : lighten(text, 0.09);
  const accentLight = light ? lighten(accent, 0.08) : lighten(accent, 0.18);
  const successLight = light ? lighten(success, 0.08) : lighten(success, 0.17);
  const pageDeep = light ? darken(page, 0.035) : darken(page, 0.16);
  const pageSoft = mixHex(page, nav, 0.42);
  const muted = mixHex(text, border, light ? 0.30 : 0.38);

  return {
    '--bg': page,
    '--bg-deep': pageDeep,
    '--bg-soft': pageSoft,
    '--surface': rgba(nav, light ? 0.94 : 0.88),
    '--surface-high': rgba(card, light ? 0.97 : 0.94),
    '--surface-low': rgba(page, light ? 0.86 : 0.72),
    '--surface-solid': nav,
    '--surface-solid-high': card,
    '--line': rgba(border, light ? 0.76 : 0.62),
    '--line-strong': rgba(border, light ? 0.96 : 0.88),
    '--line-soft': rgba(text, light ? 0.095 : 0.065),
    '--text': text,
    '--text-strong': textStrong,
    '--muted': rgba(text, light ? 0.66 : 0.68),
    '--soft': rgba(text, light ? 0.46 : 0.46),
    '--blue': accent,
    '--blue-light': accentLight,
    '--green': success,
    '--lime': successLight,
    '--solar': warning,
    '--orange': warning,
    '--red': danger,

    '--page-rgb': rgbString(page),
    '--page-deep-rgb': rgbString(pageDeep),
    '--surface-rgb': rgbString(nav),
    '--surface-high-rgb': rgbString(card),
    '--border-rgb': rgbString(border),
    '--muted-rgb': rgbString(muted),
    '--text-rgb': rgbString(text),
    '--accent-rgb': rgbString(accent),
    '--accent-light-rgb': rgbString(accentLight),
    '--success-rgb': rgbString(success),
    '--warning-rgb': rgbString(warning),
    '--danger-rgb': rgbString(danger),
  };
}

export function applyNightglassSettings(settingsInput, source = 'defaults') {
  activeSettings = normalizeNightglassSettings(settingsInput);
  const root = document.documentElement;
  if (!root) return activeSettings;

  const mode = resolvedModeFromDocument();
  const tokens = dashboardTokens(activeSettings, mode);
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty('color-scheme', mode);
  root.dataset.nightglassThemeSource = source;

  const meta = document.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tokens['--bg']);

  try {
    window.dispatchEvent(new CustomEvent('nightglass-theme-applied', {
      detail: { source, mode, settings: { ...activeSettings } },
    }));
  } catch {
    // CustomEvent may be unavailable in unit-test DOM shims.
  }

  return activeSettings;
}

async function fetchSavedNightglassSettings() {
  try {
    const data = await api({ param: 'getsettings' }, 0);
    const stored = parseSettingsValue(data?.ThemeSettings?.Nightglass);
    if (stored) return stored;
  } catch {
    // Older Domoticz builds do not expose ThemeSettings; try the legacy variable.
  }

  try {
    const data = await api({ param: 'getuservariables' }, 0);
    const row = data?.result?.find?.(item => item?.Name === 'ngTheme_settings');
    return parseSettingsValue(row?.Value);
  } catch {
    return null;
  }
}

export async function refreshNightglassTheme({ remote = true } = {}) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const local = readNightglassSettingsFromStorage();
    if (local) applyNightglassSettings(local, 'localStorage');
    else applyNightglassSettings(activeSettings, 'defaults');

    if (!remote) return activeSettings;

    const saved = await fetchSavedNightglassSettings();
    if (!saved) return activeSettings;

    // Local settings are deliberately layered last. Nightglass writes every
    // manual/preset change to localStorage immediately, even before it is saved
    // to Domoticz, so this preserves the exact colours visible in that browser.
    const merged = local ? { ...saved, ...local } : saved;
    applyNightglassSettings(merged, local ? 'Domoticz + localStorage' : 'Domoticz');
    return activeSettings;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function initNightglassThemeSync() {
  const local = readNightglassSettingsFromStorage();
  applyNightglassSettings(local || NIGHTGLASS_DEFAULTS, local ? 'localStorage' : 'defaults');

  // Fetch saved settings without delaying the dashboard bootstrap. The visual
  // test harness intentionally stays local so a missing Domoticz endpoint does
  // not postpone layout measurements.
  refreshNightglassTheme({ remote: !window.__PLAYWRIGHT__ }).catch(() => {});

  mutationObserver?.disconnect?.();
  mutationObserver = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(records => {
        if (records.some(record => record.attributeName === 'data-theme')) {
          applyNightglassSettings(activeSettings, document.documentElement.dataset.nightglassThemeSource || 'cached');
        }
      })
    : null;
  mutationObserver?.observe?.(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  storageHandler = event => {
    if (event.key === NIGHTGLASS_SETTINGS_KEY) {
      applyNightglassSettings(parseSettingsValue(event.newValue) || NIGHTGLASS_DEFAULTS, 'storage-event');
    }
    if (event.key === NIGHTGLASS_MODE_KEY) {
      applyNightglassSettings(activeSettings, 'mode-event');
    }
  };
  window.addEventListener?.('storage', storageHandler);

  focusHandler = () => refreshNightglassTheme({ remote: false }).catch(() => {});
  window.addEventListener?.('focus', focusHandler);

  visibilityHandler = () => {
    if (!document.hidden) refreshNightglassTheme({ remote: false }).catch(() => {});
  };
  document.addEventListener?.('visibilitychange', visibilityHandler);

  // Useful after changing settings from a custom script or console.
  window.refreshNightglassTheme = refreshNightglassTheme;

  return activeSettings;
}
