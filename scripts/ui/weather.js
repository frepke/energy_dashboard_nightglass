/**
 * Weather UI — clock, weather data rendering, and moon display.
 */

import { $ }                    from '../core/dom.js';
import { pad2, hhmmFrom, fmtDayLengthTime, formatNumber, formatDate } from '../core/formatters.js';
import { CFG }                 from '../config/resolveConfig.js';
import { moonInfo, nextFullMoonDate, prevFullMoonDate, nextNewMoonDate, prevNewMoonDate, moonLocationLabel, drawLocalMoon } from '../domain/moon.js';
import { fetchWeatherData as fetchWeatherDataOWM, WEATHER_TTL as WEATHER_TTL_OWM } from '../services/weatherService.js';
import { fetchWeatherData as fetchWeatherDataVC, WEATHER_TTL as WEATHER_TTL_VC }  from '../services/visualCrossingService.js';
import { fetchWeatherData as fetchWeatherDataOM, WEATHER_TTL as WEATHER_TTL_OM }  from '../services/openMeteoService.js';
import { fetchWeatherData as fetchWeatherDataVB, WEATHER_TTL as WEATHER_TTL_VB }  from '../services/vierlingsbeekService.js';
import { t, getLang, getLocale } from '../i18n.js';
import { translateWeatherCondition } from '../domain/weatherConditions.js';

const EXT_CFG = typeof window !== 'undefined' ? (window.DASHBOARD_CONFIG || {}) : {};

function fetchWeatherData() {
  const provider = (CFG.weatherProvider || 'visualcrossing').toLowerCase().trim();
  if (provider === 'openweathermap' || provider === 'owm')        return fetchWeatherDataOWM();
  if (provider === 'openmeteo'      || provider === 'om')         return fetchWeatherDataOM();
  if (provider === 'vierlingsbeek'  || provider === 'vb')         return fetchWeatherDataVB();
  return fetchWeatherDataVC();
}

function activeWeatherProvider() {
  const provider = (CFG.weatherProvider || 'visualcrossing').toLowerCase().trim();
  if (provider === 'owm') return 'openweathermap';
  if (provider === 'om') return 'openmeteo';
  if (provider === 'vb') return 'vierlingsbeek';
  return provider;
}

function weatherTtlMs() {
  const provider = activeWeatherProvider();
  if (provider === 'openweathermap') return WEATHER_TTL_OWM;
  if (provider === 'openmeteo') return WEATHER_TTL_OM;
  if (provider === 'vierlingsbeek') return WEATHER_TTL_VB;
  return WEATHER_TTL_VC;
}

let weatherSourceState = 'loading';
let lastWeatherSuccessAt = 0;
let lastSunCycle = { sunrise: null, sunset: null };

export function resolveFreshnessState(baseState, lastSuccessAt, now, staleAfterMs) {
  if (baseState !== 'live') return baseState;
  if (!Number.isFinite(lastSuccessAt) || lastSuccessAt <= 0) return 'loading';
  return now - lastSuccessAt > staleAfterMs ? 'stale' : 'live';
}

function statusClock(timestamp) {
  if (!timestamp) return '--:--';
  return new Date(timestamp).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
}

function updateWeatherStatusIndicator(now = Date.now()) {
  const indicator = $('#weatherLiveStatus');
  if (!indicator) return;

  const staleAfterMs = Math.max(120_000, weatherTtlMs() * 2.25);
  const state = resolveFreshnessState(weatherSourceState, lastWeatherSuccessAt, now, staleAfterMs);
  const lastTime = statusClock(lastWeatherSuccessAt);
  let label;
  if (state === 'live') label = `${t('source-weather-live')} · ${lastTime}`;
  else if (state === 'stale') label = `${t('source-weather-stale')} · ${lastTime}`;
  else if (state === 'error') label = `${t('source-weather-error')} · ${lastTime}`;
  else if (state === 'disabled') label = t('source-weather-disabled');
  else label = t('source-weather-loading');

  indicator.dataset.state = state;
  indicator.title = label;
  indicator.setAttribute('aria-label', label);
}

