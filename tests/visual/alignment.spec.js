// @ts-check
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 2048, height: 944 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__PLAYWRIGHT__ = true;
    const FIXED = new Date('2026-07-15T10:16:59Z').getTime();
    const NativeDate = Date;
    class MockDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [FIXED])); }
      static now() { return FIXED; }
    }
    window.Date = MockDate;

    const HOUR = 3_600_000;
    window.__MOCK_PRICE_FORECAST__ = Array.from({ length: 24 }, (_, i) => ({
      ts: FIXED - 4 * HOUR + i * HOUR,
      ct: 15 + Math.round(Math.sin(i / 3) * 10),
    }));
    window.__MOCK_CURRENT_PRICE_CT__ = 18.52;

    const HISTORY_START = FIXED - 12 * HOUR;
    const history = (fn) => Array.from({ length: 25 }, (_, i) => ({
      t: HISTORY_START + i * HOUR / 2,
      v: fn(i),
    }));
    window.__MOCK_DEVICE_HISTORY__ = {
      grid: history(i => 1.6 * Math.sin(i / 2.8) - 0.45),
      house: history(i => 1.7 + 0.55 * Math.sin(i / 2.2) + (i === 15 ? 1.4 : 0)),
      solar: history(i => Math.max(0, 3.8 * Math.sin((i - 2) / 22 * Math.PI))),
      selfSuff: history(i => Math.max(0, Math.min(100, 45 + 35 * Math.sin((i - 3) / 22 * Math.PI)))),
      selfCons: history(i => Math.max(0, Math.min(100, 76 - 26 * Math.sin((i - 3) / 22 * Math.PI)))),
      gas: history(i => 0.01 + i * 0.0025),
    };
  });

  await page.goto('/energy-dashboard.html');
  await page.waitForSelector('.energy-panel');
  await page.waitForFunction(() => document.body.classList.contains('dashboard-fit-compact'));

  await page.evaluate(() => {
    const badge = document.getElementById('limitBadge');
    if (badge) {
      badge.hidden = false;
      badge.className = 'limitBadge is-visible is-blocked';
      badge.textContent = 'PV blocked';
    }

    for (const [id, animationName] of [
      ['gridFlow', 'flow-right'],
      ['solarFlow', 'flow-left'],
    ]) {
      const line = document.getElementById(id);
      if (!line) continue;
      line.classList.remove('is-off');
      line.classList.add('is-active');
      while (line.querySelectorAll('.particle').length < 3) {
        const particle = document.createElement('span');
        particle.className = 'particle';
        line.appendChild(particle);
      }
      line.querySelectorAll('.particle').forEach((particle, index) => {
        const htmlParticle = /** @type {HTMLElement} */ (particle);
        htmlParticle.style.animationName = animationName;
        htmlParticle.style.animationDuration = '4s';
        htmlParticle.style.animationIterationCount = 'infinite';
        htmlParticle.style.animationDelay = `${-index * 1.2}s`;
      });
    }
  });
});

