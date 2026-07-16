import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addElement, installMiniDom, MiniElement } from './utils/minidom.js';

function installStorage() {
  globalThis.localStorage = { getItem: () => 'en', setItem: () => {} };
}

function makeCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), clip: vi.fn(),
    drawImage: vi.fn(), createRadialGradient: vi.fn(() => gradient), createImageData: vi.fn((w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })),
    putImageData: vi.fn(), set filter(v) { this._filter = v; }, get filter() { return this._filter; },
    set fillStyle(v) { this._fillStyle = v; }, get fillStyle() { return this._fillStyle; },
    set globalCompositeOperation(v) { this._gco = v; }, get globalCompositeOperation() { return this._gco; },
  };
}

function installCanvas(id = 'moonCanvas', size = 6) {
  const mainCtx = makeCtx();
  const shadeCtx = makeCtx();
  const canvas = addElement(document.body, 'canvas', { id });
  canvas.width = size;
  canvas.height = size;
  canvas.getContext = vi.fn(() => mainCtx);

  const originalCreate = document.createElement.bind(document);
  document.createElement = tag => {
    const el = originalCreate(tag);
    if (String(tag).toLowerCase() === 'canvas') {
      el.getContext = vi.fn(() => shadeCtx);
      el.width = size;
      el.height = size;
    }
    return el;
  };
  return { canvas, mainCtx, shadeCtx };
}

describe('moon information and canvas rendering', () => {
  beforeEach(() => {
    vi.resetModules();
    installMiniDom();
    installStorage();
  });

  it('returns translated moon info with illumination and next new moon date', async () => {
    const { moonInfo, moonLocationLabel } = await import('../scripts/domain/moon.js');

    const info = moonInfo(new Date('2000-01-06T18:14:00Z'));

    expect(info.key).toBe('moon-new-moon');
    expect(info.name).toBe('New Moon');
    expect(info.icon).toBe('🌑');
    expect(info.illum).toBe(0);
    expect(info.nextNewMoon instanceof Date).toBe(true);
    expect(moonLocationLabel({ latitude: 52.3, longitude: 4.9 })).toBe('Local moon');
    expect(moonLocationLabel({ latitude: NaN, longitude: 4.9 })).toBe('Moon');
  });

  it('returns early when there is no moon canvas', async () => {
    const { drawLocalMoon } = await import('../scripts/domain/moon.js');
    await expect(drawLocalMoon(0.25)).resolves.toBeUndefined();
  });

  it('draws the gradient fallback when no texture can be loaded', async () => {
    const { mainCtx } = installCanvas();
    globalThis.Image = class {
      set src(_) { this.onerror?.(new Error('missing')); }
    };
    const { drawLocalMoon } = await import('../scripts/domain/moon.js');

    await drawLocalMoon(0.25, { moonTextureSrc: 'missing.png' });

    expect(mainCtx.clearRect).toHaveBeenCalled();
    expect(mainCtx.createRadialGradient).toHaveBeenCalled();
    expect(mainCtx.arc).toHaveBeenCalled();
    expect(mainCtx.fill).toHaveBeenCalled();
  });

  it('draws texture and applies a phase shadow when the image loads', async () => {
    const { mainCtx, shadeCtx } = installCanvas('moonCanvas', 5);
    globalThis.Image = class {
      set src(value) { this._src = value; this.onload?.(); }
      get src() { return this._src; }
    };
    const { drawLocalMoon } = await import('../scripts/domain/moon.js');

    await drawLocalMoon(0.75, { moonTextureSrc: 'moon-texture.png' });

    expect(mainCtx.drawImage).toHaveBeenCalled();
    expect(mainCtx.createImageData).toHaveBeenCalledWith(5, 5);
    expect(shadeCtx.putImageData).toHaveBeenCalled();
    expect(mainCtx.globalCompositeOperation).toBe('overlay');
  });

  it('uses a dark tinted phase shadow so light mode does not wash out the moon', async () => {
    const { mainCtx, shadeCtx } = installCanvas('moonCanvas', 5);
    document.documentElement.setAttribute('data-theme', 'light');
    globalThis.getComputedStyle = vi.fn(() => ({
      getPropertyValue: name => (name === '--bg' ? '#f6f8ff' : '')
    }));
    globalThis.Image = class {
      set src(value) { this._src = value; this.onload?.(); }
      get src() { return this._src; }
    };
    const { drawLocalMoon } = await import('../scripts/domain/moon.js');

    await drawLocalMoon(0.75, { moonTextureSrc: 'moon-texture.png' });

    const shade = mainCtx.createImageData.mock.results[0]?.value;
    const rgbTriplets = [];
    for (let i = 0; i < shade.data.length; i += 4) {
      if (shade.data[i + 3] > 0) rgbTriplets.push([shade.data[i], shade.data[i + 1], shade.data[i + 2]]);
    }

    expect(rgbTriplets.length).toBeGreaterThan(0);
    expect(rgbTriplets.some(([r, g, b]) => r > 0 || g > 0 || b > 0)).toBe(true);
    expect(shadeCtx.putImageData).toHaveBeenCalled();
  });
});
