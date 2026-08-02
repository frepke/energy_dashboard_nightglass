/**
 * Read-only client for energy-logger v1.3+.
 *
 * This module deliberately exposes GET-only operations. It validates the
 * server-side passive policy before returning advice to the UI.
 */

import { ENERGY_LOGGER_CFG } from '../config/resolveConfig.js';

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function defaultEnergyLoggerBaseUrl(locationLike = globalThis.location) {
  const protocol = locationLike?.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = locationLike?.hostname || 'localhost';
  return `${protocol}//${hostname}:8787`;
}

export function resolveEnergyLoggerBaseUrl(config = ENERGY_LOGGER_CFG, locationLike = globalThis.location) {
  return trimTrailingSlash(config?.baseUrl) || defaultEnergyLoggerBaseUrl(locationLike);
}

export function validatePassiveAdvice(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('energy_logger_invalid_response');

  const policy = payload.operating_policy;
  const isPassive = policy?.mode === 'passive'
    && policy?.locked === true
    && policy?.control_capable === false
    && policy?.automatic_activation === false;

  if (!isPassive) throw new Error('energy_logger_policy_not_passive');
  if (payload.available !== true || !payload.latest_run) throw new Error('energy_logger_advice_unavailable');

  return payload;
}

export async function fetchEnergyAdvice({
  config = ENERGY_LOGGER_CFG,
  fetchImpl = globalThis.fetch,
  locationLike = globalThis.location,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('energy_logger_fetch_unavailable');

  if (globalThis.window?.__MOCK_ENERGY_ADVICE__) {
    return validatePassiveAdvice(globalThis.window.__MOCK_ENERGY_ADVICE__);
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(config?.timeoutMs) || 8000);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${resolveEnergyLoggerBaseUrl(config, locationLike)}/v1/advice`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`energy_logger_http_${response.status}`);
    return validatePassiveAdvice(await response.json());
  } finally {
    clearTimeout(timeoutId);
  }
}
