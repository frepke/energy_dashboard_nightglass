/** Read-only energy-logger forecast card. */

import { $ } from '../core/dom.js';
import { activeLocale } from '../core/formatters.js';
import { ENERGY_LOGGER_CFG } from '../config/resolveConfig.js';
import { fetchEnergyAdvice } from '../services/energyLoggerService.js';
import { t } from '../i18n.js';

const WINDOW_KEYS = ['1h', '2h', '3h', '4h', '6h'];

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

function formatLocalDateTime(value, options) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(activeLocale(), options);
}

function formatWindow(window) {
  const start = window?.start_local || window?.start_utc;
  const end = window?.end_local || window?.end_utc;
  if (!start || !end) return { day: '--', time: '--' };

  return {
    day: formatLocalDateTime(start, { weekday: 'short', day: 'numeric', month: 'short' }),
    time: `${formatLocalDateTime(start, { hour: '2-digit', minute: '2-digit' })}–${formatLocalDateTime(end, { hour: '2-digit', minute: '2-digit' })}`,
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

function renderWindowList(windows) {
  const container = $('#energyAdviceWindows');
  if (!container) return;
  container.replaceChildren();

  WINDOW_KEYS.forEach(key => {
    const window = windows?.[key];
    if (!window) return;
    const label = formatWindow(window);
    const item = document.createElement('div');
    item.className = 'energy-advice-window';
    item.innerHTML = `
      <span class="energy-advice-window__duration">${key}</span>
      <strong>${label.time}</strong>
      <small>${label.day}</small>
    `;
    item.title = `${key} · ${label.day} ${label.time} · ${formatCt(window.average_marginal_price_eur_kwh)}`;
    container.appendChild(item);
  });
}

export function renderEnergyAdvice(payload) {
  const panel = $('#energyAdvice');
  if (!panel) return;

  const run = payload.latest_run || {};
  const totals = payload.totals || {};
  const windows = payload.best_consumption_windows || {};
  const evaluation = payload.evaluation || {};
  const primary = windows['1h'] || windows['2h'] || windows['3h'] || Object.values(windows)[0];
  const primaryLabel = formatWindow(primary);
  const horizonEnd = payload.forecast_horizon?.last_end_utc;

  panel.dataset.state = 'live';
  setText('energyAdviceState', t('energy-advice-live'));
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

  renderWindowList(windows);
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

  async function refresh() {
    if (!ENERGY_LOGGER_CFG.enabled || busy) return;
    busy = true;
    try {
      lastPayload = await fetchEnergyAdvice();
      renderEnergyAdvice(lastPayload);
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
    if (lastPayload) renderEnergyAdvice(lastPayload);
    else if ($('#energyAdvice')?.dataset.state === 'error') renderEnergyAdviceError();
  }

  return { refresh, start, stop, retranslate };
}
