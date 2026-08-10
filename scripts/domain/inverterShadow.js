/**
 * Read-only inverter shadow controller.
 *
 * The result is a counterfactual recommendation only. This module has no
 * network client, actuator endpoint, or command path. `realControlAllowed`
 * therefore remains false, even when the future safety gates are satisfied.
 */

export const SHADOW_HISTORY_KEY = 'ed-inverter-shadow-v1';
export const ACTIVE_CONTROL_NOT_BEFORE = '2027-01-01';
const AMSTERDAM_TIMEZONE = 'Europe/Amsterdam';
const HISTORY_LIMIT = 192;
const EXPORT_NOISE_FLOOR_W = 25;

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function localIsoDate(now, timeZone = AMSTERDAM_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function currentShadowPriceSlot(priceForecast, now = Date.now()) {
  if (!Array.isArray(priceForecast)) return null;
  return priceForecast.find(item => {
    const start = finite(item?.ts);
    const fallbackMinutes = Math.max(1, finite(item?.intervalMinutes) || 15);
    const explicitEnd = finite(item?.endTs);
    const end = explicitEnd !== null && start !== null && explicitEnd > start
      ? explicitEnd
      : (start === null ? null : start + fallbackMinutes * 60_000);
    return start !== null && end !== null && start <= now && now < end;
  }) || null;
}

function confidenceReady(value) {
  return ['medium', 'high'].includes(String(value || '').trim().toLowerCase());
}

/**
 * Calculates what a future controller would recommend for the current price
 * interval. It never authorizes or sends a real command.
 */
export function evaluateInverterShadow({
  now = Date.now(),
  solarW,
  houseW,
  gridW,
  gridDir,
  priceForecast,
  confidence,
  manualRelease = false,
} = {}) {
  const slot = currentShadowPriceSlot(priceForecast, now);
  const solar = Math.max(0, finite(solarW) || 0);
  const house = Math.max(0, finite(houseW) || 0);
  const exportW = gridDir === 'export' ? Math.max(0, finite(gridW) || 0) : 0;
  const salePriceCt = finite(slot?.sellCt);
  const dateReady = localIsoDate(now) >= ACTIVE_CONTROL_NOT_BEFORE;
  const modelReady = confidenceReady(confidence);
  const gates = {
    dateReady,
    confidenceReady: modelReady,
    manualRelease: manualRelease === true,
  };

  const base = {
    mode: 'shadow',
    slotStart: finite(slot?.ts),
    slotEnd: finite(slot?.endTs),
    salePriceCt,
    solarW: solar,
    houseW: house,
    exportW,
    targetW: null,
    suggestedLimitPct: null,
    estimatedEffectEur: null,
    gates,
    allFutureGatesReady: Object.values(gates).every(Boolean),
    realControlAllowed: false,
    commandSent: false,
  };

  if (!slot || salePriceCt === null) {
    return { ...base, action: 'waiting-data', reason: 'missing-current-price' };
  }

  if (exportW <= EXPORT_NOISE_FLOOR_W || solar <= 0) {
    return {
      ...base,
      action: 'no-intervention',
      reason: 'not-exporting',
      estimatedEffectEur: 0,
    };
  }

  if (salePriceCt >= 0) {
    return {
      ...base,
      action: 'unrestricted',
      reason: 'non-negative-sale-price',
      targetW: solar,
      suggestedLimitPct: 100,
      estimatedEffectEur: 0,
    };
  }

  const targetW = Math.max(0, Math.min(solar, solar - exportW));
  const suggestedLimitPct = solar > 0 ? clamp(Math.round(targetW / solar * 100), 0, 100) : 0;
  const start = finite(slot.ts);
  const fallbackEnd = start === null ? null : start + Math.max(1, finite(slot.intervalMinutes) || 15) * 60_000;
  const end = finite(slot.endTs) || fallbackEnd;
  const durationHours = start !== null && end !== null ? Math.max(0, end - start) / 3_600_000 : 0.25;
  const estimatedEffectEur = exportW / 1000 * durationHours * Math.abs(salePriceCt) / 100;

  return {
    ...base,
    action: 'curtail-surplus',
    reason: 'negative-sale-price',
    targetW,
    suggestedLimitPct,
    estimatedEffectEur,
  };
}

export function loadShadowHistory(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== 'function') return [];
  try {
    const parsed = JSON.parse(storage.getItem(SHADOW_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Stores at most one latest decision per price interval. */
export function recordShadowDecision(decision, storage = globalThis.localStorage, recordedAt = Date.now()) {
  if (!storage || typeof storage.setItem !== 'function' || !decision) return false;
  const intervalKey = finite(decision.slotStart)
    ?? Math.floor(recordedAt / (15 * 60_000)) * 15 * 60_000;
  const entry = {
    intervalKey,
    recordedAt,
    action: decision.action,
    salePriceCt: decision.salePriceCt,
    exportW: decision.exportW,
    targetW: decision.targetW,
    suggestedLimitPct: decision.suggestedLimitPct,
    estimatedEffectEur: decision.estimatedEffectEur,
    confidenceReady: decision.gates?.confidenceReady === true,
    commandSent: false,
  };

  try {
    const history = loadShadowHistory(storage).filter(item => item?.intervalKey !== intervalKey);
    history.push(entry);
    storage.setItem(SHADOW_HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
    return true;
  } catch {
    return false;
  }
}
