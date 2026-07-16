# Energy Dashboard

A private, self-hosted energy dashboard for Domoticz with Zonneplan dynamic pricing.
Shows live grid/solar/house power flow, today's energy counters, the hourly electricity price chart, and a smart insight bar that advises when to run loads.

Built with vanilla HTML, CSS, and JavaScript — no framework, no build step.

The interface defaults to English. Use the language toggle in the top bar to switch to Dutch; dates, times, numbers, kWh/m³ values, cents and currency formatting follow the active language.

---

## What it looks like

| Section | What it shows |
|---|---|
| **Weather header** | Local time, sunrise/sunset, moon phase, current weather (switchable provider) |
| **Smart insight** | One-line action advice: use now, wait, export surplus, etc. |
| **Energy flow** | Live grid/house/solar power in watts with animated flow lines |
| **Stat cards** | Grid, house, solar, self-sufficiency, self-consumption, gas — today's totals |
| **Price chart** | Hourly electricity prices from Domoticz, with the cheapest window highlighted |

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/5e7a0b6d-6b5a-4d81-9060-67552d8978c1" />

---

## Files

```
energy-dashboard.html   ← Main entry point — open this in your browser
config.js               ← Your local configuration (gitignored)
config.example.js       ← Template — copy to config.js and fill in your values
moon-texture.png        ← Local moon texture (used for the moon phase canvas)

styles/                 ← Extracted CSS, split by concern and load order
  README.md             ← CSS split/load-order notes
  tokens.css            ← Design tokens (colours, radius, shadows)
  base.css              ← Reset and body/background styles
  layout.css            ← Dashboard wrapper, topbar, panel
  weather-core.css      ← Weather header base section
  weather-command-desktop.css ← Desktop command-header refinements
  weather-art.css       ← Weather icon/art containment and polish
  weather-final.css     ← Final weather header alignment overrides
  weather.css           ← Backwards-compatible weather import manifest
  flow.css              ← Energy flow nodes, icons, flow lines
  cards.css             ← Stat cards and price panel badges
  chart.css             ← Price bars chart and tooltip
  insights.css          ← Smart insight bar
  kiosk.css             ← Kiosk/TV mode (enable with ?kiosk=1)
  responsive-base.css   ← Foundational responsive/reduced-motion rules
  responsive-layout.css ← Desktop canvas and layout media rules
  responsive-weather.css ← Weather-header responsive rules
  responsive-flow.css   ← Mobile/tablet flow layout rules
  responsive-chart.css  ← Price-chart responsive polish
  responsive.css        ← Backwards-compatible responsive import manifest

scripts/                ← Extracted JavaScript (ES modules)
  main.js               ← Orchestration: init, polling, WebSocket, kiosk
  config/
    resolveConfig.js    ← Reads config.js + URL params → exports CFG objects
  core/
    dom.js              ← $ and $$ helpers
    formatters.js       ← parseNum, isNum, fmt (kWh / EUR / ct / m³)
    state.js            ← Shared mutable state (LIVE_STATE, price history)
  domain/
    moon.js             ← Moon astronomy calculations + canvas rendering
    prices.js           ← Price analysis, dynamic thresholds, smart insight logic
  services/
    domoticzService.js  ← Domoticz API client, cache, device-ID resolution
    weatherService.js   ← OpenWeatherMap weather API (2.5/weather)
    visualCrossingService.js ← Visual Crossing weather API
    openMeteoService.js ← Open-Meteo weather API (KNMI HARMONIE-AROME model)
    vierlingsbeekService.js ← Weerstation Vierlingsbeek via Domoticz plugin devices + Open-Meteo aanvulling
  ui/
    weather.js          ← Weather header rendering
    flow.js             ← Flow animation: setFlow, setIconIntensity
    cards.js            ← Stat card and badge rendering, updateSmartInsight
    chart.js            ← Price bars rendering, best-window highlight, tooltip
```

---

## Setup

### 1. Put the files on your server

The simplest option is to copy the entire folder to Domoticz's `www` folder:

```
/home/pi/domoticz/www/energy-dashboard/
```

Then open `http://your-domoticz-ip:8080/user/energy-dashboard/energy-dashboard.html`.

Or open `energy-dashboard.html` directly from disk for quick testing. In that case, set `domoticz.baseUrl`; empty same-origin mode only works when the dashboard is served by Domoticz or another web server on the same host.

