/**
 * Main entry point — thin bootstrap wiring app controllers.
 */

import { $ } from './core/dom.js';
import { formatTime } from './core/formatters.js';
import { CFG, validateConfig } from './config/resolveConfig.js';
import { updateWeatherClock, refreshWeather, retranslateWeatherLabels } from './ui/weather.js';
import { WEATHER_TTL as WEATHER_TTL_OWM } from './services/weatherService.js';
import { WEATHER_TTL as WEATHER_TTL_VC }  from './services/visualCrossingService.js';
import { WEATHER_TTL as WEATHER_TTL_OM }  from './services/openMeteoService.js';
import { WEATHER_TTL as WEATHER_TTL_VB }  from './services/vierlingsbeekService.js';
import { updateSmartInsight } from './ui/smartInsight.js';
import { markBestWindowBars, setupTooltip, setupUsageWindowSelector } from './ui/chart.js';
import { setupHistoryCards } from './ui/historyModal.js';
import { initDashboardFitAndKiosk } from './ui/kiosk.js';
import { setupWidthToggle } from './ui/widthToggle.js';
import {
  initDeviceHistoryWatermarks,
  retranslateDeviceHistoryWatermarks,
  destroyDeviceHistoryWatermarks,
} from './ui/deviceHistoryWatermarks.js';
import { applyIconOverrides } from './ui/iconOverrides.js';
import { initI18n, t } from './i18n.js';

import { createRefreshController } from './app/refreshController.js';
import { createWebSocketController } from './app/websocketController.js';
import { initThemeToggle } from './app/themeController.js';
import { initNightglassThemeSync } from './app/nightglassThemeController.js';
import { initLanguageToggle } from './app/languageController.js';
import { initVisibilityController } from './app/visibilityController.js';
import { initPlaywrightMock } from './app/playwrightController.js';
import { initWeatherProviderToggle, updateWeatherProviderTooltip } from './app/weatherProviderController.js';

function getWeatherTTL() {
  const provider = (CFG.weatherProvider || 'visualcrossing').toLowerCase().trim();
  if (provider === 'openweathermap' || provider === 'owm') return WEATHER_TTL_OWM;
  if (provider === 'openmeteo'      || provider === 'om')  return WEATHER_TTL_OM;
  if (provider === 'vierlingsbeek'  || provider === 'vb')  return WEATHER_TTL_VB;
  return WEATHER_TTL_VC;
}


const DOMOTICZ_STALE_AFTER_MS = Math.max(180_000, (Number(CFG.refresh) || 30) * 3_000);
let domoticzSourceState = 'loading';
let lastDomoticzSuccessAt = 0;

