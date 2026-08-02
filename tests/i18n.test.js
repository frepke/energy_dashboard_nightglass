/**
 * Tests for i18n-related helpers and language-sensitive logic.
 *
 * Coverage:
 *  – scripts/i18n.js         : t(), applyTemplate()
 *  – scripts/domain/moon.js  : moonPhaseNameIcon() key mapping, moonLocationLabel()
 *  – scripts/domain/weatherConditions.js : translateWeatherCondition()
 *
 * Notes on the test environment:
 *  – Vitest runs in Node.js (no browser globals).
 *  – localStorage is unavailable; getLang() falls back to DEFAULT_LANG ('en').
 *  – dom.js is mocked to prevent ReferenceError on `document`.
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that depends on them.
// ---------------------------------------------------------------------------

vi.mock('../scripts/core/dom.js', () => ({ $: () => null, $$: () => [] }));
vi.mock('../scripts/config/resolveConfig.js', () => ({
  CFG:          { latitude: 52.379, longitude: 4.900 },
  CONTRACT_CFG: {},
  DOMOTICZ_CFG: {},
  WEATHER_CFG:  {},
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { t, applyTemplate, translations, localeForLang } from '../scripts/i18n.js';
import { moonPhaseNameIcon, moonLocationLabel }          from '../scripts/domain/moon.js';
import { translateWeatherCondition, WEATHER_CONDITION_NL } from '../scripts/domain/weatherConditions.js';

// ---------------------------------------------------------------------------
// t() — core translation lookup
// ---------------------------------------------------------------------------

describe('t()', () => {
  it('returns an EN string for a known key (Node env defaults to EN)', () => {
    // In Node, localStorage is absent → getLang() returns DEFAULT_LANG ('en')
    expect(t('moon-full-moon')).toBe('Full Moon');
  });

  it('returns the key itself for an unknown key (no silent failure)', () => {
    expect(t('definitely-not-a-real-key')).toBe('definitely-not-a-real-key');
  });

  it('maps language codes to the locale used by number/date formatters', () => {
    expect(localeForLang('nl')).toBe('nl-NL');
    expect(localeForLang('en')).toBe('en-GB');
    expect(localeForLang('xx')).toBe('en-GB');
  });

  it('has NL translations for all moon phase keys', () => {
    const moonKeys = [
      'moon-new-moon', 'moon-waxing-crescent', 'moon-first-quarter',
      'moon-waxing-gibbous', 'moon-full-moon', 'moon-waning-gibbous',
      'moon-last-quarter', 'moon-waning-crescent',
    ];
    moonKeys.forEach(key => {
      const val = translations.nl[key];
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('has EN translations for all moon phase keys', () => {
    const moonKeys = [
      'moon-new-moon', 'moon-waxing-crescent', 'moon-first-quarter',
      'moon-waxing-gibbous', 'moon-full-moon', 'moon-waning-gibbous',
      'moon-last-quarter', 'moon-waning-crescent',
    ];
    moonKeys.forEach(key => {
      const val = translations.en[key];
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('NL and EN moon-phase translations differ (are actual translations)', () => {
    // Sanity check: a translation is not just a copy of the other language.
    expect(translations.nl['moon-full-moon']).not.toBe(translations.en['moon-full-moon']);
  });

  it('has moon date prefix keys in both languages', () => {
    ['next-moon-prefix', 'next-full-moon-prefix'].forEach(key => {
      expect(typeof translations.nl[key]).toBe('string');
      expect(typeof translations.en[key]).toBe('string');
    });
  });

  it('has all required smart-insight action pill keys in both languages', () => {
    const pillKeys = [
      'pill-no-action', 'pill-use-now', 'pill-use-if-needed',
      'pill-hold', 'pill-export-now', 'pill-wait',
    ];
    pillKeys.forEach(key => {
      expect(typeof translations.nl[key]).toBe('string');
      expect(typeof translations.en[key]).toBe('string');
    });
  });

  it('has all required smart-insight message keys in both languages', () => {
    const msgKeys = [
      'msg-no-action-fine', 'msg-use-negative-until', 'msg-use-negative',
      'msg-wait-cheap-ahead', 'msg-wait-starts-soon', 'msg-export-later', 'msg-export-zonnebonus',
      'msg-use-best-until', 'msg-use-solar-reducing', 'msg-use-good-no-better',
      'msg-avoid-high', 'msg-wait-low-later', 'msg-no-action-low',
      'msg-wait-low-solar', 'msg-avoid-low-solar', 'msg-no-action-fallback',
      // Strategy engine messages (insightEngine.js)
      'msg-use-best-window', 'msg-use-if-needed-near-best', 'msg-export-exceptional',
      'msg-ctx-export-attractive', 'msg-ctx-export-while-waiting',
      'msg-ctx-plan-loads-later', 'msg-ctx-plan-loads-generic',
    ];
    msgKeys.forEach(key => {
      expect(typeof translations.nl[key]).toBe('string');
      expect(typeof translations.en[key]).toBe('string');
    });
  });

  it('has all passive energy-advice labels in both languages', () => {
    const keys = [
      'section-energy-advice', 'energy-advice-title', 'energy-advice-live',
      'energy-advice-policy', 'energy-advice-best-1h', 'energy-advice-solar',
      'energy-advice-house', 'energy-advice-import', 'energy-advice-export',
      'energy-advice-net-cost', 'energy-advice-quality',
      'energy-advice-confidence-low', 'energy-advice-check-config',
      'energy-advice-policy-error',
    ];
    keys.forEach(key => {
      expect(typeof translations.nl[key]).toBe('string');
      expect(typeof translations.en[key]).toBe('string');
    });
  });
});

// ---------------------------------------------------------------------------
// applyTemplate() — pure template substitution
// ---------------------------------------------------------------------------

describe('applyTemplate()', () => {
  it('replaces a single {label} placeholder', () => {
    expect(applyTemplate('Hello {label}!', { label: 'world' })).toBe('Hello world!');
  });

  it('replaces {time} and {price} placeholders', () => {
    const result = applyTemplate('Gebruik nu · Best window tot {time} ({price} gem.)', {
      time:  '18:00',
      price: '12,40 ct',
    });
    expect(result).toBe('Gebruik nu · Best window tot 18:00 (12,40 ct gem.)');
  });

  it('leaves unmatched placeholders intact', () => {
    expect(applyTemplate('Value is {x}', { y: 'foo' })).toBe('Value is {x}');
  });

  it('handles an empty vars object without errors', () => {
    expect(applyTemplate('No placeholders here', {})).toBe('No placeholders here');
  });

  it('handles a numeric replacement value', () => {
    expect(applyTemplate('Count: {n}', { n: 42 })).toBe('Count: 42');
  });

  it('returns empty string for null template input', () => {
    expect(applyTemplate(null, {})).toBe('');
  });

  it('returns empty string for undefined template input', () => {
    expect(applyTemplate(undefined, {})).toBe('');
  });

  it('applies NL smart-insight wait message correctly', () => {
    const tpl = translations.nl['msg-wait-cheap-ahead'];
    const result = applyTemplate(tpl, { label: '22:00-23:00', price: '8,50 ct' });
    expect(result).toContain('22:00-23:00');
    expect(result).toContain('8,50 ct');
  });

  it('applies EN smart-insight wait message correctly', () => {
    const tpl = translations.en['msg-wait-cheap-ahead'];
    const result = applyTemplate(tpl, { label: '22:00-23:00', price: '8.50 ct' });
    expect(result).toContain('22:00-23:00');
    expect(result).toContain('8.50 ct');
  });
});

// ---------------------------------------------------------------------------
// moonPhaseNameIcon() — key + icon mapping for every phase band
// ---------------------------------------------------------------------------

describe('moonPhaseNameIcon()', () => {
  // Helper: call the function for a given fractional phase (0..1)
  const pni = moonPhaseNameIcon;

  it('returns "moon-new-moon" key and 🌑 for phase 0 (new moon)', () => {
    const r = pni(0);
    expect(r.key).toBe('moon-new-moon');
    expect(r.icon).toBe('🌑');
  });

  it('returns "moon-new-moon" key and 🌑 for phase ≈ 1 (new moon cycle wrap)', () => {
    const r = pni(0.999);
    expect(r.key).toBe('moon-new-moon');
    expect(r.icon).toBe('🌑');
  });

  it('returns "moon-waxing-crescent" key for phase 0.10', () => {
    const r = pni(0.10);
    expect(r.key).toBe('moon-waxing-crescent');
    expect(r.icon).toBe('🌒');
  });

  it('returns "moon-first-quarter" key and 🌓 for phase 0.25', () => {
    const r = pni(0.25);
    expect(r.key).toBe('moon-first-quarter');
    expect(r.icon).toBe('🌓');
  });

  it('returns "moon-waxing-gibbous" key for phase 0.38', () => {
    const r = pni(0.38);
    expect(r.key).toBe('moon-waxing-gibbous');
    expect(r.icon).toBe('🌔');
  });

  it('returns "moon-full-moon" key and 🌕 for phase 0.50', () => {
    const r = pni(0.50);
    expect(r.key).toBe('moon-full-moon');
    expect(r.icon).toBe('🌕');
  });

  it('returns "moon-waning-gibbous" key for phase 0.62', () => {
    const r = pni(0.62);
    expect(r.key).toBe('moon-waning-gibbous');
    expect(r.icon).toBe('🌖');
  });

  it('returns "moon-last-quarter" key and 🌗 for phase 0.75', () => {
    const r = pni(0.75);
    expect(r.key).toBe('moon-last-quarter');
    expect(r.icon).toBe('🌗');
  });

  it('returns "moon-waning-crescent" key for phase 0.88', () => {
    const r = pni(0.88);
    expect(r.key).toBe('moon-waning-crescent');
    expect(r.icon).toBe('🌘');
  });

  it('every key returned by moonPhaseNameIcon exists in translations.nl', () => {
    const testPhases = [
      0,    // new moon
      0.10, // waxing crescent
      0.25, // first quarter
      0.38, // waxing gibbous
      0.50, // full moon
      0.62, // waning gibbous
      0.75, // last quarter
      0.88, // waning crescent
      0.999, // new moon (cycle wrap)
    ];
    testPhases.forEach(phase => {
      const { key } = pni(phase);
      expect(translations.nl[key]).toBeDefined();
      expect(translations.en[key]).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// moonLocationLabel() — "Local moon" vs "Moon" based on config
// ---------------------------------------------------------------------------

describe('moonLocationLabel()', () => {
  it('returns a non-empty string when lat/lon are configured', () => {
    const label = moonLocationLabel({ latitude: 52.379, longitude: 4.900 });
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string when lat/lon are missing', () => {
    const label = moonLocationLabel({});
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns a different label when lat/lon are present vs absent', () => {
    const withCoords    = moonLocationLabel({ latitude: 52.379, longitude: 4.900 });
    const withoutCoords = moonLocationLabel({});
    expect(withCoords).not.toBe(withoutCoords);
  });

  it('returns the EN "moon-local" translation when coordinates are provided (Node env = EN)', () => {
    expect(moonLocationLabel({ latitude: 52.379, longitude: 4.900 }))
      .toBe(translations.en['moon-local']);
  });

  it('returns the EN "moon-default" translation when coordinates are absent (Node env = EN)', () => {
    expect(moonLocationLabel({})).toBe(translations.en['moon-default']);
  });
});

// ---------------------------------------------------------------------------
// translateWeatherCondition() — API condition → UI language
// ---------------------------------------------------------------------------

describe('translateWeatherCondition()', () => {
  // ---- NL translations (known conditions) ----

  it('translates "Overcast" to "Bewolkt" in NL', () => {
    expect(translateWeatherCondition('Overcast', 'nl')).toBe('Bewolkt');
  });

  it('translates "Clear" to "Helder" in NL', () => {
    expect(translateWeatherCondition('Clear', 'nl')).toBe('Helder');
  });

  it('translates "Rain" to "Regen" in NL', () => {
    expect(translateWeatherCondition('Rain', 'nl')).toBe('Regen');
  });

  it('translates all entries in WEATHER_CONDITION_NL without empty results', () => {
    Object.keys(WEATHER_CONDITION_NL).forEach(en => {
      const result = translateWeatherCondition(en, 'nl');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ---- EN pass-through ----

  it('returns the English string unchanged in EN mode', () => {
    expect(translateWeatherCondition('Overcast', 'en')).toBe('Overcast');
  });

  it('returns an unknown EN condition unchanged in EN mode', () => {
    expect(translateWeatherCondition('Fog and Ice Crystals', 'en')).toBe('Fog and Ice Crystals');
  });

  // ---- Compound conditions ----

  it('translates compound "Rain, Partially cloudy" to NL', () => {
    expect(translateWeatherCondition('Rain, Partially cloudy', 'nl')).toBe('Regen, Gedeeltelijk bewolkt');
  });

  it('handles compound condition with extra whitespace around the comma', () => {
    expect(translateWeatherCondition('Rain,Partially cloudy', 'nl')).toBe('Regen, Gedeeltelijk bewolkt');
  });

  it('returns compound EN condition unchanged in EN mode', () => {
    expect(translateWeatherCondition('Rain, Partially cloudy', 'en')).toBe('Rain, Partially cloudy');
  });

  // ---- Unknown / unmapped conditions ----

  it('returns an unknown condition as-is in NL (English fallback label)', () => {
    // Unknown terms must not cause blanks or errors — English is better than nothing.
    const result = translateWeatherCondition('Volcanic Ash', 'nl');
    expect(result).toBe('Volcanic Ash');
  });

  it('returns a compound string with one unknown term keeping the unknown in English', () => {
    const result = translateWeatherCondition('Rain, Volcanic Ash', 'nl');
    expect(result).toBe('Regen, Volcanic Ash');
  });

  // ---- Edge / null / empty cases ----

  it('returns "--" for null input', () => {
    expect(translateWeatherCondition(null, 'nl')).toBe('--');
  });

  it('returns "--" for undefined input', () => {
    expect(translateWeatherCondition(undefined, 'nl')).toBe('--');
  });

  it('returns "--" for empty string input', () => {
    expect(translateWeatherCondition('', 'nl')).toBe('--');
  });

  it('returns "--" when the placeholder "--" is passed in NL', () => {
    expect(translateWeatherCondition('--', 'nl')).toBe('--');
  });

  it('returns "--" when the placeholder "--" is passed in EN', () => {
    expect(translateWeatherCondition('--', 'en')).toBe('--');
  });
});
