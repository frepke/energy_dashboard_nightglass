import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addElement, installMiniDom } from './utils/minidom.js';

vi.mock('../scripts/config/resolveConfig.js', () => ({
  ENERGY_LOGGER_CFG: { enabled: true, baseUrl: '', refreshSeconds: 60, timeoutMs: 8000 },
}));

import { renderEnergyAdvice, renderEnergyAdviceError } from '../scripts/ui/energyAdvice.js';

const OUTPUT_IDS = [
  'energyAdviceState', 'energyAdviceMainTime', 'energyAdviceMainDay', 'energyAdviceMainPrice',
  'energyAdviceSolar', 'energyAdviceHouse', 'energyAdviceImport', 'energyAdviceExport',
  'energyAdviceNetCost', 'energyAdviceConfidence', 'energyAdviceModel', 'energyAdviceHorizon',
  'energyAdviceEvaluation', 'energyAdviceWindows',
];

function setupAdviceDom() {
  installMiniDom();
  globalThis.localStorage = { getItem: () => 'en', setItem: () => {} };
  const panel = addElement(document.body, 'section', { id: 'energyAdvice' });
  OUTPUT_IDS.forEach(id => addElement(panel, 'div', { id }));
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
    expect(document.querySelector('#energyAdviceNetCost').textContent).toBe('€ 0.31');
    expect(document.querySelector('#energyAdviceConfidence').textContent).toBe('Low');
    expect(document.querySelector('#energyAdviceEvaluation').textContent).toContain('5 quarters evaluated');
    expect(document.querySelector('#energyAdviceWindows').children).toHaveLength(5);
  });

  it('shows an isolated logger error without throwing', () => {
    renderEnergyAdviceError(new Error('energy_logger_http_500'));

    expect(document.querySelector('#energyAdvice').dataset.state).toBe('error');
    expect(document.querySelector('#energyAdviceState').textContent).toBe('Logger unavailable');
    expect(document.querySelector('#energyAdviceEvaluation').textContent).toContain('port 8787');
  });
});
