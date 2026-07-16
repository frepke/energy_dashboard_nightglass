/**
 * Refresh orchestration for distribution/prices and polling lifecycle.
 */

import { CFG } from '../config/resolveConfig.js';
import { $ } from '../core/dom.js';
import { parseNum, parsePriceEuro, isNum, fmt, safeDate, formatDateTime, formatTime } from '../core/formatters.js';
import { LIVE_STATE, PRICE_HISTORY_KEY, setState } from '../core/state.js';
import { pushPriceHistory } from '../domain/prices.js';
import {
  api,
  apiLive,
  ensureDeviceIds,
  fetchYearGas,
  fetchYearGridExport,
  findForecastDevice,
} from '../services/domoticzService.js';
import {
  setElecBadge,
  setGasBadge,
  renderLimitBadge,
} from '../ui/cards.js';
import { updateSmartInsight } from '../ui/smartInsight.js';
import { renderDistribution, renderGasYear } from '../ui/distributionView.js';
import {
  renderBars,
  markBestWindowBars,
  colorFor,
} from '../ui/chart.js';
import { t } from '../i18n.js';

// How many past hours to include in the price chart (excluding the current hour).
const HISTORY_HOURS = 4;

function priceFromDevice(d) {
  const raw = Number.parseFloat(d && d.price);
  return (!Number.isNaN(raw) && raw !== 1000) ? raw : null;
}

function livePriceFromDevice(d) {
  if (!d) return null;
  const n = parseNum(d.Data || d.sValue || d.Status);
  return isNum(n) ? n : null;
}

const GRID_EXPORT_YEAR_REFRESH_MS = 60 * 60_000;

function parseLimitPct(device) {
  if (!device) return null;
  const raw = String(device.Data || device.sValue || device.Status || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'on') return 100;
  if (raw === 'off') return 0;
  const n = parseNum(raw);
  return Number.isNaN(n) ? null : Math.max(0, Math.min(100, Math.round(n)));
}

