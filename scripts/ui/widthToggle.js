/**
 * Zoom control — two buttons (🔍− / 🔍+) that scale the dashboard
 * visually in steps of 10%, from 70% to 100%. The fullscreen fit itself is
 * automatic, so zoom-in never crops the dashboard outside the viewport.
 */

import { setKioskScale } from './kiosk.js';

const STOR_KEY  = 'dash-zoom';
const MIN_SCALE = 0.70;
const MAX_SCALE = 1.00;
const STEP      = 0.10;
const DEFAULT   = 1.00;

function clamp(v) {
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, v)) * 100) / 100;
}

export function setupWidthToggle() {
  const dash   = document.querySelector('.dashboard');
  const btnOut = document.getElementById('zoomOut');
  const btnIn  = document.getElementById('zoomIn');
  if (!dash || !btnOut || !btnIn) return;

  const saved = parseFloat(localStorage.getItem(STOR_KEY));
  let scale   = isFinite(saved) ? clamp(saved) : DEFAULT;

  function apply(s) {
    scale = clamp(s);

    // Hybrid fit: kiosk.js calculates the viewport-safe auto-fit scale.
    // User zoom now only zooms out or returns to automatic fullscreen fit.
    document.body.style.setProperty('--zoom-scale', scale);

    // Dim the buttons at limits
    btnOut.disabled      = scale <= MIN_SCALE;
    btnIn.disabled       = scale >= MAX_SCALE;
    btnOut.style.opacity = scale <= MIN_SCALE ? '0.35' : '';
    btnIn.style.opacity  = scale >= MAX_SCALE ? '0.35' : '';

    try { localStorage.setItem(STOR_KEY, scale); } catch { /* ignore */ }

    // Recalculate dashboard fit after the user changes zoom
    setKioskScale();
  }

  btnOut.addEventListener('click', () => apply(scale - STEP));
  btnIn.addEventListener('click',  () => apply(scale + STEP));

  apply(scale);
}
