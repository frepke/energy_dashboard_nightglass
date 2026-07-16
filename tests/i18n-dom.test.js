import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addElement, installMiniDom } from './utils/minidom.js';

function installStorage(initial = {}) {
  const store = { ...initial };
  globalThis.localStorage = {
    getItem: vi.fn(k => store[k] ?? null),
    setItem: vi.fn((k, v) => { store[k] = String(v); }),
  };
  return globalThis.localStorage;
}

describe('i18n DOM language application', () => {
  beforeEach(() => {
    vi.resetModules();
    installMiniDom();
    installStorage();
  });

  it('updates text nodes, aria labels, and toggle labels for Dutch', async () => {
    const title = addElement(document.body, 'h1', { dataset: { i18n: 'moon-full-moon' } });
    const labelled = addElement(document.body, 'button', { dataset: { i18nLabel: 'theme-toggle-label' } });
    const themeToggle = addElement(document.body, 'button', { id: 'themeToggle' });
    const langToggle = addElement(document.body, 'button', { id: 'langToggle' });

    const { applyLang, translations } = await import('../scripts/i18n.js');
    applyLang('nl');

    expect(document.documentElement.lang).toBe('nl');
    expect(title.textContent).toBe(translations.nl['moon-full-moon']);
    expect(labelled.getAttribute('aria-label')).toBe(translations.nl['theme-toggle-label']);
    expect(themeToggle.getAttribute('title')).toBe(translations.nl['theme-toggle-label']);
    expect(langToggle.textContent).toBe('NL');
    expect(langToggle.getAttribute('lang')).toBe('nl');
  });

  it('falls back to English dictionary for an unsupported language code', async () => {
    const title = addElement(document.body, 'h1', { dataset: { i18n: 'moon-full-moon' } });
    const { applyLang, translations } = await import('../scripts/i18n.js');

    applyLang('xx');

    expect(document.documentElement.lang).toBe('en');
    expect(title.textContent).toBe(translations.en['moon-full-moon']);
  });

  it('persists language, applies it, and invokes the callback', async () => {
    const title = addElement(document.body, 'h1', { dataset: { i18n: 'moon-full-moon' } });
    const after = vi.fn();
    const { setLang, translations } = await import('../scripts/i18n.js');

    setLang('nl', after);

    expect(localStorage.setItem).toHaveBeenCalledWith('ed-lang', 'nl');
    expect(title.textContent).toBe(translations.nl['moon-full-moon']);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('initializes from stored language and survives localStorage failures', async () => {
    installStorage({ 'ed-lang': 'nl' });
    const title = addElement(document.body, 'h1', { dataset: { i18n: 'moon-full-moon' } });
    const mod = await import('../scripts/i18n.js');

    mod.initI18n();
    expect(title.textContent).toBe(mod.translations.nl['moon-full-moon']);

    globalThis.localStorage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    };
    expect(mod.getLang()).toBe(mod.DEFAULT_LANG);
    expect(() => mod.setLang('en')).not.toThrow();
  });
});
