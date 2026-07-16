/**
 * Weather provider toggle — cycles between Visual Crossing, OpenWeatherMap,
 * and Open-Meteo.
 *
 * The chosen provider is persisted in localStorage so it survives a page reload.
 * It overrides whatever is set in config.js, but only if the user has explicitly
 * toggled it — config.js is still the default on first load.
 *
 * Toggle order: visualcrossing → openweathermap → openmeteo → visualcrossing …
 * Providers whose API key is absent are skipped automatically (Open-Meteo never
 * needs a key, so it is always available).
 */

import { $ }   from '../core/dom.js';
import { CFG } from '../config/resolveConfig.js';
import { t }   from '../i18n.js';

const STORAGE_KEY = 'ed-weather-provider';

const PROVIDERS = ['visualcrossing', 'openweathermap', 'openmeteo', 'vierlingsbeek'];

/** Short labels shown on the button (the *current* active provider). */
const PROVIDER_LABEL = {
  visualcrossing: 'VC',
  openweathermap: 'OWM',
  openmeteo:      'OM',
  vierlingsbeek:  'VB',
};

/** Tooltip text when hovering the button. */
const PROVIDER_TITLE = {
  visualcrossing: 'Visual Crossing',
  openweathermap: 'OpenWeatherMap',
  openmeteo:      'Open-Meteo (KNMI)',
  vierlingsbeek:  'Weerstation Vierlingsbeek',
};

/**
 * Returns true when the provider has the required credentials present in CFG.
 * Open-Meteo needs no key; VC and OWM need their respective keys.
 */
function providerAvailable(provider) {
  if (provider === 'openmeteo')      return true;
  if (provider === 'vierlingsbeek')  return true;
  if (provider === 'openweathermap') return !!CFG.owmKey;
  if (provider === 'visualcrossing') return !!CFG.vcKey;
  return false;
}

/**
 * Returns the active provider string.
 * Priority: localStorage override → CFG.weatherProvider → 'visualcrossing'.
 * Falls back to the first available provider if the stored one has lost its key.
 */
export function activeWeatherProvider() {
  let candidate;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && PROVIDERS.includes(stored)) candidate = stored;
  } catch { /* storage unavailable */ }

  if (!candidate) {
    const p = (CFG.weatherProvider || 'visualcrossing').toLowerCase().trim();
    candidate = p === 'owm' ? 'openweathermap'
              : p === 'om'  ? 'openmeteo'
              : p === 'vb'  ? 'vierlingsbeek'
              : (PROVIDERS.includes(p) ? p : 'visualcrossing');
  }

  // If the candidate provider has no key, fall through to the first available one.
  if (!providerAvailable(candidate)) {
    candidate = PROVIDERS.find(providerAvailable) || 'openmeteo';
  }

  return candidate;
}

export function initWeatherProviderToggle(onProviderChange) {
  const btn = $('#weatherProviderToggle');
  if (!btn) return;

  // Count how many providers are available (Open-Meteo always counts).
  const available = PROVIDERS.filter(providerAvailable);

  // Hide the toggle when only one provider is usable — nothing to cycle through.
  if (available.length < 2) {
    btn.style.display = 'none';
    return;
  }

  function applyProvider(provider) {
    btn.textContent = PROVIDER_LABEL[provider] || provider.toUpperCase();
    const providerName = PROVIDER_TITLE[provider] || provider;
    const tooltipTpl   = t('weather-provider-toggle-label') || 'Weerbron: {provider} — klik om te wisselen';
    btn.title          = tooltipTpl.replace('{provider}', providerName);

    // Groen (aria-pressed=true) alleen als de actieve provider afwijkt van de
    // standaard in config.js — zelfde gedrag als de taaltoggle.
    const raw = window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.weatherProvider
      ? window.DASHBOARD_CONFIG.weatherProvider.toLowerCase().trim()
      : 'visualcrossing';
    const configDefault = raw === 'owm' ? 'openweathermap'
                        : raw === 'om'  ? 'openmeteo'
                        : raw === 'vb'  ? 'vierlingsbeek'
                        : raw;
    const isNonDefault = provider !== configDefault;
    btn.setAttribute('aria-pressed', isNonDefault ? 'true' : 'false');
    btn.setAttribute('data-provider', provider);

    CFG.weatherProvider = provider;

    try { localStorage.setItem(STORAGE_KEY, provider); } catch { /* ignore */ }
  }

  // Initialise from stored/config preference.
  applyProvider(activeWeatherProvider());

  btn.addEventListener('click', () => {
    // Cycle to the next available provider.
    const currentIdx = available.indexOf(CFG.weatherProvider);
    const nextIdx    = (currentIdx + 1) % available.length;
    applyProvider(available[nextIdx]);
    if (typeof onProviderChange === 'function') onProviderChange();
  });
}

/**
 * Re-applies the tooltip text in the current language.
 * Call this whenever the UI language changes.
 */
export function updateWeatherProviderTooltip() {
  const btn = $('#weatherProviderToggle');
  if (!btn) return;
  const provider     = (CFG.weatherProvider || 'visualcrossing').toLowerCase().trim();
  const providerName = PROVIDER_TITLE[provider] || provider;
  const tooltipTpl   = t('weather-provider-toggle-label') || 'Weerbron: {provider} — klik om te wisselen';
  btn.title          = tooltipTpl.replace('{provider}', providerName);
}
