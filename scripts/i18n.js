/**
 * Internationalisation — EN / NL language toggle support.
 *
 * Usage:
 *   import { t, initI18n, setLang, getLang, getLocale } from './i18n.js';
 *
 *   initI18n()              — call once on page load to apply stored/default language
 *   t('key')                — return translated string for the current language
 *   setLang('en', callback) — switch language, then run optional callback
 *   getLang()               — return current language code ('nl' | 'en')
 *   getLocale()             — return the locale for number/date formatting
 */

const LANG_KEY     = 'ed-lang';
export const DEFAULT_LANG = 'en';

const LANG_LOCALES = {
  nl: 'nl-NL',
  en: 'en-GB',
};

export function localeForLang(lang) {
  return LANG_LOCALES[lang] || LANG_LOCALES[DEFAULT_LANG];
}

export const translations = {
  nl: {
    /* Topbar */
    'theme-toggle-label':  'Schakel licht/donker thema',
    'lang-toggle-label':   'Switch to English',
    'weather-provider-toggle-label': 'Weerbron: {provider} — klik om te wisselen',

    /* Status bar */
    'status-init':         'Live data starten…',
    'status-push-ok':      'Push verbonden · realtime updates actief',
    'status-push-updated': 'Push bijgewerkt: ',
    'status-live-updated': 'Live bijgewerkt: ',
    'source-domoticz-loading': 'Domoticz verbinden…',
    'source-domoticz-live':    'Domoticz actueel',
    'source-domoticz-stale':   'Domoticz-data verouderd',
    'source-domoticz-error':   'Domoticz niet bereikbaar',
    'source-weather-loading':  'Weergegevens laden…',
    'source-weather-live':     'Weer actueel',
    'source-weather-stale':    'Weergegevens verouderd',
    'source-weather-error':    'Weerbron niet bereikbaar',
    'source-weather-disabled': 'Weerbron niet geconfigureerd',

    /* Weather section */
    'section-weather':     'Weeroverzicht',
    'weather-live-dashboard': 'Live-overzicht',
    'weather-realtime':     'Realtime',
    'weather-energy-console': 'Energieconsole',
    'weather-sun-cycle':    'Zoncyclus',
    'weather-moon-label':   'Maan',
    'weather-label':        'Weer',
    'weather-current-time-aria': 'Huidige tijd',
    'weather-sun-moon-cycle-aria': 'Zon- en maancyclus',
    'weather-sun-cycle-aria': 'Zoncyclus',
    'weather-moon-phase-aria': 'Maanfase',
    'weather-current-weather-aria': 'Huidig weer',
    'moonrise-label':      'Opkomst',
    'moonset-label':       'Onder',
    'moon-age-label':      'Leeftijd',
    'moon-distance-label': 'Afstand',
    'sunrise':             'Zonsopkomst',
    'sunset':              'Zonsondergang',
    'day-length-prefix':   'Daglengte: ',
    'day-length-unknown':  'Daglengte: --:--',
    'illum-suffix':        '% verlicht',
    'next-moon-prefix':    'Nieuwe maan',
    'next-full-moon-prefix': 'Volle maan',
    'wet':                 'Nat',
    'dry':                 'Droog',
    'weather-error':       'Weerapifout',
    'weather-no-key':      'Voeg Visual Crossing-sleutel toe via config.js → visualCrossingApiKey',
    'weather-no-key-sub':  'Weer-API is niet geconfigureerd',
    'weather-check':       'Controleer de Visual Crossing-sleutel/locatie in config.js',
    'temperature-label':    'Temperatuur: ',
    'wind-direction-label': 'Windrichting: ',
    'sun-status-daylight':   'Daglicht',
    'sun-status-night':      'Nacht',
    'sun-status-remaining':  'nog',
    'sun-status-sunrise-in': 'zon op over',
    'sun-status-unavailable':'Zoncyclus niet beschikbaar',

    /* Smart insight */
    'section-insight':     'Slim energieadvies',
    'smart-insight-title': 'Slim advies',
    'smart-insight-init':  'Live data wordt geanalyseerd…',

    /* Passive energy-logger forecast */
    'section-energy-advice':             'Passief energieadvies',
    'energy-advice-kicker':              'VOORSPELLING',
    'energy-advice-title':               'Passief energieadvies',
    'energy-advice-loading':             'Logger verbinden…',
    'energy-advice-live':                'Prognose actueel',
    'energy-advice-offline':             'Logger niet bereikbaar',
    'energy-advice-policy':              'Alleen advies · vergrendeld in 2026',
    'energy-advice-best-1h':             'Beste venster van 1 uur',
    'energy-advice-best-window':         'Beste venster van {hours} uur',
    'energy-advice-metrics-aria':        'Verwachte energiestromen',
    'energy-advice-windows-aria':        'Beste verbruiksvensters',
    'energy-advice-solar':               'Zon',
    'energy-advice-house':               'Huis',
    'energy-advice-import':              'Import',
    'energy-advice-export':              'Teruglevering',
    'energy-advice-net-cost':            'Netto kosten',
    'energy-advice-quality':             'Betrouwbaarheid',
    'energy-advice-confidence-low':      'Laag',
    'energy-advice-confidence-medium':   'Gemiddeld',
    'energy-advice-confidence-high':     'Hoog',
    'energy-advice-until':               'tot',
    'energy-advice-until-unknown':       'horizon onbekend',
    'energy-advice-quarters-evaluated':  'kwartieren beoordeeld',
    'energy-advice-not-evaluated':       'Nog geen kwartieren beoordeeld',
    'energy-advice-unavailable':         'Prognose niet beschikbaar',
    'energy-advice-check-config':        'Controleer energyLogger in config.js en poort 8787.',
    'energy-advice-policy-error':        'Advies geblokkeerd: de bron meldt geen harde passieve vergrendeling.',

    /* Energy flow nodes */
    'section-flow':        'Energiestroom',
    'label-grid':          'Net',
    'label-house':         'Huis',
    'label-solar':         'Zonnepanelen',
    'live-load':           'Live belasting',
    'grid-import':         'Import',
    'grid-export':         'Export',
    'on-site-prefix':      'Lokaal ',
    'flow-grid-short':     'NET',
    'flow-house-short':    'HUIS',
    'flow-solar-short':    'ZON',

    /* Stat cards */
    'section-cards':       'Dagstatistieken',
    'card-grid':           'Net',
    'card-house':          'Huis',
    'card-solar':          'Zonnepanelen',
    'card-self-suff':      'Zelfvoorziening',
    'self-suff-sub':       'van verbruik gedekt',
    'card-self-cons':      'Zelfconsumptie',
    'self-cons-sub':       'van zon lokaal gebruikt',
    'card-gas':            'Gas',
    'today':               'Vandaag',
    'net-prefix':          'Netto ',
    'credit-prefix':       'Tegoed ',
    'this-year':           'dit jaar',
    'pv-blocked':          'PV geblokkeerd',
    'pv-limited':          'PV beperkt ',
    'sparkline-grid-label':      'Netvermogen',
    'sparkline-house-label':     'Huisvermogen',
    'sparkline-solar-label':     'Zonnevermogen',
    'sparkline-self-suff-label': 'Zelfvoorziening',
    'sparkline-self-cons-label': 'Zelfconsumptie',
    'sparkline-gas-label':       'Gasverbruik vandaag',
    'sparkline-period-60m':      'Afgelopen 60 minuten',
    'sparkline-period-today':    'Vandaag tot nu',
    'sparkline-current':         'Laatste waarde:',
    'sparkline-scale':           'Schaal:',
    'sparkline-no-data':         'Nog geen trendgegevens',

    /* History modal */
    'history-open-title':   'Toon historische grafiek',
    'history-grid':         'Net historie',
    'history-house':        'Huis historie',
    'history-solar':        'Zonnepanelen historie',
    'history-gas':          'Gas historie',
    'history-range-day':    'Vandaag',
    'history-range-week':   'Week',
    'history-range-month':  'Maand',
    'history-range-year':   'Jaar',
    'history-loading':      'Historische data uit Domoticz laden…',
    'history-source':       'Bron:',
    'history-import':       'Import',
    'history-export':       'Export',
    'history-no-data':      'Geen historische data gevonden',
    'history-no-device':    'Geen Domoticz-device gevonden voor deze tegel',
    'history-error-title':  'Historie kon niet worden geladen',
    'history-watermark-day':       'Daghistorie',
    'history-watermark-domoticz':  'Domoticz',
    'history-watermark-derived':   'berekend uit net en zon',
    'history-watermark-points':    'meetpunten',
    'history-watermark-no-data':   'geen daghistorie beschikbaar',

    /* Prices panel */
    'section-prices':      'Energieprijzen',
    'prices-title':        'ZONNEPLAN ENERGIE',
    'updated-prefix':      'Bijgewerkt: ',
    'updated-missing':     'Bijgewerkt: forecastIdx ontbreekt',
    'chart-aria':          'Grafiek met elektriciteitsprijzen per kwartier',
    'price-bars-aria':     'Prijsbalken per kwartier',
    'usage-window-label':  'Beste venster',
    'insight-history-title': 'Adviesgeschiedenis vandaag',
    'insight-history-empty': 'Nog geen adviezen opgeslagen.',
    'usage-window-aria':   'Voordeligste reeks uren',
    'usage-window-all-aria': 'Alle uren',
    'usage-window-1-aria': '1 uur',
    'usage-window-2-aria': '2 uur',
    'usage-window-3-aria': '3 uur',
    'usage-window-4-aria': '4 uur',
    'usage-window-6-aria': '6 uur',
    'usage-window-all-btn': 'Alle',
    'usage-window-1-btn':  '1u',
    'usage-window-2-btn':  '2u',
    'usage-window-3-btn':  '3u',
    'usage-window-4-btn':  '4u',
    'usage-window-6-btn':  '6u',
    'usage-window-detail': '{hours}u: {date} {start}–{end} · gem. {average} · voordeel {saving} · {slots} kwartieren',
    'usage-window-all-detail': 'Toon alle {slots} beschikbare kwartieren',

    /* Moon phases */
    'moon-new-moon':       'Nieuwe maan',
    'moon-waxing-crescent':'Wassende sikkel',
    'moon-first-quarter':  'Eerste kwartier',
    'moon-waxing-gibbous': 'Wassende maan',
    'moon-full-moon':      'Volle maan',
    'moon-waning-gibbous': 'Afnemende maan',
    'moon-last-quarter':   'Laatste kwartier',
    'moon-waning-crescent':'Afnemende sikkel',
    'moon-local':          'Lokale maan',
    'moon-default':        'Maan',

    /* Chart day markers */
    'tomorrow':            'Morgen',
    'day-after':           'Overmorgen',
    'time-now':            'nu',
    'time-in-min':         'over {m}m',
    'time-min-ago':        '{m}m geleden',
    'time-in-h':           'over {h}u',
    'time-h-ago':          '{h}u geleden',
    'price-unknown':       'Onbekend',
    'price-not-yet-known': 'Nog onbekend',
    'price-current-slot':  'huidig kwartier',
    'price-current-hour':  'huidig uur',
    'tooltip-buy':         'Afname',
    'tooltip-sell':        'Teruglevering excl. belasting',
    'tooltip-best-window': 'Beste {hours}u · gem. {average}',
    'price-slot-aria':     '{date} {range}, afname {buy}, teruglevering excl. belasting {sell}, {note}',

    /* Smart insight status pills */
    'pill-grid':           'Net',
    'pill-export':         'export',
    'pill-import':         'import',
    'pill-solar':          'Zon',
    'pill-price':          'Prijs',

    /* Smart insight action pills */
    'pill-no-action':      'Geen actie',
    'pill-use-now':        'Nu gebruiken',
    'pill-use-if-needed':  'Nu gebruiken indien nodig',
    'pill-hold':           'Nu beperken',
    'pill-export-now':     'Nu terugleveren',
    'pill-wait':           'Wachten',
    
    /* Smart insight next-pill extras */
    'until':               'tot',
    'current-window':      'Huidig moment',
    'best-window':         'Beste moment',
    'earning-hour':        'Meest gunstige kwartier',
'best-hour':           'Goedkoopste kwartier',

    /* Smart insight messages */
    'msg-no-action-fine':          'Geen actie nodig. Je verbruik is nu prima.',
    'msg-use-negative-until':      'Gebruik nu. De stroomprijs is negatief tot {time}.',
    'msg-use-negative':            'Gebruik nu. De stroomprijs is negatief.',
    'msg-wait-cheap-ahead':        'Wacht. Er komt een goedkoper moment ({label} · {price}).',
    'msg-wait-starts-soon':         'Wacht. Het beste venster start om {time} ({price}).',
    'msg-export-later':            'Lever nu terug. Je overschot levert nu meer op; verbruik later ({label} · {price}).',
    'msg-export-zonnebonus':       'Lever nu terug. Door Zonnebonus is terugleveren nu gunstiger dan zelf gebruiken.',
    'msg-export-exceptional':      'Lever nu terug. Teruglevering is op dit moment uitzonderlijk gunstig.',
    'msg-use-best-window':         'Gebruik nu. Dit is een van de goedkoopste uren van vandaag.',
    'msg-use-best-until':          'Gebruik nu. Dit is het beste moment tot {time} ({price} gemiddeld).',
    'msg-use-cheapest-hour':       'Gebruik nu. Dit is het goedkoopste kwartier van vandaag.',
    'msg-use-in-best-window':      'Gebruik nu. Je zit in het beste gebruiksvenster van vandaag.',
    'msg-use-if-needed-near-best': 'Gebruik nu als het nodig is. De prijs ligt dicht bij het volgende beste venster.',
    'msg-wait-tomorrow-window':    'Wacht. Het beste venster van morgen start om {time}.',
    'msg-use-solar-reducing':      'Gebruik nu. De prijs is gunstig en je zonnestroom verlaagt netafname.',
    'msg-use-good-no-better':      'Gebruik nu. De prijs is gunstig en later wordt het niet beter.',
    'msg-avoid-high':              'Wacht liever. De stroomprijs is nu hoog, stel flexibel verbruik uit.',
    'msg-wait-low-later':          'Wacht. Je verbruik is nu laag; later is voordeliger ({label}, {price}).',
    'msg-no-action-low':           'Geen actie nodig. Je verbruik is laag; zo is het prima.',
    'msg-wait-low-solar':          'Wacht. Er is nu weinig zon; later is het gunstiger ({label}, {price}).',
    'msg-avoid-low-solar':         'Wacht liever. Weinig zon en hoge prijs; gebruik nu alleen wat nodig is.',
    'msg-no-action-fallback':      'Geen actie nodig. Je verbruik is nu prima.',
    'msg-ctx-export-attractive':   'Terugleveren is nu aantrekkelijk door de Zonnebonus.',
    'msg-ctx-export-while-waiting':'Tot die tijd is terugleveren van overschot gunstig.',
    'msg-ctx-plan-loads-later':    'Plan grote verbruikers in het volgende goedkope venster ({label}).',
    'msg-ctx-plan-loads-generic':  'Plan grote verbruikers in het volgende goedkope venster.',
  },

  en: {
    /* Topbar */
    'theme-toggle-label':  'Toggle dark/light mode',
    'lang-toggle-label':   'Schakel naar Nederlands',
    'weather-provider-toggle-label': 'Weather source: {provider} — click to switch',

    /* Status bar */
    'status-init':         'Starting live data…',
    'status-push-ok':      'Push connected · realtime updates active',
    'status-push-updated': 'Push updated: ',
    'status-live-updated': 'Live updated: ',
    'source-domoticz-loading': 'Connecting to Domoticz…',
    'source-domoticz-live':    'Domoticz current',
    'source-domoticz-stale':   'Domoticz data stale',
    'source-domoticz-error':   'Domoticz unavailable',
    'source-weather-loading':  'Loading weather data…',
    'source-weather-live':     'Weather current',
    'source-weather-stale':    'Weather data stale',
    'source-weather-error':    'Weather source unavailable',
    'source-weather-disabled': 'Weather source not configured',

    /* Weather section */
    'section-weather':     'Weather overview',
    'weather-live-dashboard': 'Live dashboard',
    'weather-realtime':     'Realtime',
    'weather-energy-console': 'Energy console',
    'weather-sun-cycle':    'Sun cycle',
    'weather-moon-label':   'Moon',
    'weather-label':        'Weather',
    'weather-current-time-aria': 'Current time',
    'weather-sun-moon-cycle-aria': 'Sun and moon cycle',
    'weather-sun-cycle-aria': 'Sun cycle',
    'weather-moon-phase-aria': 'Moon phase',
    'weather-current-weather-aria': 'Current weather',
    'moonrise-label':      'Moonrise',
    'moonset-label':       'Moonset',
    'moon-age-label':      'Age',
    'moon-distance-label': 'Distance',
    'sunrise':             'Sunrise',
    'sunset':              'Sunset',
    'day-length-prefix':   'Day length: ',
    'day-length-unknown':  'Day length: --:--',
    'illum-suffix':        '% illuminated',
    'next-moon-prefix':    'New moon',
    'next-full-moon-prefix': 'Full moon',
    'wet':                 'Wet',
    'dry':                 'Dry',
    'weather-error':       'Weather API error',
    'weather-no-key':      'Add Visual Crossing key in config.js → visualCrossingApiKey',
    'weather-no-key-sub':  'Weather API is not configured',
    'weather-check':       'Check the Visual Crossing key/location in config.js',
    'temperature-label':    'Temperature: ',
    'wind-direction-label': 'Wind direction: ',
    'sun-status-daylight':   'Daylight',
    'sun-status-night':      'Night',
    'sun-status-remaining':  'remaining',
    'sun-status-sunrise-in': 'sunrise in',
    'sun-status-unavailable':'Sun cycle unavailable',

    /* Smart insight */
    'section-insight':     'Smart energy insight',
    'smart-insight-title': 'Smart Insight',
    'smart-insight-init':  'Live data is being analyzed…',

    /* Passive energy-logger forecast */
    'section-energy-advice':             'Passive energy advice',
    'energy-advice-kicker':              'FORECAST',
    'energy-advice-title':               'Passive energy advice',
    'energy-advice-loading':             'Connecting logger…',
    'energy-advice-live':                'Forecast current',
    'energy-advice-offline':             'Logger unavailable',
    'energy-advice-policy':              'Advice only · locked throughout 2026',
    'energy-advice-best-1h':             'Best 1-hour window',
    'energy-advice-best-window':         'Best {hours}-hour window',
    'energy-advice-metrics-aria':        'Forecast energy flows',
    'energy-advice-windows-aria':        'Best consumption windows',
    'energy-advice-solar':               'Solar',
    'energy-advice-house':               'House',
    'energy-advice-import':              'Import',
    'energy-advice-export':              'Export',
    'energy-advice-net-cost':            'Net cost',
    'energy-advice-quality':             'Confidence',
    'energy-advice-confidence-low':      'Low',
    'energy-advice-confidence-medium':   'Medium',
    'energy-advice-confidence-high':     'High',
    'energy-advice-until':               'until',
    'energy-advice-until-unknown':       'horizon unknown',
    'energy-advice-quarters-evaluated':  'quarters evaluated',
    'energy-advice-not-evaluated':       'No quarters evaluated yet',
    'energy-advice-unavailable':         'Forecast unavailable',
    'energy-advice-check-config':        'Check energyLogger in config.js and port 8787.',
    'energy-advice-policy-error':        'Advice blocked: the source does not report a hard passive lock.',

    /* Energy flow nodes */
    'section-flow':        'Energy flow',
    'label-grid':          'Grid',
    'label-house':         'House',
    'label-solar':         'Solar',
    'live-load':           'Live load',
    'grid-import':         'Import',
    'grid-export':         'Export',
    'on-site-prefix':      'On-site ',
    'flow-grid-short':     'GRID',
    'flow-house-short':    'HOUSE',
    'flow-solar-short':    'SOLAR',

    /* Stat cards */
    'section-cards':       'Daily statistics',
    'card-grid':           'Grid',
    'card-house':          'House',
    'card-solar':          'Solar',
    'card-self-suff':      'Self-sufficiency',
    'self-suff-sub':       'of consumption covered',
    'card-self-cons':      'Self-consumption',
    'self-cons-sub':       'of solar used on-site',
    'card-gas':            'Gas',
    'today':               'Today',
    'net-prefix':          'Net ',
    'credit-prefix':       'Credit ',
    'this-year':           'this year',
    'pv-blocked':          'PV blocked',
    'pv-limited':          'PV limited ',
    'sparkline-grid-label':      'Grid power',
    'sparkline-house-label':     'House power',
    'sparkline-solar-label':     'Solar power',
    'sparkline-self-suff-label': 'Self-sufficiency',
    'sparkline-self-cons-label': 'Self-consumption',
    'sparkline-gas-label':       'Gas use today',
    'sparkline-period-60m':      'Last 60 minutes',
    'sparkline-period-today':    'Today so far',
    'sparkline-current':         'Latest value:',
    'sparkline-scale':           'Scale:',
    'sparkline-no-data':         'No trend data yet',

    /* History modal */
    'history-open-title':   'Show historical chart',
    'history-grid':         'Grid history',
    'history-house':        'House history',
    'history-solar':        'Solar history',
    'history-gas':          'Gas history',
    'history-range-day':    'Today',
    'history-range-week':   'Week',
    'history-range-month':  'Month',
    'history-range-year':   'Year',
    'history-loading':      'Loading historical data from Domoticz…',
    'history-source':       'Source:',
    'history-import':       'Import',
    'history-export':       'Export',
    'history-no-data':      'No historical data found',
    'history-no-device':    'No Domoticz device found for this card',
    'history-error-title':  'Could not load history',
    'history-watermark-day':       'Day history',
    'history-watermark-domoticz':  'Domoticz',
    'history-watermark-derived':   'derived from grid and solar',
    'history-watermark-points':    'samples',
    'history-watermark-no-data':   'no day history available',

    /* Prices panel */
    'section-prices':      'Energy prices',
    'prices-title':        'ZONNEPLAN ENERGY',
    'updated-prefix':      'Updated: ',
    'updated-missing':     'Updated: missing forecastIdx',
    'chart-aria':          'Quarter-hour electricity price chart',
    'price-bars-aria':     'Quarter-hour price bars',
    'usage-window-label':  'Best window',
    'insight-history-title': "Today's advice history",
    'insight-history-empty': 'No advice recorded yet.',
    'usage-window-aria':   'Best usage window hours',
    'usage-window-all-aria': 'All hours',
    'usage-window-1-aria': '1 hour',
    'usage-window-2-aria': '2 hours',
    'usage-window-3-aria': '3 hours',
    'usage-window-4-aria': '4 hours',
    'usage-window-6-aria': '6 hours',
    'usage-window-all-btn': 'All',
    'usage-window-1-btn':  '1h',
    'usage-window-2-btn':  '2h',
    'usage-window-3-btn':  '3h',
    'usage-window-4-btn':  '4h',
    'usage-window-6-btn':  '6h',
    'usage-window-detail': '{hours}h: {date} {start}–{end} · avg {average} · saving {saving} · {slots} quarters',
    'usage-window-all-detail': 'Show all {slots} available quarters',

    /* Moon phases */
    'moon-new-moon':       'New Moon',
    'moon-waxing-crescent':'Waxing Crescent',
    'moon-first-quarter':  'First Quarter',
    'moon-waxing-gibbous': 'Waxing Gibbous',
    'moon-full-moon':      'Full Moon',
    'moon-waning-gibbous': 'Waning Gibbous',
    'moon-last-quarter':   'Last Quarter',
    'moon-waning-crescent':'Waning Crescent',
    'moon-local':          'Local moon',
    'moon-default':        'Moon',

    /* Chart day markers */
    'tomorrow':            'Tomorrow',
    'day-after':           'Day after',
    'time-now':            'now',
    'time-in-min':         'in {m}m',
    'time-min-ago':        '{m}m ago',
    'time-in-h':           'in {h}h',
    'time-h-ago':          '{h}h ago',
    'price-unknown':       'Unknown',
    'price-not-yet-known': 'Not yet known',
    'price-current-slot':  'current quarter',
    'price-current-hour':  'current hour',
    'tooltip-buy':         'Buy',
    'tooltip-sell':        'Feed-in excl. tax',
    'tooltip-best-window': 'Best {hours}h · avg {average}',
    'price-slot-aria':     '{date} {range}, buy {buy}, feed-in excl. tax {sell}, {note}',

    /* Smart insight status pills */
    'pill-grid':           'Grid',
    'pill-export':         'export',
    'pill-import':         'import',
    'pill-solar':          'Solar',
    'pill-price':          'Price',

    /* Smart insight action pills */
    'pill-no-action':      'No action needed',
    'pill-use-now':        'Use now',
    'pill-use-if-needed':  'Use if needed',
    'pill-hold':           'Hold for now',
    'pill-export-now':     'Export now',
    'pill-wait':           'Wait',

    /* Smart insight next-pill extras */
    'until':               'until',
    'current-window':      'Current window',
    'best-window':         'Best window',
    'earning-hour':        'Earning quarter',
    'best-hour':           'Best quarter',

    /* Smart insight messages — use {time}, {label}, {price} as placeholders */
    'msg-no-action-fine':          'No action needed. Current usage is fine.',
    'msg-use-negative-until':      'Use now. Electricity is negatively priced until {time}.',
    'msg-use-negative':            'Use now. Electricity is negatively priced.',
    'msg-wait-cheap-ahead':        'Wait. A cheaper window is ahead ({label} · {price}).',
    'msg-wait-starts-soon':         'Wait. The best window starts at {time} ({price}).',
    'msg-export-later':            'Export now. Surplus is more valuable now; use loads later ({label} · {price}).',
    'msg-export-zonnebonus':       'Export now. Zonnebonus is active, so export beats self-use right now.',
    'msg-export-exceptional':      'Export now. Export value is exceptionally strong right now.',
    'msg-use-best-window':         'Use now. This is one of today’s cheapest usage windows.',
    'msg-use-best-until':          'Use now. Best window until {time} ({price} average).',
    'msg-use-cheapest-hour':       "Use now. This is today's cheapest quarter.",
    'msg-use-in-best-window':      "Use now. You're in today's best usage window.",
    'msg-use-if-needed-near-best': 'Use now if needed. The current price is close to the next best window.',
    'msg-wait-tomorrow-window':    "Wait. Tomorrow's best window starts at {time}.",
    'msg-use-solar-reducing':      'Use now. Pricing is favorable and solar is reducing grid import.',
    'msg-use-good-no-better':      'Use now. Pricing is favorable and no better window is ahead.',
    'msg-avoid-high':              'Better to wait. Prices are high, so delay flexible loads.',
    'msg-wait-low-later':          'Wait. Usage is low now; later is cheaper ({label}, {price}).',
    'msg-no-action-low':           'No action needed. Usage is low and already efficient.',
    'msg-wait-low-solar':          'Wait. Solar is low now; a better window is ahead ({label}, {price}).',
    'msg-avoid-low-solar':         'Better to wait. Low solar and high prices; use essentials only.',
    'msg-no-action-fallback':      'No action needed. Current usage is fine.',
    'msg-ctx-export-attractive':   'Export reward is attractive right now due to Zonnebonus.',
    'msg-ctx-export-while-waiting':'Until then, exporting surplus is favorable.',
    'msg-ctx-plan-loads-later':    'Plan flexible loads in the next cheap window ({label}).',
    'msg-ctx-plan-loads-generic':  'Plan flexible loads in the next cheap window.',
  },
};

