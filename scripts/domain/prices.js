/**
 * Price analysis and smart insight engine.
 * Provides dynamic thresholds, price classification, best-window detection,
 * and insight stabilization to prevent flicker near threshold boundaries.
 */

import { LIVE_STATE, priceHistoryBuffer, insightState, STABLE_TICKS } from '../core/state.js';
import { isNum } from '../core/formatters.js';
import { CONTRACT_CFG, CFG } from '../config/resolveConfig.js';

const PRICE_HISTORY_MAX = 672; // 7 days × 96 quarter-hour slots
const LEGACY_PRICE_HISTORY_MAX = 168; // Untimestamped callers retain the historic 7 × 24 limit.
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;
const DEFAULT_SLOT_MS = HOUR_MS;
const CONTINUOUS_TOLERANCE_MS = 120000;

/** @type {Map<number, number>} Timestamped rolling price history (ts -> ct). */
const priceHistoryByTs = new Map();

function syncTimestampedHistoryBuffer() {
  const entries = Array.from(priceHistoryByTs.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-PRICE_HISTORY_MAX);

  priceHistoryByTs.clear();
  entries.forEach(([ts, ct]) => priceHistoryByTs.set(ts, ct));

  priceHistoryBuffer.length = 0;
  entries.forEach(([, ct]) => priceHistoryBuffer.push(ct));
}

/**
 * Appends forecast prices to the rolling history buffer.
 *
 * Entries with a timestamp are de-duplicated by price slot, so a fast dashboard
 * refresh cannot fill the 7-day history with repeated copies of the same
 * forecast. Untimestamped entries keep the old append-only behaviour for
 * backwards compatibility with tests and utility callers.
 */
export function pushPriceHistory(forecast) {
  if (!Array.isArray(forecast)) return;

  // Tests and debug code may clear the exported array directly. Keep the
  // private timestamp index in sync with that external reset.
  if (priceHistoryBuffer.length === 0 && priceHistoryByTs.size > 0) {
    priceHistoryByTs.clear();
  }

  const timestamped = forecast.filter(x => x && isNum(x.ts) && isNum(x.ct));
  if (timestamped.length > 0) {
    timestamped.forEach(x => {
      priceHistoryByTs.set(Number(x.ts), Number(x.ct));
    });
    syncTimestampedHistoryBuffer();
    return;
  }

  forecast.forEach(x => {
    if (x && isNum(x.ct)) priceHistoryBuffer.push(Number(x.ct));
  });
  if (priceHistoryBuffer.length > LEGACY_PRICE_HISTORY_MAX) {
    priceHistoryBuffer.splice(0, priceHistoryBuffer.length - LEGACY_PRICE_HISTORY_MAX);
  }
}

function validForecastItems(items = LIVE_STATE.priceForecast) {
  return (items || [])
    .filter(x => x && isNum(x.ts) && isNum(x.ct))
    .sort((a, b) => Number(a.ts) - Number(b.ts));
}

/** Infers the active price-slot duration (15 minutes for quarter prices, 60 for legacy data). */
export function inferPriceIntervalMs(items = LIVE_STATE.priceForecast) {
  const sorted = validForecastItems(items);
  const explicit = sorted
    .map(x => Number(x.intervalMinutes) * MINUTE_MS)
    .filter(ms => Number.isFinite(ms) && ms >= 5 * MINUTE_MS && ms <= 2 * HOUR_MS);

  if (explicit.length) {
    explicit.sort((a, b) => a - b);
    return explicit[Math.floor(explicit.length / 2)];
  }

  const diffs = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = Number(sorted[i].ts) - Number(sorted[i - 1].ts);
    // Larger differences are forecast gaps, not slot durations.
    if (diff >= 5 * MINUTE_MS && diff <= 90 * MINUTE_MS) diffs.push(diff);
  }
  if (!diffs.length) return DEFAULT_SLOT_MS;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function itemDurationMs(item, fallbackMs) {
  const explicitEnd = Number(item?.endTs) - Number(item?.ts);
  if (Number.isFinite(explicitEnd) && explicitEnd > 0 && explicitEnd <= 2 * HOUR_MS) return explicitEnd;
  const explicitMinutes = Number(item?.intervalMinutes) * MINUTE_MS;
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0 && explicitMinutes <= 2 * HOUR_MS) return explicitMinutes;
  return fallbackMs;
}