function parseSunMoment(value, referenceDate) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = String(value || '').trim();
  if (!raw) return null;
  const timeOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeOnly) {
    return new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
      Number(timeOnly[1]),
      Number(timeOnly[2]),
      Number(timeOnly[3] || 0),
      0,
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function sunCycleSnapshot(nowInput, sunriseValue, sunsetValue) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  if (Number.isNaN(now.getTime())) {
    return {
      state: 'unknown', phase: 'unknown', progress: 0, sunrise: null, sunset: null,
      nextEvent: null, nextEventAt: null, remainingMs: null,
    };
  }

  const sunrise = parseSunMoment(sunriseValue, now);
  const sunset = parseSunMoment(sunsetValue, now);
  if (!sunrise || !sunset || sunset <= sunrise) {
    return {
      state: 'unknown', phase: 'unknown', progress: 0, sunrise, sunset,
      nextEvent: null, nextEventAt: null, remainingMs: null,
    };
  }

  if (now >= sunrise && now < sunset) {
    const progress = Math.max(0, Math.min(1, (now.getTime() - sunrise.getTime()) / (sunset.getTime() - sunrise.getTime())));
    return {
      state: 'day', phase: 'day', progress, sunrise, sunset,
      nextEvent: 'sunset', nextEventAt: sunset, remainingMs: Math.max(0, sunset.getTime() - now.getTime()),
    };
  }

  const beforeSunrise = now < sunrise;
  const nextSunrise = beforeSunrise
    ? sunrise
    : new Date(sunrise.getFullYear(), sunrise.getMonth(), sunrise.getDate() + 1, sunrise.getHours(), sunrise.getMinutes(), sunrise.getSeconds(), sunrise.getMilliseconds());

  return {
    state: 'night',
    phase: beforeSunrise ? 'before-sunrise' : 'after-sunset',
    progress: beforeSunrise ? 0 : 1,
    sunrise,
    sunset,
    nextEvent: 'sunrise',
    nextEventAt: nextSunrise,
    remainingMs: Math.max(0, nextSunrise.getTime() - now.getTime()),
  };
}

