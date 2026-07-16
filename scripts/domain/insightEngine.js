/**
 * Smart Insight strategy engine.
 *
 * Provides structured decision context and strategy evaluation for the Smart
 * Insight bar. This module is pure logic — no DOM, no i18n dependencies.
 *
 * Design goals:
 *  - Cheapest-window-first policy for schedulable loads
 *  - Always-on Zonnebonus treated as background contract characteristic
 *  - EXPORT NOW only when no load-optimisation opportunity exists AND
 *    export advantage exceeds an explicit threshold
 *  - Stable, human-readable recommendations
 *
 * Exported API:
 *   buildInsightContext()           → full decision context from LIVE_STATE
 *   evaluateInsightStrategies(ctx)  → { primaryAction, confidence, reasonCodes }
 *   pickPrimaryInsight(ctx)         → adds secondaryContext to evaluation result
 */

import { LIVE_STATE }   from '../core/state.js';
import { isNum }        from '../core/formatters.js';
import { CONTRACT_CFG } from '../config/resolveConfig.js';
import {
  classifyPrice, getZonnebonusContext,
  activeDecisionWindow, getDynamicThresholds,
} from './prices.js';

// Minimum export advantage (ct/kWh) for EXPORT NOW to override load scheduling
export const EXPORT_STRONG_ADVANTAGE_CT = 5.0;

// Price delta thresholds for WAIT decisions
export const WAIT_THRESHOLD_CT        = 2.0;
const STRONG_WAIT_THRESHOLD_CT = 4.0;

// Current price within this many ct of best-window avg → use-if-needed
const NEAR_BEST_THRESHOLD_CT = 1.5;

// Treat a future best window as actionable almost immediately.
// A small grace prevents flicker right at the hour boundary, while avoiding
// the old behaviour where a window starting within 30 minutes was ignored.
const UPCOMING_WINDOW_GRACE_MS = 2 * 60000;
const SOON_WINDOW_MS = 30 * 60000;

/**
 * Gathers all inputs needed by the strategy engine from LIVE_STATE.
 * Pure function — no DOM, no side-effects.
 * @returns {object} Flat context object.
 */
