/**
 * Fullscreen dashboard fit controller.
 *
 * Desktop/laptop: one fixed 1920x1080 control-room canvas is scaled to the
 * viewport, with density classes applied before the final scale.
 * Mobile/tablet: normal responsive CSS is used; no miniaturized dashboard.
 *
 * Kiosk mode is still enabled with ?kiosk=1 for fullscreen, night dimming and
 * optional burn-in protection.
 */

const qs = new URLSearchParams(location.search);

const KIOSK_CFG = {
  enabled:          qs.get('kiosk') === '1',
  autoFullscreen:   true,
  autoScale:        true,
  burnInSafe:       true,
  nightDimming:     true,
  nightStartHour:   22,
  nightEndHour:     6,
  maxShiftPx:       0,
  shiftEveryMs:     15 * 60_000,
  dimOpacity:       0.10,
  viewportPaddingX: 0,
  viewportPaddingY: 0,
  designWidth:      1920,
  designHeight:     1080,
  // On wide/short fullscreen displays the old fixed 16:9 canvas left empty
  // side margins. The canvas may now widen while the 1080px vertical rhythm
  // stays intact, so the dashboard fits both viewport width and height.
  dynamicWidth:     true,
  minDesignWidth:   1100,
  maxDesignWidth:   2400,
  mobileMaxWidth:   1100,
  minScale:         0.45,
  maxScale:         1.35,
};

let fitRaf            = 0;
let lastScale         = '';
let lastDensity       = '';
let lastCanvasWidth   = '';
let kioskNightTimer   = null;
let kioskBurnInTimer  = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function requestKioskFullscreen() {
  if (!KIOSK_CFG.autoFullscreen || document.fullscreenElement) return;
  const target = document.documentElement;
  try {
    await (target.requestFullscreen?.({ navigationUI: 'hide' }) ?? target.requestFullscreen?.());
  } catch { /* fullscreen unavailable */ }
}

function viewportSize() {
  const vv = window.visualViewport;
  return {
    w: Math.floor(vv?.width  || document.documentElement.clientWidth  || window.innerWidth  || 1),
    h: Math.floor(vv?.height || document.documentElement.clientHeight || window.innerHeight || 1),
  };
}

function currentZoomScale() {
  const value = parseFloat(getComputedStyle(document.body).getPropertyValue('--zoom-scale'));
  // Keep fullscreen auto-fit safe: zoom-out is allowed, zoom-in returns to
  // edge-to-edge fit instead of cropping content outside the viewport.
  return clamp(Number.isFinite(value) ? value : 1, 0.70, 1.00);
}

function designMetricsForViewport(availableW, availableH) {
  const designH = KIOSK_CFG.designHeight;
  let designW = KIOSK_CFG.designWidth;

  if (KIOSK_CFG.dynamicWidth) {
    const heightFitScale = availableH / designH;
    const widthAtHeightFit = heightFitScale > 0 ? availableW / heightFitScale : designW;
    designW = clamp(widthAtHeightFit, KIOSK_CFG.minDesignWidth, KIOSK_CFG.maxDesignWidth);
  }

  const fitScale = clamp(
    Math.min(availableW / designW, availableH / designH),
    KIOSK_CFG.minScale,
    KIOSK_CFG.maxScale
  );

  return { designW, designH, fitScale };
}

function setDensity(density) {
  document.body.classList.toggle('dashboard-fit-cozy', density === 'cozy');
  document.body.classList.toggle('dashboard-fit-compact', density === 'compact');
  document.body.classList.toggle('dashboard-fit-dense', density === 'dense');

  document.body.dataset.dashboardFit = density;
  lastDensity = density;
}

function clearDesktopFit() {
  document.body.classList.remove('dashboard-fit-cozy', 'dashboard-fit-compact', 'dashboard-fit-dense');
  document.body.dataset.dashboardFit = 'mobile';
  document.body.dataset.dashboardScale = '1.000';
  document.body.style.setProperty('--dashboard-fit-scale', '1');
  document.body.style.setProperty('--dashboard-total-scale', '1');
  document.body.style.setProperty('--dashboard-canvas-width', `${KIOSK_CFG.designWidth}px`);
  document.body.style.setProperty('--dashboard-canvas-height', `${KIOSK_CFG.designHeight}px`);
  document.body.style.setProperty('--kiosk-shift-x', '0px');
  document.body.style.setProperty('--kiosk-shift-y', '0px');
  lastScale = '1.000';
  lastDensity = 'mobile';
  lastCanvasWidth = `${KIOSK_CFG.designWidth}px`;
}