export function formatSunDuration(durationMs, lang = getLang()) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '--';
  const totalMinutes = Math.max(0, Math.ceil(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourSuffix = lang === 'nl' ? 'u' : 'h';
  const parts = [];
  if (hours > 0) parts.push(`${hours}${hourSuffix}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function updateSunCycleIndicator(now = new Date()) {
  const indicator = $('#sunCycleStatus');
  if (!indicator) return;

  const statusText = $('#daylightStatusText');
  const trackSunrise = $('#daylightSunrise');
  const trackSunset = $('#daylightSunset');
  const snapshot = sunCycleSnapshot(now, lastSunCycle.sunrise, lastSunCycle.sunset);
  const progressPct = Math.round(snapshot.progress * 100);
  const sunriseText = hhmmFrom(lastSunCycle.sunrise);
  const sunsetText = hhmmFrom(lastSunCycle.sunset);

  indicator.dataset.state = snapshot.state;
  indicator.dataset.phase = snapshot.phase;
  indicator.dataset.progress = String(progressPct);
  indicator.style.setProperty('--sun-progress', `${progressPct}%`);
  if (trackSunrise) trackSunrise.textContent = sunriseText;
  if (trackSunset) trackSunset.textContent = sunsetText;

  const durationText = formatSunDuration(snapshot.remainingMs);
  let visibleLabel;
  let accessibleLabel;
  if (snapshot.state === 'day') {
    visibleLabel = `${t('sun-status-daylight')} ${progressPct}% · ${t('sun-status-remaining')} ${durationText}`;
    accessibleLabel = `${visibleLabel} · ${t('sunset')} ${sunsetText}`;
  } else if (snapshot.state === 'night') {
    visibleLabel = `${t('sun-status-night')} · ${t('sun-status-sunrise-in')} ${durationText}`;
    accessibleLabel = `${visibleLabel} · ${t('sunrise')} ${sunriseText}`;
  } else {
    visibleLabel = t('sun-status-unavailable');
    accessibleLabel = visibleLabel;
  }

  if (statusText) statusText.textContent = visibleLabel;
  indicator.title = accessibleLabel;
  indicator.setAttribute('aria-label', accessibleLabel);
}

function renderWeatherSourceLabel() {
  const srcEl = $('#weatherProviderToggle');
  const activeProvider = srcEl ? srcEl.getAttribute('data-provider') : activeWeatherProvider();
  const sourceLabels = {
    visualcrossing: '· VISUAL CROSSING',
    openweathermap: '· OPENWEATHERMAP',
    openmeteo:      '· OPEN-METEO (KNMI)',
    vierlingsbeek:  '· WEERSTATION VIERLINGSBEEK',
  };
  const weatherSrcEl = $('#weatherSource');
  if (weatherSrcEl) {
    weatherSrcEl.textContent = sourceLabels[activeProvider] || `· ${String(activeProvider || '').toUpperCase()}`;
  }
}


function normalizeWeatherIcon(cc = {}, day = {}) {
  const icon = String(cc.icon || day.icon || '').toLowerCase();
  const cond = String(cc.conditions || day.conditions || '').toLowerCase();
  const text = `${icon} ${cond}`;

  // Determine day/night from actual sunrise/sunset, not the API icon field.
  // Visual Crossing returns sunrise/sunset as "HH:MM:SS" strings on the day object.
  function isNightNow() {
    const nowMs = Date.now();
    const todayPrefix = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const riseStr = day.sunrise || cc.sunrise;
    const setStr  = day.sunset  || cc.sunset;
    if (!riseStr || !setStr) return icon.includes('night');
    // Accept both "HH:MM:SS" and full ISO strings
    const riseMs = new Date(riseStr.includes('T') ? riseStr : `${todayPrefix}T${riseStr}`).getTime();
    const setMs  = new Date(setStr.includes('T')  ? setStr  : `${todayPrefix}T${setStr}`).getTime();
    if (!Number.isFinite(riseMs) || !Number.isFinite(setMs)) return icon.includes('night');
    return nowMs < riseMs || nowMs >= setMs;
  }

  const night = isNightNow();

  if (text.includes('thunder') || text.includes('lightning') || text.includes('storm')) return 'storm';
  if (text.includes('snow') || text.includes('sleet') || text.includes('blizzard') || text.includes('ice')) return 'snow';
  if (text.includes('rain') || text.includes('drizzle') || text.includes('shower')) return 'rain';
  if (text.includes('fog') || text.includes('mist') || text.includes('haze') || text.includes('smoke')) return 'fog';
  if (icon.includes('partly-cloudy') || text.includes('partially cloudy') || text.includes('partly cloudy')) {
    return night ? 'partly-cloudy-night' : 'partly-cloudy-day';
  }
  if (icon.includes('cloud') || text.includes('overcast') || text.includes('cloudy')) return 'cloudy';
  if (icon.includes('clear') || text.includes('clear')) return night ? 'clear-night' : 'clear-day';
  return 'cloudy';
}


function premiumWeatherDefs() {
  return `
      <defs>
        <radialGradient id="wxSunCore" cx="38%" cy="32%" r="68%">
          <stop offset="0"    stop-color="#fffde0"/>
          <stop offset="0.22" stop-color="#ffe566"/>
          <stop offset="0.55" stop-color="#ffb420"/>
          <stop offset="0.82" stop-color="#ff8c00"/>
          <stop offset="1"    stop-color="#e85d04"/>
        </radialGradient>
        <radialGradient id="wxSunHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0"   stop-color="#ffd340" stop-opacity=".55"/>
          <stop offset="0.5" stop-color="#ff9500" stop-opacity=".18"/>
          <stop offset="1"   stop-color="#ff6900" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="wxSunCorona" cx="50%" cy="50%" r="50%">
          <stop offset="0"   stop-color="#fff4a0" stop-opacity=".30"/>
          <stop offset="1"   stop-color="#ffb300" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="wxMoonGrad" cx="36%" cy="28%" r="72%">
          <stop offset="0"    stop-color="#ffffff"/>
          <stop offset="0.30" stop-color="#e8f4ff"/>
          <stop offset="0.65" stop-color="#a8c8ef"/>
          <stop offset="1"    stop-color="#4a6fa5"/>
        </radialGradient>
        <radialGradient id="wxMoonHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0"   stop-color="#7ac8ff" stop-opacity=".22"/>
          <stop offset="1"   stop-color="#3a8fff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="wxCloudMain" x1="15%" y1="0%" x2="88%" y2="100%">
          <stop offset="0"    stop-color="#eef5ff"/>
          <stop offset="0.38" stop-color="#c8d9f5"/>
          <stop offset="0.72" stop-color="#7a92bb"/>
          <stop offset="1"    stop-color="#3a527a"/>
        </linearGradient>
        <linearGradient id="wxCloudDark" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0"    stop-color="#c8d5e8"/>
          <stop offset="0.45" stop-color="#5a6e8c"/>
          <stop offset="1"    stop-color="#1e2e45"/>
        </linearGradient>
        <linearGradient id="wxCloudMid" x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0"    stop-color="#d8e8f8"/>
          <stop offset="0.5"  stop-color="#8ba5c8"/>
          <stop offset="1"    stop-color="#2e4060"/>
        </linearGradient>
        <linearGradient id="wxRainDrop" x1="0%" y1="0%" x2="20%" y2="100%">
          <stop offset="0"   stop-color="#a8e8ff"/>
          <stop offset="1"   stop-color="#1890ff"/>
        </linearGradient>
        <linearGradient id="wxDrizzleDrop" x1="0%" y1="0%" x2="10%" y2="100%">
          <stop offset="0"   stop-color="#d0f0ff"/>
          <stop offset="1"   stop-color="#60b8e8"/>
        </linearGradient>
        <linearGradient id="wxSleetDrop" x1="0%" y1="0%" x2="15%" y2="100%">
          <stop offset="0"   stop-color="#ddeeff"/>
          <stop offset="0.5" stop-color="#88ccee"/>
          <stop offset="1"   stop-color="#c8e8ff"/>
        </linearGradient>
        <linearGradient id="wxSnowFlake" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0"   stop-color="#ffffff"/>
          <stop offset="1"   stop-color="#9ae8ff"/>
        </linearGradient>
        <linearGradient id="wxBoltGrad" x1="0%" y1="0%" x2="30%" y2="100%">
          <stop offset="0"   stop-color="#fff5a0"/>
          <stop offset="0.5" stop-color="#ffd200"/>
          <stop offset="1"   stop-color="#ff9500"/>
        </linearGradient>
        <filter id="wxShadow" x="-30%" y="-20%" width="160%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="7"  flood-color="#020c1e" flood-opacity=".55"/>
          <feDropShadow dx="0" dy="0" stdDeviation="3"  flood-color="#4aacff" flood-opacity=".12"/>
        </filter>
        <filter id="wxGlowSun" x="-90%" y="-90%" width="280%" height="280%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values="1 .2 0 0 .1  .4 .6 0 0 .05  0 0 .1 0 0  0 0 0 .7 0"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="wxGlowMoon" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values=".5 .5 1 0 0  .3 .5 1 0 0  .4 .6 1 0 .05  0 0 0 .6 0"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="wxGlowRain" x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#40c8ff" flood-opacity=".50"/>
        </filter>
        <filter id="wxGlowBolt" x="-60%" y="-40%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feColorMatrix in="blur" type="matrix"
            values="1 .4 0 0 .15  .6 .5 0 0 .08  0 0 0 0 0  0 0 0 .8 0"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="wxGlowFog" x="-20%" y="-40%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="2.5"/>
        </filter>
        <clipPath id="wxCloudClip">
          <path d="M11 48 C5 48 0 43 0 36 C0 28 6 22 14 22 C16 10 27 2 40 2 C53 2 64 11 67 24 C70 23 73 22 77 22 C88 22 97 31 97 42 C97 53 88 61 77 61 L14 61 Z"/>
        </clipPath>
      </defs>`;
}

function premiumSun(cx = 37, cy = 28, r = 15) {
  // Tapered rays that fade out
  const rayCount = 12;
  const rays = Array.from({ length: rayCount }, (_, i) => {
    const a  = (Math.PI * 2 * i) / rayCount - Math.PI / 2;
    const r1 = r + 5;
    const r2 = r + 20;
    const spread = 0.055;
    const ax1 = cx + Math.cos(a - spread) * r1, ay1 = cy + Math.sin(a - spread) * r1;
    const ax2 = cx + Math.cos(a + spread) * r1, ay2 = cy + Math.sin(a + spread) * r1;
    const bx  = cx + Math.cos(a) * r2,          by  = cy + Math.sin(a) * r2;
    return `<path d="M${ax1.toFixed(1)} ${ay1.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)} L${ax2.toFixed(1)} ${ay2.toFixed(1)} Z" opacity="${i % 2 === 0 ? '.82' : '.58'}"/>`;
  }).join('');

  return `
    <g filter="url(#wxGlowSun)">
      <circle cx="${cx}" cy="${cy}" r="${r + 30}" fill="url(#wxSunCorona)"/>
      <circle cx="${cx}" cy="${cy}" r="${r + 19}" fill="url(#wxSunHalo)"/>
      <g fill="#ffc832" opacity=".88">${rays}</g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#wxSunCore)"/>
      <ellipse cx="${(cx - r * .30).toFixed(1)}" cy="${(cy - r * .38).toFixed(1)}" rx="${(r * .30).toFixed(1)}" ry="${(r * .15).toFixed(1)}" fill="#fffde8" opacity=".60" transform="rotate(-32 ${(cx - r * .30).toFixed(1)} ${(cy - r * .38).toFixed(1)})"/>
    </g>`;
}

function premiumMoon(cx = 39, cy = 29, r = 18) {
  const ox = cx + r * 0.42, oy = cy - r * 0.14;
  return `
    <g filter="url(#wxGlowMoon)">
      <circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="url(#wxMoonHalo)"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#wxMoonGrad)"/>
      <circle cx="${ox}" cy="${oy}" r="${r * 0.98}" fill="#07142e" opacity=".88"/>
      <ellipse cx="${(cx - r * .30).toFixed(1)}" cy="${(cy - r * .40).toFixed(1)}" rx="${(r * .28).toFixed(1)}" ry="${(r * .13).toFixed(1)}" fill="#ffffff" opacity=".45" transform="rotate(-28 ${(cx - r * .30).toFixed(1)} ${(cy - r * .40).toFixed(1)})"/>
    </g>`;
}

function premiumCloud(x = 27, y = 22, scale = 1, variant = 'main') {
  const fill   = variant === 'dark' ? 'url(#wxCloudDark)' : variant === 'mid' ? 'url(#wxCloudMid)' : 'url(#wxCloudMain)';
  const hiOp   = variant === 'dark' ? '.10' : '.22';
  const loOp   = variant === 'dark' ? '.20' : '.14';
  return `
    <g transform="translate(${x} ${y}) scale(${scale})" filter="url(#wxShadow)">
      <path d="M11 48 C5 48 0 43 0 36 C0 28 6 22 14 22 C16 10 27 2 40 2 C53 2 64 11 67 24 C70 23 73 22 77 22 C88 22 97 31 97 42 C97 53 88 61 77 61 L14 61 C6 61 0 56 0 48 Z" fill="${fill}"/>
      <g clip-path="url(#wxCloudClip)">
        <ellipse cx="30" cy="18" rx="20" ry="11" fill="#ffffff" opacity="${hiOp}" transform="rotate(-14 30 18)"/>
        <ellipse cx="64" cy="36" rx="24" ry="13" fill="#020e28" opacity="${loOp}"/>
        <path d="M2 40 Q20 30 40 36 Q60 42 80 34 Q90 30 97 35" fill="none" stroke="#ffffff" stroke-width="1.2" opacity=".18"/>
      </g>
    </g>`;
}

function premiumRain() {
  const drops = [
    [46, 63, 38, 79], [63, 61, 55, 79], [80, 63, 72, 79],
    [96, 61, 89, 75, .70], [54, 72, 48, 85, .75], [71, 70, 65, 84, .75],
  ];
  return `
    <g filter="url(#wxGlowRain)" opacity=".96">
      ${drops.map(([x1,y1,x2,y2,op=1]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#wxRainDrop)" stroke-width="3.4" stroke-linecap="round" opacity="${op}"/>`
      ).join('')}
    </g>`;
}

function premiumSnow() {
  function flake(cx, cy, size, op = 1) {
    const arms = [0, 60, 120].map(deg => {
      const r = deg * Math.PI / 180;
      const dx = Math.cos(r) * size, dy = Math.sin(r) * size;
      const bx = Math.cos(r + Math.PI/6) * size * .48, by = Math.sin(r + Math.PI/6) * size * .48;
      const cx2 = Math.cos(r - Math.PI/6) * size * .48, cy2 = Math.sin(r - Math.PI/6) * size * .48;
      return `<line x1="${-dx.toFixed(1)}" y1="${-dy.toFixed(1)}" x2="${dx.toFixed(1)}" y2="${dy.toFixed(1)}"/>
              <line x1="${(dx*.52).toFixed(1)}" y1="${(dy*.52).toFixed(1)}" x2="${(dx*.52+bx).toFixed(1)}" y2="${(dy*.52+by).toFixed(1)}"/>
              <line x1="${(dx*.52).toFixed(1)}" y1="${(dy*.52).toFixed(1)}" x2="${(dx*.52+cx2).toFixed(1)}" y2="${(dy*.52+cy2).toFixed(1)}"/>
              <line x1="${(-dx*.52).toFixed(1)}" y1="${(-dy*.52).toFixed(1)}" x2="${(-dx*.52+bx).toFixed(1)}" y2="${(-dy*.52+by).toFixed(1)}"/>
              <line x1="${(-dx*.52).toFixed(1)}" y1="${(-dy*.52).toFixed(1)}" x2="${(-dx*.52+cx2).toFixed(1)}" y2="${(-dy*.52+cy2).toFixed(1)}"/>`;
    }).join('');
    return `<g transform="translate(${cx} ${cy})" opacity="${op}">${arms}</g>`;
  }
  return `
    <g stroke="url(#wxSnowFlake)" stroke-width="1.9" stroke-linecap="round" filter="url(#wxGlowRain)" opacity=".95">
      ${flake(52, 70, 7)}${flake(74, 76, 5.5, .80)}${flake(91, 68, 4.5, .65)}
    </g>`;
}

function premiumBolt() {
  return `
    <g filter="url(#wxGlowBolt)">
      <path d="M70 48 L55 72 L67 70 L60 90 L88 58 L73 61 L82 48 Z" fill="url(#wxBoltGrad)" opacity=".96"/>
      <path d="M70 48 L55 72 L67 70 L60 90 L88 58 L73 61 L82 48 Z" fill="none" stroke="#fff8c0" stroke-width="1" opacity=".45"/>
    </g>`;
}

function premiumFog() {
  const lines = [
    [26, 44, 94, 44, '.72'], [40, 54, 106, 54, '.55'],
    [20, 64, 82, 64, '.46'], [50, 73, 98, 73, '.35'],
    [32, 83, 80, 83, '.25'],
  ];
  return `
    <g opacity=".90">
      <ellipse cx="62" cy="64" rx="42" ry="20" fill="#b8e0ff" opacity=".07" filter="url(#wxGlowFog)"/>
      <g stroke="#cce8ff" stroke-width="5.5" stroke-linecap="round">
        ${lines.map(([x1,y1,x2,y2,op]) =>
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" opacity="${op}"/>`
        ).join('')}
      </g>
    </g>`;
}

function premiumStars() {
  function star(cx, cy, r, op) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e8f5ff" opacity="${op}"/>`;
  }
  function sparkle(cx, cy, size, op) {
    return `<g transform="translate(${cx} ${cy})" opacity="${op}" fill="#e8f5ff">
      <path d="M0 -${size} L${size*.28} -${size*.28} L${size} 0 L${size*.28} ${size*.28} L0 ${size} L-${size*.28} ${size*.28} L-${size} 0 L-${size*.28} -${size*.28} Z"/>
    </g>`;
  }
  return `
    <g filter="url(#wxGlowMoon)" opacity=".92">
      ${star(86, 18, 2.2, '.88')}${star(103, 32, 1.6, '.65')}${star(96, 48, 1.2, '.50')}
      ${star(78, 38, 1.4, '.45')}${star(108, 20, 1.0, '.40')}
      ${sparkle(97, 52, 3.5, '.80')}
    </g>`;
}

function weatherArtSvg(type) {
  // Use a slightly larger internal canvas and lower icon placement so the
  // premium weather art fits comfortably inside the dashboard card without
  // clipping at the top edge.
  let content;
  switch (type) {
    case 'clear-day':
      content = premiumSun(74, 44, 20);
      break;
    case 'clear-night':
      content = premiumMoon(74, 46, 22) + premiumStars();
      break;
    case 'partly-cloudy-day':
      content = premiumSun(68, 34, 18) + premiumCloud(48, 36, .94);
      break;
    case 'partly-cloudy-night':
      content = premiumMoon(66, 36, 18) + premiumStars() + premiumCloud(48, 36, .94);
      break;
    case 'rain':
      content = premiumCloud(26, 26, 1.04, 'mid') + premiumRain();
      break;
    case 'snow':
      content = premiumCloud(26, 26, 1.04, 'mid') + premiumSnow();
      break;
    case 'storm':
      content = premiumCloud(25, 24, 1.06, 'dark') + premiumRain() + premiumBolt();
      break;
    case 'fog':
      content = premiumFog();
      break;
    case 'cloudy':
    default:
      content = premiumCloud(22, 32, .88, 'mid') + premiumCloud(30, 22, 1.0);
      break;
  }

  return `
    <svg class="weather-art-svg weather-art-svg--premium" viewBox="0 0 144 108" xmlns="http://www.w3.org/2000/svg" role="img" focusable="false" aria-hidden="true">
      ${premiumWeatherDefs()}
      <ellipse cx="86" cy="96" rx="36" ry="6" fill="#40c7ff" opacity=".18"/>
      ${content}
    </svg>`;
}

function updateWeatherArt(cc = {}, day = {}) {
  const art = document.getElementById('weatherArt');
  if (!art) return;
  const type = normalizeWeatherIcon(cc, day);
  art.dataset.weather = type;
  art.className = 'weather-art weather-art--svg weather-art--' + type;
  art.title = cc.conditions || day.conditions || type;
  art.innerHTML = weatherArtSvg(type);
}


function windDirectionLabel(deg) {
  const value = Number(deg);
  if (!Number.isFinite(value)) return '';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(value / 22.5) % 16];
}

function windDirectionArrow(deg) {
  const value = Number(deg);
  if (!Number.isFinite(value)) return '';
  // Meteorological convention: arrow shows where the wind comes from.
  const arrows = ['↓', '↙', '↙', '↙', '←', '↖', '↖', '↖', '↑', '↗', '↗', '↗', '→', '↘', '↘', '↘'];
  return arrows[Math.round(value / 22.5) % 16];
}

/** Last fetched weather payload — kept to allow re-translation without a new API call. */
let lastWeatherData = null;

function isSameLocalDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function localMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function currentOrNextMoonEvent(now, previousDate, nextDate) {
  const previous = previousDate(now);
  return isSameLocalDate(previous, now) ? previous : nextDate(now);
}

export function moonEventLabel(eventDate, now, locale) {
  if (!(eventDate instanceof Date) || Number.isNaN(eventDate.getTime())) return '--';

  const isNl = getLang() === 'nl';
  const time = eventDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (isSameLocalDate(eventDate, now)) {
    return `${isNl ? 'vandaag' : 'today'} · ${time}`;
  }

  const date = eventDate.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const days = Math.max(1, Math.round(
    (localMidnight(eventDate).getTime() - localMidnight(now).getTime()) / 86400000,
  ));
  const relative = isNl
    ? `over ${days} ${days === 1 ? 'dag' : 'dagen'}`
    : `in ${days} ${days === 1 ? 'day' : 'days'}`;
  return `${date} · ${relative}`;
}

export function moonAgeLabel(ageDays) {
  if (!Number.isFinite(ageDays)) return '--';
  const isNl = getLang() === 'nl';
  const rounded = Number(ageDays.toFixed(1));
  const unit = isNl
    ? (Math.abs(rounded - 1) < 0.05 ? 'dag' : 'dagen')
    : (Math.abs(rounded - 1) < 0.05 ? 'day' : 'days');
  return `${formatNumber(ageDays, 1)} ${unit}`;
}

function renderMoon() {
  const now    = new Date();
  const moon   = moonInfo(now, { latitude: CFG.latitude, longitude: CFG.longitude });
  const locale = getLocale();

  const moonTitle = $('.weather-moon .moon-title');
  if (moonTitle) moonTitle.textContent = moonLocationLabel(CFG);

  drawLocalMoon(moon.value, { ...EXT_CFG, latitude: CFG.latitude, longitude: CFG.longitude, moonRenderDate: now });

  // Current phase name + illumination (keep as before)
  $('#moonPhase').textContent = moon.name;
  const illum = Number.isFinite(moon.illum) ? formatNumber(moon.illum, 1) : moon.illum;
  $('#moonIllum').textContent = illum + t('illum-suffix');

  const timeFmt = value => value instanceof Date
    ? value.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const moonRise = $('#moonRise');
  const moonSet = $('#moonSet');
  const moonAge = $('#moonAge');
  const moonDistance = $('#moonDistance');
  const fullMoonLabel = $('#moonFullMoonWhen');
  const newMoonLabel = $('#moonNewMoonWhen');
  if (moonRise) moonRise.textContent = timeFmt(moon.rise);
  if (moonSet) moonSet.textContent = timeFmt(moon.set);
  if (moonAge) moonAge.textContent = moonAgeLabel(moon.ageDays);
  if (moonDistance) {
    moonDistance.textContent = Number.isFinite(moon.distanceKm)
      ? `${formatNumber(Math.round(moon.distanceKm), 0)} km`
      : '--';
  }

  const fullMoonDate = currentOrNextMoonEvent(now, prevFullMoonDate, nextFullMoonDate);
  const newMoonDate = currentOrNextMoonEvent(now, prevNewMoonDate, nextNewMoonDate);
  if (fullMoonLabel) {
    fullMoonLabel.textContent = moonEventLabel(fullMoonDate, now, locale);
    fullMoonLabel.title = fullMoonDate.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });
  }
  if (newMoonLabel) {
    newMoonLabel.textContent = moonEventLabel(newMoonDate, now, locale);
    newMoonLabel.title = newMoonDate.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });
  }

  const phase = document.getElementById('moonPhase');
  if (phase) phase.style.width = '';
}