### 2. Create your config.js

```bash
cp config.example.js config.js
```

Edit `config.js` with your values:

```js
window.DASHBOARD_CONFIG = {
  // Visual Crossing API key (free tier is sufficient)
  visualCrossingApiKey:   'YOUR_KEY_HERE',
  visualCrossingLocation: 'Amsterdam,NL',
  latitude:  52.379,
  longitude:  4.900,

  domoticz: {
    baseUrl:  '',        // same-origin when served by Domoticz itself
    username: '',        // leave empty when local/same-origin auth is not needed
    password: '',
    auth: 'none',
    ws: false,  // set true for WebSocket push + 60s heartbeat poll (optional)

    // Optional manual overrides if auto-detection picks the wrong devices
    forecastIdx: '',
    usageIdx: '',
    electricityPriceIdx: '',
    gasPriceIdx: '',
    inverterLimitIdx: '',

    // Optional: Weerstation Vierlingsbeek plugin device idx overrides
    vierlingsbeek: {
      thbIdx: '',
      windIdx: '',
      rainTodayIdx: '',
      rainHourIdx: '',
      rainRateIdx: '',
      dewPointIdx: '',
      feelsLikeIdx: '',
      windAvgIdx: '',
      windGustMaxIdx: '',
      tempMaxIdx: '',
      tempMinIdx: ''
    }
  },

  // Optional network timeout for Domoticz/weather calls
  fetchTimeoutMs: 10000,

  // Optional Zonnebonus cap; the dashboard uses P1 year export when available
  zonnebonusAnnualExportLimitKwh: 7500
};
```

> **Note:** `config.js` is intentionally excluded from version control via `.gitignore` so real credentials are never committed.

### 3. Open in browser

Navigate to `energy-dashboard.html`. On first load it fetches Domoticz data and weather. The page auto-refreshes every second by default (`?refresh=1`). If the dashboard is served by Domoticz itself, `domoticz.baseUrl: ''` is valid and the API uses `/json.htm` on the same host.

---

## URL parameters

All parameters are optional and override config.js values at runtime:

| Parameter | Description |
|---|---|
| `?refresh=5` | Poll interval in seconds (default: 1). With `?ws=1`, polling is reduced to a heartbeat of at least 60 seconds. |
| `?fetchTimeoutMs=15000` / `?timeout=15000` | Network timeout for Domoticz and weather requests in milliseconds (default: 10000). |
| `?kiosk=1` | Enable TV/kiosk mode (fullscreen, night dimming, auto-scale) |
| `?theme=light` | Force light theme |
| `?vcKey=…` | Visual Crossing API key |
| `?vcLocation=…` | Weather location |
| `?forecastIdx=…` | Domoticz device idx holding the price forecast JSON |
| `?ws=1` | Enable WebSocket push and reduce polling to a heartbeat |

Example:
```
energy-dashboard.html?kiosk=1&refresh=10
```

---

## Domoticz requirements

The dashboard auto-detects most device IDs from Domoticz. You need:

- A **P1 smart meter** device (grid import/export). The yearly P1 history graph is also used, when available, to stop Zonnebonus advice after the configured annual export cap.
- A **solar production** device
- A Domoticz device containing a **Zonneplan price forecast JSON** (stored in `Data` or `sValue`)

Optional but recommended:
- Gas meter device
- Separate house consumption device
- Self-sufficiency / self-consumption % devices (auto-calculated if missing)
- Live electricity/gas price devices
- Inverter power-limit device (for the "PV limited" badge)

---

## Weather providers

The dashboard supports four weather providers, switchable via the toggle button in the top bar. The active provider is shown on the button (`VC`, `OWM`, `OM`, `VB`). Set the default in `config.js` via `weatherProvider`.

| Provider | Key | Sleutel | Update | Proxy nodig |
|---|---|---|---|---|
| `visualcrossing` | VC | Ja (`visualCrossingApiKey`) | 15 min | Nee |
| `openweathermap` | OWM | Ja (`openWeatherMapApiKey`) | 10 min | Nee |
| `openmeteo` | OM | Nee | 1 uur (KNMI HARMONIE-AROME) | Nee |
| `vierlingsbeek` | VB | Nee | ~60 sec (Domoticz plugin) | Nee |

### Visual Crossing

