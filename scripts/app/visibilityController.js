/**
 * Visibility and animation lifecycle.
 */

import { $$ } from '../core/dom.js';

export function initVisibilityController({ onHidden, onVisible }) {
  let animationsPaused = false;

  function setAnimationsPaused(paused) {
    if (paused === animationsPaused) return;
    animationsPaused = paused;
    document.body.style.setProperty('--anim-state', paused ? 'paused' : 'running');
    $$('.particle, .icon').forEach(el => {
      el.style.animationPlayState = paused ? 'paused' : '';
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setAnimationsPaused(true);
      if (typeof onHidden === 'function') onHidden();
    } else {
      setAnimationsPaused(false);
      if (typeof onVisible === 'function') onVisible();
    }
  });
}