function isInside(inner, outer, tolerance = 1) {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

async function seedTextStressContent(page) {
  await page.evaluate(() => {
    const setText = (selector, text) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = text;
    };

    setText('#statusText', 'Bijgewerkt om 07:31 — gateway synchroniseert grijzig prijsverloop');
    setText('#weatherDesc', 'Zwaar bewolkt, grijzige motregen en vlagerige zijwind');
    setText('#weatherHumidity', '💧 Luchtvochtigheid 97%');
    setText('#weatherWind', '💨 Zijwind 37 km/h');
    setText('#weatherPressure', '🌐 Luchtdruk 1007 hPa');
    setText('#moonPhase', 'Afnemende gibbeus');
    setText('#moonIllum', '97% verlicht');
    setText('#moonRise', '21:47');
    setText('#moonSet', '08:15');
    setText('#moonAge', '17 dagen');
    setText('#moonDistance', '394.425 km');
    setText('#moonFullMoonWhen', 'vrijdag over negen dagen');
    setText('#moonNewMoonWhen', 'zondag over twintig dagen');
    setText('#smartInsightText', 'Gebruik je wasdroger tijdens de goedkoopste uren voor lagere dagkosten.');
    setText('#smartInsightContext', 'Vergelijk teruglevering, verbruik en prijsbeweging zorgvuldig bij grijze pieken.');
    setText('#smartGridPill', 'Net teruglevering');
    setText('#smartSolarPill', 'Zon opbrengst');
    setText('#smartPricePill', 'Prijs gunstig');
    setText('#smartNextPill', 'Beste volgorde');
    setText('#gridW', '12.345 W');
    setText('#gridDir', 'Teruglevering bezig');
    setText('#houseW', '3.210 W');
    setText('#solarW', '9.876 W');
    setText('#localSolarW', 'Lokaal 4.567 W');
    setText('#gridToday', '12,7 kWh');
    setText('#gridNet', 'Netto vergelijking gisteren');
    setText('#houseToday', '8,9 kWh');
    setText('#solarToday', '14,2 kWh');
    setText('#solarStatus', 'Vandaag grijzig');
    setText('#selfSuff', '97%');
    setText('#selfCons', '83%');
    setText('#gasToday', '2,17 m³');
    setText('#gasYear', '1.024 m³ vergelijking');
    setText('#updated', 'Bijgewerkt: vandaag 07:31');

    document.querySelectorAll('.history-summary').forEach((element, index) => {
      element.textContent = index % 2 === 0 ? 'Vergelijking gisteren' : 'Vergelijking vorige week';
    });

    document.querySelectorAll('.price-line .price-text, .solar-price .price-text, .gas-price .price-text')
      .forEach((element, index) => {
        element.textContent = [
          'Stroom € 0,123/kWh',
          'Zon € 0,118/kWh',
          'Gas € 1,297/m³',
        ][index] || 'Prijs € 0,123';
      });

    document.querySelectorAll('.badge .price-text').forEach((element, index) => {
      element.textContent = index === 0 ? 'Stroom € 0,123/kWh' : 'Gas € 1,297/m³';
    });

    const limitBadge = document.getElementById('limitBadge');
    if (limitBadge) {
      limitBadge.hidden = false;
      limitBadge.className = 'limitBadge is-visible is-blocked';
      limitBadge.textContent = 'PV begrenzing actief';
    }
  });
}