export function createRefreshController(setStatus) {
  let forecastDeviceId = CFG.forecastIdx || '';
  let pollTimer = null;
  let refreshBusy = false;
  let lastForecastSignature = '';
  let gridExportYearLoadedKey = '';
  let gridExportYearLoadedAt = 0;
  let lastDistributionView = null;
  let lastPriceView = null;
  let lastGasNow = null;
  let lastForecastUpdated = null;

  function renderUpdatedLabel() {
    const el = $('#updated');
    if (!el) return;
    el.textContent = t('updated-prefix') + (lastForecastUpdated || formatDateTime(new Date()));
  }

  async function refreshDistribution() {
    const ids = await ensureDeviceIds();
    const idList = Object.values(ids).filter(x => x && String(x) !== '-1');
    if (!idList.length) throw new Error('no energy devices');

    const data = await api({ param: 'getdevices', rid: idList.join(',') }, 0);
    const by = {};
    (data.result || []).forEach(d => { by[String(d.idx)] = d; });

    const p1 = by[String(ids.p1)];
    const sol = by[String(ids.solar)];
    const gas = by[String(ids.gas)];
    const use = by[String(ids.usage)];
    const ssDev = by[String(ids.selfSufficiency)];
    const scDev = by[String(ids.selfConsumption)];
    const elecPriceDev = by[String(ids.electricityPrice)];
    const gasPriceDev = by[String(ids.gasPrice)];
    const invLimitDev = by[String(ids.inverterLimit)];

    if (!p1 || !sol) throw new Error('P1/Solar device missing');

    const imp = parseNum(p1.Usage);
    const exp = parseNum(p1.UsageDeliv);
    const solarW = parseNum(sol.Usage);
    const gridNet = imp - exp;
    const houseW = use
      ? parseNum(use.Usage || use.Data)
      : (gridNet >= 0 ? solarW + gridNet : Math.max(0, solarW - Math.abs(gridNet)));
    const localSolarW = gridNet >= 0 ? solarW : houseW;

    const importToday = parseNum(p1.CounterToday);
    const exportToday = parseNum(p1.CounterDelivToday);
    const netToday = importToday - exportToday;
    const solarToday = parseNum(sol.CounterToday || sol.Counter || sol.Data);
    const houseToday = use
      ? parseNum(use.CounterToday || use.Counter || use.Data)
      : Math.max(0, solarToday - exportToday + importToday);
    const localSolarToday = Math.max(0, solarToday - exportToday);

    const selfSuff = ssDev
      ? Math.round(parseNum(ssDev.Data || ssDev.sValue || ssDev.Counter) * 10) / 10
      : Math.round((houseToday ? localSolarToday / houseToday * 100 : 0) * 10) / 10;
    const selfCons = scDev
      ? Math.round(parseNum(scDev.Data || scDev.sValue || scDev.Counter) * 10) / 10
      : Math.round((solarToday ? localSolarToday / solarToday * 100 : 0) * 10) / 10;

    const gridPrice = elecPriceDev ? livePriceFromDevice(elecPriceDev) : priceFromDevice(p1);
    const solarPrice = priceFromDevice(sol);
    const gasPrice = gasPriceDev ? livePriceFromDevice(gasPriceDev) : priceFromDevice(gas);
    const gasToday = gas ? parseNum(gas.CounterToday || gas.Data) : 0;
    const limitPct = parseLimitPct(invLimitDev);

    setState({
      gridW:       Math.abs(gridNet),
      gridDir:     gridNet >= 0 ? 'import' : 'export',
      houseW,
      solarW,
      localSolarW,
      netToday,
      limitPct,
      gridPriceCt: isNum(gridPrice) ? Number(gridPrice) * 100 : LIVE_STATE.gridPriceCt,
      updatedAt:   Date.now(),
    });

    lastDistributionView = {
      gridNet,
      houseW,
      solarW,
      localSolarW,
      importToday,
      exportToday,
      netToday,
      houseToday,
      solarToday,
      selfSuff,
      selfCons,
      gasToday:   gas ? gasToday : null,
      gridPrice,
      solarPrice,
      gasPrice,
      limitPct,
    };
    renderDistribution(lastDistributionView);

    const exportYearKey = String(ids.p1) + ':' + new Date().getFullYear();
    const exportYearAgeMs = Date.now() - gridExportYearLoadedAt;
    const shouldRefreshYearExport =
      ids.p1 &&
      String(ids.p1) !== '-1' &&
      (gridExportYearLoadedKey !== exportYearKey || exportYearAgeMs >= GRID_EXPORT_YEAR_REFRESH_MS);

    if (shouldRefreshYearExport) {
      const yearExport = await fetchYearGridExport(ids.p1);
      setState({ gridExportYearKwh: yearExport });
      gridExportYearLoadedKey = exportYearKey;
      gridExportYearLoadedAt = Date.now();
    }

    updateSmartInsight();

    if (gas && ids.gas && $('#gasYear').dataset.loaded !== String(ids.gas)) {
      const y = await fetchYearGas(ids.gas);
      setState({ gasYearValue: y });
      $('#gasYear').dataset.loaded = String(ids.gas);
      renderGasYear(y);
    }
  }

  async function refreshPrices() {
    forecastDeviceId = await findForecastDevice(forecastDeviceId);
    if (!forecastDeviceId) {
      $('#updated').textContent = t('updated-missing');
      return;
    }

    const d = await apiLive({ param: 'getdevices', rid: forecastDeviceId });
    const fd = (d.result || [])[0];
    if (!fd) return;

    let forecast;
    try {
      forecast = JSON.parse(fd.Data || fd.sValue || '{}');
    } catch (e) {
      throw new Error('invalid forecast JSON', { cause: e });
    }
    if (!Array.isArray(forecast.hours)) return;

    const now = new Date();
    now.setMinutes(0, 0, 0);
    const nowTs = now.getTime();

    const liveItems = forecast.hours
      .map(h => {
        const d = safeDate(h);
        const price = parsePriceEuro(h && h.price);
        return d && isNum(price)
          ? { d, ts: d.getTime(), p: Number(price), placeholder: false }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts);

    const historyStartTs = nowTs - HISTORY_HOURS * 3600000;

    let cachedItems;
    try {
      cachedItems = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]')
        .map(x => ({ d: new Date(x.ts), ts: Number(x.ts), p: Number(x.p), placeholder: false }))
        .filter(x => isNum(x.ts) && isNum(x.p) && !Number.isNaN(x.d));
    } catch {
      cachedItems = [];
    }

    const mergedByTs = new Map();
    cachedItems.forEach(x => mergedByTs.set(x.ts, x));
    liveItems.forEach(x => mergedByTs.set(x.ts, x));

    const items = Array.from(mergedByTs.values())
      .filter(x => x.ts >= nowTs - 72 * 3600000)
      .sort((a, b) => a.ts - b.ts);

    try {
      localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(items.map(x => ({ ts: x.ts, p: x.p })).slice(-120)));
    } catch {
      // storage unavailable
    }

    const slice = items.filter(x => x.ts >= historyStartTs);

    const vals = slice.map(x => x.p).filter(isNum);
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 1;
    const current = slice.find(x => x.ts === nowTs);

    const priceForecast = slice
      .filter(x => x && isNum(x.ts) && isNum(x.p) && x.ts >= nowTs)
      .map(x => ({ ts: x.ts, ct: Number(x.p) * 100 }));
    const cheapestFuture = priceForecast.reduce((best, item) => {
      if (!best || item.ct < best.ct) return item;
      return best;
    }, null);

    const sig = slice.map(x => x.ts + ':' + (isNum(x.p) ? x.p : 'x')).join('|') + '|' + nowTs;
    if (sig !== lastForecastSignature) {
      pushPriceHistory(priceForecast);
    }
    setState({
      priceForecast,
      cheapestFuture,
      currentPriceCt: current && isNum(current.p) ? Number(current.p) * 100 : null,
    });

    lastPriceView = { slice, nowTs, min, max, current };

    if (sig !== lastForecastSignature) {
      lastForecastSignature = sig;
      renderBars(slice, nowTs, min, max);
      markBestWindowBars();
      if (current && isNum(current.p)) setElecBadge(current.p, colorFor(current.p, min, max));
    } else if (current && isNum(current.p)) {
      setElecBadge(current.p, colorFor(current.p, min, max));
    }

    lastForecastUpdated = forecast.updated || null;
    renderUpdatedLabel();
    if (isNum(forecast.gas_now)) {
      lastGasNow = forecast.gas_now;
      setGasBadge(forecast.gas_now);
    }
    updateSmartInsight();
  }

  async function refreshAll(reason) {
    if (refreshBusy) return;
    refreshBusy = true;
    let ok = true;
    const msg = [];
    try {
      try {
        await refreshDistribution();
        msg.push('energie');
      } catch (e) {
        ok = false;
        msg.push(e.message);
      }
      try {
        await refreshPrices();
        if (forecastDeviceId) msg.push('prijzen');
      } catch (e) {
        ok = false;
        msg.push(e.message);
      }
      setStatus(
        ok,
        (reason === 'ws' ? t('status-push-updated') : t('status-live-updated'))
          + formatTime(new Date())
          + (ok ? '' : ' - ' + msg.join(' / ')),
      );
    } finally {
      refreshBusy = false;
    }
  }

  function startPolling(intervalSeconds = CFG.refresh) {
    const seconds = Number.isFinite(Number(intervalSeconds)) && Number(intervalSeconds) > 0
      ? Number(intervalSeconds)
      : CFG.refresh;
    clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshAll('poll'), seconds * 1000);
    return seconds;
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function getForecastDeviceId() {
    return forecastDeviceId;
  }

  function retranslateLiveLabels() {
    if (lastDistributionView) {
      renderDistribution(lastDistributionView);
    } else {
      $('#localSolarW').textContent = t('on-site-prefix') + fmt.w(LIVE_STATE.localSolarW);
      if (isNum(LIVE_STATE.netToday)) {
        $('#gridNet').textContent = t('net-prefix') + (LIVE_STATE.netToday < 0 ? '↑' : '↓') + ' ' + fmt.kwh(Math.abs(LIVE_STATE.netToday));
      }
      if (LIVE_STATE.limitPct === null || LIVE_STATE.limitPct === undefined || LIVE_STATE.limitPct >= 100) {
        $('#solarStatus').textContent = t('today');
      }
      renderLimitBadge(LIVE_STATE.limitPct);
    }

    if (lastPriceView) {
      const { slice, nowTs, min, max, current } = lastPriceView;
      renderBars(slice, nowTs, min, max);
      markBestWindowBars();
      if (current && isNum(current.p)) setElecBadge(current.p, colorFor(current.p, min, max));
      renderUpdatedLabel();
      if (isNum(lastGasNow)) setGasBadge(lastGasNow);
    }

    if (isNum(LIVE_STATE.gasYearValue)) {
      $('#gasYear').textContent = fmt.m3(LIVE_STATE.gasYearValue) + ' ' + t('this-year');
    }
  }

  return {
    refreshAll,
    startPolling,
    stopPolling,
    getForecastDeviceId,
    retranslateLiveLabels,
  };
}
