/**
 * Weather condition translation helpers — pure module, no DOM or browser globals.
 *
 * Exported for use by weather.js and unit tests.
 */

/**
 * Maps Visual Crossing condition terms (English) to Dutch translations.
 * Unknown terms fall through to the English source string, which is always
 * preferable to an error or blank label.
 */
export const WEATHER_CONDITION_NL = {
  // ---- Visual Crossing ------------------------------------------------
  'Clear':               'Helder',
  'Partially cloudy':    'Gedeeltelijk bewolkt',
  'Overcast':            'Bewolkt',
  'Rain':                'Regen',
  'Drizzle':             'Motregen',
  'Showers':             'Buien',
  'Heavy Rain':          'Zware regen',
  'Light Rain':          'Lichte regen',
  'Heavy Drizzle':       'Zware motregen',
  'Light Drizzle':       'Lichte motregen',
  'Snow':                'Sneeuw',
  'Heavy Snow':          'Zware sneeuw',
  'Light Snow':          'Lichte sneeuw',
  'Freezing Rain':       'IJzige regen',
  'Freezing Drizzle':    'IJzige motregen',
  'Sleet':               'Natte sneeuw',
  'Fog':                 'Mist',
  'Mist':                'Nevel',
  'Haze':                'Waas',
  'Blowing Snow':        'Sneeuwstorm',
  'Blizzard':            'Sneeuwstorm',
  'Thunder':             'Onweer',
  'Thunderstorm':        'Onweer',
  'Storm':               'Storm',
  'Hail':                'Hagel',
  'Lightning':           'Bliksem',
  'Dust':                'Stof',
  'Smoke':               'Rook',
  'Wind':                'Wind',
  'Ice':                 'IJzel',
  'Squalls':             'Windstoten',

  // ---- Open-Meteo (WMO codes) -----------------------------------------
  'Mainly clear':        'Overwegend helder',
  'Icy fog':             'IJsmist',
  'Snow grains':         'Sneeuwkorrels',
  'Heavy Showers':       'Zware buien',
  'Light Showers':       'Lichte buien',
  'Light Snow showers':  'Lichte sneeuwbuien',
  'Snow showers':        'Sneeuwbuien',
  'Thunderstorm with hail': 'Onweer met hagel',
};

// NL → EN map for station text that arrives in Dutch (Weerstation Vierlingsbeek, sky_block)
const WEATHER_CONDITION_EN = {
  'Helder':                      'Clear',
  'Zonnig':                      'Sunny',
  'Overwegend helder':           'Mainly clear',
  'Grotendeels bewolkt':         'Mostly cloudy',
  'Gedeeltelijk bewolkt':        'Partially cloudy',
  'Wat bewolking':               'Some clouds',
  'Licht bewolkt':               'Lightly cloudy',
  'Half bewolkt':                'Partly cloudy',
  'Wisselend bewolkt':           'Variable clouds',
  'Zwaar bewolkt':               'Heavily cloudy',
  'Bewolkt':                     'Overcast',
  'Bedekt':                      'Overcast',
  'Mistig':                      'Foggy',
  'Mist':                        'Fog',
  'IJsmist':                     'Icy fog',
  'Nevel':                       'Mist',
  'Wazig':                       'Hazy',
  'Stof':                        'Dust',
  'Winderig en zonnig':          'Windy and sunny',
  'Winderig en bewolkt':         'Windy and cloudy',
  'Winderig':                    'Windy',
  'Lichte motregen':             'Light drizzle',
  'Matige motregen':             'Drizzle',
  'Zware motregen':              'Heavy drizzle',
  'Lichte regen':                'Light rain',
  'Matige regen':                'Rain',
  'Regen':                       'Rain',
  'Zware regen':                 'Heavy rain',
  'Buien':                       'Showers',
  'Bewolkt met lichte regen':    'Cloudy with light rain',
  'Bewolkt met regen':           'Cloudy with rain',
  'Bewolkt met zware regen':     'Cloudy with heavy rain',
  'IJzige regen':                'Freezing rain',
  'IJzel':                       'Sleet',
  'Lichte sneeuw':               'Light snow',
  'Matige sneeuw':               'Snow',
  'Zware sneeuw':                'Heavy snow',
  'Natte sneeuw':                'Sleet',
  'Sneeuwkorrels':               'Snow grains',
  'Lichte sneeuwbuien':          'Light snow showers',
  'Sneeuwbuien':                 'Snow showers',
  'Onweer met regen':            'Thunderstorm with rain',
  'Onweer':                      'Thunderstorm',
  'Zwaar onweer':                'Heavy thunderstorm',
  'Tornado':                     'Tornado',
  'Onbekend':                    'Unknown',
  'Mix van opklaringen en middelbare of lage bewolking': 'Mix of sun and clouds',
};

/**
 * Translates a weather condition string for the given UI language.
 * EN→NL: Visual Crossing / Open-Meteo terms.
 * NL→EN: Weerstation Vierlingsbeek station terms (via stationConditions field).
 * Unknown terms are passed through unchanged — always better than blank.
 */
export function translateWeatherCondition(condition, lang) {
  if (!condition || condition === '--') return '--';

  const parts = condition.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return '--';

  if (lang === 'nl') {
    return parts.map(part => WEATHER_CONDITION_NL[part] || part).join(', ');
  } else {
    return parts.map(part => WEATHER_CONDITION_EN[part] || part).join(', ');
  }
}
