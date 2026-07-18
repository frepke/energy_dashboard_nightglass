/**
 * Card and badge rendering helpers.
 */

import { $ }                    from '../core/dom.js';
import { isNum, fmt }          from '../core/formatters.js';
import { t }                  from '../i18n.js';

// ---- Price icon SVGs (shared across badges and card price rows) ----

function priceIconSvg(type) {
  if (type === 'gas')   return '<span class="mini-price-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2c0 0-1.5 3-1.5 5.5 0 1 .4 1.9 1 2.5C10.2 8.5 10 7 10 7c-2 2.5-3 5-3 7a5 5 0 0 0 10 0c0-3-1.5-5.5-3-7 0 0 .2 2.5-1 4.5-.5-.8-.5-2-.5-2.5C12.5 6.5 12 2 12 2z"/></svg></span>';
  if (type === 'solar') return '<span class="mini-price-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.6"/><path class="stroke" d="M12 1.8v3M12 19.2v3M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M1.8 12h3M19.2 12h3M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1"/></svg></span>';
  return '<span class="mini-price-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 2L4 13h6l-1 9 10-12h-6l1-8z"/></svg></span>';
}

// ---- Badge helpers ----

const badgeState = new WeakMap();

function syncPriceBadge(badge, type, text, color) {
  if (!badge) return;
  const next = { type, text, color: color || '#00c9a7' };
  const prev = badgeState.get(badge);
  if (prev && prev.type === next.type && prev.text === next.text && prev.color === next.color) return;

  badgeState.set(badge, next);
  badge.classList.add('syncGlow');
  badge.style.setProperty('--sync-color', next.color);

  const priceText = badge.querySelector('.price-text');
  if (prev && prev.type === next.type && priceText) {
    priceText.textContent = next.text;
  } else {
    badge.innerHTML = priceIconSvg(type) + '<span class="price-text">' + text + '</span>';
  }
}

let lastGasBadgeText      = '';
let gasBadgeInitialized   = false;

function setStableGasBadge(price) {
  if (!isNum(price)) return;
  const badge = $('#gasBadge');
  if (!badge) return;

  const text = fmt.eur(price);
  const tooltip = fmt.ctRaw(Math.abs(Number(price) * 100)).replace(' ct', ' ct/m³');
  badge.title = tooltip;

  if (!gasBadgeInitialized) {
    gasBadgeInitialized = true;
    badge.classList.remove('syncGlow');
    badge.classList.add('gasStable');
    badge.style.setProperty('--sync-color', 'var(--blue-light)');
    if (!badge.querySelector('.price-text')) {
      badge.innerHTML = priceIconSvg('gas') + '<span class="price-text">' + text + '</span>';
    }
  }
  if (text === lastGasBadgeText) return;
  lastGasBadgeText = text;
  const priceText = badge.querySelector('.price-text');
  if (priceText) priceText.textContent = text;
}

/** Updates the electricity price badge in the prices panel header. */
export function setElecBadge(price, color) {
  syncPriceBadge($('#elecBadge'), 'elec', fmt.ct(price), color);
}

/** Updates the gas price badge in the prices panel header. */
export function setGasBadge(price) {
  setStableGasBadge(price);
}

/** Updates a card's price row with icon and formatted text. */
export function setLowerPrice(el, type, text, color) {
  if (!el) return;
  el.style.color = color || '';
  if (color) el.style.setProperty('--sync-color', color);
  el.innerHTML = priceIconSvg(type) + '<span class="price-text">' + text + '</span>';
}

// ---- Inverter limit badge ----

/**
 * Shows or hides the "PV limited" / "PV blocked" badge on the Solar card.
 * @param {number|null} limitPct - 0-100 or null (null = no limit active)
 */
export function renderLimitBadge(limitPct) {
  const b      = $('#limitBadge');
  const status = $('#solarStatus');
  if (!b) return;
  b.className  = 'limitBadge';
  if (limitPct === null || limitPct === undefined || limitPct >= 100) {
    b.hidden        = true;
    b.textContent   = '';
    if (status && status.dataset.limit === '1') delete status.dataset.limit;
    return;
  }
  b.hidden = false;
  b.classList.add('is-visible', limitPct <= 0 ? 'is-blocked' : 'is-limited');
  b.textContent = limitPct <= 0 ? t('pv-blocked') : t('pv-limited') + limitPct + '%';
  if (status) {
    status.dataset.limit  = '1';
    status.textContent    = limitPct <= 0 ? t('pv-blocked') : t('pv-limited') + limitPct + '%';
  }
}
