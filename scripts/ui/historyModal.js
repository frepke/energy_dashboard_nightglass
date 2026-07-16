/**
 * History — opent de Domoticz device-log rechtstreeks.
 * Geen eigen modal, geen grafiek, geen parsing. Gewoon de werkende log.
 */

import { ensureDeviceIds } from '../services/domoticzService.js';
import { t } from '../i18n.js';

const DEVICE_KEYS = {
  grid: 'p1',
  house: 'usage',
  solar: 'solar',
  gas: 'gas',
  selfSuff: 'selfSufficiency',
  selfCons: 'selfConsumption',
};

async function openLog(type) {
  let ids;
  try {
    ids = await ensureDeviceIds();
  } catch {
    alert(t('history-no-device'));
    return;
  }

  let idx = ids[DEVICE_KEYS[type]];
  if (type === 'house' && (!idx || String(idx) === '-1')) idx = ids.p1;
  if (!idx || String(idx) === '-1') { alert(t('history-no-device')); return; }

  window.open(`/#/Devices/${idx}/Log`, '_blank');
}

export function setupHistoryCards() {
  [
    ['.card-grid',     'grid'],
    ['.card-house',    'house'],
    ['.card-solar',    'solar'],
    ['.card-gas',      'gas'],
    ['.card-self-suff', 'selfSuff'],
    ['.card-self-cons', 'selfCons'],
  ].forEach(([selector, type]) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.classList.add('is-clickable');
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('title', t('history-open-title'));
    element.addEventListener('click',   () => openLog(type));
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLog(type);
      }
    });
  });
}
