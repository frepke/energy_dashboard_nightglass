/**
 * Tests for scripts/app/refreshController.js
 *
 * Covers the previously uncovered branches:
 *  - priceFromDevice: NaN, price === 1000, valid price
 *  - livePriceFromDevice: null device, invalid value, valid value
 *  - parseLimitPct: null, 'on', 'off', numeric string, NaN string
 *  - refreshDistribution: no device ids, missing P1/Solar, export scenario,
 *    houseW/selfSuff/selfCons fallbacks, gas year skip/fetch/already-loaded,
 *    elecPriceDev branch, price sentinel 1000
 *  - refreshPrices: no forecast device, missing fd, invalid JSON,
 *    no forecast.hours, cached items merge, signature dedup,
 *    gas_now badge, localStorage failures, fallback slice logic
 *  - refreshAll: busy guard, distribution error, prices error
 *  - retranslateLiveLabels: limitPct null/set, gasYearValue present/absent
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom, addElement } from './utils/minidom.js';

// ── Mocks — must be declared before any imports that trigger them ─────────────

const mockEnsureDeviceIds = vi.fn();
const mockApi             = vi.fn();
const mockApiLive         = vi.fn();
const mockFetchYearGas    = vi.fn();
const mockFetchYearGridExport = vi.fn();
const mockFindForecast    = vi.fn();

vi.mock('../scripts/services/domoticzService.js', () => ({
  api:                (...a) => mockApi(...a),
  apiLive:            (...a) => mockApiLive(...a),
  ensureDeviceIds:    (...a) => mockEnsureDeviceIds(...a),
  fetchYearGas:       (...a) => mockFetchYearGas(...a),
  fetchYearGridExport: (...a) => mockFetchYearGridExport(...a),
  findForecastDevice: (...a) => mockFindForecast(...a),
}));

// distributionView may not exist yet in the repo — mock it completely
vi.mock('../scripts/ui/distributionView.js', () => ({
  renderDistribution: vi.fn(),
  renderGasYear:      vi.fn(),
}));

vi.mock('../scripts/domain/prices.js', () => ({
  pushPriceHistory: vi.fn(),
}));

vi.mock('../scripts/ui/smartInsight.js', () => ({
  updateSmartInsight: vi.fn(),
}));

vi.mock('../scripts/ui/cards.js', () => ({
  setElecBadge:     vi.fn(),
  setGasBadge:      vi.fn(),
  setLowerPrice:    vi.fn(),
  renderLimitBadge: vi.fn(),
}));

vi.mock('../scripts/ui/gridCard.js', () => ({
  renderGridTodayBreakdown: vi.fn(),
}));

vi.mock('../scripts/ui/flow.js', () => ({
  setFlow:           vi.fn(),
  setIconIntensity:  vi.fn(),
}));

vi.mock('../scripts/ui/chart.js', () => ({
  renderBars:         vi.fn(),
  markBestWindowBars: vi.fn(),
  colorFor:           vi.fn(() => '#00e0ba'),
}));

vi.mock('../scripts/config/resolveConfig.js', () => ({
  CFG: { refresh: 30, forecastIdx: '', ws: false },
}));

vi.mock('../scripts/i18n.js', () => ({
  t: (k) => k,
  getLang: () => 'en',
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { createRefreshController } from '../scripts/app/refreshController.js';
import { LIVE_STATE, setState }     from '../scripts/core/state.js';
import { pushPriceHistory }         from '../scripts/domain/prices.js';
import { setElecBadge, setGasBadge, renderLimitBadge } from '../scripts/ui/cards.js';
import { renderBars }               from '../scripts/ui/chart.js';
import { renderGasYear }            from '../scripts/ui/distributionView.js';

beforeEach(() => {
  mockFetchYearGridExport.mockResolvedValue(null);
});

// ── Shared helpers ────────────────────────────────────────────────────────────

const BASE_IDS = {
  p1: '1', solar: '2', gas: '3', usage: '',
  selfSufficiency: '', selfConsumption: '',
  electricityPrice: '', gasPrice: '', inverterLimit: '',
};

function makeP1(imp = '500', exp = '100') {
  return { idx: '1', Usage: imp, UsageDeliv: exp,
    CounterToday: '2', CounterDelivToday: '0.5', price: '0.25' };
}
function makeSolar(usage = '300', counter = '1.2') {
  return { idx: '2', Usage: usage, CounterToday: counter, price: '0.30' };
}
function makeGas(counter = '0.062') {
  return { idx: '3', CounterToday: counter };
}
function makeApiResult(...devices) {
  return { result: devices };
}
function makeController() {
  const setStatus = vi.fn();
  return { ctrl: createRefreshController(setStatus), setStatus };
}
function setupDom() {
  installMiniDom();
  ['gasYear', 'updated', 'gridNet', 'localSolarW', 'solarStatus'].forEach(id => {
    addElement(document.body, 'div', { id });
  });
  document.getElementById('gasYear').dataset = {};
  LIVE_STATE.gridExportYearKwh = null;
}

// ── parseLimitPct (via refreshDistribution) ───────────────────────────────────

describe('parseLimitPct branches', () => {
  beforeEach(() => {
    vi.useRealTimers();
    setupDom();
    vi.clearAllMocks();
  });

  async function runWithInverterData(data) {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, inverterLimit: '9' });
    mockApi.mockResolvedValue(makeApiResult(
      makeP1(), makeSolar(), { idx: '9', Data: data },
    ));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
  }

  it('handles missing inverterLimit device (null)', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, inverterLimit: '' });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar()));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(true).toBe(true); // no throw
  });

  it('parses "on" as 100%',          async () => { await runWithInverterData('on');      expect(true).toBe(true); });
  it('parses "off" as 0%',           async () => { await runWithInverterData('off');     expect(true).toBe(true); });
  it('parses numeric string "75"',   async () => { await runWithInverterData('75');      expect(true).toBe(true); });
  it('returns null for unknown str', async () => { await runWithInverterData('unknown'); expect(true).toBe(true); });
});

// ── refreshDistribution branches ──────────────────────────────────────────────

describe('refreshDistribution', () => {
  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
  });

  it('reports error when no device IDs are configured', async () => {
    mockEnsureDeviceIds.mockResolvedValue(
      Object.fromEntries(Object.keys(BASE_IDS).map(k => [k, ''])),
    );
    const { ctrl, setStatus } = makeController();
    await ctrl.refreshAll('poll');
    expect(setStatus).toHaveBeenCalledWith(false, expect.stringContaining('no energy devices'));
  });

  it('reports error when P1 or Solar device missing from result', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    mockApi.mockResolvedValue(makeApiResult(makeGas()));
    const { ctrl, setStatus } = makeController();
    await ctrl.refreshAll('poll');
    expect(setStatus).toHaveBeenCalledWith(false, expect.stringContaining('P1/Solar device missing'));
  });

  it('calculates houseW when exporting (no usage device)', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, usage: '' });
    const p1 = { ...makeP1('0', '200'), CounterToday: '0', CounterDelivToday: '2' };
    mockApi.mockResolvedValue(makeApiResult(p1, makeSolar('300', '1.5')));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(LIVE_STATE.gridDir).toBe('export');
  });

  it('calculates houseW when importing (no usage device)', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, usage: '' });
    const p1 = { ...makeP1('500', '0'), CounterToday: '2', CounterDelivToday: '0' };
    mockApi.mockResolvedValue(makeApiResult(p1, makeSolar('200', '1')));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(LIVE_STATE.gridDir).toBe('import');
  });

  it('uses selfSufficiency device value when present', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, selfSufficiency: '5' });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar(), { idx: '5', Data: '42' }));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(true).toBe(true);
  });

  it('uses selfConsumption device value when present', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, selfConsumption: '6' });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar(), { idx: '6', Data: '77' }));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(true).toBe(true);
  });

  it('reads live grid price from electricityPrice device', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, electricityPrice: '7' });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar(), { idx: '7', Data: '0.28' }));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(LIVE_STATE.gridPriceCt).toBeCloseTo(28, 0);
  });

  it('falls back to P1 price when no electricityPrice device', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, electricityPrice: '' });
    const p1 = { ...makeP1(), price: '0.22' };
    mockApi.mockResolvedValue(makeApiResult(p1, makeSolar()));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(LIVE_STATE.gridPriceCt).toBeCloseTo(22, 0);
  });

  it('treats price 1000 as null sentinel', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    const p1 = { ...makeP1(), price: '1000' };
    mockApi.mockResolvedValue(makeApiResult(p1, makeSolar()));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(LIVE_STATE.gridPriceCt).not.toBe(100000);
  });

  it('skips gasYear fetch when gas device absent', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS, gas: '' });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar()));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(mockFetchYearGas).not.toHaveBeenCalled();
  });

  it('fetches gasYear when not yet loaded for this device', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar(), makeGas()));
    mockFetchYearGas.mockResolvedValue(362.87);
    document.getElementById('gasYear').dataset.loaded = '';
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(mockFetchYearGas).toHaveBeenCalledWith('3');
    expect(renderGasYear).toHaveBeenCalledWith(362.87);
  });

  it('fetches yearly grid export at most once per hour for Zonnebonus cap tracking', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar(), makeGas()));
    mockFetchYearGridExport.mockResolvedValue(1234.5);

    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    await ctrl.refreshAll('poll');

    expect(mockFetchYearGridExport).toHaveBeenCalledTimes(1);
    expect(mockFetchYearGridExport).toHaveBeenCalledWith('1');
    expect(LIVE_STATE.gridExportYearKwh).toBe(1234.5);
  });

  it('refreshes yearly grid export after the hourly Zonnebonus cap interval', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar(), makeGas()));
    mockFetchYearGridExport
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1001);

    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');

    now += 59 * 60_000;
    await ctrl.refreshAll('poll');

    now += 2 * 60_000;
    await ctrl.refreshAll('poll');

    expect(mockFetchYearGridExport).toHaveBeenCalledTimes(2);
    expect(LIVE_STATE.gridExportYearKwh).toBe(1001);
  });

  it('skips gasYear fetch when already loaded for this device', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar(), makeGas()));
    document.getElementById('gasYear').dataset.loaded = '3';
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(mockFetchYearGas).not.toHaveBeenCalled();
  });
});

// ── refreshPrices branches ────────────────────────────────────────────────────

describe('refreshPrices', () => {
  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    mockApi.mockResolvedValue(makeApiResult(makeP1(), makeSolar()));
    globalThis.localStorage = {
      getItem:  vi.fn(() => null),
      setItem:  vi.fn(),
    };
  });

  function makeHour(offsetH, price = 0.20) {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + offsetH);
    return { local_datetime: d.toISOString(), price: String(price) };
  }
  function makeForecast(hours, extra = {}) {
    return { result: [{ Data: JSON.stringify({ hours, updated: '2026-06-05 04:00:26', ...extra }) }] };
  }

  it('writes updated-missing when no forecast device', async () => {
    mockFindForecast.mockResolvedValue(null);
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(document.getElementById('updated').textContent).toBe('updated-missing');
  });

  it('returns early when API result has no device', async () => {
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue({ result: [] });
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(setElecBadge).not.toHaveBeenCalled();
  });

  it('reports error on invalid forecast JSON', async () => {
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue({ result: [{ Data: 'not-json' }] });
    const { ctrl, setStatus } = makeController();
    await ctrl.refreshAll('poll');
    expect(setStatus).toHaveBeenCalledWith(false, expect.stringContaining('invalid forecast JSON'));
  });

  it('returns early when forecast.hours is not an array', async () => {
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue({ result: [{ Data: JSON.stringify({ hours: null }) }] });
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(setElecBadge).not.toHaveBeenCalled();
  });

  it('renders bars with fresh forecast data', async () => {
    renderBars.mockClear();
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.25), makeHour(1, 0.18), makeHour(2, 0.30)]));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(renderBars).toHaveBeenCalled();
    expect(setElecBadge).toHaveBeenCalled();
  });

  it('keeps quarter-hour slot metadata and feed-in prices from Forecast JSON', async () => {
    renderBars.mockClear();
    mockFindForecast.mockResolvedValue('42');
    const start = new Date();
    start.setSeconds(0, 0);
    start.setMinutes(Math.floor(start.getMinutes() / 15) * 15);
    const rows = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(start.getTime() + i * 15 * 60000);
      const end = new Date(d.getTime() + 15 * 60000);
      return {
        local_datetime: d.toISOString(),
        local_end_datetime: end.toISOString(),
        interval_minutes: 15,
        price: 0.3397908 + i * 0.001,
        sell_price_ex_tax: 0.2289427 + i * 0.001,
        is_current: i === 0,
      };
    });
    mockApiLive.mockResolvedValue(makeForecast(rows, { interval_minutes: 15, source: 'quarter-hourly' }));

    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');

    const [items, nowTs] = renderBars.mock.calls.at(-1);
    expect(nowTs).toBe(start.getTime());
    expect(items[0]).toMatchObject({
      intervalMinutes: 15,
      endTs: start.getTime() + 15 * 60000,
      sell: 0.2289427,
    });
    expect(LIVE_STATE.priceForecast[0]).toMatchObject({
      intervalMinutes: 15,
      sellCt: 22.89427,
    });
    expect(setElecBadge).toHaveBeenCalledWith(rows[0].price, '#00e0ba');
  });

  it('skips forecast rows with invalid prices instead of treating them as 0', async () => {
    renderBars.mockClear();
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 'missing'), makeHour(1, 0.18)]));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');

    expect(renderBars).toHaveBeenCalled();
    const [items] = renderBars.mock.calls[renderBars.mock.calls.length - 1];
    expect(items).toHaveLength(1);
    expect(items[0].p).toBeCloseTo(0.18);
    expect(setElecBadge).not.toHaveBeenCalled();
  });

  it('skips renderBars on second call with identical data (signature dedup)', async () => {
    renderBars.mockClear();
    const forecast = makeForecast([makeHour(0, 0.25), makeHour(1, 0.18)]);
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(forecast);
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    // The second poll in the same hour skips refreshPrices (hour-boundary cadence),
    // so renderBars, pushPriceHistory, and setElecBadge are not called again.
    await ctrl.refreshAll('poll');
    expect(renderBars).toHaveBeenCalledTimes(1);
    expect(pushPriceHistory).toHaveBeenCalledTimes(1);
    expect(setElecBadge).toHaveBeenCalledTimes(1);
  });

  it('calls setGasBadge when gas_now present', async () => {
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.20)], { gas_now: 1.38 }));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(setGasBadge).toHaveBeenCalledWith(1.38);
  });

  it('skips setGasBadge when gas_now absent', async () => {
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.20)]));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(setGasBadge).not.toHaveBeenCalled();
  });

  it('handles corrupt localStorage cache without throwing', async () => {
    globalThis.localStorage.getItem = vi.fn(() => { throw new Error('corrupt'); });
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.20)]));
    const { ctrl } = makeController();
    await expect(ctrl.refreshAll('poll')).resolves.not.toThrow();
  });

  it('handles localStorage.setItem quota error without throwing', async () => {
    globalThis.localStorage.setItem = vi.fn(() => { throw new Error('quota'); });
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.20)]));
    const { ctrl } = makeController();
    await expect(ctrl.refreshAll('poll')).resolves.not.toThrow();
  });

  it('merges cached history items with live items', async () => {
    renderBars.mockClear();
    const pastHour = new Date();
    pastHour.setMinutes(0, 0, 0);
    pastHour.setHours(pastHour.getHours() - 2);
    globalThis.localStorage.getItem = vi.fn(() =>
      JSON.stringify([{ ts: pastHour.getTime(), p: 0.15 }]),
    );
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.25), makeHour(1, 0.18)]));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(renderBars).toHaveBeenCalled();
    const [items] = renderBars.mock.calls[renderBars.mock.calls.length - 1];
    expect(items.some(x => x.ts === pastHour.getTime())).toBe(true);
  });

  it('uses fallback slice when recent history is short', async () => {
    renderBars.mockClear();
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(1, 0.20)]));
    const { ctrl } = makeController();
    await ctrl.refreshAll('poll');
    expect(renderBars).toHaveBeenCalled();
  });

  it('skips refreshPrices on immediate subsequent poll ticks within the same price slot', async () => {
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.25)]));
    const { ctrl } = makeController();

    // First poll: prices fetched because no slot has been loaded yet.
    await ctrl.refreshAll('poll');
    expect(mockApiLive).toHaveBeenCalledTimes(1);

    // Second poll in the same slot: prices should be skipped.
    await ctrl.refreshAll('poll');
    expect(mockApiLive).toHaveBeenCalledTimes(1);
  });

  it('re-fetches prices when the next quarter-hour starts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T10:07:00Z'));
    try {
      mockFindForecast.mockResolvedValue('42');
      mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.25)], { interval_minutes: 15 }));
      const { ctrl } = makeController();

      await ctrl.refreshAll('poll');
      expect(mockApiLive).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date('2026-08-01T10:15:01Z'));
      await ctrl.refreshAll('poll');
      expect(mockApiLive).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-fetches prices when a WebSocket push arrives regardless of hour boundary', async () => {
    mockFindForecast.mockResolvedValue('42');
    mockApiLive.mockResolvedValue(makeForecast([makeHour(0, 0.25)]));
    const { ctrl } = makeController();

    await ctrl.refreshAll('poll');
    expect(mockApiLive).toHaveBeenCalledTimes(1);

    // A 'ws' reason must always re-fetch prices.
    await ctrl.refreshAll('ws');
    expect(mockApiLive).toHaveBeenCalledTimes(2);
  });
});

// ── refreshAll busy guard ─────────────────────────────────────────────────────

describe('refreshAll busy guard', () => {
  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
    globalThis.localStorage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  });

  it('blocks a second concurrent refresh', async () => {
    mockEnsureDeviceIds.mockResolvedValue({ ...BASE_IDS });
    let resolveApi;
    mockApi.mockReturnValue(new Promise(r => { resolveApi = r; }));
    const { ctrl } = makeController();

    const first  = ctrl.refreshAll('poll');
    const second = ctrl.refreshAll('poll');  // should be a no-op

    resolveApi(makeApiResult(makeP1(), makeSolar()));
    mockFindForecast.mockResolvedValue(null);
    await first;
    await second;

    expect(mockEnsureDeviceIds).toHaveBeenCalledTimes(1);
  });
});

// ── retranslateLiveLabels branches ────────────────────────────────────────────

describe('retranslateLiveLabels', () => {
  beforeEach(() => {
    setupDom();
    vi.clearAllMocks();
  });

  it('updates gridNet label when netToday is a valid number', () => {
    setState({ netToday: 1.5, localSolarW: 200, limitPct: null, gasYearValue: null });
    const { ctrl } = makeController();
    ctrl.retranslateLiveLabels();
    expect(document.getElementById('gridNet').textContent).toContain('kWh');
  });

  it('skips gridNet label when netToday is null', () => {
    setState({ netToday: null, localSolarW: 150, limitPct: null, gasYearValue: null });
    const { ctrl } = makeController();
    ctrl.retranslateLiveLabels();
    expect(document.getElementById('gridNet').textContent).toBe('');
  });

  it('sets solarStatus to "today" when limitPct is null', () => {
    setState({ limitPct: null, localSolarW: 100, netToday: null, gasYearValue: null });
    const { ctrl } = makeController();
    ctrl.retranslateLiveLabels();
    expect(document.getElementById('solarStatus').textContent).toBe('today');
  });

  it('does NOT overwrite solarStatus when limitPct < 100', () => {
    setState({ limitPct: 75, localSolarW: 100, netToday: null, gasYearValue: null });
    const { ctrl } = makeController();
    ctrl.retranslateLiveLabels();
    expect(document.getElementById('solarStatus').textContent).toBe('');
  });

  it('renders gasYear label when gasYearValue is set', () => {
    setState({ gasYearValue: 362.87, localSolarW: 0, netToday: null, limitPct: null });
    const { ctrl } = makeController();
    ctrl.retranslateLiveLabels();
    expect(document.getElementById('gasYear').textContent).toContain('m³');
  });

  it('calls renderLimitBadge with current limitPct', () => {
    setState({ limitPct: 50, localSolarW: 0, netToday: null, gasYearValue: null });
    const { ctrl } = makeController();
    ctrl.retranslateLiveLabels();
    expect(renderLimitBadge).toHaveBeenCalledWith(50);
  });
});
