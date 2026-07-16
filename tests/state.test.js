import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

async function loadState() {
  vi.resetModules();
  return import('../scripts/core/state.js');
}

describe('state', () => {
  describe('setState()', () => {
    beforeEach(() => {
      if (typeof globalThis.window === 'undefined') {
        globalThis.window = new EventTarget();
      }
    });

    it('merges a patch into LIVE_STATE', async () => {
      const { LIVE_STATE, setState } = await loadState();
      setState({ gridW: 318, gridDir: 'export' });
      expect(LIVE_STATE.gridW).toBe(318);
      expect(LIVE_STATE.gridDir).toBe('export');
    });

    it('does not overwrite fields not present in the patch', async () => {
      const { LIVE_STATE, setState } = await loadState();
      setState({ houseW: 156 });
      setState({ solarW: 474 });
      expect(LIVE_STATE.houseW).toBe(156);
      expect(LIVE_STATE.solarW).toBe(474);
    });

    it('dispatches a state:change event on window with patch and prev', async () => {
      const { LIVE_STATE, setState } = await loadState();

      const events = [];
      window.addEventListener('state:change', e => events.push(e.detail));

      setState({ gridW: 100 });
      setState({ gridW: 200 });

      // listener captured via events array — no cleanup needed in isolated module scope

      expect(events).toHaveLength(2);
      expect(events[0].patch).toEqual({ gridW: 100 });
      expect(events[0].prev).toEqual({ gridW: 0 });
      expect(events[1].patch).toEqual({ gridW: 200 });
      expect(events[1].prev).toEqual({ gridW: 100 });
    });

    it('dispatches an event with only the changed fields in patch', async () => {
      const { setState } = await loadState();

      const events = [];
      window.addEventListener('state:change', e => events.push(e.detail));

      setState({ gridW: 50, houseW: 75 });

      // listener captured via events array — no cleanup needed in isolated module scope

      expect(Object.keys(events[0].patch)).toEqual(['gridW', 'houseW']);
    });

    it('correctly records prev values before mutation', async () => {
      const { LIVE_STATE, setState } = await loadState();
      setState({ solarW: 100 });

      const events = [];
      window.addEventListener('state:change', e => events.push(e.detail));

      setState({ solarW: 500 });

      // listener captured via events array — no cleanup needed in isolated module scope

      expect(events[0].prev.solarW).toBe(100);
      expect(LIVE_STATE.solarW).toBe(500);
    });

    it('handles an empty patch without throwing', async () => {
      const { setState } = await loadState();
      expect(() => setState({})).not.toThrow();
    });

    it('does not throw when window is unavailable (SSR/test env)', async () => {
      vi.resetModules();
      const origWindow = globalThis.window;
      delete globalThis.window;

      try {
        const { setState } = await import('../scripts/core/state.js');
        expect(() => setState({ gridW: 1 })).not.toThrow();
      } finally {
        globalThis.window = origWindow;
      }
    });
  });

  describe('LIVE_STATE defaults', () => {
    it('starts with all numeric fields at 0 or null', async () => {
      const { LIVE_STATE } = await loadState();
      expect(LIVE_STATE.gridW).toBe(0);
      expect(LIVE_STATE.houseW).toBe(0);
      expect(LIVE_STATE.solarW).toBe(0);
      expect(LIVE_STATE.netToday).toBeNull();
      expect(LIVE_STATE.updatedAt).toBeNull();
    });

    it('starts with priceForecast as an empty array', async () => {
      const { LIVE_STATE } = await loadState();
      expect(Array.isArray(LIVE_STATE.priceForecast)).toBe(true);
      expect(LIVE_STATE.priceForecast).toHaveLength(0);
    });
  });
});