function growWeatherHeroIfNeeded(dash) {
  const hero  = dash.querySelector('.weather-hero');
  const zones = ['.command-zone--time', '.command-zone--weather', '.command-zone--celestial']
    .map((sel) => dash.querySelector(sel))
    .filter(Boolean);
  if (!hero || !zones.length) return;

  // Reset inline override so we read the clean CSS-token floor.
  hero.style.removeProperty('min-height');
  const tokenFloor = parseFloat(getComputedStyle(hero).minHeight) || 0;

  // scrollHeight gives us the true content height even when overflow:hidden
  // is hiding some of it visually. Measure every command zone — not just
  // the weather zone — since the clock or sun/moon column can be the
  // tallest one at some densities/viewport heights (e.g. after toggling
  // fullscreen, where the width stays the same but the available height
  // changes and picks a different density class).
  const heroOwnPadding = (parseFloat(getComputedStyle(hero).paddingTop) || 0)
    + (parseFloat(getComputedStyle(hero).paddingBottom) || 0);
  const tallestZone = Math.max(...zones.map((zone) => zone.scrollHeight));
  const safetyMargin = 6; // headroom for font-metric/ascender overshoot at large clock sizes
  const needed = Math.ceil(tallestZone + heroOwnPadding + safetyMargin);
  hero.style.setProperty('min-height', `${Math.max(tokenFloor, needed)}px`, 'important');
}

function fillRemainingHeight(dash) {
  growWeatherHeroIfNeeded(dash);
  const designH = KIOSK_CFG.designHeight;
  const topbar  = dash.querySelector('.topbar');
  const hero    = dash.querySelector('.weather-hero');
  const insight = dash.querySelector('.smart-insight');
  const flow    = dash.querySelector('.panel[data-i18n-label="section-flow"]');
  const price   = dash.querySelector('.panel[data-i18n-label="section-prices"]');
  if (!topbar || !hero || !insight || !flow || !price) return;

  const cs = getComputedStyle(dash);
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const paddingBottom = parseFloat(cs.paddingBottom) || 0;
  const flexGap = parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0;

  // offsetHeight/margins are read pre-transform, so these are already
  // in design-space px regardless of the current fit/zoom scale.
  const blockHeight = (el) => {
    const m = getComputedStyle(el);
    return el.offsetHeight + (parseFloat(m.marginTop) || 0) + (parseFloat(m.marginBottom) || 0);
  };

  const used = paddingTop
    + blockHeight(topbar) + flexGap
    + blockHeight(hero) + flexGap
    + blockHeight(insight) + flexGap
    + blockHeight(flow) + flexGap
    + paddingBottom;
  const remaining = Math.max(180, designH - used);
  price.style.height = `${Math.round(remaining)}px`;
  price.style.minHeight = `${Math.round(remaining)}px`;
}

let sectionObserver = null;
function watchSectionSizes(dash) {
  if (sectionObserver || typeof ResizeObserver === 'undefined') return;
  const targets = ['.topbar', '.weather-hero', '.smart-insight', '.panel[data-i18n-label="section-flow"]']
    .map((sel) => dash.querySelector(sel))
    .filter(Boolean);
  if (!targets.length) return;
  sectionObserver = new ResizeObserver(() => setKioskScale());
  targets.forEach((el) => sectionObserver.observe(el));
}

export function setKioskScale() {
  if (!KIOSK_CFG.autoScale) return;
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    const dash = document.querySelector('.dashboard');
    if (!dash) return;

    const vp = viewportSize();
    const availableW = Math.max(1, vp.w - KIOSK_CFG.viewportPaddingX);
    const availableH = Math.max(1, vp.h - KIOSK_CFG.viewportPaddingY);

    if (availableW <= KIOSK_CFG.mobileMaxWidth) {
      clearDesktopFit();
      dash.querySelector('.panel[data-i18n-label="section-prices"]')?.style.removeProperty('height');
      dash.querySelector('.panel[data-i18n-label="section-prices"]')?.style.removeProperty('min-height');
      return;
    }

    const aspect = availableW / availableH;
    let density = 'cozy';
    if (availableH < 880 || aspect < 1.55) density = 'dense';
    else if (availableH < 1010 || aspect < 1.70) density = 'compact';
    setDensity(density);

    // Measure the *actual* rendered height of every other section (after the
    // density class above has been applied) and let the price/chart panel
    // absorb exactly whatever design-space height is left. This makes the
    // 1080px design canvas self-balancing: if any section's real content
    // height ever changes, this recomputes instead of relying on hand-tuned
    // per-density constants that can silently drift out of sync.
    fillRemainingHeight(dash);
    watchSectionSizes(dash);

    const { designW, fitScale } = designMetricsForViewport(availableW, availableH);
    const zoom = currentZoomScale();
    const totalScale = clamp(fitScale * zoom, KIOSK_CFG.minScale, fitScale);
    const scaleText = fitScale.toFixed(3);
    const totalText = totalScale.toFixed(3);
    const canvasWidthText = `${Math.round(designW)}px`;

    if (lastScale !== totalText || lastDensity !== density || lastCanvasWidth !== canvasWidthText) {
      document.body.style.setProperty('--dashboard-canvas-width', canvasWidthText);
      document.body.style.setProperty('--dashboard-canvas-height', `${KIOSK_CFG.designHeight}px`);
      document.body.style.setProperty('--dashboard-fit-scale', scaleText);
      document.body.style.setProperty('--dashboard-total-scale', totalText);
      document.body.dataset.dashboardScale = totalText;
      document.body.dataset.dashboardCanvasWidth = canvasWidthText;
      lastScale = totalText;
      lastCanvasWidth = canvasWidthText;
    }
  });
}