/** Returns the timestamp of the slot containing `nowTs`. */
export function currentPriceSlotTs(items = LIVE_STATE.priceForecast, nowTs = Date.now()) {
  const sorted = validForecastItems(items);
  const fallbackMs = inferPriceIntervalMs(sorted);
  const active = sorted.find(x => {
    const end = Number(x.ts) + itemDurationMs(x, fallbackMs);
    return Number(x.ts) <= nowTs && nowTs < end;
  });
  if (active) return Number(active.ts);

  const beforeNow = sorted.filter(x => Number(x.ts) <= nowTs).pop();
  if (beforeNow) return Number(beforeNow.ts);
  return Math.floor(nowTs / fallbackMs) * fallbackMs;
}

/**
 * Returns dynamic cheap/expensive thresholds based on historical price distribution.
 * Falls back to hardcoded defaults when history is thin (< 12 samples).
 */
export function getDynamicThresholds() {
  if (priceHistoryBuffer.length < 12) {
    return { cheapCt: 8, expensiveCt: 25, highDeltaCt: 4, minDeltaCt: 8 };
  }

  const sorted = [...priceHistoryBuffer].sort((a, b) => a - b);
  const n = sorted.length;
  const p20 = sorted[Math.floor(n * 0.20)];
  const p80 = sorted[Math.floor(n * 0.80)];
  const median = sorted[Math.floor(n * 0.50)];

  return {
    cheapCt: Math.min(p20, 10),
    expensiveCt: Math.max(p80, 18),
    highDeltaCt: Math.max(3, (p80 - median) * 0.55),
    minDeltaCt: Math.max(5, (p80 - median) * 1.0)
  };
}

/** Builds price context: avg, min, max, cheapest future hour, cheap/expensive flags. */
function getPriceContext(priceCt) {
  const now = Date.now();

  const future = (LIVE_STATE.priceForecast || [])
    .filter(x => x && isNum(x.ts) && isNum(x.ct) && x.ts >= now - 30 * 60000)
    .sort((a, b) => a.ts - b.ts);

  if (!future.length || !isNum(priceCt)) {
    return {
      future,
      avg: null,
      min: null,
      max: null,
      cheapest: null,
      expensiveNow: false,
      cheapNow: false
    };
  }

  const vals = future.map(x => x.ct);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const cheapest = future.reduce((a, x) => (!a || x.ct < a.ct ? x : a), null);
  const thr = getDynamicThresholds();

  const expensiveNow =
    priceCt >= thr.expensiveCt ||
    (isNum(avg) && priceCt > avg + thr.highDeltaCt) ||
    (isNum(min) && priceCt > min + thr.minDeltaCt);

  const cheapNow =
    priceCt <= thr.cheapCt ||
    (isNum(min) && priceCt <= min + 1.5);

  return { future, avg, min, max, cheapest, expensiveNow, cheapNow };
}

/** Classifies the current price level: 'negative' | 'cheap' | 'normal' | 'high' | 'peak'. */
export function classifyPrice(priceCt) {
  const ctx = getPriceContext(priceCt);

  if (!isNum(priceCt)) {
    return Object.assign(ctx, { level: 'unknown' });
  }

  let level = 'normal';

  if (priceCt < 0) level = 'negative';
  else if (ctx.cheapNow) level = 'cheap';

  if (ctx.expensiveNow) level = 'high';

  const thr = getDynamicThresholds();

  if (
    isNum(ctx.max) &&
    priceCt >= ctx.max - 1.5 &&
    priceCt >= thr.expensiveCt * 0.80
  ) {
    level = 'peak';
  }

  return Object.assign(ctx, { level });
}

/**
 * Finds the cheapest consecutive window of `hoursNeeded` clock-hours in the forecast.
 * With quarter-hour prices, one requested hour therefore contains four slots.
 * Returns null when no suitable window exists.
 */
export function bestWindow(hoursNeeded = 2) {
  const requestedHours = Number.isFinite(Number(hoursNeeded))
    ? Math.max(1, Math.min(24, Math.round(Number(hoursNeeded))))
    : 2;
  const targetDurationMs = requestedHours * HOUR_MS;
  const all = validForecastItems();
  const slotMs = inferPriceIntervalMs(all);
  const currentSlotTs = currentPriceSlotTs(all);
  const future = all.filter(x => Number(x.ts) >= currentSlotTs);
  if (!future.length) return null;

  let best = null;

  for (let i = 0; i < future.length; i++) {
    const block = [];
    let durationMs = 0;
    let expectedTs = Number(future[i].ts);

    for (let j = i; j < future.length; j++) {
      const item = future[j];
      if (Math.abs(Number(item.ts) - expectedTs) >= CONTINUOUS_TOLERANCE_MS) break;

      const duration = itemDurationMs(item, slotMs);
      if (durationMs + duration > targetDurationMs + CONTINUOUS_TOLERANCE_MS) break;
      block.push(item);
      durationMs += duration;
      expectedTs = Number(item.ts) + duration;

      if (Math.abs(durationMs - targetDurationMs) < CONTINUOUS_TOLERANCE_MS) {
        const avg = block.reduce((a, x) => a + Number(x.ct), 0) / block.length;
        if (!best || avg < best.avg) {
          best = {
            start: Number(block[0].ts),
            end: expectedTs,
            avg,
            items: [...block],
            intervalMinutes: Math.round(slotMs / MINUTE_MS),
            slotCount: block.length,
          };
        }
        break;
      }
    }
  }

  if (best) {
    const referenceAvg = future.reduce((sum, x) => sum + Number(x.ct), 0) / future.length;
    best.referenceAvg = referenceAvg;
    best.savingCt = Math.max(0, referenceAvg - best.avg);
  }
  return best;
}

