/** Read-only energy-logger forecast card. */

import { $ } from '../core/dom.js';
import { activeLocale } from '../core/formatters.js';
import { LIVE_STATE } from '../core/state.js';
import { CFG, ENERGY_LOGGER_CFG } from '../config/resolveConfig.js';
import { fetchEnergyAdvice } from '../services/energyLoggerService.js';
import { evaluateInverterShadow, recordShadowDecision } from '../domain/inverterShadow.js';
import { t } from '../i18n.js';

const WINDOW_KEYS = ['1h', '2h', '3h', '4h', '6h'];

function normalizeWindowHours(value, fallback = 1) {
  if (String(value).toLowerCase().trim() === 'all') return 'all';
  const hours = Math.round(Number(value));
  return WINDOW_KEYS.includes(`${hours}h`) ? hours : fallback;
}

function initialWindowHours() {
  let hours = normalizeWindowHours(CFG?.usageWindowHours, 1);
  try {
    const saved = localStorage.getItem('usageWindowHours');
    if (saved !== null) hours = normalizeWindowHours(saved, hours);
  } catch {
    // Storage is optional; use the configured duration.
  }
  return hours;
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, digits = 1) {
  const n = finite(value);
  return n === null ? '--' : n.toLocaleString(activeLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatKwh(value) {
  return `${formatNumber(value, 1)} kWh`;
}

function formatCt(valueEur) {
  const n = finite(valueEur);
  return n === null ? '--' : `${formatNumber(n * 100, 2)} ct/kWh`;
}

function formatCtValue(valueCt) {
  const n = finite(valueCt);
  return n === null ? '--' : `${formatNumber(n, 2)} ct/kWh`;
}

function formatWatts(value) {
  const n = finite(value);
  return n === null ? '-- W' : `${formatNumber(Math.round(n), 0)} W`;
}

function formatEuro(value) {
  const n = finite(value);
  return n === null ? '--' : `€ ${formatNumber(Math.abs(n), 2)}`;
}

function fillTemplate(key, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    t(key),
  );
}

function priceWindowBounds(window) {
  const start = new Date(window?.start_local || window?.start_utc).getTime();
  const end = new Date(window?.end_local || window?.end_utc).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null;
}

/**
 * Returns the time-weighted Zonneplan purchase tariff for an energy-logger
 * window. A value is only shown when the price forecast covers the complete
 * window, preventing a partial average while quarter prices are still loading.
 */
function averagePurchasePriceEurKwh(window, priceForecast = LIVE_STATE.priceForecast) {
  const bounds = priceWindowBounds(window);
  if (!bounds || !Array.isArray(priceForecast)) return null;

  const intervals = priceForecast
    .map(item => {
      const start = Number(item?.ts);
      const fallbackDuration = Math.max(1, Number(item?.intervalMinutes) || 60) * 60_000;
      const explicitEnd = Number(item?.endTs);
      const end = Number.isFinite(explicitEnd) && explicitEnd > start
        ? explicitEnd
        : start + fallbackDuration;
      const priceCt = finite(item?.ct);
      return {
        start: Math.max(bounds.start, start),
        end: Math.min(bounds.end, end),
        priceCt,
      };
    })
    .filter(item => item.priceCt !== null && item.end > item.start)
    .sort((a, b) => a.start - b.start);

  let cursor = bounds.start;
  let weightedCtMs = 0;
  let coveredMs = 0;

  intervals.forEach(item => {
    const start = Math.max(cursor, item.start);
    if (start > cursor) return;
    const end = Math.max(start, item.end);
    const duration = end - start;
    weightedCtMs += item.priceCt * duration;
    coveredMs += duration;
    cursor = Math.max(cursor, end);
  });

  const requiredMs = bounds.end - bounds.start;
  if (cursor < bounds.end || coveredMs < requiredMs) return null;
  return (weightedCtMs / coveredMs) / 100;
}

function dateFromLocalWallClock(value) {
  const match = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/,
  );
  if (!match) return null;
  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
  ));
}

