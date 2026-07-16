import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom } from './utils/minidom.js';

vi.mock('../scripts/services/domoticzService.js', () => ({
  api: vi.fn(),
}));

import {
  NIGHTGLASS_DEFAULTS,
  applyNightglassSettings,
  dashboardTokens,
  mixHex,
  normalizeHex,
  normalizeNightglassSettings,
  readNightglassSettingsFromStorage,
} from '../scripts/app/nightglassThemeController.js';

const NORD_COLORS = {
  accentColor: '#88c0d0',
  dangerColor: '#bf616a',
  warningColor: '#ebcb8b',
  successColor: '#a3be8c',
  bgColor: '#2e3440',
  surfaceColor: '#3b4252',
  borderColor: '#4c566a',
  textColor: '#d8dee9',
  pageBgColor: '#242933',
};

describe('Nightglass theme synchronisation', () => {
  beforeEach(() => {
    installMiniDom();
    document.documentElement.setAttribute('data-theme', 'dark');
    globalThis.window = {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
    };
  });

  it('normalises shorthand and invalid colour values', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('invalid', '#123456')).toBe('#123456');
    expect(normalizeNightglassSettings({ accentColor: 'bad' }).accentColor)
      .toBe(NIGHTGLASS_DEFAULTS.accentColor);
  });

  it('maps a selected Nightglass preset onto every dashboard colour family', () => {
    const tokens = dashboardTokens(NORD_COLORS, 'dark');

    expect(tokens['--bg']).toBe('#242933');
    expect(tokens['--surface-solid']).toBe('#2e3440');
    expect(tokens['--surface-solid-high']).toBe('#3b4252');
    expect(tokens['--blue']).toBe('#88c0d0');
    expect(tokens['--green']).toBe('#a3be8c');
    expect(tokens['--solar']).toBe('#ebcb8b');
    expect(tokens['--red']).toBe('#bf616a');
    expect(tokens['--text']).toBe('#d8dee9');
    expect(tokens['--accent-rgb']).toBe('136, 192, 208');
    expect(tokens['--border-rgb']).toBe('76, 86, 106');
  });

  it('writes manual Nightglass values to the live document root', () => {
    applyNightglassSettings(NORD_COLORS, 'unit-test');
    const root = document.documentElement;

    expect(root.style.getPropertyValue('--bg')).toBe('#242933');
    expect(root.style.getPropertyValue('--blue')).toBe('#88c0d0');
    expect(root.style.getPropertyValue('--surface-solid-high')).toBe('#3b4252');
    expect(root.dataset.nightglassThemeSource).toBe('unit-test');
  });

  it('reads the complete live settings object from localStorage', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify(NORD_COLORS)),
    };
    expect(readNightglassSettingsFromStorage(storage)).toEqual(NORD_COLORS);
  });

  it('mixes semantic colours deterministically', () => {
    expect(mixHex('#000000', '#ffffff', .5)).toBe('#808080');
  });
});
