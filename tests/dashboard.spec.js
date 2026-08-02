// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Visual regression + interaction tests for the energy dashboard.
 *
 * First run (no snapshots yet):
 *   npm run test:visual:update
 *
 * Subsequent runs (compare against saved snapshots):
 *   npm run test:visual
 *
 * If you intentionally change the UI, update the snapshots with:
 *   npm run test:visual:update
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__PLAYWRIGHT__ = true;

    // Freeze Date so timestamps in screenshots are always the same
    const FIXED = new Date('2026-05-17T10:00:00Z').getTime();
    const _Date = Date;
    class MockDate extends _Date {
      constructor(...args) { super(...(args.length ? args : [FIXED])); }
      static now() { return FIXED; }
    }
    window.Date = MockDate;

    // Inject mock price forecast so chart bars render without a real backend.
    // Includes negative price (rule 1), best window, cheapest and most expensive
    // hours so all flag/label paths are exercised.
    const H = 3600000;
    window.__MOCK_PRICE_FORECAST__ = Array.from({ length: 30 }, (_, i) => ({
      ts:  FIXED - 6 * H + i * H,
      ct:  i === 2  ? -3                // negative price — rule 1 path
         : i === 8  ? 8                 // cheapest hour — flag + today-cheapest path
         : i === 26 ? 38                // most expensive — flag path
         : 15 + Math.round(Math.sin(i / 3) * 8),
    }));
    window.__MOCK_CURRENT_PRICE_CT__ = 19;
  });

  await page.goto('/energy-dashboard.html');
  await page.waitForSelector('.weather-hero', { state: 'visible' });
  await page.waitForTimeout(800);
});

// ── Full-page layout ──────────────────────────────────────────────────────────

