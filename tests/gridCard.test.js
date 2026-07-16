import { beforeEach, describe, expect, it } from 'vitest';
import { MiniElement, installMiniDom } from './utils/minidom.js';

// gridCard.js only depends on formatters.js — no browser mocks needed beyond document
beforeEach(() => {
  installMiniDom();
});

import { renderGridTodayBreakdown } from '../scripts/ui/gridCard.js';

function makeEl() {
  const el = new MiniElement('strong');
  el.textContent = '--';  // mimics initial HTML placeholder
  return el;
}

describe('renderGridTodayBreakdown', () => {
  it('no-ops when el is null', () => {
    expect(() => renderGridTodayBreakdown(null, 1, 2)).not.toThrow();
  });

  it('falls back to "--" when both values are 0', () => {
    const el = makeEl();
    renderGridTodayBreakdown(el, 0, 0);
    expect(el.textContent).toBe('--');
    expect(el.children).toHaveLength(0);
  });

  it('falls back to "--" when both values are missing (NaN/null)', () => {
    const el = makeEl();
    renderGridTodayBreakdown(el, NaN, null);
    expect(el.textContent).toBe('--');
  });

  it('shows both values with separator when both are positive', () => {
    const el = makeEl();
    renderGridTodayBreakdown(el, 1.177, 2.613);
    expect(el.textContent).toBe('');  // placeholder cleared
    const spans = el.children;
    const importSpan = spans.find(s => s.dataset.part === 'import');
    const sepSpan    = spans.find(s => s.dataset.part === 'separator');
    const exportSpan = spans.find(s => s.dataset.part === 'export');
    expect(importSpan.textContent).toBe('↓ 1.177 kWh');
    expect(sepSpan.textContent).toBe(' · ');
    expect(exportSpan.textContent).toBe('↑ 2.613 kWh');
  });

  it('shows only import when export is 0, no separator', () => {
    const el = makeEl();
    renderGridTodayBreakdown(el, 1.177, 0);
    const spans = el.children;
    const importSpan = spans.find(s => s.dataset.part === 'import');
    const sepSpan    = spans.find(s => s.dataset.part === 'separator');
    const exportSpan = spans.find(s => s.dataset.part === 'export');
    expect(importSpan.textContent).toBe('↓ 1.177 kWh');
    expect(sepSpan.textContent).toBe('');
    expect(exportSpan.textContent).toBe('');
  });

  it('shows only export when import is 0, no separator', () => {
    const el = makeEl();
    renderGridTodayBreakdown(el, 0, 2.613);
    const spans = el.children;
    const importSpan = spans.find(s => s.dataset.part === 'import');
    const sepSpan    = spans.find(s => s.dataset.part === 'separator');
    const exportSpan = spans.find(s => s.dataset.part === 'export');
    expect(importSpan.textContent).toBe('');
    expect(sepSpan.textContent).toBe('');
    expect(exportSpan.textContent).toBe('↑ 2.613 kWh');
  });

  it('import span has "orange" class, export span has "green" class', () => {
    const el = makeEl();
    renderGridTodayBreakdown(el, 1, 2);
    const importSpan = el.children.find(s => s.dataset.part === 'import');
    const exportSpan = el.children.find(s => s.dataset.part === 'export');
    expect(importSpan.className).toBe('orange');
    expect(exportSpan.className).toBe('green');
  });

  it('reuses existing spans on subsequent calls', () => {
    const el = makeEl();
    renderGridTodayBreakdown(el, 1.0, 2.0);
    const firstChildren = [...el.children];
    renderGridTodayBreakdown(el, 3.0, 4.0);
    expect(el.children).toHaveLength(3);
    expect(el.children[0]).toBe(firstChildren[0]);  // same span, not a new one
    const importSpan = el.children.find(s => s.dataset.part === 'import');
    expect(importSpan.textContent).toBe('↓ 3.000 kWh');
  });
});
