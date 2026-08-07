import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addElement, installMiniDom } from './utils/minidom.js';

let fakeDecisionWindow;

vi.mock('../scripts/domain/prices.js', () => ({
  activeDecisionWindow: () => fakeDecisionWindow,
}));

function installStorage() {
  globalThis.localStorage = { getItem: () => 'en', setItem: () => {} };
}

function makeHour(ts, price, extra = {}) {
  return { d: new Date(ts), ts, p: price, ...extra };
}

describe('chart DOM rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMiniDom();
    installStorage();
    addElement(document.body, 'div', { id: 'bars' });
    fakeDecisionWindow = null;
    globalThis.requestAnimationFrame = fn => fn();
  });

  it('renders, orders, annotates, and removes price bars', async () => {
    const { renderBars } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 22).getTime();
    const items = [
      makeHour(now - 3600000, 50),
      makeHour(now, -1),
      makeHour(now + 3600000, 8),
      makeHour(now + 2 * 3600000, 30),
      makeHour(now + 3 * 3600000, NaN, { placeholder: true }),
    ];

    renderBars(items, now, -1, 50);

    const bars = document.getElementById('bars');
    expect(bars.style.getPropertyValue('--bar-count')).toBe('5');
    expect(bars.children).toHaveLength(5);
    expect(bars.children.map(ch => ch.dataset.key)).toEqual(items.map(x => String(x.ts)));

    const current = bars.children[1];
    expect(current.classList.contains('now')).toBe(true);
    expect(current.classList.contains('negative-now')).toBe(true);
    expect(current.classList.contains('has-zero')).toBe(true);
    expect(current.dataset.note).toBe('current hour');
    expect(current.querySelector('.bar').classList.contains('negative')).toBe(true);

    const tomorrow = bars.children[3];
    expect(tomorrow.classList.contains('is-tomorrow')).toBe(true);
    expect(tomorrow.querySelector('.day-label').textContent).toBe('Tomorrow');

    const cheapestFlag = bars.children[1].querySelector('.flag');
    const expensiveFlag = bars.children[3].querySelector('.flag');
    expect(cheapestFlag.hidden).toBe(false);
    expect(cheapestFlag.classList.contains('is-negative')).toBe(true);
    expect(bars.children[2].querySelector('.flag').hidden).toBe(true);
    expect(expensiveFlag.hidden).toBe(false);
    expect(expensiveFlag.classList.contains('is-positive')).toBe(true);

    const placeholder = bars.children[4];
    expect(placeholder.dataset.price).toBe('Unknown');
    expect(placeholder.dataset.note).toBe('Not yet known');
    expect(placeholder.querySelector('.bar').classList.contains('placeholder')).toBe(true);

    renderBars(items.slice(1, 4), now, -1, 30);
    expect(bars.children).toHaveLength(3);
    expect(bars.children[0].dataset.key).toBe(String(now));
  });

  it('shows min and max flags over the full visible future forecast', async () => {
    const { renderBars } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 4, 12, 22).getTime();
    const tomorrow = new Date(2026, 4, 13, 0).getTime();
    fakeDecisionWindow = {
      start: tomorrow + 10 * 3600000,
      highlightStart: tomorrow + 10 * 3600000,
      highlightEnd: tomorrow + 16 * 3600000,
    };

    const items = [
      makeHour(now, 40.0),
      makeHour(now + 3600000, 27.4),
      makeHour(tomorrow + 10 * 3600000, 16.1),
      makeHour(tomorrow + 11 * 3600000, 16.3),
      makeHour(tomorrow + 20 * 3600000, 34.2),
    ];

    renderBars(items, now, 16.1, 40.0);

    const bars = document.getElementById('bars').children;
    expect(bars[0].querySelector('.flag').hidden).toBe(false);
    expect(bars[1].querySelector('.flag').hidden).toBe(true);
    expect(bars[2].querySelector('.flag').hidden).toBe(false);
    expect(bars[4].querySelector('.flag').hidden).toBe(true);
  });

  it('marks the active cheapest decision window edges', async () => {
    const { renderBars, markBestWindowBars } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    const items = [0, 1, 2, 3].map(i => makeHour(now + i * 3600000, 10 + i));
    renderBars(items, now, 10, 20);

    fakeDecisionWindow = {
      highlightStart: now + 3600000,
      highlightEnd: now + 3 * 3600000,
    };
    markBestWindowBars();

    const bars = document.getElementById('bars').children;
    expect(bars[0].classList.contains('is-best-window')).toBe(false);
    expect(bars[1].classList.contains('is-best-window')).toBe(true);
    expect(bars[1].classList.contains('is-best-edge')).toBe(true);
    expect(bars[2].classList.contains('is-best-window')).toBe(true);
    expect(bars[2].classList.contains('is-best-edge')).toBe(true);
    expect(bars[3].classList.contains('is-best-window')).toBe(false);
  });

  it('uses the selected energy-logger advice period for the graph highlight', async () => {
    const { renderBars, markBestWindowBars, setEnergyAdviceWindow } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    const items = [0, 1, 2, 3, 4].map(i => makeHour(now + i * 3600000, 10 + i));
    renderBars(items, now, 10, 20);

    fakeDecisionWindow = {
      requestedHours: 3,
      highlightStart: now,
      highlightEnd: now + 3 * 3600000,
    };
    setEnergyAdviceWindow({
      hours: 3,
      start: new Date(now + 3600000).toISOString(),
      end: new Date(now + 4 * 3600000).toISOString(),
      averageMarginalPriceEurKwh: 0.01857,
    });
    markBestWindowBars();

    const bars = document.getElementById('bars').children;
    expect(bars[0].classList.contains('is-best-window')).toBe(false);
    expect(bars[1].classList.contains('is-best-window')).toBe(true);
    expect(bars[2].classList.contains('is-best-window')).toBe(true);
    expect(bars[3].classList.contains('is-best-window')).toBe(true);
    expect(bars[4].classList.contains('is-best-window')).toBe(false);

    setEnergyAdviceWindow({ hours: 'all' });
  });



  it('keeps all-window mode neutral so the price colour scale stays logical', async () => {
    const { renderBars, markBestWindowBars } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    const items = [0, 1, 2, 3].map(i => makeHour(now + i * 3600000, 10 + i));
    renderBars(items, now, 10, 20);

    fakeDecisionWindow = {
      requestedHours: 'all',
      highlightStart: now,
      highlightEnd: now + 4 * 3600000,
    };
    markBestWindowBars();

    const container = document.getElementById('bars');
    expect(container.classList.contains('has-focus-window')).toBe(false);
    expect(container.classList.contains('has-all-window')).toBe(true);
    Array.from(container.children).forEach(bar => {
      expect(bar.classList.contains('is-best-window')).toBe(false);
      expect(bar.classList.contains('is-best-edge')).toBe(false);
    });
  });

  it('shows and hides the tooltip for bar hover events', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    renderBars([makeHour(now, 12)], now, 0, 20);

    setupTooltip();
    const bars = document.getElementById('bars');
    const wrap = bars.children[0];

    bars.dispatch('pointerover', { target: wrap });
    const tip = document.querySelector('.tooltip');
    const line = document.querySelector('.hoverline');
    expect(tip.classList.contains('is-visible')).toBe(true);
    expect(line.classList.contains('is-visible')).toBe(true);
    expect(tip.querySelector('.tip-time').textContent).toBe('10:00–11:00');
    expect(tip.querySelector('.tip-price').textContent).toContain('ct');

    bars.dispatch('pointerout', { target: wrap, relatedTarget: null });
    expect(tip.classList.contains('is-visible')).toBe(false);
    expect(line.classList.contains('is-visible')).toBe(false);
  });

  it('shows quarter-hour range, buy tariff and feed-in tariff in the tooltip', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 7, 1, 10, 15).getTime();
    renderBars([
      makeHour(now, 0.3397908, {
        endTs: now + 15 * 60000,
        intervalMinutes: 15,
        sell: 0.2289427,
      }),
    ], now, 0.2, 0.4);

    setupTooltip();
    const wrap = document.getElementById('bars').children[0];
    document.getElementById('bars').dispatch('pointerover', { target: wrap });

    const tip = document.querySelector('.tooltip');
    expect(tip.querySelector('.tip-time').textContent).toBe('10:15–10:30');
    expect(tip.querySelector('.tip-price').textContent).toContain('33.98');
    expect(tip.querySelector('.tip-sell-price').textContent).toContain('22.89');
  });

  it('keeps the desktop tooltip in one vertical lane across different bar heights', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 7, 7, 10).getTime();
    renderBars([
      makeHour(now, 0.12),
      makeHour(now + 15 * 60000, 0.38),
    ], now, 0.12, 0.38);

    const bars = document.getElementById('bars');
    const chart = addElement(document.body, 'div', { id: 'chart', className: 'chart' });
    bars.remove();
    chart.appendChild(bars);
    chart.getBoundingClientRect = () => ({ left: 20, top: 300, bottom: 600, width: 800, height: 300 });

    const [shortWrap, tallWrap] = bars.children;
    shortWrap.getBoundingClientRect = () => ({ left: 100, top: 360, bottom: 580, width: 20, height: 220 });
    tallWrap.getBoundingClientRect = () => ({ left: 140, top: 320, bottom: 580, width: 20, height: 260 });
    shortWrap.querySelector('.bar').getBoundingClientRect = () => ({ left: 100, top: 500, bottom: 580, width: 20, height: 80 });
    tallWrap.querySelector('.bar').getBoundingClientRect = () => ({ left: 140, top: 360, bottom: 580, width: 20, height: 220 });

    setupTooltip();
    bars.dispatch('pointerover', { target: shortWrap });
    const tip = document.querySelector('.tooltip');
    const firstTop = tip.style.top;
    const firstLeft = tip.style.left;

    // The desktop lane is intentionally 24px above the touch/iPhone lane.
    // Its visible transform lifts 18px from this inline top value.
    expect(firstTop).toBe('340px');

    bars.dispatch('pointermove', { target: tallWrap });
    expect(tip.style.top).toBe(firstTop);
    expect(tip.style.left).not.toBe(firstLeft);
  });

  it('pins tooltip on touchend and dismisses on tap outside', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    renderBars([makeHour(now, 12)], now, 0, 20);

    setupTooltip();
    const bars = document.getElementById('bars');
    const wrap = bars.children[0];
    document.elementFromPoint = () => wrap;

    // Tap the bar → tooltip shows
    bars.dispatch('touchstart', {
      touches: [{ clientX: 110, clientY: 90 }],
      preventDefault: () => {},
    });

    const tip = document.querySelector('.tooltip');
    const line = document.querySelector('.hoverline');
    expect(tip.classList.contains('is-visible')).toBe(true);
    expect(line.classList.contains('is-visible')).toBe(true);

    // Lift finger → tooltip stays visible briefly, then auto-dismisses
    bars.dispatch('touchend', {});
    expect(tip.classList.contains('is-visible')).toBe(true);
    expect(line.classList.contains('is-visible')).toBe(true);

    vi.advanceTimersByTime(1199);
    expect(tip.classList.contains('is-visible')).toBe(true);

    vi.advanceTimersByTime(1 + 220); // cross the auto-hide delay, then the fade-out
    expect(tip.classList.contains('is-visible')).toBe(false);
    expect(line.classList.contains('is-visible')).toBe(false);

    // Re-open and confirm tapping outside still dismisses immediately too
    bars.dispatch('touchstart', {
      touches: [{ clientX: 110, clientY: 90 }],
      preventDefault: () => {},
    });
    bars.dispatch('touchend', {});
    expect(tip.classList.contains('is-visible')).toBe(true);

    const outside = document.body;
    document.dispatch('touchstart', { target: outside });
    vi.advanceTimersByTime(220);
    expect(tip.classList.contains('is-visible')).toBe(false);
    expect(line.classList.contains('is-visible')).toBe(false);
  });

  it('moves pinned tooltip when tapping another bar', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    renderBars(
      [makeHour(now, 12), makeHour(now + 3600000, 20)],
      now, 0, 20,
    );

    setupTooltip();
    const bars = document.getElementById('bars');
    const wrap1 = bars.children[0];
    const wrap2 = bars.children[1];

    // Tap bar 1
    document.elementFromPoint = () => wrap1;
    bars.dispatch('touchstart', {
      touches: [{ clientX: 110, clientY: 90 }],
      preventDefault: () => {},
    });
    bars.dispatch('touchend', {});

    const tip = document.querySelector('.tooltip');
    expect(tip.querySelector('.tip-time').textContent).toBe('10:00–11:00');

    // Tap bar 2 → tooltip moves
    document.elementFromPoint = () => wrap2;
    bars.dispatch('touchstart', {
      touches: [{ clientX: 130, clientY: 90 }],
      preventDefault: () => {},
    });
    bars.dispatch('touchend', {});

    expect(tip.classList.contains('is-visible')).toBe(true);
    expect(tip.querySelector('.tip-time').textContent).toBe('11:00–12:00');
  });

  it('dismisses pinned tooltip when tapping empty chart area', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    renderBars([makeHour(now, 12)], now, 0, 20);

    setupTooltip();
    const bars = document.getElementById('bars');
    const wrap = bars.children[0];
    const tip = document.querySelector('.tooltip');

    document.elementFromPoint = () => wrap;
    bars.dispatch('touchstart', {
      touches: [{ clientX: 110, clientY: 90 }],
      preventDefault: () => {},
    });
    bars.dispatch('touchend', {});
    expect(tip.classList.contains('is-visible')).toBe(true);

    document.elementFromPoint = () => bars;
    bars.dispatch('touchstart', {
      touches: [{ clientX: 150, clientY: 90 }],
      preventDefault: () => {},
    });
    bars.dispatch('touchend', {});

    expect(tip.classList.contains('is-visible')).toBe(false);
  });

  it('hides tooltip immediately on touchcancel', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    renderBars([makeHour(now, 12)], now, 0, 20);

    setupTooltip();
    const bars = document.getElementById('bars');
    const wrap = bars.children[0];
    document.elementFromPoint = () => wrap;

    bars.dispatch('touchstart', {
      touches: [{ clientX: 110, clientY: 90 }],
      preventDefault: () => {},
    });

    const tip = document.querySelector('.tooltip');
    expect(tip.classList.contains('is-visible')).toBe(true);

    bars.dispatch('touchcancel', {});
    vi.advanceTimersByTime(220);
    expect(tip.classList.contains('is-visible')).toBe(false);
  });

  it('hides tooltip immediately on multi-touch start', async () => {
    const { renderBars, setupTooltip } = await import('../scripts/ui/chart.js');
    const now = new Date(2026, 0, 1, 10).getTime();
    renderBars([makeHour(now, 12)], now, 0, 20);

    setupTooltip();
    const bars = document.getElementById('bars');
    const wrap = bars.children[0];
    document.elementFromPoint = () => wrap;

    bars.dispatch('touchstart', {
      touches: [{ clientX: 110, clientY: 90 }],
      preventDefault: () => {},
    });

    const tip = document.querySelector('.tooltip');
    expect(tip.classList.contains('is-visible')).toBe(true);

    bars.dispatch('touchstart', {
      touches: [
        { clientX: 110, clientY: 90 },
        { clientX: 150, clientY: 90 },
      ],
      preventDefault: () => {},
    });

    expect(tip.classList.contains('is-visible')).toBe(false);
  });
});