function formatLocalDateTime(value, options, preserveWallClock = false) {
  const d = preserveWallClock ? dateFromLocalWallClock(value) : new Date(value);
  if (!d) return '--';
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(activeLocale(), preserveWallClock ? { ...options, timeZone: 'UTC' } : options);
}

function formatWindow(window) {
  const hasLocalTimes = Boolean(window?.start_local && window?.end_local);
  const start = hasLocalTimes ? window.start_local : window?.start_utc;
  const end = hasLocalTimes ? window.end_local : window?.end_utc;
  if (!start || !end) return { day: '--', time: '--' };

  return {
    day: formatLocalDateTime(start, { weekday: 'short', day: 'numeric', month: 'short' }, hasLocalTimes),
    time: `${formatLocalDateTime(start, { hour: '2-digit', minute: '2-digit' }, hasLocalTimes)}–${formatLocalDateTime(end, { hour: '2-digit', minute: '2-digit' }, hasLocalTimes)}`,
  };
}

function confidenceKey(value) {
  if (value === 'high') return 'energy-advice-confidence-high';
  if (value === 'medium') return 'energy-advice-confidence-medium';
  return 'energy-advice-confidence-low';
}

function setText(id, value) {
  const el = $(id.startsWith('#') ? id : `#${id}`);
  if (el) el.textContent = value;
}

function renderWindowList(windows, selectedHours) {
  const container = $('#energyAdviceWindows');
  if (!container) return;
  container.replaceChildren();

  WINDOW_KEYS.forEach(key => {
    const window = windows?.[key];
    if (!window) return;
    const label = formatWindow(window);
    const hours = Number.parseInt(key, 10);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'energy-advice-window';
    item.dataset.adviceWindow = key;
    const isActive = selectedHours !== 'all' && hours === selectedHours;
    item.classList.toggle('is-active', isActive);
    item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    item.innerHTML = `
      <span class="energy-advice-window__duration">${key}</span>
      <strong>${label.time}</strong>
      <small>${label.day}</small>
    `;
    item.title = `${key} · ${label.day} ${label.time} · ${formatCt(window.average_marginal_price_eur_kwh)}`;
    item.addEventListener('click', () => {
      const selectorButton = document.querySelector(`[data-usage-window="${hours}"]`);
      if (selectorButton && typeof selectorButton.click === 'function') selectorButton.click();
    });
    container.appendChild(item);
  });
}

function selectedWindow(windows, selectedHours) {
  const selected = selectedHours === 'all' ? null : windows?.[`${selectedHours}h`];
  if (selected) return { key: `${selectedHours}h`, hours: selectedHours, window: selected };

  const key = WINDOW_KEYS.find(candidate => windows?.[candidate]);
  return key ? { key, hours: Number.parseInt(key, 10), window: windows[key] } : null;
}

function bestWindowLabel(hours) {
  return t('energy-advice-best-window').replace('{hours}', String(hours));
}

function netCostPresentation(value) {
  const amount = finite(value);
  if (amount === null) {
    return {
      label: t('energy-advice-net-balance'),
      amount: '--',
      note: t('energy-advice-net-balance-note'),
    };
  }

  const isRevenue = amount < 0;
  return {
    label: t(isRevenue ? 'energy-advice-net-revenue' : 'energy-advice-net-payable'),
    amount: `€ ${formatNumber(Math.abs(amount), 2)}`,
    note: t(isRevenue ? 'energy-advice-net-revenue-note' : 'energy-advice-net-payable-note'),
  };
}

