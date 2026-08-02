import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadConfig({ search = '', config = {} } = {}) {
  vi.resetModules();
  globalThis.location = { search, protocol: 'http:' };
  globalThis.window = { DASHBOARD_CONFIG: config };
  return import('../scripts/config/resolveConfig.js');
}

describe('Smart Insight configuration', () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.location;
  });

  it('is disabled by default without disabling energy-logger advice', async () => {
    const { INSIGHT_CFG, ENERGY_LOGGER_CFG, CFG } = await loadConfig();

    expect(INSIGHT_CFG.enabled).toBe(false);
    expect(CFG.insightEnabled).toBe(false);
    expect(ENERGY_LOGGER_CFG.enabled).toBe(true);
  });

  it('can be explicitly re-enabled in config.js', async () => {
    const { INSIGHT_CFG } = await loadConfig({ config: { insight: { enabled: true } } });
    expect(INSIGHT_CFG.enabled).toBe(true);
  });

  it('allows a temporary URL override', async () => {
    const { INSIGHT_CFG } = await loadConfig({ search: '?insight=1' });
    expect(INSIGHT_CFG.enabled).toBe(true);
  });
});