/** Returns the active language code from localStorage, or the default. */
export function getLang() {
  try {
    const lang = localStorage.getItem(LANG_KEY);
    return translations[lang] ? lang : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** Returns the BCP 47 locale used for number/date formatting in the active language. */
export function getLocale() {
  return localeForLang(getLang());
}

/** Returns the translated string for `key` in the current language, falling back to default. */
export function t(key) {
  const lang = getLang();
  const dict = translations[lang] || translations[DEFAULT_LANG];
  return dict[key] ?? (translations[DEFAULT_LANG][key] ?? key);
}

/**
 * Applies the given language to the document:
 * – sets html[lang]
 * – updates all [data-i18n] elements
 * – updates all [data-i18n-label] aria-label attributes
 * – syncs the language and theme toggle button labels
 */
export function applyLang(lang) {
  const resolvedLang = translations[lang] ? lang : DEFAULT_LANG;
  const dict = translations[resolvedLang] || translations[DEFAULT_LANG];
  document.documentElement.lang = resolvedLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (key && dict[key] !== undefined) el.textContent = dict[key];
  });

  document.querySelectorAll('[data-i18n-label]').forEach(el => {
    const key = el.dataset.i18nLabel;
    if (key && dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.dataset.i18nAria;
    if (key && dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
  });

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle && dict['theme-toggle-label']) {
    themeToggle.setAttribute('aria-label', dict['theme-toggle-label']);
    themeToggle.setAttribute('title',      dict['theme-toggle-label']);
  }

  const langToggle = document.getElementById('langToggle');
  if (langToggle) {
    const label = dict['lang-toggle-label'] || '';
    langToggle.setAttribute('aria-label',  label);
    langToggle.setAttribute('title',       label);
    langToggle.setAttribute('lang',        resolvedLang);
    langToggle.textContent = resolvedLang.toUpperCase();
  }
}

/** Persists the language choice, re-applies translations, then calls the optional callback. */
export function setLang(lang, onAfterApply) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage unavailable */ }
  applyLang(lang);
  if (typeof onAfterApply === 'function') onAfterApply();
}

/** Reads the stored language (or default) and applies it to the document. Call once on page load. */
export function initI18n() {
  applyLang(getLang());
}

/**
 * Replaces named `{placeholder}` tokens in a string with supplied values.
 * Pure utility — no language state involved.
 *
 * @param {string} str  - Template string containing `{key}` tokens.
 * @param {Object} vars - Map of token names to replacement values.
 * @returns {string}    - String with all matching tokens substituted.
 */
export function applyTemplate(str, vars) {
  const s = str === null || str === undefined ? '' : String(str);
  return s.replaceAll(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}