function scheduleKioskScale() {
  setKioskScale();
}

function setBurnInShift() {
  const max = KIOSK_CFG.maxShiftPx;
  if (!KIOSK_CFG.burnInSafe || max <= 0) {
    document.body.style.setProperty('--kiosk-shift-x', '0px');
    document.body.style.setProperty('--kiosk-shift-y', '0px');
    return;
  }
  const x = Math.round((Math.random() * 2 - 1) * max);
  const y = Math.round((Math.random() * 2 - 1) * max);
  document.body.style.setProperty('--kiosk-shift-x', `${x}px`);
  document.body.style.setProperty('--kiosk-shift-y', `${y}px`);
}

function updateKioskNightMode() {
  if (!KIOSK_CFG.nightDimming) return;
  const h = new Date().getHours();
  const night = KIOSK_CFG.nightStartHour > KIOSK_CFG.nightEndHour
    ? (h >= KIOSK_CFG.nightStartHour || h < KIOSK_CFG.nightEndHour)
    : (h >= KIOSK_CFG.nightStartHour && h < KIOSK_CFG.nightEndHour);
  document.body.classList.toggle('kiosk-night', night);
  document.body.style.setProperty('--kiosk-dim', night ? String(KIOSK_CFG.dimOpacity) : '0');
}

export function initDashboardFitAndKiosk() {
  [0, 100, 350, 900, 1800].forEach(ms => setTimeout(setKioskScale, ms));
  window.addEventListener('resize', scheduleKioskScale, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleKioskScale, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(setKioskScale, 350), { passive: true });
  document.addEventListener('fullscreenchange', () => setTimeout(setKioskScale, 250));
  window.addEventListener('load', () => setTimeout(setKioskScale, 150), { once: true });
  document.fonts?.ready?.then(() => setTimeout(setKioskScale, 150)).catch(() => {});

  const vp = viewportSize();
  const isMobileLayout = vp.w <= KIOSK_CFG.mobileMaxWidth;

  if (!KIOSK_CFG.enabled || isMobileLayout) {
    document.body.classList.remove('kiosk-mode', 'kiosk-night');
    document.body.style.setProperty('--kiosk-shift-x', '0px');
    document.body.style.setProperty('--kiosk-shift-y', '0px');
    document.body.style.setProperty('--kiosk-dim', '0');
    return;
  }

  document.body.classList.add('kiosk-mode');

  if (!document.querySelector('.kiosk-dim-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'kiosk-dim-overlay';
    document.body.appendChild(overlay);
  }
  if (!document.querySelector('.kiosk-status')) {
    const status = document.createElement('button');
    status.type = 'button';
    status.className = 'kiosk-status';
    status.textContent = 'Kiosk mode';
    status.title = 'Click once to enter fullscreen';
    status.addEventListener('click', () => { requestKioskFullscreen(); setTimeout(setKioskScale, 180); });
    document.body.appendChild(status);
  }

  updateKioskNightMode();
  setBurnInShift();
  clearInterval(kioskNightTimer);
  clearInterval(kioskBurnInTimer);
  kioskNightTimer = setInterval(updateKioskNightMode, 60_000);
  kioskBurnInTimer = setInterval(setBurnInShift, KIOSK_CFG.shiftEveryMs);

  ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, () => {
      requestKioskFullscreen();
      setTimeout(setKioskScale, 250);
    }, { once: true, passive: true });
  });

  setTimeout(requestKioskFullscreen, 800);
}
