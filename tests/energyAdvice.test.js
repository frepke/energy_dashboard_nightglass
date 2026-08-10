import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addElement, installMiniDom } from './utils/minidom.js';
import { LIVE_STATE } from '../scripts/core/state.js';

vi.mock('../scripts/config/resolveConfig.js', () => ({
  CFG: { usageWindowHours: 3 },
  ENERGY_LOGGER_CFG: { enabled: true, baseUrl: '', refreshSeconds: 60, timeoutMs: 8000 },
}));

import { renderEnergyAdvice, renderEnergyAdviceError } from '../scripts/ui/energyAdvice.js';

const OUTPUT_IDS = [
  'energyAdviceState', 'energyAdviceMainLabel', 'energyAdviceMainTime', 'energyAdviceMainDay', 'energyAdviceMainPrice',
  'energyAdviceMainPriceLabel', 'energyAdviceMainPurchasePriceLabel', 'energyAdviceMainPurchasePrice',
  'energyAdviceSolar', 'energyAdviceHouse', 'energyAdviceImport', 'energyAdviceExport',
  'energyAdviceNetCostLabel', 'energyAdviceNetCost', 'energyAdviceNetCostNote',
  'energyAdviceMetricsHorizon', 'energyAdviceConfidence', 'energyAdviceModel', 'energyAdviceHorizon',
  'energyAdviceEvaluation', 'energyAdviceWindows',
];

function setupAdviceDom() {
  installMiniDom();
  globalThis.localStorage = { getItem: () => 'en', setItem: () => {} };
  const panel = addElement(document.body, 'section', { id: 'energyAdvice' });
  OUTPUT_IDS.forEach(id => addElement(panel, 'div', { id }));
  const start = new Date('2026-08-02T13:00:00+02:00').getTime();
  LIVE_STATE.priceForecast = Array.from({ length: 6 }, (_, index) => ({
    ts: start + index * 60 * 60_000,
    endTs: start + (index + 1) * 60 * 60_000,
    intervalMinutes: 60,
    ct: 20 + index * 2,
  }));
  return panel;
}

function payload() {
  return {
    latest_run: { model_version: 'profile-weather-v2', overall_confidence: 'low' },
    forecast_horizon: { last_end_utc: '2026-08-02T22:00:00Z' },
    totals: {
      solar_kwh: 10.6686,
      house_kwh: 4.0701,
      import_kwh: 1.5381,
      export_kwh: 8.1366,
      net_cost_eur: 0.3117,
    },
    best_consumption_windows: {
      '1h': { start_local: '2026-08-02T13:30:00+02:00', end_local: '2026-08-02T14:30:00+02:00', average_marginal_price_eur_kwh: 0.01528 },
      '2h': { start_local: '2026-08-02T13:00:00+02:00', end_local: '2026-08-02T15:00:00+02:00', average_marginal_price_eur_kwh: 0.01604 },
      '3h': { start_local: '2026-08-02T13:00:00+02:00', end_local: '2026-08-02T16:00:00+02:00', average_marginal_price_eur_kwh: 0.01694 },
      '4h': { start_local: '2026-08-02T13:00:00+02:00', end_local: '2026-08-02T17:00:00+02:00', average_marginal_price_eur_kwh: 0.01857 },
      '6h': { start_local: '2026-08-02T13:00:00+02:00', end_local: '2026-08-02T19:00:00+02:00', average_marginal_price_eur_kwh: 0.07513 },
    },
    evaluation: { evaluated_quarters: 5, net_mae_kwh: 0.19305 },
  };
}

describe('passive energy advice card', () => {
  beforeEach(setupAdviceDom);

  it('renders forecast totals, confidence, evaluation, and all five windows', () => {
    renderEnergyAdvice(payload());

    expect(document.querySelector('#energyAdvice').dataset.state).toBe('live');
    expect(document.querySelector('#energyAdviceState').textContent).toBe('Forecast current');
    expect(document.querySelector('#energyAdviceSolar').textContent).toBe('10.7 kWh');
    expect(document.querySelector('#energyAdviceHouse').textContent).toBe('4.1 kWh');
    expect(document.querySelector('#energyAdviceMainPurchasePriceLabel').textContent).toBe('Avg. purchase price');
    expect(document.querySelector('#energyAdviceMainPurchasePrice').textContent).toBe('22.00 ct/kWh');
    expect(document.querySelector('#energyAdviceMainPriceLabel').textContent).toBe('Avg. sale price');
    expect(document.querySelector('#energyAdviceNetCostLabel').textContent).toBe('Net amount payable');
    expect(document.querySelector('#energyAdviceNetCost').textContent).toBe('€ 0.31');
    expect(document.querySelector('#energyAdviceNetCostNote').textContent).toBe('purchase cost − sale revenue');
    expect(document.querySelector('#energyAdviceMetricsHorizon').textContent).toContain('until');
    expect(document.querySelector('#energyAdviceConfidence').textContent).toBe('Low');
    expect(document.querySelector('#energyAdviceEvaluation').textContent).toContain('5 quarters evaluated');
    expect(document.querySelector('#energyAdviceWindows').children).toHaveLength(5);
  });

  it('shows a negative net cost as revenue instead of a confusing negative bill', () => {
    const advice = payload();
    advice.totals.net_cost_eur = -0.428;

    renderEnergyAdvice(advice);

    expect(document.querySelector('#energyAdviceNetCostLabel').textContent).toBe('Net revenue');
    expect(document.querySelector('#energyAdviceNetCost').textContent).toBe('€ 0.43');
    expect(document.querySelector('#energyAdviceNetCostNote').textContent).toBe('sale revenue − purchase cost');
  });

  it('synchronizes the primary card and active row with the selected duration', () => {
    renderEnergyAdvice(payload(), 4);

    expect(document.querySelector('#energyAdviceMainLabel').textContent).toBe('Best 4-hour window');
    expect(document.querySelector('#energyAdviceMainTime').textContent).toBe('13:00–17:00');
    expect(document.querySelector('#energyAdviceMainPurchasePrice').textContent).toBe('23.00 ct/kWh');
    expect(document.querySelector('#energyAdviceMainPrice').textContent).toBe('1.86 ct/kWh');

    const rows = document.querySelector('#energyAdviceWindows').children;
    expect(rows[3].dataset.adviceWindow).toBe('4h');
    expect(rows[3].classList.contains('is-active')).toBe(true);
    expect(rows[0].classList.contains('is-active')).toBe(false);
  });

  it('does not show an incomplete purchase-price average', () => {
    LIVE_STATE.priceForecast = LIVE_STATE.priceForecast.slice(0, 2);

    renderEnergyAdvice(payload(), 4);

    expect(document.querySelector('#energyAdviceMainPurchasePrice').textContent).toBe('--');
  });

  it('shows an isolated logger error without throwing', () => {
    renderEnergyAdviceError(new Error('energy_logger_http_500'));

    expect(document.querySelector('#energyAdvice').dataset.state).toBe('error');
    expect(document.querySelector('#energyAdviceState').textContent).toBe('Logger unavailable');
    expect(document.querySelector('#energyAdviceEvaluation').textContent).toContain('port 8787');
  });
});