export function buildInsightContext() {
  const gridW       = Math.abs(Number(LIVE_STATE.gridW) || 0);
  const houseW      = Math.max(0, Number(LIVE_STATE.houseW) || 0);
  const solarW      = Math.max(0, Number(LIVE_STATE.solarW) || 0);
  const localSolarW = Math.max(0, Number(LIVE_STATE.localSolarW) || 0);
  const isExporting = LIVE_STATE.gridDir === 'export';
  const isImporting = LIVE_STATE.gridDir === 'import';
  const priceCt     = isNum(LIVE_STATE.currentPriceCt) ? LIVE_STATE.currentPriceCt
                                                        : LIVE_STATE.gridPriceCt;

  const price     = classifyPrice(priceCt);
  const zonne     = getZonnebonusContext(priceCt, solarW, localSolarW, isExporting);
  const bestBlock = activeDecisionWindow();
  const bestAvg   = bestBlock && isNum(bestBlock.avg) ? bestBlock.avg : null;

  const nowTs         = Date.now();
  const currentHour   = new Date(nowTs);
  currentHour.setMinutes(0, 0, 0);
  const currentHourTs = currentHour.getTime();
  const bestStart     = bestBlock ? (bestBlock.highlightStart || bestBlock.start) : null;
  const bestEnd       = bestBlock ? (bestBlock.highlightEnd   || bestBlock.end)   : null;
  const bestStartHourTs = isNum(bestStart)
    ? (() => { const d = new Date(bestStart); d.setMinutes(0, 0, 0); return d.getTime(); })()
    : null;
  const bestEndHourTs = isNum(bestEnd)
    ? (() => { const d = new Date(bestEnd); d.setMinutes(0, 0, 0); return d.getTime(); })()
    : null;

  const inBestWindow = !!bestBlock && isNum(bestStartHourTs) && isNum(bestEndHourTs)
                     && currentHourTs >= bestStartHourTs && currentHourTs < bestEndHourTs
                     && isNum(priceCt) && isNum(bestAvg)
                     && priceCt <= bestAvg + NEAR_BEST_THRESHOLD_CT;
  const laterWindow  = !!bestBlock && isNum(bestStart)
                     && bestStart > nowTs + UPCOMING_WINDOW_GRACE_MS;
  const bestWindowStartsSoon = !!bestBlock && isNum(bestStart)
                             && bestStart > nowTs + UPCOMING_WINDOW_GRACE_MS
                             && bestStart <= nowTs + SOON_WINDOW_MS;

  const cheaperLater     = !!bestBlock && laterWindow
                         && isNum(priceCt) && isNum(bestAvg)
                         && bestAvg <= priceCt - WAIT_THRESHOLD_CT;
  const muchCheaperLater = !!bestBlock && laterWindow
                         && isNum(priceCt) && isNum(bestAvg)
                         && bestAvg <= priceCt - STRONG_WAIT_THRESHOLD_CT;
  const nowNearBest      = isNum(priceCt) && isNum(bestAvg)
                         && priceCt <= bestAvg + NEAR_BEST_THRESHOLD_CT;

  // Day boundary for today/tomorrow distinction
  const tomorrowStartTs = (() => { const d = new Date(nowTs); d.setHours(24, 0, 0, 0); return d.getTime(); })();

  // Is the current hour the cheapest of today's remaining forecast hours?
  const todayForecastHours = (LIVE_STATE.priceForecast || [])
    .filter(x => x && isNum(x.ts) && isNum(x.ct) && x.ts >= nowTs - 30 * 60000 && x.ts < tomorrowStartTs);
  const todayMinCt = todayForecastHours.length > 0
    ? Math.min(...todayForecastHours.map(x => x.ct))
    : null;
  const isTodayCheapestHour = isNum(priceCt) && isNum(todayMinCt) && priceCt <= todayMinCt + 0.1;

  // Is there any hour cheaper than the current price coming within the next 12 hours?
  // Does the best window belong to today or tomorrow?
  const bestWindowIsToday    = !!bestBlock && isNum(bestStart) && bestStart < tomorrowStartTs;
  const bestWindowIsTomorrow = !!bestBlock && isNum(bestStart) && bestStart >= tomorrowStartTs;

  const _thr = getDynamicThresholds();
  const currentIsFavourable = isNum(priceCt) && (
    (price.cheapNow && !cheaperLater && !nowNearBest)
    || inBestWindow
    || nowNearBest
    || (priceCt < _thr.expensiveCt * 0.72 && !cheaperLater)
  );

  // How much better is the best window vs the overall day average?
  // When this gain is small (flat-price day), inBestWindow is trivially true but not meaningful.
  const windowGainCt        = isNum(price.avg) && isNum(bestAvg) ? price.avg - bestAvg : 0;
  const windowIsSignificant = windowGainCt >= WAIT_THRESHOLD_CT;

  const hasSolarSurplus = isExporting && gridW > 100;
  const lowImport       = isImporting  && gridW < 600;

  // How much more is export worth than self-consumption right now?
  const exportAdvantage = isNum(zonne.feedInRewardCt) && isNum(priceCt)
                        ? zonne.feedInRewardCt - priceCt : null;
  const exportIsExceptional = isNum(exportAdvantage)
                            && exportAdvantage >= EXPORT_STRONG_ADVANTAGE_CT;

  return {
    // Power state
    gridW, houseW, solarW, localSolarW, isExporting, isImporting,
    // Price classification
    priceCt, price,
    // Zonnebonus / export
    zonne, hasSolarSurplus, exportAdvantage, exportIsExceptional,
    // Best window
    bestBlock, bestAvg, bestStart, bestEnd,
    inBestWindow, laterWindow, bestWindowStartsSoon, cheaperLater, muchCheaperLater,
    nowNearBest, currentIsFavourable, windowGainCt, windowIsSignificant, lowImport,
    // Day-awareness fields
    isTodayCheapestHour, bestWindowIsToday, bestWindowIsTomorrow,
    // Contract policy
    alwaysOnZonnebonus: CONTRACT_CFG.zonnebonusAlwaysOn,
    // Dynamic price thresholds
    _thr,
  };
}