/** Re-applies translated labels for weather conditions from the cached API payload. */
function retranslateWeather() {
  if (!lastWeatherData) return;
  const { cc, day } = lastWeatherData;
  const provider = (CFG.weatherProvider || '').toLowerCase();
  const isVB = provider === 'vierlingsbeek' || provider === 'vb';
  const conditionStr = (isVB && getLang() === 'nl' && cc.stationConditions)
    ? cc.stationConditions
    : (cc.conditions || day.conditions || '--');
  $('#weatherDesc').textContent = translateWeatherCondition(conditionStr, getLang());
  $('#dayLength').textContent   = t('day-length-prefix') + fmtDayLengthTime(day.sunrise || cc.sunrise, day.sunset || cc.sunset);
}

/** Updates the clock and date display — call every second. */
export function updateWeatherClock() {
  const n      = new Date();
  const locale = getLocale();
  $('#weatherTime').textContent = pad2(n.getHours()) + ':' + pad2(n.getMinutes()) + ':' + pad2(n.getSeconds());
  $('#weatherDate').textContent = formatDate(n, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, locale);
  updateWeatherStatusIndicator(n.getTime());
  updateSunCycleIndicator(n);
}

/**
 * Fetches weather data and updates the weather header.
 * Always renders moon data (moon is calculated locally, no API needed).
 */