function renderInverterShadow(payload, now = Date.now()) {
  const confidence = payload.latest_run?.overall_confidence || 'low';
  const decision = evaluateInverterShadow({
    now,
    solarW: LIVE_STATE.solarW,
    houseW: LIVE_STATE.houseW,
    gridW: LIVE_STATE.gridW,
    gridDir: LIVE_STATE.gridDir,
    priceForecast: LIVE_STATE.priceForecast,
    confidence,
    manualRelease: false,
  });

  recordShadowDecision(decision, globalThis.localStorage, now);

  const actionKey = {
    'curtail-surplus': 'energy-shadow-action-curtail',
    unrestricted: 'energy-shadow-action-unrestricted',
    'no-intervention': 'energy-shadow-action-none',
    'waiting-data': 'energy-shadow-action-wait',
  }[decision.action] || 'energy-shadow-action-wait';

  let detail = t('energy-shadow-detail-wait');
  if (decision.action === 'curtail-surplus') {
    detail = fillTemplate('energy-shadow-detail-curtail', {
      percent: decision.suggestedLimitPct,
      power: formatWatts(decision.targetW),
    });
  } else if (decision.action === 'unrestricted') {
    detail = t('energy-shadow-detail-unrestricted');
  } else if (decision.action === 'no-intervention') {
    detail = t('energy-shadow-detail-none');
  }

  const effect = decision.action === 'curtail-surplus'
    ? fillTemplate('energy-shadow-effect-avoided', { amount: formatEuro(decision.estimatedEffectEur) })
    : t('energy-shadow-effect-none');
  const confidenceLabel = t(confidenceKey(confidence));

  setText('energyShadowAction', t(actionKey));
  setText('energyShadowDetail', detail);
  setText('energyShadowSalePrice', formatCtValue(decision.salePriceCt));
  setText('energyShadowEffect', effect);
  setText('energyShadowDateGate', t(decision.gates.dateReady
    ? 'energy-shadow-gate-date-ready'
    : 'energy-shadow-gate-date-blocked'));
  setText('energyShadowConfidenceGate', fillTemplate(
    decision.gates.confidenceReady
      ? 'energy-shadow-gate-confidence-ready'
      : 'energy-shadow-gate-confidence-blocked',
    { confidence: confidenceLabel },
  ));
  setText('energyShadowManualGate', t('energy-shadow-gate-manual-blocked'));
  setText('energyShadowCommand', t('energy-shadow-no-command'));

  const shadow = $('#energyShadow');
  if (shadow) {
    shadow.dataset.action = decision.action;
    shadow.dataset.commandSent = 'false';
  }
}