/**
 * Evaluates all strategies and picks the best primary action.
 *
 * Priority order (cheapest-window-first policy):
 *  1. Negative current price            → use-now
 *  2. Best window ahead with neg avg    → wait
 *  3. Currently inside best window      → use-now  ← HARD RULE; overrides export
 *  4. Significantly cheaper later       → wait
 *  5. Current price near best window    → use-if-needed
 *  6. Favourable price conditions       → use-now
 *  7. High prices + high import         → hold
 *  8. Export advantage is exceptional   → export-now (only here, not before)
 *  9. Low import, expensive, cheaper later → wait
 * 10. Low solar, expensive              → hold / no-action
 * 11. Fallback                          → no-action
 *
 * @param {object} ctx - From buildInsightContext()
 * @returns {{ primaryAction: string, confidence: string, reasonCodes: string[] }}
 */
export function evaluateInsightStrategies(ctx) {
  const {
    priceCt, price, bestBlock, bestAvg,
    inBestWindow, laterWindow, bestWindowStartsSoon, cheaperLater, muchCheaperLater,
    nowNearBest, currentIsFavourable, windowIsSignificant, hasSolarSurplus,
    zonne, exportIsExceptional, lowImport,
    isImporting, solarW, gridW, _thr,
    isTodayCheapestHour, bestWindowIsToday,
  } = ctx;

  const reasonCodes = [];

  // 1. Negative current price — maximize consumption immediately
  if (isNum(priceCt) && priceCt < 0) {
    reasonCodes.push('negative-price');
    return { primaryAction: 'use-now', confidence: 'high', reasonCodes };
  }

  // 2. Best window later has a negative average — worth waiting for
  if (bestBlock && isNum(bestAvg) && bestAvg < 0 && laterWindow) {
    reasonCodes.push('best-window-negative-later');
    return { primaryAction: 'wait', confidence: 'high', reasonCodes };
  }

  // 3. Currently inside the cheapest window — HARD RULE
  // Only fires when the window is meaningfully cheaper than the day average
  // (guards against trivially-true "best window" on flat-price days).
  // In always-on Zonnebonus mode this explicitly overrides any export signal.
  if (inBestWindow && bestBlock && windowIsSignificant) {
    reasonCodes.push('in-best-window');
    return { primaryAction: 'use-now', confidence: 'high', reasonCodes };
  }

  // 4. A significantly cheaper window is coming later
  if (cheaperLater) {
    reasonCodes.push(bestWindowStartsSoon ? 'best-window-starts-soon' : 'cheaper-later');
    if (muchCheaperLater) reasonCodes.push('much-cheaper-later');
    return {
      primaryAction: 'wait',
      confidence: muchCheaperLater ? 'high' : 'medium',
      reasonCodes,
    };
  }

  // 4.5. Current hour is today's cheapest — prefer use-now over use-if-needed
  // Fires when current price equals today's minimum and no dramatically cheaper
  // window is coming (that case is handled by rule 4 above).
  // Does NOT fire when the best window is today — a cheaper hour still exists
  // later today, so rule 5 (use-if-needed) is more accurate.
  // Does NOT fire when tomorrow's best window is meaningfully cheaper than now —
  // in that case "wait" is the correct advice even though today's remaining hours
  // are all similarly priced.
  const tomorrowWindowIsCheaper = ctx.bestWindowIsTomorrow && laterWindow
    && isNum(priceCt) && isNum(bestAvg)
    && bestAvg <= priceCt - WAIT_THRESHOLD_CT;
  if (isTodayCheapestHour && !cheaperLater && !tomorrowWindowIsCheaper && !bestWindowIsToday && isNum(priceCt) && !price.expensiveNow) {
    reasonCodes.push('today-cheapest-hour');
    return { primaryAction: 'use-now', confidence: 'high', reasonCodes };
  }

  // 4.6. Today's cheapest hour but tomorrow is significantly cheaper — wait
  if (isTodayCheapestHour && tomorrowWindowIsCheaper) {
    reasonCodes.push('cheaper-tomorrow');
    return { primaryAction: 'wait', confidence: 'high', reasonCodes };
  }

  // 5. Current price is already close to the best window
  // Only fires when the window is genuinely good (not on expensive flat-price days).
  if (nowNearBest && bestBlock && !price.expensiveNow) {
    reasonCodes.push('now-near-best');
    return { primaryAction: 'use-if-needed', confidence: 'medium', reasonCodes };
  }

  // 6. Currently favourable price conditions
  // Not applied when prices are expensive — prevents "use now" on expensive-all-day scenarios.
  // Also not applied when a meaningfully cheaper window is coming (cheaperLater covers the
  // WAIT_THRESHOLD gap; nowNearBest covers the near-best gap — both already handled above).
  if (currentIsFavourable && !price.expensiveNow && !cheaperLater && !nowNearBest && (isImporting || solarW > 100)) {
    reasonCodes.push('currently-favourable');
    return { primaryAction: 'use-now', confidence: 'medium', reasonCodes };
  }

  // 7. High prices and large import — avoid flexible loads
  if (isImporting && (price.level === 'peak' || price.expensiveNow) && gridW > 900) {
    reasonCodes.push('high-price-high-import');
    return { primaryAction: 'hold', confidence: 'high', reasonCodes };
  }

  // 8. Export advantage is genuinely exceptional — only when no load optimisation is available
  // (Rules 3–6 already handled all load-optimisation opportunities above)
  if (hasSolarSurplus && zonne.eligible && exportIsExceptional) {
    reasonCodes.push('export-exceptional');
    return { primaryAction: 'export-now', confidence: 'medium', reasonCodes };
  }

  // 9. Low import, expensive now, cheaper window available later
  if (lowImport && price.expensiveNow && bestBlock && laterWindow) {
    reasonCodes.push('low-import-expensive');
    return { primaryAction: 'wait', confidence: 'low', reasonCodes };
  }

  // 10. Low solar generation, importing at near-expensive price
  if (solarW <= 30 && isImporting && isNum(priceCt) && priceCt >= _thr.expensiveCt * 0.72) {
    reasonCodes.push('low-solar-expensive');
    if (cheaperLater) {
      return { primaryAction: 'wait', confidence: 'medium', reasonCodes };
    }
    return {
      primaryAction: price.expensiveNow ? 'hold' : 'no-action',
      confidence: 'low',
      reasonCodes,
    };
  }

  // 11. Fallback
  reasonCodes.push('fallback');
  return { primaryAction: 'no-action', confidence: 'low', reasonCodes };
}

