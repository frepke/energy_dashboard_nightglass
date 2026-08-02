/**
 * Energy Dashboard — example configuration
 *
 * SETUP:
 *   1. Copy this file to config.js (next to energy-dashboard.html)
 *   2. Fill in your real values
 *   3. Open energy-dashboard.html in your browser
 *
 * config.js is listed in .gitignore by default so credentials
 * are not accidentally committed to version control.
 */
window.DASHBOARD_CONFIG = {
  // ----------------------------------------------------------------
  // Weather provider — choose default one:
  //   'visualcrossing'  — Visual Crossing (API key required)
  //   'openweathermap'  — OpenWeatherMap (API key required)
  //   'openmeteo'       — Open-Meteo, KNMI model, no key needed
  //   'vierlingsbeek'   — Weerstation Vierlingsbeek via Domoticz plugin devices
  // The toggle button in the dashboard cycles through all available providers.
  // ----------------------------------------------------------------
  weatherProvider: 'visualcrossing',

  // ---- Visual Crossing ------------------------------------
  // Get a free key at https://www.visualcrossing.com/
  visualCrossingApiKey:      'YOUR_VISUAL_CROSSING_API_KEY',
  visualCrossingLocation:    'Vierlingsbeek,NL', // City,Country or lat,lon
  visualCrossingUnitGroup:   'metric',           // 'metric' | 'us'

  // ---- OpenWeatherMap ---------------------------------
  // Get a free key at https://openweathermap.org/api
  // Uses your latitude/longitude below — no separate location string needed.
  // openWeatherMapApiKey:   'YOUR_OWM_API_KEY',
  // openWeatherMapUnits:    'metric',            // 'metric' | 'imperial'

  // ---- Open-Meteo (no API key required) ---------------
  // Free, non-commercial use. Uses KNMI HARMONIE-AROME model for NL (2 km resolution,
  // updated hourly). No registration needed — just set weatherProvider to 'openmeteo'.
  // https://open-meteo.com/

  // ---- Weerstation Vierlingsbeek (no API key required) ---
  // Reads the Domoticz devices created by the Weerstation Vierlingsbeek plugin.
  // The plugin fetches the station server-side, so the browser dashboard does
  // not need a CORS proxy. Open-Meteo is used only for sunrise/sunset and
  // forecast-style fields the station plugin does not provide.

  // Your location (used for the moon's local tilt and local time display)
  // Vierlingsbeek fallback. Override these with your exact location if needed.
  latitude:   51.596,
  longitude:  5.947,
  timezone:   'Europe/Amsterdam',

  // ----------------------------------------------------------------
  // Nightglass UI customisation
  // Bundled icon names: bolt, grid, plug, home, solar, panel, flame,
  // leaf, gauge, battery, water, wind, check.
  // Keys correspond to data-icon-target attributes in energy-dashboard.html.
  // ----------------------------------------------------------------
  ui: {
    iconOverrides: {
      grid:            'grid',
      house:           'home',
      solar:           'panel',
      'grid-card':     'grid',
      'house-card':    'home',
      'solar-card':    'panel',
      'self-suff-card':'check',
      'self-cons-card':'gauge',
      'gas-card':      'flame',
    },
  },

  // Moon rendering: by default the dashboard uses the local Sun altitude to
  // make the unlit lunar side softer during real daylight and darker at night.
  // Override only when you want fixed behaviour for screenshots/testing.
  // moonDaylightFactor: 0,       // 0 = night contrast, 1 = daylight contrast
  // moonLowAltitudeFactor: 0,    // optional override; otherwise calculated from local Moon altitude
  // moonUnlitOpacity:   0.44,    // texture still visible in the unlit side at night
  // moonDayUnlitOpacity: 0.62,   // texture still visible in the unlit side by daylight
  // moonDayShadowColor: '#485870',
  // moonTerminatorSoftness: 0.08, // optional fixed softness; leave unset for automatic behaviour
  // moonNightTerminatorSoftness: 0.060,
  // moonDayTerminatorSoftness:   0.110,
  // moonCrescentTerminatorBoost: 0.055,
  // moonGibbousTerminatorBoost:  0.018,
  // moonDaylightTerminatorBoost: 0.025,
  // moonLowAltitudeTerminatorBoost: 0.045,
  // moonQuarterTerminatorTighten: 0.010,
  // moonEarthshineBoost: 0.12,
  // moonTextureFlattening: 0.70,  // remove baked lighting from the source moon texture
  // moonLitTextureStrength: 0.98,
  // moonUnlitTextureOpacity: 0.22,
  // moonLitMicroContrast: 0.18,
  // moonUnlitDetailLift: 0.08,
  // moonTerminatorReliefStrength: 0.09,
  // moonAmbientBlue: 0.11,

  // ----------------------------------------------------------------
  // Domoticz connection
  // ----------------------------------------------------------------
  domoticz: {
    // Base URL of your Domoticz instance (no trailing slash).
    // Leave empty ('') for same-origin access when energy-dashboard.html
    // is served by Domoticz itself; API calls then go to /json.htm.
    baseUrl:  '',

    // Basic-auth credentials — only needed if Domoticz requires login.
    // Leave empty for local same-origin mode or if auth is handled by a reverse proxy.
    username: '',
    password: '',

    // 'basic' — sends Authorization: Basic header
    // 'none'  — no explicit auth (relies on browser cookies/session)
    auth: 'none',

    // true  — use WebSocket for real-time push updates plus a 60s heartbeat poll
    // false — poll every `refresh` seconds (safer across firewalls/proxies)
    ws: false,

    // Optional: override auto-detected Domoticz device IDs.
    // Set only the ones where auto-detection picks the wrong device.
    forecastIdx:         '',   // device holding price forecast JSON
    usageIdx:            '',   // house consumption device idx
    selfSufficiencyIdx:  '',   // self-sufficiency % device idx
    selfConsumptionIdx:  '',   // self-consumption % device idx
    electricityPriceIdx: '',   // live electricity price device idx
    gasPriceIdx:         '',   // live gas price device idx
    inverterLimitIdx:    '',   // PV inverter limit device idx

    // Optional: Weerstation Vierlingsbeek Domoticz plugin device idx overrides.
    // Leave empty for auto-detection by device name/hardware. Fill these when
    // multiple Vierlingsbeek-like devices exist or auto-detection is wrong.
    vierlingsbeek: {
      thbIdx:         '', // Temp/Hum/Baro VB, e.g. 337
      windIdx:        '', // Wind VB, e.g. 338
      rainTodayIdx:   '', // Regen vandaag VB, e.g. 339
      rainHourIdx:    '', // Regen laatste uur VB, e.g. 340
      rainRateIdx:    '', // Regenintensiteit VB, e.g. 341
      dewPointIdx:    '', // Dauwpunt VB, e.g. 342
      feelsLikeIdx:   '', // Gevoelstemperatuur VB, e.g. 343
      windAvgIdx:     '', // Wind gemiddeld VB, e.g. 344
      windGustMaxIdx: '', // Vlaag max VB, e.g. 345
      tempMaxIdx:     '', // Temperatuur max VB, e.g. 346
      tempMinIdx:     '', // Temperatuur min VB, e.g. 347
    },
  },

  // ----------------------------------------------------------------
  // Energy Logger v1.3+ — passieve voorspellingen en advies
  // ----------------------------------------------------------------
  energyLogger: {
    enabled: true,

    // Leeg = automatisch dezelfde host als dit dashboard, poort 8787.
    // Vul een volledig adres in wanneer de logger elders draait, bijvoorbeeld:
    // baseUrl: 'http://192.168.1.20:8787',
    baseUrl: '',

    refreshSeconds: 60,
    timeoutMs: 8000,
  },

  // ----------------------------------------------------------------
  // Oude Smart Insight-balk — voorlopig uitgeschakeld
  // De losse energy-logger advieskaart hierboven blijft actief.
  // ----------------------------------------------------------------
  insight: {
    enabled: false,
  },

  // ----------------------------------------------------------------
  // Refresh interval in seconds (default: 1)
  // Can also be set via ?refresh=5 URL parameter.
  // ----------------------------------------------------------------
  // refresh: 1,

  // ----------------------------------------------------------------
  // Network timeout in milliseconds (default: 10000)
  // Can also be set via ?fetchTimeoutMs=15000 or ?timeout=15000.
  // ----------------------------------------------------------------
  // fetchTimeoutMs: 10000,

  // ----------------------------------------------------------------
  // Optional: Zonneplan Zonnebonus contract settings
  // Only relevant if you have a Zonneplan feed-in tariff contract.
  // ----------------------------------------------------------------
  // zonnebonusAlwaysOn:              true,  // true = bonus is always active
  // zonnebonusInkoopvergoedingCt:    2,     // ct/kWh purchase allowance
  // zonnebonusPct:                   0.10,  // 10% bonus on top of market + allowance
  // zonnebonusAnnualExportLimitKwh:  7500,  // annual export cap in kWh; uses P1 year export when available
};
