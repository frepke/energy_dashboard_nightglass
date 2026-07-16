/**
 * Energy flow animation — particle flow lines and node icon effects.
 *
 * Flow updates are scheduled to apply only when the particle is not visible,
 * avoiding jarring mid-animation direction or color changes.
 */


// Per-element state maps (WeakMap so GC can collect removed elements)
const flowPending = new WeakMap();
const flowCurrent = new WeakMap();

const PARTICLE_COUNT = 3;

function getFlowAnimationName(dir) {
  try {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 560px) and (orientation: portrait)').matches) {
      return dir === 'dir-left' ? 'ng-flow-up-portrait-v3' : 'ng-flow-down-portrait-v3';
    }
  } catch {
    // Ignore matchMedia/window access issues outside the browser.
  }
  return dir === 'dir-left' ? 'flow-left' : 'flow-right';
}

function ensureFlowParticles(el) {
  const particles = Array.from(el.querySelectorAll('.particle'));
  for (let i = particles.length; i < PARTICLE_COUNT; i += 1) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.setAttribute('aria-hidden', 'true');
    el.appendChild(particle);
  }
  return Array.from(el.querySelectorAll('.particle'));
}

function updateFlowIntensity(el, power) {
  const p = Math.abs(+power || 0);
  const intensity = Math.max(0, Math.min(1, p / 3000));
  const laneSpread = Math.round(3 + intensity * 10);
  el.style.setProperty('--flow-intensity', intensity.toFixed(3));
  el.style.setProperty('--flow-lane-spread', laneSpread + 'px');
}

function applyFlowState(el, arrow, state) {
  const particles = ensureFlowParticles(el);
  const cur = flowCurrent.get(el) || {};

  if (state.dir !== cur.dir) {
    el.classList.remove('dir-left', 'dir-right');
    el.classList.add(state.dir);
  }
  if (state.active !== cur.active) {
    el.classList.toggle('is-active', state.active);
    el.classList.toggle('is-off',   !state.active);
  }
  if (state.color !== cur.color) {
    el.style.setProperty('--flow-color', state.color);
  }
  if (particles.length && (state.speed !== cur.speed || state.dir !== cur.dir || state.active !== cur.active)) {
    const animationName = getFlowAnimationName(state.dir);
    particles.forEach((particle, index) => {
      if (state.active) {
        const delay = index === 0 ? 0 : -parseFloat(state.speed) * (index / particles.length);
        particle.style.animationName           = animationName;
        particle.style.animationDuration       = state.speed;
        particle.style.animationTimingFunction = 'cubic-bezier(.45,0,.55,1)';
        particle.style.animationIterationCount = 'infinite';
        particle.style.animationFillMode       = 'none';
        particle.style.animationDelay          = delay.toFixed(2) + 's';
      } else {
        particle.style.animationName = 'none';
        particle.style.opacity       = '0';
      }
    });
  }
  if (arrow) {
    const arrowChar = state.dir === 'dir-left' ? '←' : '→';
    if (arrow.dataset.arrowDir !== arrowChar) {
      let ico = arrow.querySelector('.ico');
      if (!ico) {
        ico = document.createElement('span');
        ico.className = 'ico';
        arrow.appendChild(ico);
      }
      ico.textContent = arrowChar;
      arrow.dataset.arrowDir = arrowChar;
    }
    if (arrow.style.color !== state.color) arrow.style.color = state.color;
  }

  flowCurrent.set(el, { ...state });
}

function scheduleFlowUpdate(el, arrow, state) {
  flowPending.set(el, { arrow, state });
  if (el.dataset.flowScheduled === '1') return;

  const p = ensureFlowParticles(el)[0];
  if (!p) { applyFlowState(el, arrow, state); return; }

  function tryApply() {
    const pending = flowPending.get(el);
    if (!pending) { el.dataset.flowScheduled = '0'; return; }

    const cur = flowCurrent.get(el) || {};
    // If no active animation: apply immediately
    if (!cur.active || !p.style.animationName || p.style.animationName === 'none') {
      el.dataset.flowScheduled = '0';
      flowPending.delete(el);
      applyFlowState(el, pending.arrow, pending.state);
      return;
    }

    // Wait for the particle's dead zone (opacity=0 at 0–8% and 92–100% of cycle)
    const anims = p.getAnimations ? p.getAnimations() : [];
    const anim  = anims[0];
    if (anim && anim.effect) {
      const timing = anim.effect.getComputedTiming ? anim.effect.getComputedTiming() : null;
      if (timing && timing.duration > 0) {
        const ct       = (anim.currentTime || 0) % timing.duration;
        const fraction = ct / timing.duration;
        if (fraction >= 0.92 || fraction < 0.05) {
          el.dataset.flowScheduled = '0';
          flowPending.delete(el);
          applyFlowState(el, pending.arrow, pending.state);
          return;
        }
      }
    }

    requestAnimationFrame(tryApply);
  }

  el.dataset.flowScheduled = '1';
  requestAnimationFrame(tryApply);
}

/**
 * Updates a flow line's direction, color, and speed.
 * Small fluctuations in speed are rounded to 0.2s steps to reduce unnecessary updates.
 *
 * @param {Element} el    - The .flowline element
 * @param {Element} arrow - The adjacent .arrow element
 * @param {string}  dir   - 'dir-left' | 'dir-right'
 * @param {string}  color - CSS color string
 * @param {number}  power - Power in watts (determines particle speed)
 */
export function setFlow(el, arrow, dir, color, power) {
  if (!el) return;
  ensureFlowParticles(el);
  updateFlowIntensity(el, power);
  const active      = Math.abs(power) > 5;
  const rawSpeed    = powerToSpeed(power);
  const roundedSpeed = (Math.round(rawSpeed * 5) / 5).toFixed(1) + 's';

  const cur      = flowCurrent.get(el) || {};
  const newState = { active, dir, color, speed: roundedSpeed };

  if (cur.active === active && cur.dir === dir && cur.color === color && cur.speed === roundedSpeed) return;

  scheduleFlowUpdate(el, arrow, newState);
}

function powerToSpeed(powerW) {
  const p       = Math.abs(+powerW || 0);
  if (p < 5) return 0;
  const clamped = Math.max(25, Math.min(3000, p));
  const ratio   = (clamped - 25) / (3000 - 25);
  return 5.8 - (5.8 - 0.75) * ratio;
}

/**
 * Applies a glow intensity and tilt effect to an icon node based on its power level.
 *
 * @param {Element} node      - The .node element containing the icon
 * @param {number}  power     - Watts
 * @param {number}  direction - Tilt direction (+1 or -1 or 0)
 */
export function setIconIntensity(node, power, direction = 1) {
  if (!node) return;
  const p         = Math.abs(+power || 0);
  const intensity = Math.max(.08, Math.min(1, p / 3000));
  const tilt      = Math.min(7, 1.2 + intensity * 6);

  node.classList.toggle('is-active', p > 8);
  node.style.setProperty('--icon-intensity', intensity.toFixed(3));
  node.style.setProperty('--tilt-x', (-tilt * .32).toFixed(2) + 'deg');
  node.style.setProperty('--tilt-y', (tilt * direction).toFixed(2) + 'deg');
}
