/**
 * Tests for the smartInsight buildInsightOutput mapping.
 *
 * Covers all primaryAction cases and secondaryContext strings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installMiniDom, addElement } from './utils/minidom.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../scripts/i18n.js', () => ({
  t:             (k) => k,
  applyTemplate: (tpl, vars) => {
    let out = tpl;
    for (const [k, v] of Object.entries(vars || {})) out = out.replace(`{${k}}`, String(v));
    return out;
  },
}));

vi.mock('../scripts/core/dom.js', () => ({
  $: (sel) => globalThis.document.getElementById(sel.replace('#', '')),
}));

vi.mock('../scripts/domain/prices.js', () => ({
  stableAdvice: (c) => c,
}));

vi.mock('../scripts/core/formatters.js', () => ({
  isNum:  (n) => typeof n === 'number' && !Number.isNaN(n),
  fmt: {
    w:       (n) => n + ' W',
    ctValue: (n) => n + ' ct',
    m3:      (n) => n + ' m³',
    kwh:     (n) => n + ' kWh',
    eur:     (n) => '€' + n,
  },
}));

// Mutable context refs — tests override per case
let buildCtx;
let pickPrimary;

vi.mock('../scripts/domain/insightEngine.js', () => ({
  buildInsightContext: () => buildCtx,
  pickPrimaryInsight:  () => pickPrimary,
}));

// ── Defaults ─────────────────────────────────────────────────────────────────

const defaultCtx = {
  priceCt:             20,
  price:               { level: 'normal', expensiveNow: false, cheapest: null },
  bestBlock:           null,
  bestAvg:             null,
  isImporting:         true,
  isExporting:         false,
  solarW:              0,
  gridW:               400,
  inBestWindow:        false,
  cheaperLater:        false,
  muchCheaperLater:    false,
  lowImport:           false,
  bestWindowIsTomorrow: false,
  zonne:               { eligible: false, feedInRewardCt: 0 },
  hasSolarSurplus:     false,
  currentIsFavourable: false,
  nowNearBest:         false,
};

const defaultResult = {
  primaryAction:    'no-action',
  secondaryContext: null,
  reasonCodes:      [],
};

// ── DOM + module setup ────────────────────────────────────────────────────────

let doc;
const IDS = ['smartInsight','smartInsightIcon','smartInsightText',
             'smartInsightContext','smartGridPill','smartSolarPill',
             'smartPricePill','smartNextPill'];

beforeEach(() => {
  doc = installMiniDom();
  IDS.forEach(id => addElement(doc.body, 'div', { id }));
  globalThis.localStorage = {
    _s: {},
    getItem: (k) => this._s?.[k] ?? null,
    setItem: (k, v) => { if (this._s) this._s[k] = v; },
  };
});

const { updateSmartInsight } = await import('../scripts/ui/smartInsight.js');

function run(ctxOverrides = {}, resultOverrides = {}) {
  buildCtx    = { ...defaultCtx,    ...ctxOverrides   };
  pickPrimary = { ...defaultResult, ...resultOverrides };
  updateSmartInsight();
  return {
    ico:  doc.getElementById('smartInsightIcon').textContent,
    text: doc.getElementById('smartInsightText').textContent,
    ctx:  doc.getElementById('smartInsightContext').textContent,
    classes: [...doc.getElementById('smartInsight').classList.set],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('primaryAction mapping', () => {

  it('use-now normal → € icon, is-use', () => {
    const { ico, classes } = run({}, { primaryAction: 'use-now', reasonCodes: [] });
    expect(ico).toBe('€');
    expect(classes).toContain('is-use');
  });

  it('use-now negative price → ↯ icon, is-negative', () => {
    const { ico, classes } = run(
      { priceCt: -5 },
      { primaryAction: 'use-now', reasonCodes: [] },
    );
    expect(ico).toBe('↯');
    expect(classes).toContain('is-negative');
  });

  it('use-now today-cheapest-hour → € icon', () => {
    const { ico } = run(
      { priceCt: 10 },
      { primaryAction: 'use-now', reasonCodes: ['today-cheapest-hour'] },
    );
    expect(ico).toBe('€');
  });

  it('use-now solar reducing import → msg-use-solar-reducing', () => {
    const { text } = run(
      { priceCt: 15, solarW: 500, isImporting: true, inBestWindow: false },
      { primaryAction: 'use-now', reasonCodes: [] },
    );
    expect(text).toBe('msg-use-solar-reducing');
  });

  it('use-now in best window → msg-use-in-best-window', () => {
    const ts = Date.now();
    const { text } = run(
      { inBestWindow: true, bestBlock: { highlightStart: ts, highlightEnd: ts + 3_600_000, start: ts, end: ts + 3_600_000 } },
      { primaryAction: 'use-now', reasonCodes: [] },
    );
    expect(text).toBe('msg-use-in-best-window');
  });

  it('use-if-needed → € icon, is-use', () => {
    const { ico, classes } = run({}, { primaryAction: 'use-if-needed', reasonCodes: [] });
    expect(ico).toBe('€');
    expect(classes).toContain('is-use');
  });

  it('wait normal → ⏱ icon, is-wait', () => {
    const { ico, classes } = run(
      { cheaperLater: true },
      { primaryAction: 'wait', reasonCodes: [] },
    );
    expect(ico).toBe('⏱');
    expect(classes).toContain('is-wait');
  });

  it('wait much cheaper later → is-hold', () => {
    const { classes } = run(
      { muchCheaperLater: true },
      { primaryAction: 'wait', reasonCodes: [] },
    );
    expect(classes).toContain('is-hold');
  });

  it('wait low-solar-expensive → 🌙 icon', () => {
    const { ico } = run({}, { primaryAction: 'wait', reasonCodes: ['low-solar-expensive'] });
    expect(ico).toBe('🌙');
  });

  it('wait tomorrow window → msg-wait-tomorrow-window', () => {
    const ts = Date.now();
    const { text } = run(
      { bestWindowIsTomorrow: true, bestBlock: { highlightStart: ts, start: ts, highlightEnd: ts + 3_600_000, end: ts + 3_600_000 } },
      { primaryAction: 'wait', reasonCodes: [] },
    );
    expect(text).toContain('msg-wait-tomorrow-window');
  });

  it('hold normal → ⚠ icon, is-hold', () => {
    const { ico, classes } = run({}, { primaryAction: 'hold', reasonCodes: [] });
    expect(ico).toBe('⚠');
    expect(classes).toContain('is-hold');
  });

  it('hold low-solar-expensive → 🌙 icon', () => {
    const { ico } = run({}, { primaryAction: 'hold', reasonCodes: ['low-solar-expensive'] });
    expect(ico).toBe('🌙');
  });

  it('export-now cheaper later → msg-export-later', () => {
    const ts = Date.now();
    const { ico, text } = run(
      { cheaperLater: true, bestBlock: { highlightStart: ts, start: ts, highlightEnd: ts + 3_600_000, end: ts + 3_600_000 }, bestAvg: 8 },
      { primaryAction: 'export-now', reasonCodes: [] },
    );
    expect(ico).toBe('☀');
    expect(text).toContain('msg-export-later');
  });

  it('export-now no cheaper later → msg-export-exceptional', () => {
    const { text } = run(
      { cheaperLater: false },
      { primaryAction: 'export-now', reasonCodes: [] },
    );
    expect(text).toBe('msg-export-exceptional');
  });

  it('no-action default → ✓ icon, is-good', () => {
    const { ico, classes } = run({}, { primaryAction: 'no-action', reasonCodes: [] });
    expect(ico).toBe('✓');
    expect(classes).toContain('is-good');
  });

  it('no-action lowImport → msg-no-action-low', () => {
    const { text } = run({ lowImport: true }, { primaryAction: 'no-action', reasonCodes: [] });
    expect(text).toBe('msg-no-action-low');
  });

  it('no-action expensive + no solar + importing → 🌙 icon', () => {
    const { ico } = run(
      { price: { level: 'high', expensiveNow: true, cheapest: null }, solarW: 10, isImporting: true, lowImport: false },
      { primaryAction: 'no-action', reasonCodes: [] },
    );
    expect(ico).toBe('🌙');
  });

});

describe('secondaryContext mapping', () => {

  it('export-attractive-context → msg-ctx-export-attractive', () => {
    const { ctx } = run(
      {},
      { primaryAction: 'no-action', secondaryContext: 'export-attractive-context', reasonCodes: [] },
    );
    expect(ctx).toBe('msg-ctx-export-attractive');
  });

  it('export-while-waiting → msg-ctx-export-while-waiting', () => {
    const { ctx } = run(
      {},
      { primaryAction: 'wait', secondaryContext: 'export-while-waiting', reasonCodes: [] },
    );
    expect(ctx).toBe('msg-ctx-export-while-waiting');
  });

  it('plan-loads-later with bestBlock → msg-ctx-plan-loads-later', () => {
    const ts = Date.now();
    const { ctx } = run(
      { bestBlock: { highlightStart: ts, start: ts, highlightEnd: ts + 3_600_000, end: ts + 3_600_000 } },
      { primaryAction: 'use-now', secondaryContext: 'plan-loads-later', reasonCodes: [] },
    );
    expect(ctx).toContain('msg-ctx-plan-loads-later');
  });

  it('plan-loads-later without bestBlock → msg-ctx-plan-loads-generic', () => {
    const { ctx } = run(
      { bestBlock: null },
      { primaryAction: 'use-now', secondaryContext: 'plan-loads-later', reasonCodes: [] },
    );
    expect(ctx).toBe('msg-ctx-plan-loads-generic');
  });

  it('null secondaryContext → empty context element', () => {
    const { ctx } = run({}, { primaryAction: 'no-action', secondaryContext: null, reasonCodes: [] });
    expect(ctx).toBe('');
  });

});
