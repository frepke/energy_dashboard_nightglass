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
      socket.onmessage = () => {
        const n = Date.now();
        if (n - lastWsRefresh > 750) {
          lastWsRefresh = n;
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