Sign up for a free key at [visualcrossing.com](https://www.visualcrossing.com/).  
The free tier allows 1,000 records/day which is more than sufficient for personal use.

### OpenWeatherMap

Sign up for a free key at [openweathermap.org](https://openweathermap.org/api).  
Uses the `/data/2.5/weather` endpoint — no One Call subscription needed.

### Open-Meteo

No registration needed. Uses the KNMI HARMONIE-AROME model (2 km resolution, updated hourly) — the most accurate forecast model available for the Netherlands.

### Weerstation Vierlingsbeek via Domoticz

The `vierlingsbeek` provider reads the devices created by the Domoticz **Weerstation Vierlingsbeek** plugin. The plugin performs the external website fetch server-side and writes normal Domoticz devices, so the browser dashboard does **not** need a CORS proxy for Vierlingsbeek.

The service auto-detects devices whose hardware/name contains `Vierlingsbeek` or `VB`. If auto-detection ever picks the wrong device, add explicit idx overrides in `config.js`:

```js
window.DASHBOARD_CONFIG = {
  weatherProvider: 'vierlingsbeek',

  domoticz: {
    baseUrl: '',
    auth: 'none',

    vierlingsbeek: {
      thbIdx:         337, // Temp/Hum/Baro VB
      windIdx:        338, // Wind VB
      rainTodayIdx:   339, // Regen vandaag VB
      rainHourIdx:    340, // Regen laatste uur VB
      rainRateIdx:    341, // Regenintensiteit VB
      dewPointIdx:    342, // Dauwpunt VB
      feelsLikeIdx:   343, // Gevoelstemperatuur VB
      windAvgIdx:     344, // Wind gemiddeld VB
      windGustMaxIdx: 345, // Vlaag max VB
      tempMaxIdx:     346, // Temperatuur max VB
      tempMinIdx:     347, // Temperatuur min VB
    }
  }
};
```

You can also override individual ids through URL parameters such as `?thbIdx=337&windIdx=338` or `?vbThbIdx=337`.

---

## Kiosk / TV mode

Add `?kiosk=1` to the URL to enable:
- Auto-scaling to fit the screen without scrollbars
- Night dimming (22:00–06:00 by default)
- Click anywhere to request fullscreen

The kiosk configuration is in `scripts/main.js` near the bottom (`KIOSK_CFG`).

---

## Tests

Unit tests cover the core utility functions and domain logic (formatters, price analysis, chart colour utilities).

**Prerequisites:** [Node.js](https://nodejs.org/) (v20+)

```bash
npm install        # install dev dependencies
npm test           # run all unit tests once
npm run test:watch # watch mode
npm run test:coverage  # with coverage report
```

Tests live in `tests/` and use [Vitest](https://vitest.dev/).
The visual Playwright tests live in `tests/visual/`; install Chromium first with `npx playwright install chromium --with-deps`, then run `npm run test:visual`. Their mock data is deterministic, and Playwright pins the browser locale/timezone so screenshots do not change because of random prices or host machine settings. In minimal Docker images you can point Playwright at a system Chromium with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:visual`.

---

## Security notes

This dashboard is intended for a trusted home/LAN environment. It runs entirely in the browser, so any value in `config.js` is visible to anyone who can open the page or inspect network traffic.

Recommended setup:

- Serve the dashboard from Domoticz itself and use `domoticz.baseUrl: ''` with `auth: 'none'` for same-origin local access.
- Keep `config.js` in `.gitignore`; never commit real Domoticz credentials or Visual Crossing keys.
- Do not expose Domoticz or this dashboard directly to the public internet.
- If you need remote access, put Domoticz behind a trusted VPN or HTTPS reverse proxy with authentication.
- Avoid Basic Auth over plain HTTP outside a fully trusted LAN. Basic Auth credentials are only encoded, not encrypted.
- Be extra careful with `ws: true` when credentials are configured: some WebSocket fallbacks may place credentials in a URL, which can be logged by browsers, proxies, or routers.
- Treat the Visual Crossing API key as a low-privilege browser key and rotate it if the dashboard was accidentally exposed.

`config.js` should remain in your `.gitignore`:

```
# .gitignore
config.js
```

---

## License

Private/internal project. No public license is granted. The package metadata marks the project as `UNLICENSED` and `private` to avoid accidentally publishing it as an ISC-licensed package.

