/**
 * Price bars chart rendering — bars, flags, day markers, best-window highlight, and tooltip.
 */

import { $, $$ }         from '../core/dom.js';
import { isNum, fmt, activeLocale } from '../core/formatters.js';
import { activeDecisionWindow } from '../domain/prices.js';
import { t }             from '../i18n.js';

// ---- Color scale ----

const LEGACY_PRICE_PALETTE = Object.freeze({
  negative: '#36a8ff',
  cheapest: '#00e0ba',
  cheap: '#35e56b',
  middle: '#b9f020',
  expensive: '#ffc400',
  peak: '#ff5f00',
});

function cssHex(name) {
  if (typeof document === 'undefined') return null;
  const getter = globalThis.getComputedStyle || globalThis.window?.getComputedStyle;
  if (typeof getter !== 'function') return null;

  try {
    const value = getter(document.documentElement).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Reads the current semantic palette from CSS. These variables are populated
 * by nightglassThemeController, so a selected preset or manual colour edit is
 * also reflected in the price graph. A non-browser caller keeps the historic
 * fixed palette, which makes the pure utility deterministic in tests.
 */
function activePricePalette() {
  const accent = cssHex('--blue');
  const accentLight = cssHex('--blue-light');
  const success = cssHex('--green');
  const warning = cssHex('--solar');
  const danger = cssHex('--red');
  if (!accent || !success || !warning || !danger) return null;

  return {
    negative: accentLight || accent,
    cheapest: mixHex(success, accent, .36),
    cheap: success,
    middle: mixHex(success, warning, .56),
    expensive: warning,
    peak: danger,
  };
}

/** Maps a price value to the active Nightglass semantic colour scale. */
export function colorFor(v, min, max) {
  const palette = activePricePalette() || LEGACY_PRICE_PALETTE;
  if (v < 0) return palette.negative;
  // Scale positive prices against the visible positive range. When all visible
  // prices are above zero, the cheapest hour should get the cheapest colour
  // instead of being pushed toward the middle by a hard zero baseline.
  const posMin = min < 0 ? 0 : min;
  const span   = Math.max(.0001, max - posMin);
  const t      = Math.max(0, Math.min(1, (v - posMin) / span));
  if (t > .82) return palette.peak;
  if (t > .62) return palette.expensive;
  if (t > .44) return palette.middle;
  if (t > .22) return palette.cheap;
  return palette.cheapest;
}

function relLabel(ts, now) {
  const minutes = Math.round((ts - now) / 60000);
  if (minutes === 0) return t('time-now');
  if (Math.abs(minutes) < 60) {
    return (minutes > 0 ? t('time-in-min') : t('time-min-ago'))
      .replace('{m}', Math.abs(minutes));
  }
  const hours = Math.round(minutes / 60);
  if (hours > 0) return t('time-in-h').replace('{h}', hours);
  return t('time-h-ago').replace('{h}', Math.abs(hours));
}

function clockTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function slotDurationMs(item) {
  const explicit = Number(item?.endTs) - Number(item?.ts);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const minutes = Number(item?.intervalMinutes);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60000;
}

function shortDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
}

function fillText(key, values = {}) {
  let text = t(key);
  Object.entries(values).forEach(([name, value]) => { text = text.replaceAll(`{${name}}`, String(value)); });
  return text;
}

// ---- Colour utilities ----

export function hexToRgb(hex) {
  hex = String(hex || '').trim();
  if (!hex.startsWith('#')) return null;
  hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  if (hex.length !== 6) return null;
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function mixHex(hex, target, amount) {
  const a = hexToRgb(hex), b = hexToRgb(target);
  if (!a || !b) return hex;
  return rgbToHex(
    a.r + (b.r - a.r) * amount,
    a.g + (b.g - a.g) * amount,
    a.b + (b.b - a.b) * amount
  );
}

function barPalette(base, negative) {
  if (!base || !String(base).startsWith('#')) return { top: base, mid: base, bottom: base, glow: base };
  if (negative) {
    return {
    top:    mixHex(base, '#dff4ff', .22),
    mid:    base,
    bottom: mixHex(base, '#031022', .24),
    glow:   mixHex(base, '#9fdcff', .12)
    };
  }
  return {
    top:    mixHex(base, '#fff2b8', .20),
    mid:    base,
    bottom: mixHex(base, '#180800', .16),
    glow:   mixHex(base, '#ffffff', .06)
  };
}


// ---- Usage window selector ----

const USAGE_WINDOW_STORAGE_KEY = 'usageWindowHours';
let selectedUsageWindowHours = 3;
let energyAdviceWindow = null;

function normalizeUsageWindowHours(value, fallback = selectedUsageWindowHours) {
  if (String(value).toLowerCase().trim() === 'all') return 'all';

  const n = Number(value);
  if (Number.isFinite(n) && n >= 1) return Math.max(1, Math.min(24, Math.round(n)));

  if (String(fallback).toLowerCase().trim() === 'all') return 'all';
  return Math.max(1, Math.min(24, Math.round(Number(fallback) || 3)));
}

/** Uses the energy-logger's selected advice period as the chart focus. */
export function setEnergyAdviceWindow(detail) {
  const hours = normalizeUsageWindowHours(detail?.hours);
  const start = new Date(detail?.start).getTime();
  const end = new Date(detail?.end).getTime();
  const averageEur = Number(detail?.averageMarginalPriceEurKwh);

  if (hours === 'all' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    energyAdviceWindow = null;
    return;
  }

  energyAdviceWindow = {
    requestedHours: hours,
    start,
    end,
    highlightStart: start,
    highlightEnd: end,
    avg: Number.isFinite(averageEur) ? averageEur * 100 : null,
    savingCt: 0,
    highlightedHours: (end - start) / 3_600_000,
    highlightedSlots: Math.round((end - start) / 900_000),
    source: 'energy-logger',
  };
}

function decisionWindowFor(hours = selectedUsageWindowHours) {
  const requested = normalizeUsageWindowHours(hours);
  if (requested !== 'all'
      && energyAdviceWindow
      && energyAdviceWindow.requestedHours === requested) {
    return energyAdviceWindow;
  }
  return activeDecisionWindow(requested);
}

function refreshUsageWindowSelectorState() {
  const selector = $('#usageWindowSelector');
  if (!selector) return;

  const activeHours = normalizeUsageWindowHours(selectedUsageWindowHours);
  $$('[data-usage-window]', selector).forEach(btn => {
    const isActive = normalizeUsageWindowHours(btn.dataset.usageWindow) === activeHours;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function refreshUsageWindowDetails() {
  const selector = $('#usageWindowSelector');
  if (!selector) return;

  $$('[data-usage-window]', selector).forEach(btn => {
    const requested = normalizeUsageWindowHours(btn.dataset.usageWindow);
    const block = decisionWindowFor(requested);
    if (!block) {
      btn.title = '';
      return;
    }

    if (requested === 'all') {
      btn.title = fillText('usage-window-all-detail', { slots: block.highlightedSlots || block.items?.length || 0 });
      return;
    }

    btn.title = fillText('usage-window-detail', {
      hours: requested,
      date: shortDate(block.start),
      start: clockTime(block.start),
      end: clockTime(block.end),
      average: fmt.ctValue(block.avg),
      saving: fmt.ctValue(block.savingCt || 0),
      slots: block.highlightedSlots || block.items?.length || 0,
    });
  });
}

async function setConfiguredUsageWindowHours(hours) {
  selectedUsageWindowHours = normalizeUsageWindowHours(hours);

  try { localStorage.setItem(USAGE_WINDOW_STORAGE_KEY, String(selectedUsageWindowHours)); }
  catch { /* storage unavailable */ }

  try {
    const mod = await import('../config/resolveConfig.js');
    if (mod && mod.CFG) mod.CFG.usageWindowHours = selectedUsageWindowHours;
  } catch {
    // In tests or non-browser contexts the config module may be unavailable.
  }

  refreshUsageWindowSelectorState();
}

export async function setupUsageWindowSelector() {
  const selector = $('#usageWindowSelector');
  if (!selector || selector.dataset.initialized === '1') return;
  selector.dataset.initialized = '1';

  let initialHours = selectedUsageWindowHours;

  try {
    const mod = await import('../config/resolveConfig.js');
    if (mod && mod.CFG) initialHours = mod.CFG.usageWindowHours;
  } catch {
    // Keep fallback value.
  }

  try {
    const saved = localStorage.getItem(USAGE_WINDOW_STORAGE_KEY);
    if (saved !== null) initialHours = saved;
  } catch {
    // storage unavailable; keep config/default value
  }

  await setConfiguredUsageWindowHours(initialHours);

  selector.addEventListener('click', async event => {
    const btn = event.target.closest('[data-usage-window]');
    if (!btn || !selector.contains(btn)) return;

    await setConfiguredUsageWindowHours(btn.dataset.usageWindow);
    markBestWindowBars();
    window.dispatchEvent(new CustomEvent('usage-window-hours-change', { detail: { hours: selectedUsageWindowHours } }));
  });
}

// ---- Bar rendering ----

function getLabelDensity(itemCount, chartWidth) {
  if (itemCount > 34 || chartWidth < 980) return 'sparse';
  if (itemCount > 26 || chartWidth < 1320) return 'medium';
  return 'full';
}

function assignDayMarkers(items, nowTs) {
  const today = new Date(nowTs);
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  let prevDay = '';

  items.forEach((x, i) => {
    const dayStart = new Date(x.d);
    dayStart.setHours(0, 0, 0, 0);

    const dk = dayStart.getTime();
    x.dayMarker = '';

    if (i > 0 && prevDay && dk !== prevDay) {
      if (dk === tomorrow.getTime()) {
        x.dayMarker = 'tomorrow';
      } else if (dk === dayAfterTomorrow.getTime()) {
        x.dayMarker = 'day-after';
      }
    }

    prevDay = dk;
  });
}

function getFutureFlagItems(items, nowTs) {
  // Chart flags should only look forward. The current price slot has its own state
  // and must not be mixed into the upcoming cheap/expensive context.
  return items.filter(x => x.ts >= nowTs && isNum(x.p));
}

function getPriceExtremes(items) {
  return {
    cheapest:  items.reduce((a, x) => !a || x.p < a.p ? x : a, null),
    expensive: items.reduce((a, x) => !a || x.p > a.p ? x : a, null)
  };
}

function ensureBarWrap(container, key) {
  let w = $$('.barwrap', container).find(x => x.dataset.key === key);
  if (w) return w;

  w = document.createElement('div');
  w.className = 'barwrap';
  w.dataset.key = key;
  w.setAttribute('role', 'listitem');

  const dayline = document.createElement('div');
  dayline.className = 'dayline';
  dayline.hidden = true;
  const dayLabel = document.createElement('div');
  dayLabel.className = 'day-label';
  dayLabel.hidden = true;
  const flag = document.createElement('div');
  flag.className = 'flag';
  flag.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'bar';
  const time = document.createElement('div');
  time.className = 'time';

  w.append(dayline, dayLabel, flag, bar, time);
  container.appendChild(w);
  return w;
}

function setTemporalClasses(w, x, nowTs) {
  const wasPast = w.classList.contains('is-past');
  const isPast  = x.ts < nowTs && !x.placeholder;

  w.classList.toggle('now',              x.ts === nowTs);
  w.classList.toggle('negative-now',     x.ts === nowTs && isNum(x.p) && x.p < 0);
  w.classList.toggle('is-negative-price', isNum(x.p) && x.p < 0);
  w.classList.toggle('is-past',          isPast);
  w.classList.toggle('is-future',        x.ts > nowTs && !x.placeholder);
  w.classList.toggle('old-past',         isPast && x.ts <= nowTs - 5 * 3600000);

  if (isPast && !wasPast) {
    w.classList.add('just-became-past');
    setTimeout(() => w.classList.remove('just-became-past'), 1900);
  }
}

function setMarkerClasses(w, x, cheapest, expensive, min) {
  w.classList.toggle('has-zero',              min < 0);
  w.classList.toggle('is-cheapest-hour',      x === cheapest && isNum(x.p));
  w.classList.toggle('is-expensive-hour',     x === expensive && isNum(x.p));
  w.classList.toggle('is-tomorrow',           x.dayMarker === 'tomorrow');
  w.classList.toggle('is-day-after-tomorrow', x.dayMarker === 'day-after');
}

function chartFillScale(w) {
  const fallback = 88;
  const el = w && w.parentElement;
  const win = globalThis.window;
  if (!el || !win || typeof win.getComputedStyle !== 'function') return fallback;

  const raw = win.getComputedStyle(el).getPropertyValue('--bar-fill-scale');
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? Math.max(45, Math.min(92, n)) : fallback;
}

function setBarMetrics(w, x, min, max, c) {
  const effectiveMin = Math.min(0, min);
  const span         = Math.max(.0001, max - effectiveMin);
  const fillScale    = chartFillScale(w);
  const zeroPct      = Math.round(Math.abs(effectiveMin) / span * fillScale);
  const h            = isNum(x.p) ? Math.max(8, Math.round(Math.abs(x.p) / span * fillScale)) : Math.round(fillScale * .48);

  w.style.setProperty('--zero',       zeroPct + '%');
  w.style.setProperty('--h',          h + '%');
  w.style.setProperty('--sync-color', c);
}

function setBarDataset(w, x, nowTs, c) {
  const endTs = Number(x.endTs) || Number(x.ts) + slotDurationMs(x);
  const tm = clockTime(x.d);
  const range = tm + '–' + clockTime(endTs);

  w.dataset.time  = range;
  w.dataset.startTime = tm;
  w.dataset.date = shortDate(x.d);
  w.dataset.price = isNum(x.p) ? fmt.ct(x.p) : t('price-unknown');
  w.dataset.sellPrice = isNum(x.sell) ? fmt.ct(x.sell) : t('price-unknown');
  w.dataset.intervalMinutes = String(Math.round(slotDurationMs(x) / 60000));
  w.dataset.note  = x.placeholder
    ? t('price-not-yet-known')
    : (x.ts === nowTs
        ? t(Number(w.dataset.intervalMinutes) < 60 ? 'price-current-slot' : 'price-current-hour')
        : relLabel(x.ts, nowTs));
  w.dataset.color = c;

  // Accessible label includes the complete slot and both tariffs.
  const priceLabel = isNum(x.p) ? fmt.ct(x.p) : t('price-unknown');
  const sellLabel  = isNum(x.sell) ? fmt.ct(x.sell) : t('price-unknown');
  const noteLabel  = x.placeholder ? t('price-not-yet-known') : relLabel(x.ts, nowTs);
  w.setAttribute('aria-label', fillText('price-slot-aria', {
    date: w.dataset.date,
    range,
    buy: priceLabel,
    sell: sellLabel,
    note: noteLabel,
  }));
}

function updateDayMarker(w, x, hasFlag) {
  const dayLine  = $('.dayline', w);
  const dayLabel = $('.day-label', w);

  dayLine.hidden  = !x.dayMarker;
  dayLabel.hidden = !x.dayMarker;

  // When this bar also carries a price flag, push the day label down so
  // the two elements don't overlap.
  w.classList.toggle('day-label-has-flag', !!(x.dayMarker && hasFlag));

  if (x.dayMarker) {
    dayLabel.dataset.i18n = x.dayMarker;
    dayLabel.textContent  = t(x.dayMarker);
  }
}

function updateFlag(w, x, cheapest, expensive, c) {
  const flag = $('.flag', w);
  const showFlag = (x === cheapest || x === expensive) && isNum(x.p);

  flag.hidden = !showFlag;
  if (showFlag) {
    flag.textContent = fmt.ct(x.p);
    flag.style.color = c;
    flag.style.setProperty('--sync-color', c);
    flag.className = 'flag ' + (x.p < 0 ? 'is-negative' : 'is-positive');
  } else {
    flag.className = 'flag';
  }
  return showFlag;
}

function updateBarFill(w, x, c) {
  const bar = $('.bar', w);
  bar.className = 'bar ' + (x.placeholder ? 'placeholder' : '') + (isNum(x.p) && x.p < 0 ? ' negative' : '');

  const pal = barPalette(c, isNum(x.p) && x.p < 0);
  bar.style.setProperty('--c1',   pal.top);
  bar.style.setProperty('--c2',   pal.mid);
  bar.style.setProperty('--c3',   pal.bottom);
  bar.style.setProperty('--glow', pal.glow);
}

function shouldShowTimeLabel(item, labelDensity, nowTs) {
  if (item.ts === nowTs) return true;
  const hour = item.d.getHours();
  const minute = item.d.getMinutes();
  if (minute !== 0) return false;
  if (labelDensity === 'full') return hour % 2 === 0;
  if (labelDensity === 'medium') return hour % 4 === 0;
  return hour % 6 === 0;
}

function updateTimeLabel(w, x, labelDensity, nowTs) {
  const time = $('.time', w);
  time.textContent = shouldShowTimeLabel(x, labelDensity, nowTs) ? w.dataset.startTime : '';
}

function updateBarWrap(w, x, nowTs, min, max, cheapest, expensive, labelDensity) {
  const c = isNum(x.p) ? colorFor(x.p, min, max) : 'rgba(255,255,255,.36)';

  setTemporalClasses(w, x, nowTs);
  setMarkerClasses(w, x, cheapest, expensive, min);
  setBarMetrics(w, x, min, max, c);
  setBarDataset(w, x, nowTs, c);
  const hasFlag = updateFlag(w, x, cheapest, expensive, c);
  updateDayMarker(w, x, hasFlag);
  updateBarFill(w, x, c);
  updateTimeLabel(w, x, labelDensity, nowTs);
}

/**
 * Renders or updates all price bars.
 *
 * @param {Array}  items - [{ d: Date, ts: number, p: number, placeholder: boolean, dayMarker: string }]
 * @param {number} nowTs - Timestamp of the current price slot
 * @param {number} min   - Minimum price in the visible range
 * @param {number} max   - Maximum price in the visible range
 */
export function renderBars(items, nowTs, min, max) {
  const el = $('#bars');
  el.style.setProperty('--bar-count', items.length);
  const firstInterval = items.find(x => x && !x.placeholder);
  el.dataset.intervalMinutes = String(Math.round(slotDurationMs(firstInterval) / 60000));

  const chartWidth = el.getBoundingClientRect?.().width || globalThis.window?.innerWidth || 1600;
  const labelDensity = getLabelDensity(items.length, chartWidth);
  el.dataset.labelDensity = labelDensity;

  const wanted = new Set(items.map(x => String(x.ts)));
  const { cheapest, expensive } = getPriceExtremes(getFutureFlagItems(items, nowTs));

  assignDayMarkers(items, nowTs);

  items.forEach((x, idx) => {
    const key = String(x.ts);
    const w = ensureBarWrap(el, key);
    updateBarWrap(w, x, nowTs, min, max, cheapest, expensive, labelDensity);
    if (el.children[idx] !== w) el.insertBefore(w, el.children[idx] || null);
  });

  Array.from(el.children).forEach(ch => { if (!wanted.has(ch.dataset.key)) ch.remove(); });

  // Restore .is-hovered on the active bar if the DOM was rebuilt around it.
  if (typeof setupTooltip._reattach === 'function') setupTooltip._reattach();
}

/** Highlights the bars that fall within the cheapest decision window. */
export function markBestWindowBars() {
  const block = decisionWindowFor();
  const wraps = $$('.barwrap');
  const isAllWindow = String(block?.requestedHours || '').toLowerCase().trim() === 'all';

  // Include every bar within the active decision window. When the current
  // hour falls inside that window it should receive the same best-window
  // styling as the rest of the highlighted sequence. In `all` mode, however,
  // every future bar would become a best-window bar, which applies the mint
  // highlight filter to orange/yellow bars and makes the price colour scale
  // look non-linear. Keep `all` as a neutral overview: no best-window overlay,
  // just the normal price colours plus cheapest/most-expensive markers.
  const eligible = wraps
    .map(w => ({ w, ts: Number(w.dataset.key) }))
    .filter(({ ts }) => !!block
      && !isAllWindow
      && isNum(ts)
      && ts >= block.highlightStart
      && ts < block.highlightEnd);

  const edgeStart = eligible.length ? Math.min(...eligible.map(x => x.ts)) : null;
  const edgeEnd   = eligible.length ? Math.max(...eligible.map(x => x.ts)) : null;
  let hasFocusWindow = false;

  wraps.forEach(w => {
    const ts = Number(w.dataset.key);
    const inWindow = eligible.some(x => x.w === w);
    hasFocusWindow = hasFocusWindow || inWindow;
    w.classList.toggle('is-best-window', inWindow);
    w.classList.toggle('is-best-edge', inWindow && (ts === edgeStart || ts === edgeEnd));
    w.dataset.window = inWindow
      ? fillText('tooltip-best-window', {
          hours: block.requestedHours,
          average: fmt.ctValue(block.avg),
        })
      : '';
  });

  const barContainers = $$('.bars');
  const mainBars = $('#bars');
  if (mainBars && !barContainers.includes(mainBars)) barContainers.push(mainBars);
  barContainers.forEach(bars => {
    bars.classList.toggle('has-focus-window', hasFocusWindow);
    bars.classList.toggle('has-all-window', isAllWindow);
  });
  refreshUsageWindowDetails();
}

// ---- Tooltip ----

/** Re-applies language-sensitive labels in the dynamically-created tooltip. */
export function retranslateTooltipLabels() {
  const tip = document.querySelector('.tooltip');
  if (!tip) return;
  const buyLabel = $('.tip-buy-label', tip);
  const sellLabel = $('.tip-sell-label', tip);
  if (buyLabel) buyLabel.textContent = t('tooltip-buy');
  if (sellLabel) sellLabel.textContent = t('tooltip-sell');
}

/** Creates and attaches the hover tooltip to the price chart. */
export function setupTooltip() {
  const tip  = document.createElement('div');
  const line = document.createElement('div');
  tip.className  = 'tooltip';

  const dot = document.createElement('span');
  dot.className = 'dot';
  const tipTime = document.createElement('span');
  tipTime.className = 'tip-time';
  const tipDate = document.createElement('span');
  tipDate.className = 'tip-date';
  const tipNote = document.createElement('span');
  tipNote.className = 'tip-note';
  const tipBuyLabel = document.createElement('span');
  tipBuyLabel.className = 'tip-label tip-buy-label';
  tipBuyLabel.textContent = t('tooltip-buy');
  const tipPrice = document.createElement('span');
  tipPrice.className = 'tip-price';
  const tipSellLabel = document.createElement('span');
  tipSellLabel.className = 'tip-label tip-sell-label';
  tipSellLabel.textContent = t('tooltip-sell');
  const tipSellPrice = document.createElement('span');
  tipSellPrice.className = 'tip-sell-price';
  const tipWindow = document.createElement('span');
  tipWindow.className = 'tip-window';

  const tipHeader = document.createElement('span');
  tipHeader.className = 'tip-header';
  tipHeader.append(tipDate, tipTime, tipNote);
  const tipValues = document.createElement('span');
  tipValues.className = 'tip-values';
  tipValues.append(tipBuyLabel, tipPrice, tipSellLabel, tipSellPrice);

  tip.append(dot, tipHeader, tipValues, tipWindow);
  line.className = 'hoverline is-hidden';
  document.body.append(tip, line);

  let hideTimer = null;
  let tooltipToken = 0;
  let activeWrap = null;
  let rafId = 0;
  let touchPinned = false;
  let lastTouchTs = 0;
  let touchAutoHideTimer = null;
  const TOUCH_AUTO_HIDE_MS = 1200;

  function clearTouchAutoHide() {
    clearTimeout(touchAutoHideTimer);
    touchAutoHideTimer = null;
  }

  function scheduleTouchAutoHide() {
    clearTouchAutoHide();
    touchAutoHideTimer = setTimeout(() => {
      touchAutoHideTimer = null;
      hide(true);
    }, TOUCH_AUTO_HIDE_MS);
  }

  function setActiveWrap(w) {
    if (activeWrap && activeWrap !== w) activeWrap.classList.remove('is-hovered');
    activeWrap = w || null;
    if (activeWrap) activeWrap.classList.add('is-hovered');
  }

  function positionTooltip(w, reveal = true, options = {}) {
    const r = w.getBoundingClientRect();
    const bar = w.querySelector('.bar');
    if (!bar) return;

    const b = bar.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = b.top;
    const c = w.dataset.color || '#00c9a7';

    tip.style.setProperty('--tip-color', c);
    // These labels live in a dynamically-created tooltip and are therefore not
    // covered by applyLang(), which only updates elements with data-i18n
    // attributes. Refresh them whenever the tooltip is populated so a language
    // switch takes effect immediately without rebuilding the tooltip.
    retranslateTooltipLabels();
    $('.tip-date',  tip).textContent = w.dataset.date  || '';
    $('.tip-time',  tip).textContent = w.dataset.time  || 'hour';
    $('.tip-note',  tip).textContent = w.dataset.note  || '';
    $('.tip-price', tip).textContent = w.dataset.price || '';
    $('.tip-sell-price', tip).textContent = w.dataset.sellPrice || t('price-unknown');
    const windowInfo = w.dataset.window || '';
    $('.tip-window', tip).textContent = windowInfo;
    $('.tip-window', tip).hidden = !windowInfo;

    const useTouchFixed = !!options.touchFixed;
    const forceTouchPrime = !!options.forceTouchPrime;
    const sameBarAlreadyVisible = useTouchFixed && !forceTouchPrime
      && w === activeWrap && tip.classList.contains('is-visible');

    // Keep desktop hover visible while moving between bars. On touch we do the
    // opposite: hide for the whole positioning pass and set transform/transition
    // inline before left/top changes. iOS Safari can otherwise paint one frame
    // with the generic desktop tooltip geometry and then snap to the bar.
    // Exception: if touchmove keeps landing on the SAME bar (typical while a
    // finger drifts a pixel or two without leaving the bar), skip the
    // hide/reveal dance entirely — touchmove can fire faster than two
    // animation frames, so redoing it on every event was hiding the tooltip
    // before the previous reveal had even run, which is what caused the
    // constant flicker while dragging.
    tip.classList.remove('is-fading-out', 'align-left', 'align-right', 'is-touch-positioning');
    tip.classList.toggle('is-touch-fixed', useTouchFixed);
    tip.classList.toggle('is-touch-no-transition', useTouchFixed);
    line.classList.remove('is-fading-out');

    const wasVisible = tip.classList.contains('is-visible');
    if (useTouchFixed && !sameBarAlreadyVisible) {
      tip.classList.add('is-positioning', 'is-touch-positioning');
      tip.style.visibility = 'hidden';
      tip.style.transition = 'none';
      tip.style.transform = 'translate(-50%, 0)';
    } else if (!useTouchFixed) {
      tip.style.transition = '';
      tip.style.transform = '';
      if (!wasVisible || forceTouchPrime) tip.classList.add('is-positioning');
    }

    const margin = 10;
    const viewportWidth = globalThis.window?.innerWidth || document.documentElement?.clientWidth || 1600;
    const viewportHeight = globalThis.window?.innerHeight || document.documentElement?.clientHeight || 900;
    const tooltipWidth = Math.ceil(tip.getBoundingClientRect?.().width || tip.offsetWidth || 0);
    const tooltipHeight = Math.ceil(tip.getBoundingClientRect?.().height || tip.offsetHeight || 40);
    const halfTooltip = tooltipWidth / 2;

    // Mouse, trackpad and touch all use a calm vertical lane near the top of
    // the chart. Desktop sits slightly higher for more air above the bars;
    // touch keeps the proven iPhone lane. Only the horizontal coordinate
    // follows the selected bar.
    // Desktop used to derive top from b.top, which made the label jump up and
    // down with every differently-sized price bar.
    const chart = w.closest?.('.chart') || document.querySelector('#chart');
    const chartRect = chart?.getBoundingClientRect?.();
    const chartTop = Number.isFinite(chartRect?.top) ? chartRect.top : (y - 120);
    const verticalTransformOffset = useTouchFixed ? 0 : 18;
    const laneOffset = useTouchFixed ? 46 : 34;
    const minVisualTop = margin;
    const maxVisualTop = Math.max(minVisualTop, viewportHeight - margin - tooltipHeight);
    const visualLaneTop = Math.min(
      Math.max(chartTop + laneOffset, minVisualTop),
      maxVisualTop,
    );

    // Edge-safe positioning. Near the edges we anchor the balloon to the
    // viewport margin instead of keeping a centered transform. This is more
    // robust than only clamping the centre point, especially when the tooltip
    // width changes after new text is inserted or when a mobile/touch tooltip
    // stays pinned while the viewport changes.
    let tooltipX = x;

    if (useTouchFixed) {
      // On phones a finger sits on top of the selected bar. Keep the balloon in
      // one fixed top lane of the chart, but let it follow the selected hour
      // horizontally so it remains clear which bar is active.
      if (tooltipWidth > 0) {
        const minX = margin + halfTooltip;
        const maxX = viewportWidth - margin - halfTooltip;
        tooltipX = minX > maxX
          ? viewportWidth / 2
          : Math.min(Math.max(x, minX), maxX);
      }

      tip.classList.add('is-touch-fixed');
      tip.style.left = tooltipX + 'px';
      tip.style.top = visualLaneTop + 'px';
    } else {
      if (tooltipWidth > 0 && x - halfTooltip < margin) {
        tooltipX = margin;
        tip.classList.add('align-left');
      } else if (tooltipWidth > 0 && x + halfTooltip > viewportWidth - margin) {
        tooltipX = viewportWidth - margin;
        tip.classList.add('align-right');
      } else if (tooltipWidth > 0) {
        const minX = margin + halfTooltip;
        const maxX = viewportWidth - margin - halfTooltip;
        tooltipX = minX > maxX
          ? viewportWidth / 2
          : Math.min(Math.max(x, minX), maxX);
      }

      tip.style.left = tooltipX + 'px';
      // Desktop's visible-state transform lifts the tooltip by 18px. Add the
      // same amount to the inline top so its painted top matches the shared
      // visual lane used by touch devices.
      tip.style.top = visualLaneTop + verticalTransformOffset + 'px';
    }

    const finalRect = tip.getBoundingClientRect();
    line.style.left   = x + 'px';
    line.style.top    = finalRect.bottom + 3 + 'px';
    line.style.height = Math.max(0, y - finalRect.bottom - 6) + 'px';

    if (reveal) {
      const token = ++tooltipToken;
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);

      if (sameBarAlreadyVisible) {
        // Visibility/opacity were never touched above, so there's nothing to
        // reveal — the balloon already tracks the finger via the left/top
        // update further up. Avoid the rAF dance entirely here.
        tip.classList.remove('is-positioning', 'is-touch-positioning');
        line.classList.remove('is-hidden');
        line.classList.add('is-visible');
        return;
      }

      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => fn();
      const revealNow = () => {
        if (token !== tooltipToken) return;
        tip.classList.remove('is-positioning', 'is-touch-positioning');
        tip.style.visibility = '';
        tip.classList.add('is-visible');
        line.classList.remove('is-hidden');
        line.classList.add('is-visible');
      };

      if (useTouchFixed) {
        // Reveal every touch update only after the fixed-lane geometry is
        // committed. This also covers moves between bars while a pinned label
        // was already visible.
        rafId = raf(() => raf(revealNow));
      } else if (!wasVisible) {
        rafId = raf(revealNow);
      } else {
        revealNow();
      }
    }
  }

  function show(e, options = {}) {
    clearTimeout(hideTimer);
    const w = e.target.closest('.barwrap');
    if (!w) return;
    setActiveWrap(w);
    positionTooltip(w, true, options);
  }

  function resetHoverElements() {
    tip.classList.remove(
      'is-visible',
      'is-fading-out',
      'is-positioning',
      'align-left',
      'align-right',
      'is-touch-fixed',
      'is-touch-no-transition'
    );
    tip.style.visibility = '';
    tip.style.transition = '';
    tip.style.transform = '';

    line.classList.remove('is-visible', 'is-fading-out');
    line.classList.add('is-hidden');
    line.style.height = '0px';
    line.style.left = '-9999px';
    line.style.top = '-9999px';
  }

  function hide(slow = false) {
    clearTimeout(hideTimer);
    clearTouchAutoHide();
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    tooltipToken += 1;
    setActiveWrap(null);
    touchPinned = false;

    if (slow) {
      tip.classList.add('is-fading-out');
      line.classList.add('is-fading-out');
      hideTimer = setTimeout(resetHoverElements, 220);
      return;
    }

    resetHoverElements();
  }

  const bars = $('#bars');

  // Mouse / stylus: pointerenter/leave semantics avoid repeated over/out churn
  // from nested chart elements. The tooltip overlay itself has pointer-events:none.
  bars.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch' || Date.now() - lastTouchTs < 700) return;
    const w = e.target.closest('.barwrap');
    if (!w || activeWrap === w) return;
    show(e);
  });

  bars.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || Date.now() - lastTouchTs < 700) return;
    const w = e.target.closest('.barwrap');
    if (!w) return;
    if (activeWrap !== w) setActiveWrap(w);
    positionTooltip(w, true);
  });

  bars.addEventListener('pointerout', e => {
    if (e.pointerType === 'touch' || Date.now() - lastTouchTs < 700) return;
    const next = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.barwrap') : null;
    if (!next) hide();
  });

  bars.addEventListener('pointerleave', e => {
    if (e.pointerType === 'touch' || Date.now() - lastTouchTs < 700) return;
    hide();
  });

  const win = globalThis.window;
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('blur', () => hide());
    win.addEventListener('scroll', () => hide(), { passive: true });
  }

  function touchListLength(list) {
    return Number.isFinite(Number(list?.length)) ? Number(list.length) : 0;
  }

  function touchCountFromEvent(e) {
    return Math.max(
      touchListLength(e.touches),
      touchListLength(e.targetTouches),
      touchListLength(e.changedTouches),
    );
  }

  function firstTouchFromEvent(e) {
    return (e.touches && e.touches[0])
      || (e.targetTouches && e.targetTouches[0])
      || (e.changedTouches && e.changedTouches[0])
      || null;
  }

  function nearestWrapAtX(clientX, clientY) {
    const r = bars.getBoundingClientRect();
    if (clientY < r.top - 24 || clientY > r.bottom + 24) return null; // clearly off the chart vertically
    const wraps = bars.querySelectorAll('.barwrap');
    let closest = null;
    let closestDist = Infinity;
    for (const w of wraps) {
      const wr = w.getBoundingClientRect();
      const dist = clientX < wr.left ? wr.left - clientX : (clientX > wr.right ? clientX - wr.right : 0);
      if (dist < closestDist) { closestDist = dist; closest = w; }
      if (dist === 0) break; // directly over this bar's column
    }
    // Only snap across a small gap (a few px), not across the whole chart.
    return closestDist <= 6 ? closest : null;
  }

  function wrapFromTouchEvent(e, { snapToNearest = false } = {}) {
    const t = firstTouchFromEvent(e);
    let wrap = null;

    if (t && Number.isFinite(t.clientX) && Number.isFinite(t.clientY)) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      wrap = el && el.closest ? el.closest('.barwrap') : null;
      // During a drag, the finger is very likely between two bars (a few px
      // gap) rather than truly off the chart — snap to the nearest bar
      // instead of treating this as "no bar", which previously caused the
      // tooltip to flicker off during normal dragging and only resolve once
      // the finger stopped. This only applies to touchmove: a deliberate tap
      // (touchstart) on genuinely empty chart area should still dismiss.
      if (!wrap && snapToNearest) wrap = nearestWrapAtX(t.clientX, t.clientY);
    }

    // Synthetic TouchEvents in Chromium/Playwright can occasionally expose an
    // empty native TouchList even when the event target is the intended bar.
    // The target fallback also helps real mobile browsers when visual-viewport
    // offsets or momentum scrolling make elementFromPoint miss by a pixel.
    if (!wrap) wrap = e.target && e.target.closest ? e.target.closest('.barwrap') : null;
    return wrap;
  }

  // Touch: 1 finger = tooltip, 2 fingers = scroll page
  bars.addEventListener('touchstart', e => {
    lastTouchTs = Date.now();
    clearTouchAutoHide();
    if (touchCountFromEvent(e) > 1) { touchPinned = false; hide(); return; }
    clearTimeout(hideTimer);
    touchPinned = false;
    e.preventDefault();
    const wrap = wrapFromTouchEvent(e);
    if (wrap) show({ target: wrap }, { touchFixed: true, forceTouchPrime: true }); else hide();
  }, { passive: false });

  bars.addEventListener('touchmove', e => {
    lastTouchTs = Date.now();
    clearTouchAutoHide();
    if (touchCountFromEvent(e) > 1) { hide(); return; }
    e.preventDefault();
    const wrap = wrapFromTouchEvent(e, { snapToNearest: true });
    if (wrap) {
      show({ target: wrap }, { touchFixed: true });
      return;
    }
    // No bar directly under the finger this frame (e.g. a sub-pixel gap
    // between bars, or fast movement outrunning elementFromPoint). Rather
    // than hiding — which caused the tooltip to flicker on/off throughout
    // the drag and only reappear once the finger came to rest — keep
    // showing the last known bar as long as the finger is still within the
    // chart's bar area. Only hide once the touch has truly left it.
    const t = firstTouchFromEvent(e);
    const withinBars = t && Number.isFinite(t.clientX) && Number.isFinite(t.clientY)
      ? (() => {
          const r = bars.getBoundingClientRect();
          return t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom;
        })()
      : false;
    if (!withinBars) hide();
  }, { passive: false });

  bars.addEventListener('touchend', () => {
    clearTimeout(hideTimer);
    touchPinned = !!activeWrap && tip.classList.contains('is-visible');
    // Auto-dismiss shortly after the finger lifts, instead of leaving the
    // label pinned indefinitely until the person taps elsewhere.
    if (touchPinned) scheduleTouchAutoHide();
  });

  bars.addEventListener('touchcancel', () => { clearTouchAutoHide(); hide(true); });

  // Tap outside the chart dismisses a pinned tooltip.
  const doc = globalThis.document;
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('touchstart', e => {
      if (!touchPinned) return;
      if (!e.target.closest?.('#bars')) { clearTouchAutoHide(); hide(true); }
    }, { passive: true });
  }

  // Exposed so renderBars can restore hover state after a DOM re-render.
  setupTooltip._reattach = function () {
    if (!activeWrap) return;
    const key = activeWrap.dataset.key;
    if (!key) return;
    const fresh = document.querySelector(`.barwrap[data-key="${key}"]`);
    if (fresh && fresh !== activeWrap) {
      activeWrap.classList.remove('is-hovered');
      activeWrap = fresh;
      activeWrap.classList.add('is-hovered');
    } else if (!fresh) {
      // Bar no longer in DOM (e.g. scrolled away)
      activeWrap = null;
    }
  };
}