/**
 * Expands a cheapest block to the full adjacent cheap plateau.
 *
 * Kept available for optional UI/debug use, but NOT used by activeDecisionWindow,
 * because usageWindowHours should highlight exactly that number of bars.
 */
const MIN_TOLERANCE_CT = 0.3;
const MAX_TOLERANCE_CT = 3.0;

export function expandCheapPlateau(block) {
  if (!block || !Array.isArray(block.items) || !block.items.length || !isNum(block.avg)) {
    return block;
  }

  const future = (LIVE_STATE.priceForecast || [])
    .filter(x => x && isNum(x.ts) && isNum(x.ct) && x.ts >= Date.now() - 30 * 60000)
    .sort((a, b) => a.ts - b.ts);

  if (!future.length) return block;
  const slotMs = inferPriceIntervalMs(future);

  const prices = future.map(x => x.ct);
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cheapHalf = sorted.filter(p => p <= median);

  const cheapSpread = cheapHalf.length > 1
    ? cheapHalf[cheapHalf.length - 1] - cheapHalf[0]
    : 0;

  const toleranceCt = Math.min(
    MAX_TOLERANCE_CT,
    Math.max(MIN_TOLERANCE_CT, cheapSpread * 0.5 + 0.3)
  );

  const startIdx = future.findIndex(x => x.ts === block.items[0].ts);
  const endIdx = future.findIndex(x => x.ts === block.items[block.items.length - 1].ts);

  if (startIdx < 0 || endIdx < 0) return block;

  let left = startIdx;
  let right = endIdx;
  const maxPlateauCt = block.avg + toleranceCt;

  while (left > 0) {
    const prev = future[left - 1];
    const current = future[left];
    const continuous = Math.abs(current.ts - prev.ts - itemDurationMs(prev, slotMs)) < CONTINUOUS_TOLERANCE_MS;

    if (!continuous || prev.ct > maxPlateauCt) break;
    left--;
  }

  while (right < future.length - 1) {
    const current = future[right];
    const next = future[right + 1];
    const continuous = Math.abs(next.ts - current.ts - itemDurationMs(current, slotMs)) < CONTINUOUS_TOLERANCE_MS;

    if (!continuous || next.ct > maxPlateauCt) break;
    right++;
  }

  const items = future.slice(left, right + 1);
  const avg = items.reduce((a, x) => a + x.ct, 0) / items.length;

  return Object.assign({}, block, {
    start: items[0].ts,
    end: items[items.length - 1].ts + itemDurationMs(items[items.length - 1], slotMs),
    avg,
    items,
    plateauLength: items.length,
    toleranceCt
  });
}

/**
 * Returns the best decision window.
 *
 * Important:
 * This uses the raw bestWindow result, not expandCheapPlateau().
 * That means usageWindowHours: 3 highlights exactly 3 bars.
 */