export async function refreshWeather() {
  updateWeatherClock();
  renderMoon();
  renderWeatherSourceLabel();
  if (!lastWeatherSuccessAt) weatherSourceState = 'loading';
  updateWeatherStatusIndicator();

  const _p = (CFG.weatherProvider || 'visualcrossing').toLowerCase().trim();
  const hasWeatherKey = (_p === 'openmeteo' || _p === 'om' || _p === 'vierlingsbeek' || _p === 'vb')
    ? true
    : (_p === 'openweathermap' || _p === 'owm') ? !!CFG.owmKey : !!CFG.vcKey;

  if (!hasWeatherKey) {
    weatherSourceState = 'disabled';
    lastSunCycle = { sunrise: null, sunset: null };
    $('#weatherDesc').textContent = t('weather-no-key');
    updateWeatherArt({ conditions: 'cloudy', icon: 'cloudy' }, {});
    updateWeatherStatusIndicator();
    updateSunCycleIndicator(new Date());
    return;
  }

  try {
    const { currentConditions: cc, day } = await fetchWeatherData();
    lastWeatherData = { cc, day };
    lastWeatherSuccessAt = Date.now();
    weatherSourceState = 'live';
    lastSunCycle = {
      sunrise: day.sunrise || cc.sunrise || null,
      sunset: day.sunset || cc.sunset || null,
    };
    $('#sunriseTime').textContent  = hhmmFrom(day.sunrise || cc.sunrise);
    $('#sunsetTime').textContent   = hhmmFrom(day.sunset  || cc.sunset);
    $('#dayLength').textContent    = t('day-length-prefix') + fmtDayLengthTime(day.sunrise || cc.sunrise, day.sunset || cc.sunset);
    const tempVal = formatNumber(cc.temp, 1) + '°C';
    $('#weatherTemp').textContent = tempVal;
    $('#weatherTemp').setAttribute('aria-label', t('temperature-label') + tempVal);   
    $('#weatherHumidity').textContent = '💧 ' + formatNumber(Math.round(Number(cc.humidity || 0)), 0) + '%';

    const windSpeed    = formatNumber(Math.round(Number(cc.windspeed || 0)), 0);
    const windDirLabel = windDirectionLabel(cc.winddir);
    const windDirArrow = windDirectionArrow(cc.winddir);
    const windDirText  = windDirLabel ? `${windDirArrow} ${windDirLabel} · ` : '';
    $('#weatherWind').textContent = '💨 ' + windDirText + windSpeed + ' km/h';
    if (Number.isFinite(Number(cc.winddir))) {
      $('#weatherWind').title = `${t('wind-direction-label')}${formatNumber(Math.round(Number(cc.winddir)), 0)}°`;
    }

    $('#weatherPressure').textContent = '↕ ' + formatNumber(Math.round(Number(cc.pressure || 0)), 0) + ' hPa';

    const precipRateEl = $('#weatherPrecipRate');
    if (precipRateEl) {
      if (cc.preciprate !== undefined && cc.preciprate !== null) {
        let precipText = '🌧 ' + formatNumber(Number(cc.preciprate).toFixed(1), 0) + ' mm/u';
        if (cc.precipday !== undefined && cc.precipday !== null) {
          precipText += ' · ' + formatNumber(Number(cc.precipday).toFixed(1), 0) + ' mm';
        }
        precipRateEl.textContent = precipText;
        precipRateEl.style.display = '';
      } else {
        precipRateEl.style.display = 'none';
      }
    }

    // For Vierlingsbeek: show Dutch station conditions when lang=NL, else Open-Meteo (English)
    const provider = (CFG.weatherProvider || '').toLowerCase();
    const isVB = provider === 'vierlingsbeek' || provider === 'vb';
    const conditionStr = (isVB && getLang() === 'nl' && cc.stationConditions)
      ? cc.stationConditions
      : (cc.conditions || day.conditions || '--');

    $('#weatherDesc').textContent = translateWeatherCondition(conditionStr, getLang());
    updateWeatherArt(cc, day);
  } catch {
    weatherSourceState = 'error';
    $('#weatherDesc').textContent = t('weather-error');
    updateWeatherArt({ conditions: 'cloudy', icon: 'cloudy' }, {});
  }

  renderWeatherSourceLabel();
  updateWeatherStatusIndicator();
  updateSunCycleIndicator(new Date());
}

/**
 * Re-applies language-sensitive labels without a new API call.
 * Call this after a language switch to immediately update:
 * – moon phase name and location label
 * – moon illumination suffix and next-new-moon date
 * – weather condition description
 * – day-length prefix
 */
export function retranslateWeatherLabels() {
  renderMoon();
  retranslateWeather();
  renderWeatherSourceLabel();
  updateWeatherStatusIndicator();
  updateSunCycleIndicator(new Date());
}
