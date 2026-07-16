/**
 * Distribution UI — renders live energy readings to the DOM.
 *
 * Accepts a plain data object and performs all DOM writes.
 * No API calls, no state mutations — pure presentation.
 */

import { $ }                        from '../core/dom.js';
import { fmt }                       from '../core/formatters.js';
import { setFlow, setIconIntensity } from './flow.js';
import { setLowerPrice, renderLimitBadge } from './cards.js';
import { renderGridTodayBreakdown }  from './gridCard.js';
import { t }                         from '../i18n.js';


/**
 * Renders all distribution-related DOM elements from a data snapshot.
 *
 * @param {object} d
 * @param {number}      d.gridNet        - Positive = importing, negative = exporting (W)
 * @param {number}      d.houseW         - House consumption (W)
 * @param {number}      d.solarW         - Solar production (W)
 * @param {number}      d.localSolarW    - Solar used on-site (W)
 * @param {number}      d.importToday    - kWh imported today
 * @param {number}      d.exportToday    - kWh exported today
 * @param {number}      d.netToday       - importToday − exportToday
 * @param {number}      d.houseToday     - kWh consumed today
 * @param {number}      d.solarToday     - kWh generated today
 * @param {number}      d.selfSuff       - Self-sufficiency % (0-100)
 * @param {number}      d.selfCons       - Self-consumption % (0-100)
 * @param {number|null} d.gasToday       - m³ gas used today, or null
 * @param {number|null} d.gridPrice      - Grid electricity price (€/kWh), or null
 * @param {number|null} d.solarPrice     - Solar feed-in price (€/kWh), or null
 * @param {number|null} d.gasPrice       - Gas price (€/m³), or null
 * @param {number|null} d.limitPct       - Inverter limit 0-100, or null
 */
export function renderDistribution(d) {
  const { gridNet, houseW, solarW, localSolarW } = d;
  const isImporting = gridNet >= 0;

  // ---- Flow nodes ----
  $('#gridNode').classList.toggle('is-importing', isImporting);
  $('#gridW').textContent = fmt.w(gridNet);
  $('#gridW').className   = 'value ' + (isImporting ? 'orange' : 'green');
  $('#gridDir').textContent = isImporting ? t('grid-import') : t('grid-export');
  $('#gridDir').className   = 'sub '    + (isImporting ? 'orange' : 'green');
  $('#houseW').textContent  = fmt.w(houseW);
  $('#solarW').textContent  = fmt.w(solarW);
  $('#localSolarW').textContent = t('on-site-prefix') + fmt.w(localSolarW);
  $('#solarNode').classList.toggle('is-off', solarW <= 5);


  const gridFlowCaption = $('#gridFlowCaption');
  const solarFlowCaption = $('#solarFlowCaption');
  if (gridFlowCaption) {
    gridFlowCaption.textContent = isImporting
      ? `${t('flow-grid-short')} → ${t('flow-house-short')}`
      : `${t('flow-grid-short')} ← ${t('flow-house-short')}`;
  }
  if (solarFlowCaption) {
    solarFlowCaption.textContent = localSolarW > 5
      ? `${t('flow-house-short')} ← ${t('flow-solar-short')}`
      : `${t('flow-house-short')} ↔ ${t('flow-solar-short')}`;
  }

  setIconIntensity($('#gridNode'),  Math.abs(gridNet), isImporting ? 1 : -1);
  setIconIntensity($('#houseNode'), houseW, 0);
  setIconIntensity($('#solarNode'), solarW, -1);
  renderLimitBadge(d.limitPct);

  setFlow($('#gridFlow'),  $('#gridArrow'),  isImporting ? 'dir-right' : 'dir-left',
          isImporting ? 'var(--orange)' : 'var(--green)', Math.abs(gridNet));
  setFlow($('#solarFlow'), $('#solarArrow'), 'dir-left', 'var(--solar)', localSolarW);

  // ---- Screen-reader flow summary ----
  const flowSummary = $('#flowSummary');
  if (flowSummary) {
    const gridDesc = (isImporting ? t('grid-import') : t('grid-export'))
      + ' ' + fmt.w(gridNet);
    flowSummary.textContent =
      t('label-solar') + ' ' + fmt.w(solarW) + '. ' +
      t('label-house') + ' ' + fmt.w(houseW) + '. ' +
      t('label-grid') + ': ' + gridDesc + '.';
  }

  // ---- Stat cards ----
  const gridPriceColor = d.netToday > 0 ? 'var(--orange)' : (d.netToday < 0 ? 'var(--green)' : 'var(--blue-light)');
  renderGridTodayBreakdown($('#gridToday'), d.importToday, d.exportToday);
  $('#gridNet').textContent = t('net-prefix') + (d.netToday < 0 ? '↑' : '↓') + ' ' + fmt.kwh(Math.abs(d.netToday));

  const gridLabel = d.gridPrice !== null && d.gridPrice !== undefined && d.gridPrice < -0.004
    ? t('credit-prefix') + fmt.eur(Math.abs(d.gridPrice))
    : fmt.eur(d.gridPrice);
  setLowerPrice($('#gridPrice'), 'elec', gridLabel, gridPriceColor);

  $('#houseToday').textContent = fmt.kwh(d.houseToday);
  $('#solarToday').textContent = fmt.kwh(d.solarToday);
  setLowerPrice($('#solarPrice'), 'solar',
    d.solarPrice !== null && d.solarPrice !== undefined ? fmt.eur(d.solarPrice) : '--',
    'var(--solar)');

  if (d.limitPct === null || d.limitPct === undefined || d.limitPct >= 100) {
    delete $('#solarStatus').dataset.limit;
    $('#solarStatus').textContent = t('today');
  }

  $('#selfSuff').textContent = fmt.pct(d.selfSuff);
  $('#selfCons').textContent = fmt.pct(d.selfCons);
  $('#gasToday').textContent = d.gasToday !== null ? fmt.m3(d.gasToday) : '--';
  setLowerPrice($('#gasPrice'), 'gas',
    d.gasPrice !== null && d.gasPrice !== undefined ? fmt.eur(d.gasPrice) : '--',
    'var(--blue-light)');
}

/**
 * Updates the gas year total display after the async fetch completes.
 *
 * @param {number|null} value - Total m³ this year, or null when unavailable.
 */
export function renderGasYear(value) {
  const el = $('#gasYear');
  if (!el) return;
  el.textContent = value !== null && value !== undefined
    ? fmt.m3(value) + ' ' + t('this-year')
    : '-- m³ ' + t('this-year');
}
