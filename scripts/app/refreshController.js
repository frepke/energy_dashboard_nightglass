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

// How many past clock-hours to include in the price chart.
const HISTORY_HOURS = 4;
const MINUTE_MS = 60000;

function parseForecastDate(raw) {
  if (!raw) return null;
  const d = new Date(String(raw).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeIntervalMinutes(value, fallback = 60) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 5 && n <= 120 ? Math.round(n) : fallback;
}

function floorToPriceSlot(timestamp, intervalMinutes) {
  const intervalMs = normalizeIntervalMinutes(intervalMinutes, 15) * MINUTE_MS;
  return Math.floor(Number(timestamp) / intervalMs) * intervalMs;
}

function inferForecastIntervalMinutes(forecast, fallback = 15) {
  const rows = Array.isArray(forecast?.hours) ? forecast.hours : [];
  const explicit = normalizeIntervalMinutes(
    forecast?.interval_minutes,
    normalizeIntervalMinutes(rows[0]?.interval_minutes, 0),
  );
  if (explicit) return explicit;

  const timestamps = rows.map(safeDate).filter(Boolean).map(d => d.getTime()).sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < timestamps.length; i++) {
    const minutes = (timestamps[i] - timestamps[i - 1]) / MINUTE_MS;
    if (minutes >= 5 && minutes <= 90) diffs.push(minutes);
  }
  if (!diffs.length) return normalizeIntervalMinutes(fallback, 15);
  diffs.sort((a, b) => a - b);
  return normalizeIntervalMinutes(diffs[Math.floor(diffs.length / 2)], fallback);
}

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
  /** Price-slot timestamp (ms) at which prices were last fetched; 0 = never. */
  let lastPriceFetchSlotTs = 0;
  let lastPriceFetchAt = 0;
  let priceIntervalMinutes = 15;

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

    const nowActualTs = new Date().getTime();
    priceIntervalMinutes = inferForecastIntervalMinutes(forecast, priceIntervalMinutes);

    const liveItems = forecast.hours
      .map(h => {
        const d = safeDate(h);
        const price = parsePriceEuro(h && h.price);
        if (!d || !isNum(price)) return null;

        const intervalMinutes = normalizeIntervalMinutes(h?.interval_minutes, priceIntervalMinutes);
        const explicitEnd = parseForecastDate(h?.local_end_datetime || h?.end_datetime);
        const endTs = explicitEnd && explicitEnd.getTime() > d.getTime()
          ? explicitEnd.getTime()
          : d.getTime() + intervalMinutes * MINUTE_MS;
        const sell = parsePriceEuro(h?.sell_price_ex_tax);

        return {
          d,
          ts: d.getTime(),
          endTs,
          intervalMinutes,
          p: Number(price),
          sell: isNum(sell) ? Number(sell) : null,
          isCurrent: h?.is_current === true,
          placeholder: false,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts);

    const currentLive = liveItems.find(x => x.isCurrent || (x.ts <= nowActualTs && nowActualTs < x.endTs));
    const nowTs = currentLive?.ts ?? floorToPriceSlot(nowActualTs, priceIntervalMinutes);

    const historyStartTs = nowTs - HISTORY_HOURS * 3600000;

    let cachedItems;
    try {
      cachedItems = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY) || '[]')
        .map(x => ({
          d: new Date(x.ts),
          ts: Number(x.ts),
          endTs: Number(x.endTs) || Number(x.ts) + normalizeIntervalMinutes(x.intervalMinutes, priceIntervalMinutes) * MINUTE_MS,
          intervalMinutes: normalizeIntervalMinutes(x.intervalMinutes, priceIntervalMinutes),
          p: Number(x.p),
          sell: isNum(x.sell) ? Number(x.sell) : null,
          placeholder: false,
        }))
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
      localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(items.map(x => ({
        ts: x.ts,
        endTs: x.endTs,
        intervalMinutes: x.intervalMinutes,
        p: x.p,
        sell: x.sell,
      })).slice(-480)));
    } catch {
      // storage unavailable
    }

    const slice = items.filter(x => x.ts >= historyStartTs);

    const vals = slice.map(x => x.p).filter(isNum);
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 1;
    const current = currentLive
      || slice.find(x => x.ts === nowTs)
      || [...liveItems].reverse().find(x => x.ts <= nowActualTs)
      || null;

    const priceForecast = slice
      .filter(x => x && isNum(x.ts) && isNum(x.p) && (Number(x.endTs) || x.ts) > nowActualTs)
      .map(x => ({
        ts: x.ts,
        endTs: x.endTs,
        intervalMinutes: x.intervalMinutes,
        ct: Number(x.p) * 100,
        sellCt: isNum(x.sell) ? Number(x.sell) * 100 : null,
      }));
    const cheapestFuture = priceForecast.reduce((best, item) => {
      if (!best || item.ct < best.ct) return item;
      return best;
    }, null);

    const sig = slice.map(x => [x.ts, x.endTs, isNum(x.p) ? x.p : 'x', isNum(x.sell) ? x.sell : 'x'].join(':')).join('|') + '|' + nowTs;
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

    lastForecastUpdated = fd.LastUpdate || forecast.updated || null;
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

      // Only fetch the pricing forecast when the current price slot has changed since
      // the last successful fetch.  This avoids redundant API calls on every
      // fast-cadence poll tick while still updating the chart when a new price
      // slot begins (or on the very first run / after a forced 'ws' push).
      const priceClockTs = Date.now();
      const currentSlotTs = floorToPriceSlot(priceClockTs, priceIntervalMinutes);
      const nearSlotBoundary = priceClockTs - currentSlotTs < 2 * MINUTE_MS;
      const boundaryRetryDue = nearSlotBoundary && priceClockTs - lastPriceFetchAt >= 20_000;
      const shouldFetchPrices = reason === 'ws'
        || lastPriceFetchSlotTs !== currentSlotTs
        || boundaryRetryDue;

      if (shouldFetchPrices) {
        try {
          await refreshPrices();
          lastPriceFetchSlotTs = currentSlotTs;
          lastPriceFetchAt = priceClockTs;
          if (forecastDeviceId) msg.push('prijzen');
        } catch (e) {
          ok = false;
          msg.push(e.message);
        }
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

  /**
   * Refreshes only live distribution data (P1, solar, gas) without fetching
   * the pricing forecast.  Intended for WebSocket delta pushes where the pushed
   * device is not the forecast device, reducing redundant API calls.
   *
   * Shares the `refreshBusy` guard with `refreshAll` so concurrent calls are
   * dropped safely.
   */
  async function refreshDistributionOnly() {
    if (refreshBusy) return;
    refreshBusy = true;
    let ok = true;
    let errMsg = '';
    try {
      try {
        await refreshDistribution();
      } catch (e) {
        ok = false;
        errMsg = e.message;
      }
      setStatus(
        ok,
        t('status-push-updated') + formatTime(new Date()) + (ok ? '' : ' - ' + errMsg),
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
    refreshDistributionOnly,
    startPolling,
    stopPolling,
    getForecastDeviceId,
    retranslateLiveLabels,
  };
}
