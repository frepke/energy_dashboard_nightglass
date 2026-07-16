/**
 * WebSocket lifecycle and Domoticz subscription orchestration.
 */

import { CFG } from '../config/resolveConfig.js';
import {
  ensureDeviceIds,
  domoticzWebSocketUrl,
} from '../services/domoticzService.js';
import { t } from '../i18n.js';

export function createWebSocketController({
  refreshAll,
  refreshDistribution,
  setStatus,
  getForecastDeviceId,
  onOpen,
  onClose,
} = {}) {
  let socket = null;
  let lastWsRefresh = 0;
  let reconnectTimer = null;

  function wsSend(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  async function primeWebSocketSubscriptions() {
    try {
      const ids = await ensureDeviceIds();
      const idList = Object.values(ids)
        .concat(getForecastDeviceId() || [])
        .filter(x => x && String(x) !== '-1');

      if (!idList.length) return;

      wsSend({
        event: 'request',
        requestid: Date.now(),
        query: 'type=command&param=getdevices&rid=' + Array.from(new Set(idList.map(String))).join(','),
      });
    } catch {
      // Polling still keeps the dashboard functional.
    }
  }

  /**
   * Parses a raw WebSocket message string from Domoticz and returns the device
   * idx as a string, or null when the payload cannot be parsed or has no idx.
   *
   * @param {string} raw - The `event.data` string from the WebSocket message.
   * @returns {string|null}
   */
  function parseWsIdx(raw) {
    try {
      const msg = JSON.parse(raw);
      const idx = msg && (msg.idx ?? msg.ID ?? msg.id);
      return idx !== undefined && idx !== null ? String(idx) : null;
    } catch {
      return null;
    }
  }

  function startWebSocket() {
    if (!CFG.ws || !('WebSocket' in window)) return false;
    try {
      if (socket && socket.readyState !== WebSocket.CLOSED) return true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      const url = domoticzWebSocketUrl();
      socket = new WebSocket(url, 'domoticz');
      socket.onopen = () => {
        setStatus(true, t('status-push-ok'));
        if (typeof onOpen === 'function') onOpen();
        primeWebSocketSubscriptions();
      };
      socket.onmessage = (event) => {
        const n = Date.now();
        if (n - lastWsRefresh <= 750) return;
        lastWsRefresh = n;

        // Delta optimisation: when the pushed device is not the forecast device
        // only the live distribution values need updating.  Fall back to a full
        // refresh when the payload cannot be parsed or when no delta handler is
        // configured.
        const pushedIdx = parseWsIdx(event && event.data);
        const forecastIdx = getForecastDeviceId ? String(getForecastDeviceId() || '') : '';
        const isForecastPush = !pushedIdx || !forecastIdx || pushedIdx === forecastIdx;

        if (!isForecastPush && typeof refreshDistribution === 'function') {
          refreshDistribution('ws');
        } else {
          refreshAll('ws');
        }
      };
      socket.onerror = () => {
        // no-op
      };
      socket.onclose = () => {
        socket = null;
        if (typeof onClose === 'function') onClose();
        if (CFG.ws) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startWebSocket();
          }, 30000);
        }
      };
      return true;
    } catch {
      return false;
    }
  }

  function isOpen() {
    return !!socket && socket.readyState === WebSocket.OPEN;
  }

  function isStarted() {
    return !!socket;
  }

  return { startWebSocket, isOpen, isStarted };
}