async function auditTextStressLayout(page) {
  return page.evaluate(() => {
    const tolerance = 1;
    const targets = [
      { selector: '#statusText', container: '.status', minRatio: 1.12 },
      { selector: '.zone-kicker', container: '.zone-heading', minRatio: 1.12 },
      { selector: '#weatherDesc', container: '.weather-now-copy', minRatio: 1.12 },
      { selector: '.weather-meta span', container: '.weather-meta', minRatio: 1.12 },
      { selector: '#moonPhase', container: '.moon-info', minRatio: 1.08 },
      { selector: '.moon-event > span', container: '.moon-event', minRatio: 1.12 },
      { selector: '.moon-event > strong', container: '.moon-event', minRatio: 1.08 },
      { selector: '.flow .label', container: '.node-text', minRatio: 1.12 },
      { selector: '.flow .value', container: '.node-text', minRatio: 1.08 },
      { selector: '.flow .sub', container: '.node-text', minRatio: 1.12 },
      { selector: '.card h3', container: '.card-topline', minRatio: 1.12 },
      { selector: '.card-metric > strong', container: '.card-metric', minRatio: 1.08 },
      { selector: '.card-metric > small', container: '.card-metric', minRatio: 1.12 },
      { selector: '.price-line .price-text, .solar-price .price-text, .gas-price .price-text', container: '.card-footer', minRatio: 1.12 },
      { selector: '.usage-window-label', container: '#usageWindowSelector', minRatio: 1.12 },
      { selector: '.pricesHeader .title', container: '.pricesTitleBlock', minRatio: 1.12 },
      { selector: '#updated', container: '.pricesTitleBlock', minRatio: 1.12 },
      { selector: '.badge .price-text', container: '.badge', minRatio: 1.12 },
    ];

    const failures = [];

    for (const target of targets) {
      const elements = Array.from(document.querySelectorAll(target.selector));

      elements.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;

        const container = element.closest(target.container) || element.parentElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const computed = window.getComputedStyle(element);
        const fontSize = Number.parseFloat(computed.fontSize);
        const lineHeight = Number.parseFloat(computed.lineHeight);
        const ratio = Number.isFinite(fontSize) && Number.isFinite(lineHeight) && fontSize > 0
          ? lineHeight / fontSize
          : null;
        const outside = rect.left < containerRect.left - tolerance
          || rect.right > containerRect.right + tolerance
          || rect.top < containerRect.top - tolerance
          || rect.bottom > containerRect.bottom + tolerance;

        if (outside || (ratio !== null && ratio + 0.01 < target.minRatio)) {
          failures.push({
            target: `${target.selector}[${index}]`,
            text: element.textContent?.trim() || '',
            outside,
            ratio,
            minRatio: target.minRatio,
          });
        }
      });
    }

    const panelOverflow = Array.from(document.querySelectorAll('.panel')).some(panel => (
      panel.scrollWidth > panel.clientWidth + 1
    ));

    return {
      failures,
      panelOverflow,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

test('PV limit label stays fully inside the solar node', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Desktop geometry check');

  const [node, badge] = await Promise.all([
    page.locator('.node.solar').boundingBox(),
    page.locator('#limitBadge').boundingBox(),
  ]);

  expect(node).not.toBeNull();
  expect(badge).not.toBeNull();
  expect(isInside(badge, node, 0.5)).toBe(true);
});

test('all flow particles are vertically centred inside their rail', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Desktop geometry check');

  const deltas = await page.locator('.flowline').evaluateAll(lines => lines.flatMap(line => {
    const rail = line.getBoundingClientRect();
    const railCentre = rail.top + rail.height / 2;
    return Array.from(line.querySelectorAll('.particle')).map(particle => {
      const dot = particle.getBoundingClientRect();
      return Math.abs(dot.top + dot.height / 2 - railCentre);
    });
  }));

  expect(deltas.length).toBeGreaterThan(0);
  expect(Math.max(...deltas)).toBeLessThanOrEqual(0.5);
});

test('card content and full-card history watermarks stay inside every tile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Desktop geometry check');

  await page.waitForFunction(() => (
    document.querySelectorAll('.card[data-history-state="ready"]').length === 6
  ));

  const cards = await page.locator('.card[data-history-card]').evaluateAll(elements => elements.map(card => {
    const cardRect = card.getBoundingClientRect();
    const metric = card.querySelector('.card-metric')?.getBoundingClientRect();
    const watermark = card.querySelector('.history-watermark')?.getBoundingClientRect();
    const lines = Array.from(card.querySelectorAll('.history-watermark-line'))
      .map(line => line.getAttribute('d') || '');
    const inside = rect => Boolean(rect)
      && rect.left >= cardRect.left - 1
      && rect.right <= cardRect.right + 1
      && rect.top >= cardRect.top - 1
      && rect.bottom <= cardRect.bottom + 1;
    return {
      metricInside: inside(metric),
      watermarkInside: inside(watermark),
      watermarkCoversCard: Boolean(watermark)
        && Math.abs(watermark.width - cardRect.width) <= 1
        && Math.abs(watermark.height - cardRect.height) <= 1,
      hasLine: lines.some(line => line.startsWith('M') && line.includes('L')),
    };
  }));

  expect(cards).toHaveLength(6);
  expect(cards.every(card => card.metricInside)).toBe(true);
  expect(cards.every(card => card.watermarkInside)).toBe(true);
  expect(cards.every(card => card.watermarkCoversCard)).toBe(true);
  expect(cards.every(card => card.hasLine)).toBe(true);
});

