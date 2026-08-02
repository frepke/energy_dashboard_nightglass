import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../scripts/config/resolveConfig.js', () => ({
  ENERGY_LOGGER_CFG: {
    enabled: true,
    baseUrl: '',
    refreshSeconds: 60,
    timeoutMs: 8000,
  },
}));

import {
  defaultEnergyLoggerBaseUrl,
  fetchEnergyAdvice,
  resolveEnergyLoggerBaseUrl,
  validatePassiveAdvice,
} from '../scripts/services/energyLoggerService.js';

function passiveAdvice(overrides = {}) {
  return {
    available: true,
    operating_policy: {
      mode: 'passive',
      locked: true,
      control_capable: false,
      automatic_activation: false,
    },
    latest_run: { id: 14, model_version: 'profile-weather-v2' },
    best_consumption_windows: {},
    ...overrides,
  };
}

describe('energy-logger read-only client', () => {
  beforeEach(() => {
    delete globalThis.window;
  });

  it('uses the dashboard hostname and port 8787 by default', () => {
    const locationLike = { protocol: 'http:', hostname: 'thinkcentre.local' };
    expect(defaultEnergyLoggerBaseUrl(locationLike)).toBe('http://thinkcentre.local:8787');
    expect(resolveEnergyLoggerBaseUrl({ baseUrl: '' }, locationLike)).toBe('http://thinkcentre.local:8787');
  });

  it('preserves an explicit base URL and removes trailing slashes', () => {
    expect(resolveEnergyLoggerBaseUrl(
      { baseUrl: 'http://192.168.1.20:8787///' },
      { protocol: 'http:', hostname: 'ignored' },
    )).toBe('http://192.168.1.20:8787');
  });

  it('only performs a credential-free GET request to /v1/advice', async () => {
    const payload = passiveAdvice();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));

    const result = await fetchEnergyAdvice({
      config: { baseUrl: 'http://logger:8787', timeoutMs: 2000 },
      fetchImpl,
      locationLike: { protocol: 'http:', hostname: 'dashboard' },
    });

    expect(result).toBe(payload);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://logger:8787/v1/advice');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
    });
  });

  it('rejects advice unless the server reports the complete passive lock', () => {
    expect(() => validatePassiveAdvice(passiveAdvice())).not.toThrow();
    expect(() => validatePassiveAdvice(passiveAdvice({
      operating_policy: {
        mode: 'active',
        locked: false,
        control_capable: true,
        automatic_activation: true,
      },
    }))).toThrow('energy_logger_policy_not_passive');
  });

  it('rejects unavailable or malformed advice', () => {
    expect(() => validatePassiveAdvice(null)).toThrow('energy_logger_invalid_response');
    expect(() => validatePassiveAdvice(passiveAdvice({ available: false })))
      .toThrow('energy_logger_advice_unavailable');
  });
});
