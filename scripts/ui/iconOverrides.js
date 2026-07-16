/**
 * Configurable semantic icon overrides for the standalone dashboard.
 *
 * config.js example:
 *   ui: {
 *     iconOverrides: {
 *       grid: 'grid',
 *       'grid-card': 'plug',
 *       solar: 'solar',
 *       'gas-card': 'flame'
 *     }
 *   }
 *
 * Only bundled icon names are accepted; raw HTML is intentionally rejected.
 */

const ICONS = {
  bolt: '<path d="M13.8 2.4 4.2 13.3h6.1l-1.5 8.3 10.9-12.8h-6.3l.4-6.4z"/>',
  grid: '<path class="stroke" d="M5 21 9.2 3h5.6L19 21M7.2 12h9.6M6.1 17h11.8M10.2 7h3.6M9 21h6"/><path d="m12 8-2 4h2l-1 4 3-5h-2l1-3z"/>',
  plug: '<path class="stroke" d="M8 3v5M16 3v5M6 8h12v2a6 6 0 0 1-6 6v5M9 21h6"/>',
  home: '<path d="M3.2 11.2 12 3.6l8.8 7.6h-2.4v8.7h-4.5v-5.8h-3.8v5.8H5.6v-8.7H3.2z"/>',
  solar: '<circle cx="12" cy="12" r="4.4"/><path class="stroke" d="M12 1.8v3M12 19.2v3M4.8 4.8 7 7M17 17l2.2 2.2M1.8 12h3M19.2 12h3M4.8 19.2 7 17M17 7l2.2-2.2"/>',
  panel: '<path class="stroke" d="M4 6h16l-2 12H6L4 6Zm3.3 0L6 18m5.2-12-.5 12M15 6l1.1 12M5.2 11h13.6M4.5 15h14M10 21h4"/>',
  flame: '<path d="M12 2s-1.5 3-1.5 5.5c0 1 .4 1.9 1 2.5C10.2 8.5 10 7 10 7c-2 2.5-3 5-3 7a5 5 0 0 0 10 0c0-3-1.5-5.5-3-7 0 0 .2 2.5-1 4.5-.5-.8-.5-2-.5-2.5C12.5 6.5 12 2 12 2z"/>',
  leaf: '<path class="stroke" d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16ZM4 21c3-6 7-9 12-12"/>',
  gauge: '<path class="stroke" d="M4 17a8 8 0 1 1 16 0M12 17l4-6M7 18h10"/>',
  battery: '<rect class="stroke" x="3" y="7" width="17" height="10" rx="2"/><path d="M20 10h2v4h-2M6 10h5v4H6z"/>',
  water: '<path d="M12 2s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12z"/>',
  wind: '<path class="stroke" d="M3 8h11c2 0 3-1 3-2.5S16 3 14.5 3C13 3 12 4 12 5M3 12h16c1.5 0 2.5 1 2.5 2.5S20.5 17 19 17c-1.2 0-2.2-.7-2.5-1.8M3 16h9"/>',
  check: '<path class="stroke" d="M4 12a8 8 0 1 1 3.1 6.3M8.5 12.5l2 2 5-6"/>',
};

const DEFAULTS = {
  grid: 'bolt',
  house: 'home',
  solar: 'solar',
  'grid-card': 'bolt',
  'house-card': 'home',
  'solar-card': 'solar',
  'self-suff-card': 'check',
  'self-cons-card': 'gauge',
  'gas-card': 'flame',
};

function iconConfig() {
  const config = window.DASHBOARD_CONFIG || {};
  const ui = config.ui || {};
  const overrides = ui.iconOverrides || ui.icons || {};
  return { ...DEFAULTS, ...(overrides && typeof overrides === 'object' ? overrides : {}) };
}

function renderIcon(target, iconName) {
  const markup = ICONS[iconName];
  if (!markup) return;
  target.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${markup}</svg>`;
  target.dataset.icon = iconName;
}

export function applyIconOverrides() {
  const config = iconConfig();
  document.querySelectorAll('[data-icon-target]').forEach(target => {
    const key = target.getAttribute('data-icon-target');
    const iconName = config[key];
    if (typeof iconName === 'string') renderIcon(target, iconName.trim().toLowerCase());
  });
}

export const availableDashboardIcons = Object.freeze(Object.keys(ICONS));
