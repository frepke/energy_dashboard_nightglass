import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom, addElement } from './utils/minidom.js';

const setLangMock = vi.fn();
const getLangMock = vi.fn(() => 'nl');

vi.mock('../scripts/i18n.js', () => ({
  getLang: () => getLangMock(),
  setLang: (...args) => setLangMock(...args),
}));

import { initThemeToggle } from '../scripts/app/themeController.js';
import { initLanguageToggle } from '../scripts/app/languageController.js';

beforeEach(() => {
  setLangMock.mockReset();
  getLangMock.mockReset();
  getLangMock.mockReturnValue('nl');
  installMiniDom();
  globalThis.location = { search: '' };
  globalThis.localStorage = { getItem: vi.fn(() => null), setItem: vi.fn() };
});

describe('themeController', () => {
  it('reads stored dashboard theme when Nightglass has no explicit mode', () => {
    globalThis.localStorage.getItem = vi.fn(key => key === 'ed-theme' ? 'light' : null);
    const btn = addElement(document.body, 'button', { id: 'themeToggle' });

    initThemeToggle();

    expect(globalThis.localStorage.getItem).toHaveBeenCalledWith('dz-theme-style');
    expect(globalThis.localStorage.getItem).toHaveBeenCalledWith('ed-theme');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(btn.textContent).toBe('☀️');
  });

  it('ignores invalid stored theme and falls back to dark', () => {
    globalThis.localStorage.getItem = vi.fn(() => 'blue');
    const btn = addElement(document.body, 'button', { id: 'themeToggle' });

    initThemeToggle();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(btn.textContent).toBe('🌙');
  });

  it('applies query-string theme and toggles on click', () => {
    globalThis.location = { search: '?theme=light' };
    const btn = addElement(document.body, 'button', { id: 'themeToggle' });

    initThemeToggle();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(btn.textContent).toBe('☀️');
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    btn.dispatch('click');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(btn.textContent).toBe('🌙');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('languageController', () => {
  it('toggles language and runs callback after apply', () => {
    const btn = addElement(document.body, 'button', { id: 'langToggle' });
    const afterApply = vi.fn();

    setLangMock.mockImplementation((_, callback) => callback());
    initLanguageToggle(afterApply);
    btn.dispatch('click');

    expect(setLangMock).toHaveBeenCalledTimes(1);
    expect(setLangMock.mock.calls[0][0]).toBe('en');
    expect(afterApply).toHaveBeenCalledTimes(1);
  });
});
