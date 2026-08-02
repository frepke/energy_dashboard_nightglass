/** Read-only energy-logger forecast card. */

import { $ } from '../core/dom.js';
import { activeLocale } from '../core/formatters.js';
import { CFG, ENERGY_LOGGER_CFG } from '../config/resolveConfig.js';
import { fetchEnergyAdvice } from '../services/energyLoggerService.js';
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

  panel.dataset.state = 'live';
  setText('energyAdviceState', t('energy-advice-live'));
  setText('energyAdviceMainLabel', bestWindowLabel(selection?.hours || 1));
  setText('energyAdviceMainTime', primaryLabel.time);
  setText('energyAdviceMainDay', primaryLabel.day);
  setText('energyAdviceMainPrice', formatCt(primary?.average_marginal_price_eur_kwh));
  setText('energyAdviceSolar', formatKwh(totals.solar_kwh));
  setText('energyAdviceHouse', formatKwh(totals.house_kwh));
  setText('energyAdviceImport', formatKwh(totals.import_kwh));
  setText('energyAdviceExport', formatKwh(totals.export_kwh));
  setText('energyAdviceNetCost', `€ ${formatNumber(totals.net_cost_eur, 2)}`);
  setText('energyAdviceConfidence', t(confidenceKey(run.overall_confidence)));
  setText('energyAdviceModel', run.model_version || '--');
  setText('energyAdviceHorizon', horizonEnd
    ? `${t('energy-advice-until')} ${formatLocalDateTime(horizonEnd, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
    : t('energy-advice-until-unknown'));

  const evaluated = Math.max(0, Number(evaluation.evaluated_quarters) || 0);
  const mae = finite(evaluation.net_mae_kwh);
  setText('energyAdviceEvaluation', evaluated
    ? `${evaluated} ${t('energy-advice-quarters-evaluated')} · MAE ${formatKwh(mae)}`
    : t('energy-advice-not-evaluated'));

  renderWindowList(windows, normalizeWindowHours(selectedHours));
}

export function renderEnergyAdviceError(error) {
  const panel = $('#energyAdvice');
  if (!panel) return;
  panel.dataset.state = 'error';
  setText('energyAdviceState', t('energy-advice-offline'));
  setText('energyAdviceMainTime', '--:--');
  setText('energyAdviceMainDay', t('energy-advice-unavailable'));
  setText('energyAdviceMainPrice', '');
  setText('energyAdviceEvaluation', error?.message === 'energy_logger_policy_not_passive'
    ? t('energy-advice-policy-error')
    : t('energy-advice-check-config'));
}

export function createEnergyAdviceController() {
  let timerId = null;
  let lastPayload = null;
  let busy = false;
  let selectedHours = initialWindowHours();

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
  }

  function stop() {
    clearInterval(timerId);
    timerId = null;
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