test('geometry remains contained across cozy, dense and micro viewports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Desktop geometry check');

  const cases = [
    { width: 2048, height: 984, density: 'cozy' },
    { width: 1366, height: 768, density: 'dense' },
    { width: 1024, height: 500, density: 'micro' },
  ];

  for (const viewport of cases) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/energy-dashboard.html?geometry=${viewport.width}x${viewport.height}`);
    await page.waitForSelector('.energy-panel');
    await page.waitForFunction(
      density => document.body.classList.contains(`dashboard-fit-${density}`),
      viewport.density,
    );

    await page.evaluate(() => {
      const badge = document.getElementById('limitBadge');
      if (badge) {
        badge.hidden = false;
        badge.className = 'limitBadge is-visible is-blocked';
        badge.textContent = 'PV blocked';
      }

      document.querySelectorAll('.flowline').forEach((line, lineIndex) => {
        line.classList.remove('is-off');
        line.classList.add('is-active');
        while (line.querySelectorAll('.particle').length < 3) {
          const particle = document.createElement('span');
          particle.className = 'particle';
          line.appendChild(particle);
        }
        line.querySelectorAll('.particle').forEach((particle, particleIndex) => {
          const htmlParticle = /** @type {HTMLElement} */ (particle);
          htmlParticle.style.animationName = lineIndex === 0 ? 'flow-right' : 'flow-left';
          htmlParticle.style.animationDuration = '4s';
          htmlParticle.style.animationIterationCount = 'infinite';
          htmlParticle.style.animationDelay = `${-particleIndex * 1.2}s`;
        });
      });
    });

    const audit = await page.evaluate(() => {
      const inside = (inner, outer, tolerance = 1) => inner.left >= outer.left - tolerance
        && inner.top >= outer.top - tolerance
        && inner.right <= outer.right + tolerance
        && inner.bottom <= outer.bottom + tolerance;

      const solar = document.querySelector('.node.solar')?.getBoundingClientRect();
      const badge = document.getElementById('limitBadge')?.getBoundingClientRect();
      const panelOverflow = Array.from(document.querySelectorAll('.panel')).some(panel => (
        panel.scrollHeight > panel.clientHeight + 1 || panel.scrollWidth > panel.clientWidth + 1
      ));
      const particleDeltas = Array.from(document.querySelectorAll('.flowline')).flatMap(line => {
        const rail = line.getBoundingClientRect();
        const centre = rail.top + rail.height / 2;
        return Array.from(line.querySelectorAll('.particle')).map(particle => {
          const rect = particle.getBoundingClientRect();
          return Math.abs(rect.top + rect.height / 2 - centre);
        });
      });

      return {
        documentOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
          || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        panelOverflow,
        badgeInside: Boolean(solar && badge && inside(badge, solar, 0.5)),
        maxParticleDelta: particleDeltas.length ? Math.max(...particleDeltas) : Infinity,
      };
    });

    expect(audit.documentOverflow, `${viewport.width}x${viewport.height}: document overflow`).toBe(false);
    expect(audit.panelOverflow, `${viewport.width}x${viewport.height}: panel overflow`).toBe(false);
    expect(audit.badgeInside, `${viewport.width}x${viewport.height}: PV badge escaped`).toBe(true);
    expect(audit.maxParticleDelta, `${viewport.width}x${viewport.height}: particle not centred`).toBeLessThanOrEqual(0.5);
  }
});

test('text stays visible across representative viewport groups', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('iPhone'), 'Explicit cross-viewport audit uses desktop project sizing');

  const viewports = [
    { width: 320, height: 700 },
    { width: 428, height: 926 },
    { width: 768, height: 1024 },
    { width: 1366, height: 900 },
    { width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/energy-dashboard.html?text-audit=${viewport.width}x${viewport.height}`);
    await page.waitForSelector('.prices-panel');
    await page.waitForFunction(() => document.querySelectorAll('.card[data-history-card]').length === 6);
    await page.waitForTimeout(600);
    await seedTextStressContent(page);

    const audit = await auditTextStressLayout(page);

    expect(audit.documentOverflow, `${viewport.width}x${viewport.height}: document overflow`).toBe(false);
    expect(audit.panelOverflow, `${viewport.width}x${viewport.height}: panel overflow`).toBe(false);
    expect(audit.failures, `${viewport.width}x${viewport.height}: ${JSON.stringify(audit.failures, null, 2)}`).toEqual([]);
  }
});