/**
 * Selects the primary insight and determines secondary context messaging.
 *
 * Secondary context codes:
 *   'export-attractive-context' — export is attractive but is not the main action
 *   'export-while-waiting'      — surplus can be exported profitably while waiting
 *   'plan-loads-later'          — schedule flexible loads in the next cheap window
 *
 * @param {object} ctx - From buildInsightContext()
 * @returns {{ primaryAction, confidence, reasonCodes, secondaryContext: string|null }}
 */
export function pickPrimaryInsight(ctx) {
  const evaluation = evaluateInsightStrategies(ctx);
  const { primaryAction } = evaluation;
  const { hasSolarSurplus, zonne, bestBlock, laterWindow } = ctx;

  let secondaryContext = null;

  if (primaryAction === 'use-now' || primaryAction === 'use-if-needed') {
    // Export is attractive but is secondary to the load-scheduling recommendation
    if (hasSolarSurplus && zonne.eligible && isNum(zonne.feedInRewardCt)) {
      secondaryContext = 'export-attractive-context';
    }
  } else if (primaryAction === 'wait') {
    // While waiting, it is useful to know surplus can be exported
    if (hasSolarSurplus && zonne.eligible) {
      secondaryContext = 'export-while-waiting';
    }
  } else if (primaryAction === 'export-now') {
    // Suggest scheduling flexible loads in the upcoming cheap window
    if (bestBlock && laterWindow) {
      secondaryContext = 'plan-loads-later';
    }
  }

  return Object.assign({}, evaluation, { secondaryContext });
}
