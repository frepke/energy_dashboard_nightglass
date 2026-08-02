import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('keeps the energy-flow panel on its own grid row when Insight is disabled', () => {
    const html = readFileSync(resolve(process.cwd(), 'energy-dashboard.html'), 'utf8');
    const css = readFileSync(resolve(process.cwd(), 'styles/energy-advice.css'), 'utf8')
      .replace(/\s+/g, ' ');

    expect(html).toContain('<body class="insight-disabled">');
    expect(css).toContain('body.insight-disabled .dashboard-content,');
    expect(css).toContain('grid-template-rows: auto auto auto minmax(clamp(168px, 24dvh, 320px), 1fr) !important;');
  });
});