export function activeDecisionWindow(hoursNeeded = CFG.usageWindowHours) {
  const all = validForecastItems();
  const slotMs = inferPriceIntervalMs(all);
  const currentSlotTs = currentPriceSlotTs(all);

  if (String(hoursNeeded).toLowerCase().trim() === 'all') {
    const future = all.filter(x => Number(x.ts) >= currentSlotTs);

    if (!future.length) return null;

    const avg = future.reduce((a, x) => a + x.ct, 0) / future.length;
    return {
      start: future[0].ts,
      end: future[future.length - 1].ts + itemDurationMs(future[future.length - 1], slotMs),
      avg,
      referenceAvg: avg,
      savingCt: 0,
      items: future,
      highlightStart: future[0].ts,
      highlightEnd: future[future.length - 1].ts + itemDurationMs(future[future.length - 1], slotMs),
      requestedHours: 'all',
      highlightedHours: (future[future.length - 1].ts + itemDurationMs(future[future.length - 1], slotMs) - future[0].ts) / HOUR_MS,
      highlightedSlots: future.length,
      intervalMinutes: Math.round(slotMs / MINUTE_MS),
      currentSlotTs,
      currentIsInsideHighlight: true
    };
  }

  const n = Number.isFinite(Number(hoursNeeded))
    ? Math.max(1, Math.min(24, Math.round(Number(hoursNeeded))))
    : 3;

  const block = bestWindow(n);
  if (!block) return null;

  // Highlight exactly the configured usage window. Do not pull the current
  // slot into the highlight just because the best window starts soon; for a
  // 1-hour window that would add an extra slot. If the current slot
  // is actually part of the best window, it is included naturally because
  // block.start <= currentHourTs < block.end.
  return Object.assign({}, block, {
    highlightStart: block.start,
    highlightEnd: block.end,
    requestedHours: n,
    highlightedHours: (block.end - block.start) / HOUR_MS,
    highlightedSlots: block.items.length,
    intervalMinutes: block.intervalMinutes || Math.round(slotMs / MINUTE_MS),
    currentSlotTs,
    currentIsInsideHighlight: currentSlotTs >= block.start && currentSlotTs < block.end
  });
}

function positiveLimit(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionalKwh(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Zonneplan Zonnebonus context — determines feed-in reward and export eligibility.
 *
 * The annual export cap is applied when a current-year export value is known.
 * If the yearly value cannot be read from Domoticz yet, the dashboard keeps the
 * previous optimistic behaviour and exposes `annualLimitKnown: false` instead
 * of hiding Zonnebonus advice on missing data.
 */
export function getZonnebonusContext(priceCt, solarW, localSolarW, isExporting, annualExportKwhInput = LIVE_STATE.gridExportYearKwh) {
  const hasSolar =
    Math.max(Number(solarW) || 0, Number(localSolarW) || 0) >=
    CONTRACT_CFG.daylightSolarThresholdW;

  const annualLimitKwh = positiveLimit(CONTRACT_CFG.zonnebonusAnnualExportLimitKwh);
  const annualExportKwh = optionalKwh(annualExportKwhInput);
  const annualLimitKnown = annualLimitKwh !== null && annualExportKwh !== null;
  const remainingAnnualExportKwh = annualLimitKnown
    ? Math.max(0, annualLimitKwh - annualExportKwh)
    : null;
  const annualLimitReached = annualLimitKnown && annualExportKwh >= annualLimitKwh;
  const withinAnnualLimit = !annualLimitReached;

  const marketPriceCt = isNum(priceCt) ? Number(priceCt) : null;
  const baseFeedInCt = isNum(marketPriceCt)
    ? marketPriceCt + CONTRACT_CFG.zonnebonusInkoopvergoedingCt
    : null;

  const bonusApplies =
    CONTRACT_CFG.zonnebonusAlwaysOn &&
    withinAnnualLimit &&
    isNum(baseFeedInCt) &&
    baseFeedInCt > 0;

  const bonusCt = bonusApplies
    ? baseFeedInCt * CONTRACT_CFG.zonnebonusPct
    : 0;

  const feedInRewardCt = isNum(baseFeedInCt)
    ? baseFeedInCt + bonusCt
    : null;

  const eligible =
    bonusApplies &&
    hasSolar;

  const exportOpportunity =
    eligible &&
    (isExporting || (Number(solarW) || 0) >= CONTRACT_CFG.exportSolarThresholdW);

  return {
    hasSolar,
    marketPriceCt,
    baseFeedInCt,
    bonusCt,
    feedInRewardCt,
    eligible,
    exportOpportunity,
    annualLimitKwh,
    annualExportKwh,
    annualLimitKnown,
    remainingAnnualExportKwh,
    annualLimitReached,
    withinAnnualLimit
  };
}

/**
 * Stabilizes insight advice: a candidate must appear STABLE_TICKS consecutive
 * refreshes before it replaces the currently displayed advice.
 */
export function stableAdvice(candidate) {
  insightState.buffer.push(candidate);

  if (insightState.buffer.length > STABLE_TICKS + 1) {
    insightState.buffer.shift();
  }

  const allSame = insightState.buffer.every(
    x => x.actionKey === candidate.actionKey
  );

  if (allSame && insightState.buffer.length >= STABLE_TICKS) {
    insightState.lastShown = candidate;
    return candidate;
  }

  return insightState.lastShown || candidate;
}