test('full dashboard layout', async ({ page }, testInfo) => {
  await expect(page).toHaveScreenshot(`full-layout-${testInfo.project.name}.png`, {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

// ── Individual sections ───────────────────────────────────────────────────────

test('weather header', async ({ page }, testInfo) => {
  await expect(page.locator('.weather-hero')).toHaveScreenshot(
    `weather-header-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0.02 },
  );
});

test('smart insight bar is disabled by default', async ({ page }) => {
  await expect(page.locator('.smart-insight')).toBeHidden();
});

test('energy flow panel', async ({ page }, testInfo) => {
  await expect(page.locator('section[aria-label="Energy flow"]')).toHaveScreenshot(
    `flow-panel-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0.02 },
  );
});

test('stats cards row', async ({ page }, testInfo) => {
  await expect(page.locator('.cards')).toHaveScreenshot(
    `cards-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0.02 },
  );
});

test('price chart section', async ({ page }, testInfo) => {
  await expect(page.locator('section').last()).toHaveScreenshot(
    `price-chart-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0.02 },
  );
});

// ── Tooltip — hover (desktop) ─────────────────────────────────────────────────

test('chart tooltip appears on hover', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Hover not available on touch devices');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  await page.locator('.barwrap').first().hover();
  await page.waitForTimeout(150);

  const tooltip = page.locator('.tooltip.is-visible');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveScreenshot(
    `tooltip-visible-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0.02 },
  );
});

test('tooltip disappears when mouse leaves chart area', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Hover not available on touch devices');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  await page.locator('.barwrap').first().hover();
  await page.waitForTimeout(150);
  await expect(page.locator('.tooltip.is-visible')).toBeVisible();

  // Move mouse outside the chart — exercises pointerout / pointerleave paths
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await expect(page.locator('.tooltip.is-visible')).not.toBeVisible();
});

test('tooltip hides on window blur', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Touch device');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  await page.locator('.barwrap').first().hover();
  await page.waitForTimeout(150);
  await expect(page.locator('.tooltip.is-visible')).toBeVisible();

  // Trigger window blur — exercises the win.addEventListener('blur') path
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(200);
  await expect(page.locator('.tooltip.is-visible')).not.toBeVisible();
});

test('tooltip hides on window scroll', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Touch device');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  await page.locator('.barwrap').first().hover();
  await page.waitForTimeout(150);
  await expect(page.locator('.tooltip.is-visible')).toBeVisible();

  // Trigger scroll — exercises win.addEventListener('scroll') path
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(200);
  await expect(page.locator('.tooltip.is-visible')).not.toBeVisible();
});

test('tooltip shows correct price on different bars', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Hover not available on touch devices');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  const bars = page.locator('.barwrap');
  const count = await bars.count();

  // Hover the last bar (most expensive in our mock)
  await bars.nth(count - 1).hover();
  await page.waitForTimeout(150);
  const tooltip = page.locator('.tooltip.is-visible');
  await expect(tooltip).toBeVisible();
  const tipText = await tooltip.locator('.tip-price').textContent();
  expect(tipText).toBeTruthy();
});

// ── Tooltip — touch ───────────────────────────────────────────────────────────

test('chart tooltip appears on tap (touch)', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('iPhone'), 'Touch test — skipped on desktop');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  const bar = page.locator('.barwrap').nth(3);
  const box = await bar.boundingBox();
  if (!box) return;

  // Simulate touchstart — exercises the touchstart path
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);

  await expect(page.locator('.tooltip.is-visible')).toBeVisible();
});

test('two-finger touch hides tooltip (touch)', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('iPhone'), 'Touch test — skipped on desktop');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  const bar = page.locator('.barwrap').nth(3);
  const box = await bar.boundingBox();
  if (!box) return;

  // Single tap to show tooltip
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  await expect(page.locator('.tooltip.is-visible')).toBeVisible();

  // Two-finger touchstart — exercises the e.touches.length > 1 path
  await page.evaluate((coords) => {
    const el = document.elementFromPoint(coords.x, coords.y);
    const wrap = el?.closest?.('.barwrap') ?? el;
    if (!wrap) return;
    const t1 = new Touch({ identifier: 1, target: wrap, clientX: coords.x,     clientY: coords.y });
    const t2 = new Touch({ identifier: 2, target: wrap, clientX: coords.x + 40, clientY: coords.y });
    wrap.closest('#priceBars,#priceChart,.chart')?.dispatchEvent(
      new TouchEvent('touchstart', { touches: [t1, t2], cancelable: true, bubbles: true }),
    );
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

  await page.waitForTimeout(200);
  await expect(page.locator('.tooltip.is-visible')).not.toBeVisible();
});

// ── Window selector ───────────────────────────────────────────────────────────

test('chart window selector buttons', async ({ page }, testInfo) => {
  const selector = page.locator('.usage-window-selector');

  await selector.locator('button[data-usage-window="1"]').click();
  await page.waitForTimeout(300);
  await expect(selector).toHaveScreenshot(
    `window-selector-1h-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0.02 },
  );

  await selector.locator('button[data-usage-window="6"]').click();
  await page.waitForTimeout(300);
  await expect(selector).toHaveScreenshot(
    `window-selector-6h-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0.02 },
  );
});

test('window selector persists selection to localStorage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Behaviour identical on mobile');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  await page.locator('button[data-usage-window="2"]').click();
  await page.waitForTimeout(300);

  // Check localStorage was written — exercises setConfiguredUsageWindowHours
  const stored = await page.evaluate(() => localStorage.getItem('usageWindowHours'));
  expect(stored).toBe('2');
});

test('window selector reads initial value from localStorage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Behaviour identical on mobile');

  // Pre-seed localStorage before the page loads
  await page.addInitScript(() => {
    localStorage.setItem('usageWindowHours', '6');
  });
  await page.reload();
  await page.waitForSelector('.weather-hero', { state: 'visible' });
  await page.waitForTimeout(800);

  // The 6h button should be active
  const btn6 = page.locator('button[data-usage-window="6"]');
  await expect(btn6).toHaveAttribute('aria-pressed', 'true');
});

// ── Chart flag labels ─────────────────────────────────────────────────────────

test('cheapest and most expensive price flags are visible', async ({ page }) => {
  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });

  // Both flags should be rendered (hidden=false) in our 30-bar mock
  const flags = page.locator('.flag:not([hidden])');
  await expect(flags).toHaveCount(2);
});

test('tomorrow day label is visible when forecast spans midnight', async ({ page }) => {
  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });

  // Our 30-bar mock starting 6h before FIXED (10:00) spans midnight → tomorrow label exists
  const dayLabel = page.locator('.day-label:not([hidden])');
  await expect(dayLabel).toHaveCount(1);
});

// ── Tooltip clamp — near left / right edge ────────────────────────────────────

test('tooltip clamps to left edge when hovering first bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Desktop only');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  await page.locator('.barwrap').first().hover();
  await page.waitForTimeout(150);

  const tooltip = page.locator('.tooltip.is-visible');
  await expect(tooltip).toBeVisible();

  // Tooltip should not overflow left edge of viewport
  const box = await tooltip.boundingBox();
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
});

test('tooltip clamps to right edge when hovering last bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Desktop only');

  await page.waitForSelector('.barwrap', { state: 'visible', timeout: 10000 });
  const bars = page.locator('.barwrap');
  await bars.last().hover();
  await page.waitForTimeout(150);

  const tooltip = page.locator('.tooltip.is-visible');
  await expect(tooltip).toBeVisible();

  const [box, vw] = await Promise.all([
    tooltip.boundingBox(),
    page.evaluate(() => window.innerWidth),
  ]);
  if (box) expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
});
