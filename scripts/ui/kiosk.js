/**
 * Adaptive viewport and optional kiosk controller.
 *
 * V2.2 uses the actual Visual Viewport instead of assuming that 100vh is the
 * visible browser area. This matters in Safari and on tablets where browser UI
 * can make a wide screen unexpectedly short. Four density modes are exposed to
 * CSS: cozy, compact, dense and micro.
 */

const qs = new URLSearchParams(location.search);

const KIOSK_CFG = {
  enabled: qs.get('kiosk') === '1',
  autoFullscreen: true,
  nightDimming: true,
  nightStartHour: 22,
  nightEndHour: 6,
  dimOpacity: 0.10,
};

const VIEWPORT_INSETS = {
  top: readInset('safeTop'),
  right: readInset('safeRight'),
  bottom: readInset('safeBottom'),
  left: readInset('safeLeft'),
};

let resizeRaf = 0;
let nightTimer = null;

function readInset(name) {
  const n = Number(qs.get(name));
  return Number.isFinite(n) ? Math.max(0, Math.min(240, Math.round(n))) : 0;
}

function viewportSize() {
  const viewport = window.visualViewport;
  return {
    width: Math.max(1, Math.floor(viewport?.width || window.innerWidth || 1)),
    height: Math.max(1, Math.floor(viewport?.height || window.innerHeight || 1)),
    offsetTop: Math.max(0, Math.floor(viewport?.offsetTop || 0)),
    offsetLeft: Math.max(0, Math.floor(viewport?.offsetLeft || 0)),
  };
}

function densityForViewport(width, height) {
  const aspect = width / Math.max(1, height);

  // A MacBook/Safari window can be roughly 1024 x 500 CSS pixels even when the
  // screenshot itself is 2048 pixels wide. This dedicated mode keeps all four
  // dashboard bands inside that genuinely visible height.
  if (width >= 900 && (height <= 620 || aspect >= 1.85 && height <= 680)) return 'micro';
  if (height <= 820 || aspect <= 1.32) return 'dense';
  if (height <= 980 || width <= 1280) return 'compact';
  return 'cozy';
}

function setDensityClass(density) {
  for (const mode of ['cozy', 'compact', 'dense', 'micro']) {
    document.body.classList.toggle(`dashboard-fit-${mode}`, density === mode);
  }
  document.body.dataset.dashboardFit = density;
  document.body.dataset.dashboardScale = '1.000';
}

export function setKioskScale() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    const { width, height, offsetTop, offsetLeft } = viewportSize();
    const effectiveWidth = Math.max(1, width - VIEWPORT_INSETS.left - VIEWPORT_INSETS.right);
    const effectiveHeight = Math.max(1, height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom);
    const density = densityForViewport(effectiveWidth, effectiveHeight);
    const root = document.documentElement;

    setDensityClass(density);

    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty('--viewport-width', `${width}px`);
    root.style.setProperty('--viewport-offset-top', `${offsetTop}px`);
    root.style.setProperty('--viewport-offset-left', `${offsetLeft}px`);
    root.style.setProperty('--usable-viewport-height', `${effectiveHeight}px`);
    root.style.setProperty('--usable-viewport-width', `${effectiveWidth}px`);
    root.style.setProperty('--safe-top-extra', `${VIEWPORT_INSETS.top}px`);
    root.style.setProperty('--safe-right-extra', `${VIEWPORT_INSETS.right}px`);
    root.style.setProperty('--safe-bottom-extra', `${VIEWPORT_INSETS.bottom}px`);
    root.style.setProperty('--safe-left-extra', `${VIEWPORT_INSETS.left}px`);
  });
}

async function requestFullscreen() {
  if (!KIOSK_CFG.enabled || !KIOSK_CFG.autoFullscreen || document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    // Fullscreen can require a user gesture or be disabled by the browser.
  }
}

function isNightHour(hour) {
  return KIOSK_CFG.nightStartHour > KIOSK_CFG.nightEndHour
    ? hour >= KIOSK_CFG.nightStartHour || hour < KIOSK_CFG.nightEndHour
    : hour >= KIOSK_CFG.nightStartHour && hour < KIOSK_CFG.nightEndHour;
}

function updateNightMode() {
  const night = KIOSK_CFG.enabled && KIOSK_CFG.nightDimming && isNightHour(new Date().getHours());
  document.body.classList.toggle('kiosk-night', night);
  document.body.style.setProperty('--kiosk-dim', night ? String(KIOSK_CFG.dimOpacity) : '0');
}

function ensureKioskElements() {
  if (!document.querySelector('.kiosk-dim-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'kiosk-dim-overlay';
    document.body.appendChild(overlay);
  }

  if (!document.querySelector('.kiosk-status')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kiosk-status';
    button.textContent = 'Kiosk';
    button.title = 'Klik voor volledig scherm';
    button.addEventListener('click', requestFullscreen);
    document.body.appendChild(button);
  }
}

export function initDashboardFitAndKiosk() {
  setKioskScale();
  window.addEventListener('resize', setKioskScale, { passive: true });
  window.visualViewport?.addEventListener('resize', setKioskScale, { passive: true });
  window.visualViewport?.addEventListener('scroll', setKioskScale, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(setKioskScale, 180), { passive: true });
  document.addEventListener('fullscreenchange', setKioskScale);
  document.fonts?.ready?.then(setKioskScale).catch(() => {});

  if (!KIOSK_CFG.enabled) {
    document.body.classList.remove('kiosk-mode', 'kiosk-night');
    document.body.style.setProperty('--kiosk-dim', '0');
    return;
  }

  document.body.classList.add('kiosk-mode');
  ensureKioskElements();
  updateNightMode();
  clearInterval(nightTimer);
  nightTimer = setInterval(updateNightMode, 60_000);

  ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => {
    document.addEventListener(eventName, requestFullscreen, { once: true, passive: true });
  });
}