function domoticzStateLabel(state) {
  const lastTime = lastDomoticzSuccessAt
    ? formatTime(new Date(lastDomoticzSuccessAt), { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  if (state === 'live') return `${t('source-domoticz-live')} · ${lastTime}`;
  if (state === 'stale') return `${t('source-domoticz-stale')} · ${lastTime}`;
  if (state === 'error') return `${t('source-domoticz-error')} · ${lastTime}`;
  return t('source-domoticz-loading');
}

function updateDomoticzIndicator(now = Date.now()) {
  let visibleState = domoticzSourceState;
  if (visibleState === 'live'
      && lastDomoticzSuccessAt
      && now - lastDomoticzSuccessAt > DOMOTICZ_STALE_AFTER_MS) {
    visibleState = 'stale';
  }

  const label = domoticzStateLabel(visibleState);
  const zoneState = $('#domoticzLiveState');
  if (zoneState) {
    zoneState.dataset.state = visibleState;
    zoneState.title = label;
    zoneState.setAttribute('aria-label', label);
  }

  const statusEl = $('#status');
  if (statusEl) {
    statusEl.dataset.state = visibleState;
    statusEl.classList.toggle('is-live', visibleState === 'live');
    statusEl.title = label;
  }
}

function setStatus(ok, text) {
  const statusEl = $('#status');
  const statusTextEl = $('#statusText');
  if (!statusEl || !statusTextEl) return;

  domoticzSourceState = ok ? 'live' : 'error';
  if (ok) lastDomoticzSuccessAt = Date.now();
  statusTextEl.textContent = text;
  updateDomoticzIndicator();
}

const WS_HEARTBEAT_SECONDS = 60;

function wsHeartbeatSeconds() {
  return Math.max(Number(CFG.refresh) || 1, WS_HEARTBEAT_SECONDS);
}

let pageVisible = typeof document === 'undefined' ? true : !document.hidden;
let lastWeatherRefresh = 0;
let weatherClockIntervalId = null;
let weatherRefreshTimeoutId = null;

const refreshController = createRefreshController(setStatus);
const websocketController = createWebSocketController({
  refreshAll: refreshController.refreshAll,
  setStatus,
  getForecastDeviceId: refreshController.getForecastDeviceId,
  onOpen: () => {
    if (pageVisible) refreshController.startPolling(wsHeartbeatSeconds());
  },
  onClose: () => {
    if (pageVisible) refreshController.startPolling(CFG.refresh);
  },
});

initThemeToggle();
initNightglassThemeSync();
initLanguageToggle(() => {
  retranslateWeatherLabels();
  retranslateDeviceHistoryWatermarks();
  updateDomoticzIndicator();
  updateSmartInsight();
  updateWeatherProviderTooltip();
  refreshController.retranslateLiveLabels();
  // Re-render cards and price bars so number/date formatting follows the
  // selected language immediately, not only after the next poll tick.
  refreshController.refreshAll('lang');
});
initWeatherProviderToggle(() => {
  lastWeatherRefresh = Date.now();
  refreshWeather();
});

initVisibilityController({
  onHidden: () => {
    pageVisible = false;
    refreshController.stopPolling();
    destroyDeviceHistoryWatermarks();
  },
  onVisible: () => {
    pageVisible = true;
    refreshController.refreshAll('visible');
    initDeviceHistoryWatermarks();
    const wsStarted = websocketController.isStarted() || websocketController.startWebSocket();
    refreshController.startPolling(wsStarted ? wsHeartbeatSeconds() : CFG.refresh);
    // Refresh weather immediately if the page was hidden long enough for the
    // cached data to have expired (e.g. laptop lid closed overnight).
    if (Date.now() - lastWeatherRefresh > getWeatherTTL()) {
      lastWeatherRefresh = Date.now();
      refreshWeather();
    }
  },
});

validateConfig();
initI18n();
setupWidthToggle();
applyIconOverrides();
initDeviceHistoryWatermarks();
setupHistoryCards();
function updateUiClock() {
  updateWeatherClock();
  updateDomoticzIndicator();
}

updateUiClock();
weatherClockIntervalId = setInterval(updateUiClock, 1000);
lastWeatherRefresh = Date.now();
refreshWeather();
function scheduleWeatherRefresh() {
  weatherRefreshTimeoutId = setTimeout(() => {
    lastWeatherRefresh = Date.now();
    refreshWeather();
    scheduleWeatherRefresh();
  }, getWeatherTTL());
}
scheduleWeatherRefresh();

setupTooltip();
setupUsageWindowSelector();
window.addEventListener('usage-window-hours-change', () => {
  markBestWindowBars();
  updateSmartInsight();
});

if (!initPlaywrightMock()) {
  refreshController.refreshAll('start');
  if (websocketController.startWebSocket()) {
    // WebSocket push handles live updates; keep only a slow heartbeat poll as
    // a safety net for missed pushes and reconnect gaps.
    refreshController.startPolling(wsHeartbeatSeconds());
  } else {
    refreshController.startPolling(CFG.refresh);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (weatherClockIntervalId !== null) {
      clearInterval(weatherClockIntervalId);
      weatherClockIntervalId = null;
    }
    if (weatherRefreshTimeoutId !== null) {
      clearTimeout(weatherRefreshTimeoutId);
      weatherRefreshTimeoutId = null;
    }
    refreshController.stopPolling();
    destroyDeviceHistoryWatermarks();
  });
}

initDashboardFitAndKiosk();