export function renderEnergyAdvice(payload, selectedHours = initialWindowHours()) {
  const panel = $('#energyAdvice');
  if (!panel) return;

  const run = payload.latest_run || {};
  const totals = payload.totals || {};
  const windows = payload.best_consumption_windows || {};
  const evaluation = payload.evaluation || {};
  const selection = selectedWindow(windows, normalizeWindowHours(selectedHours));
  const primary = selection?.window;
  const primaryLabel = formatWindow(primary);
  const horizonEnd = payload.forecast_horizon?.last_end_utc;
  const horizonLabel = horizonEnd
    ? `${t('energy-advice-until')} ${formatLocalDateTime(horizonEnd, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
    : t('energy-advice-until-unknown');
  const netCost = netCostPresentation(totals.net_cost_eur);

  panel.dataset.state = 'live';
  setText('energyAdviceState', t('energy-advice-live'));
  setText('energyAdviceMainLabel', bestWindowLabel(selection?.hours || 1));
  setText('energyAdviceMainTime', primaryLabel.time);
  setText('energyAdviceMainDay', primaryLabel.day);
  setText('energyAdviceMainPurchasePriceLabel', t('energy-advice-average-purchase-price'));
  setText('energyAdviceMainPurchasePrice', formatCt(averagePurchasePriceEurKwh(primary)));
  setText('energyAdviceMainPriceLabel', t('energy-advice-average-sale-price'));
  setText('energyAdviceMainPrice', formatCt(primary?.average_marginal_price_eur_kwh));
  setText('energyAdviceSolar', formatKwh(totals.solar_kwh));
  setText('energyAdviceHouse', formatKwh(totals.house_kwh));
  setText('energyAdviceImport', formatKwh(totals.import_kwh));
  setText('energyAdviceExport', formatKwh(totals.export_kwh));
  setText('energyAdviceMetricsHorizon', horizonLabel);
  setText('energyAdviceNetCostLabel', netCost.label);
  setText('energyAdviceNetCost', netCost.amount);
  setText('energyAdviceNetCostNote', netCost.note);
  setText('energyAdviceConfidence', t(confidenceKey(run.overall_confidence)));
  setText('energyAdviceModel', run.model_version || '--');
  setText('energyAdviceHorizon', horizonLabel);

  const evaluated = Math.max(0, Number(evaluation.evaluated_quarters) || 0);
  const mae = finite(evaluation.net_mae_kwh);
  setText('energyAdviceEvaluation', evaluated
    ? `${evaluated} ${t('energy-advice-quarters-evaluated')} · MAE ${formatKwh(mae)}`
    : t('energy-advice-not-evaluated'));

  renderWindowList(windows, normalizeWindowHours(selectedHours));
  renderInverterShadow(payload);
}

export function renderEnergyAdviceError(error) {
  const panel = $('#energyAdvice');
  if (!panel) return;
  panel.dataset.state = 'error';
  setText('energyAdviceState', t('energy-advice-offline'));
  setText('energyAdviceMainTime', '--:--');
  setText('energyAdviceMainDay', t('energy-advice-unavailable'));
  setText('energyAdviceMainPurchasePrice', '');
  setText('energyAdviceMainPrice', '');
  setText('energyShadowAction', t('energy-shadow-action-wait'));
  setText('energyShadowDetail', t('energy-shadow-detail-wait'));
  setText('energyShadowSalePrice', '--');
  setText('energyShadowEffect', t('energy-shadow-effect-none'));
  setText('energyShadowCommand', t('energy-shadow-no-command'));
  setText('energyAdviceEvaluation', error?.message === 'energy_logger_policy_not_passive'
    ? t('energy-advice-policy-error')
    : t('energy-advice-check-config'));
}

export function createEnergyAdviceController() {
  let timerId = null;
  let lastPayload = null;
  let busy = false;
  let selectedHours = initialWindowHours();
  let priceListenerActive = false;

  function handleEnergyStateChange(event) {
    const patch = event?.detail?.patch || {};
    const relevant = ['priceForecast', 'solarW', 'houseW', 'gridW', 'gridDir'];
    if (!relevant.some(key => Object.prototype.hasOwnProperty.call(patch, key))) return;
    renderCurrent();
  }

  function announceSelectedWindow() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    const selection = selectedWindow(lastPayload?.best_consumption_windows || {}, selectedHours);
    const source = selection?.window;
    window.dispatchEvent(new CustomEvent('energy-advice-window-change', {
      detail: selectedHours === 'all' || !source ? { hours: selectedHours } : {
        hours: selection.hours,
        start: source.start_local || source.start_utc,
        end: source.end_local || source.end_utc,
        averageMarginalPriceEurKwh: source.average_marginal_price_eur_kwh,
      },
    }));
  }

  function renderCurrent() {
    if (!lastPayload) return;
    renderEnergyAdvice(lastPayload, selectedHours);
    announceSelectedWindow();
  }

  async function refresh() {
    if (!ENERGY_LOGGER_CFG.enabled || busy) return;
    busy = true;
    try {
      lastPayload = await fetchEnergyAdvice();
      renderCurrent();
    } catch (error) {
      renderEnergyAdviceError(error);
    } finally {
      busy = false;
    }
  }

  function start() {
    if (!ENERGY_LOGGER_CFG.enabled) {
      const panel = $('#energyAdvice');
      if (panel) panel.hidden = true;
      return;
    }
    const seconds = Math.max(15, Number(ENERGY_LOGGER_CFG.refreshSeconds) || 60);
    clearInterval(timerId);
    timerId = setInterval(refresh, seconds * 1000);
    if (!priceListenerActive && typeof window !== 'undefined') {
      window.addEventListener('state:change', handleEnergyStateChange);
      priceListenerActive = true;
    }
  }

  function stop() {
    clearInterval(timerId);
    timerId = null;
    if (priceListenerActive && typeof window !== 'undefined') {
      window.removeEventListener('state:change', handleEnergyStateChange);
      priceListenerActive = false;
    }
  }

  function retranslate() {
    if (lastPayload) renderCurrent();
    else if ($('#energyAdvice')?.dataset.state === 'error') renderEnergyAdviceError();
  }

  function selectWindow(hours) {
    selectedHours = normalizeWindowHours(hours, selectedHours);
    renderCurrent();
  }

  return { refresh, start, stop, retranslate, selectWindow };
}
