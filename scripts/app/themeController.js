/**
 * Theme toggle lifecycle.
 */

import { $ } from '../core/dom.js';

const THEME_KEY = 'ed-theme';

export function initThemeToggle() {
  const html = document.documentElement;
  const themeToggle = $('#themeToggle');
  if (!themeToggle) return;

  const qs = new URLSearchParams(location.search);

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
    themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage unavailable
    }
  }

  function readStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
      return null;
    }
  }

  function initialTheme() {
    const requested = qs.get('theme');
    if (requested === 'light' || requested === 'dark') return requested;
    return readStoredTheme() || 'dark';
  }

  applyTheme(initialTheme());

  themeToggle.addEventListener('click', () => {
    applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
}
