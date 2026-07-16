/**
 * Theme toggle lifecycle.
 *
 * The dashboard follows Nightglass's own dark/light selection (`dz-theme-style`)
 * before falling back to its legacy `ed-theme` preference. Clicking the moon
 * button updates both keys so Domoticz and the standalone dashboard remain in
 * sync in the same browser.
 */

import { $ } from '../core/dom.js';
import { NIGHTGLASS_MODE_KEY, NIGHTGLASS_SETTINGS_KEY } from './nightglassThemeKeys.js';

const THEME_KEY = 'ed-theme';

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

function systemTheme() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function parseNightglassSettings() {
  try {
    const raw = readStorage(NIGHTGLASS_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveNightglassThemeMode() {
  const storedMode = readStorage(NIGHTGLASS_MODE_KEY);
  if (storedMode === 'light' || storedMode === 'dark') return storedMode;
  if (storedMode === 'auto') return systemTheme();

  const settings = parseNightglassSettings();
  const mode = settings?.themeMode;
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'auto') return systemTheme();
  if (mode === 'toggle' && (settings?.defaultMode === 'light' || settings?.defaultMode === 'dark')) {
    return settings.defaultMode;
  }

  return null;
}

export function initThemeToggle() {
  const html = document.documentElement;
  const themeToggle = $('#themeToggle');
  if (!themeToggle) return;

  const qs = new URLSearchParams(location.search);

  function applyTheme(theme, { syncNightglass = false } = {}) {
    const next = theme === 'light' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    themeToggle.textContent = next === 'dark' ? '🌙' : '☀️';
    themeToggle.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
    writeStorage(THEME_KEY, next);
    if (syncNightglass) writeStorage(NIGHTGLASS_MODE_KEY, next);
  }

  function readStoredTheme() {
    const stored = readStorage(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  }

  function initialTheme() {
    const requested = qs.get('theme');
    if (requested === 'light' || requested === 'dark') return requested;
    return resolveNightglassThemeMode() || readStoredTheme() || 'dark';
  }

  applyTheme(initialTheme());

  themeToggle.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next, { syncNightglass: true });
  });
}
