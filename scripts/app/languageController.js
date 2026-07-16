/**
 * Language toggle lifecycle.
 */

import { $ } from '../core/dom.js';
import { getLang, setLang } from '../i18n.js';

export function initLanguageToggle(onAfterApply) {
  const langToggle = $('#langToggle');
  if (!langToggle) return;

  langToggle.addEventListener('click', () => {
    const next = getLang() === 'nl' ? 'en' : 'nl';
    setLang(next, () => {
      if (typeof onAfterApply === 'function') onAfterApply();
    });
  });
}
