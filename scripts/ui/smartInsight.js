/**
 * Smart Insight rendering.
 */

import { $ } from '../core/dom.js';
import { isNum, fmt } from '../core/formatters.js';
import { t, applyTemplate } from '../i18n.js';
import { stableAdvice } from '../domain/prices.js';
import { buildInsightContext, pickPrimaryInsight } from '../domain/insightEngine.js';

/** Helper: replaces named placeholders {name} in a translation string. */
function fillTemplate(key, vars) {
  return applyTemplate(t(key), vars);
}

function fmtSignedW(value) {
  return fmt.w(value);
}

function fmtCtValue(value) {
  return fmt.ctValue(value);
}

function fmtHour(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function setPill(el, value, cls) {
  if (!el) return;
  el.textContent = value;
  el.classList.remove('is-hot', 'is-cool', 'is-best', 'is-negative',
    'is-action-now', 'is-action-wait', 'is-action-export', 'is-action-hold');
  if (cls) el.classList.add(cls);
}

/**
 * Maps the engine result and context to UI-ready output.
 * @param {{ primaryAction, secondaryContext, reasonCodes }} result
 * @param {object} ctx - From buildInsightContext()
 * @returns {{ msg, ico, mode, actionKey, actionClass, secondaryMsg }}
 */
function buildInsightOutput(result, ctx) {
  const { primaryAction, secondaryContext, reasonCodes } = result;
  const {
    priceCt, price, bestBlock, bestAvg, isImporting, solarW,
    inBestWindow, cheaperLater, muchCheaperLater, lowImport,
    bestWindowIsTomorrow,
  } = ctx;

  const bestLabel = bestBlock
    ? fmtHour(bestBlock.highlightStart || bestBlock.start) + '-'
      + fmtHour(bestBlock.highlightEnd || bestBlock.end)
    : '';

  let msg;
  let ico;
  let mode;
  let actionKey;
  let actionClass;
  let secondaryMsg = '';

  switch (primaryAction) {
    case 'use-now': {
      actionKey = 'use-now'; actionClass = 'is-action-now';
      if (isNum(priceCt) && priceCt < 0) {
        ico  = '↯'; mode = 'is-negative';
        msg  = inBestWindow && bestBlock
          ? fillTemplate('msg-use-negative-until', { time: fmtHour(bestBlock.highlightEnd || bestBlock.end) })
          : t('msg-use-negative');
      } else if (reasonCodes.includes('today-cheapest-hour')) {
        ico  = '€'; mode = 'is-use';
        msg  = t('msg-use-cheapest-hour');
      } else if (inBestWindow && bestBlock) {
        ico  = '€'; mode = 'is-use';
        msg  = t('msg-use-in-best-window');
      } else {
        ico  = '€'; mode = 'is-use';
        msg  = solarW > 300 && isImporting
          ? t('msg-use-solar-reducing')
          : t('msg-use-good-no-better');
      }
      break;
    }
    case 'use-if-needed': {
      ico = '€'; mode = 'is-use'; actionKey = 'use-if-needed'; actionClass = 'is-action-now';
      msg = t('msg-use-if-needed-near-best');
      break;
    }
    case 'wait': {
      ico = '⏱';
      mode        = muchCheaperLater || price.expensiveNow ? 'is-hold' : 'is-wait';
      actionKey   = 'wait';
      actionClass = muchCheaperLater || price.expensiveNow ? 'is-action-hold' : 'is-action-wait';
      if (reasonCodes.includes('low-solar-expensive')) {
        ico = '🌙';
        msg = fillTemplate('msg-wait-low-solar', { label: bestLabel, price: fmtCtValue(bestAvg) });
      } else if (reasonCodes.includes('low-import-expensive')) {
        msg = fillTemplate('msg-wait-low-later', { label: bestLabel, price: fmtCtValue(bestAvg) });
      } else if (bestWindowIsTomorrow && bestBlock) {
        msg = fillTemplate('msg-wait-tomorrow-window', { time: fmtHour(bestBlock.highlightStart || bestBlock.start) });
      } else if (reasonCodes.includes('best-window-starts-soon') && bestBlock) {
        msg = fillTemplate('msg-wait-starts-soon', { time: fmtHour(bestBlock.highlightStart || bestBlock.start), price: fmtCtValue(bestAvg) });
      } else {
        msg = fillTemplate('msg-wait-cheap-ahead', { label: bestLabel, price: fmtCtValue(bestAvg) });
      }
      break;
    }
    case 'hold': {
      ico = '⚠'; mode = 'is-hold'; actionKey = 'hold'; actionClass = 'is-action-hold';
      if (reasonCodes.includes('low-solar-expensive')) {
        ico = '🌙';
        msg = t('msg-avoid-low-solar');
      } else {
        msg = t('msg-avoid-high');
      }
      break;
    }
    case 'export-now': {
      ico = '☀'; mode = 'is-export'; actionKey = 'export-now'; actionClass = 'is-action-export';
      msg = cheaperLater
        ? fillTemplate('msg-export-later', { label: bestLabel, price: fmtCtValue(bestAvg) })
        : t('msg-export-exceptional');
      break;
    }
    default: { // no-action
      ico = '✓'; mode = 'is-good'; actionKey = 'no-action'; actionClass = '';
      if (lowImport && !price.expensiveNow) {
        msg = t('msg-no-action-low');
      } else if (price.expensiveNow && solarW <= 30 && isImporting) {
        ico = '🌙';
        msg = t('msg-avoid-low-solar');
      } else {
        msg = t('msg-no-action-fine');
      }
      break;
    }
  }

  // Secondary context message
  switch (secondaryContext) {
    case 'export-attractive-context':
      secondaryMsg = t('msg-ctx-export-attractive');
      break;
    case 'export-while-waiting':
      secondaryMsg = t('msg-ctx-export-while-waiting');
      break;
    case 'plan-loads-later':
      secondaryMsg = bestBlock
        ? fillTemplate('msg-ctx-plan-loads-later', { label: bestLabel })
        : t('msg-ctx-plan-loads-generic');
      break;
  }

  return { msg, ico, mode, actionKey, actionClass, secondaryMsg };
}

/**
 * Recomputes and renders the Smart Insight bar based on LIVE_STATE.
 * Call after every distribution or prices refresh.
 */
export function updateSmartInsight() {
  const box = $('#smartInsight');
  if (!box) return;

  const icon        = $('#smartInsightIcon');
  const text        = $('#smartInsightText');
  const ctxEl       = $('#smartInsightContext');
  const gridPill    = $('#smartGridPill');
  const solarPill   = $('#smartSolarPill');
  const pricePill   = $('#smartPricePill');
  const nextPill    = $('#smartNextPill');

  // Gather context and evaluate strategy
  const ctx    = buildInsightContext();
  const result = pickPrimaryInsight(ctx);

  const {
    gridW, solarW, isExporting, priceCt, price,
    zonne, hasSolarSurplus, bestBlock, bestAvg, inBestWindow,
    currentIsFavourable, nowNearBest,
  } = ctx;

  // Status pills
  const gridText = t('pill-grid') + ' ' + (isExporting ? t('pill-export') : t('pill-import')) + ' ' + fmtSignedW(gridW);
  const feedText = zonne.eligible
    ? t('pill-export') + ' ' + fmtCtValue(zonne.feedInRewardCt)
    : t('pill-solar') + ' ' + fmtSignedW(solarW);
  setPill(gridPill,  gridText,
    isExporting ? 'is-cool' : (gridW > 1200 ? 'is-hot' : ''));
  setPill(solarPill, feedText,
    hasSolarSurplus && zonne.eligible ? 'is-best' : (solarW > 500 ? 'is-cool' : ''));
  setPill(pricePill, t('pill-price') + ' ' + fmtCtValue(priceCt),
    price.level === 'negative'
      ? 'is-negative'
      : (currentIsFavourable || nowNearBest)
        ? 'is-cool'
        : (price.level === 'high' || price.level === 'peak' ? 'is-hot' : ''));

  // Build display output from engine result
  const out = buildInsightOutput(result, ctx);

  box.classList.remove('is-warn', 'is-solar', 'is-action', 'is-good', 'is-negative', 'is-use', 'is-wait', 'is-export', 'is-hold');

  const candidate = {
    mode:        out.mode,
    msg:         out.msg,
    ico:         out.ico,
    actionKey:   out.actionKey,
    actionClass: out.actionClass,
  };
  const stable = stableAdvice(candidate);

  box.classList.add(stable.mode);
  if (icon) icon.textContent = stable.ico;
  if (text) text.textContent = stable.msg;
  if (ctxEl) ctxEl.textContent = out.secondaryMsg || '';

  const cheapest = price.cheapest;
  const bestLabel = bestBlock
    ? fmtHour(bestBlock.highlightStart || bestBlock.start) + '-'
      + fmtHour(bestBlock.highlightEnd || bestBlock.end)
    : '';

  if (nextPill) {
    const stableActionPill = t('pill-' + stable.actionKey);
    let nextText = stableActionPill;
    if (bestBlock && inBestWindow && (stable.actionKey === 'use-now' || stable.actionKey === 'use-if-needed'))
      {nextText += ' · ' + t('until') + ' ' + fmtHour(bestBlock.highlightEnd || bestBlock.end);}
    else if (bestBlock && stable.actionKey === 'wait')
      {nextText += ' · ' + fmtCtValue(bestAvg);}
    else if (bestBlock && !stable.actionClass)
      {nextText = (inBestWindow ? t('current-window') : t('best-window')) + ' ' + bestLabel + ' · ' + fmtCtValue(bestAvg);}
    else if (!bestBlock && cheapest)
      {nextText = (cheapest.ct < 0 ? t('earning-hour') : t('best-hour')) + ' ' + fmtHour(cheapest.ts) + ' · ' + fmtCtValue(cheapest.ct);}
    setPill(nextPill, nextText,
      stable.actionClass || (bestBlock && bestBlock.avg < 0 ? 'is-negative' : (inBestWindow ? 'is-action-now' : 'is-best')));
  }
}
