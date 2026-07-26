# AGENTS.md — Nightglass Energy Dashboard

This file gives AI coding agents the context they need to work effectively in this repository.

## Project overview

A private, self-hosted fullscreen energy dashboard for **Domoticz** with Zonneplan dynamic pricing, built in the visual language of the Nightglass theme. The project uses plain HTML, CSS and ES-module JavaScript — no framework and no build step for production. Node.js is used only for development tooling (tests and linting).

## Repository layout

```
energy-dashboard.html          Main HTML entry point (semantic dashboard structure)
config.example.js              Example configuration — copy to config.js and fill in
styles/
  nightglass-v2.css            Adaptive Nightglass layout and component styles
scripts/
  main.js                      Initialisation and data-source status
  i18n.js                      Internationalisation (NL/EN)
  app/                         Application-level controllers
    languageController.js
    nightglassThemeController.js
    nightglassThemeKeys.js
    playwrightController.js
    refreshController.js
    themeController.js
    visibilityController.js
    weatherProviderController.js
    websocketController.js
  config/                      Configuration helpers
  core/                        Shared utilities
    dom.js
    formatters.js
    state.js
  domain/                      Pure business logic (energy calculations, moon, prices …)
  services/                    External data fetching
    domoticzService.js
    openMeteoService.js
    openWeatherService.js
    vierlingsbeekService.js
    visualCrossingService.js
    weatherService.js
  ui/                          DOM rendering and visual components
    cards.js
    chart.js
    deviceHistoryWatermarks.js
    distributionView.js
    flow.js
    gridCard.js
    historyModal.js
    iconOverrides.js
    kiosk.js
    smartInsight.js
    weather.js
    widthToggle.js
tests/                         Vitest unit tests (*.test.js) + Playwright visual tests
  utils/
  visual/                      Playwright specs (excluded from vitest)
.github/
  workflows/ci.yml             CI: audit → lint → test with coverage
  dependabot.yml
```

## Development commands

All commands require `npm ci` to be run first.

| Command | What it does |
|---|---|
| `npm ci` | Install exact dependency versions |
| `npm test` | Run all Vitest unit tests once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run tests and generate coverage report |
| `npm run test:visual` | Run Playwright visual tests |
| `npm run test:visual:update` | Update Playwright baseline snapshots |
| `npm run lint` | ESLint with `--max-warnings=0` |
| `npm run lint:fix` | ESLint with auto-fix |

After making changes always run **both** `npm test` and `npm run lint` to confirm nothing is broken. CI runs `npm audit --audit-level=high`, `npm run lint`, and `npm run test:coverage`.

## Testing

- Unit tests live in `tests/` and use **Vitest**. Each test file is named `<module>.test.js`.
- Visual / end-to-end tests live in `tests/visual/` and use **Playwright** (`*.spec.js`). These are excluded from `vitest`.
- Vitest config: `vitest.config.js`. Playwright config: `playwright.config.js`.
- Add tests for every new unit of logic in `domain/`, `services/`, or `core/`. Aim to keep coverage comparable to the current level.
- Do **not** remove or disable existing tests.

## Linting and code style

- **ESLint** with `eslint.config.js` (flat config, `@eslint/js` recommended + custom rules).
- ECMAScript 2022, ES modules (`"type": "module"` in `package.json`).
- Key rules: `no-var` (use `const`/`let`), `prefer-const`, `eqeqeq: always`, `no-unused-vars` (warn).
- Zero warnings allowed (`--max-warnings=0`). Fix all lint issues before committing.
- Do not add comments unless they match the style of existing comments or explain genuinely complex logic.

## Architecture notes

- **No framework, no build step.** All production files are served directly.  
- **No `config.js` in the repo.** Credentials and API keys live only in the user's local `config.js` (gitignored). Never commit secrets.
- **Pure domain logic in `domain/`.** Keep it free of DOM or browser-specific APIs so it remains easily testable in Node.js (Vitest).
- **Services** fetch external data (Domoticz, weather APIs). They return plain objects; rendering happens in `ui/`.
- **Nightglass theme tokens** (`--color-*` CSS custom properties) come from `localStorage` (`ngThemeSettings`) and are applied at runtime. UI code reads these tokens via `currentColor` and CSS variables — do not hard-code colours.
- **Internationalisation** is handled by `scripts/i18n.js`. All user-visible strings must use the i18n mechanism.
- Background Domoticz history graphs are refreshed at most once every five minutes to avoid overloading the server.

## Pull request guidance

- Make the smallest correct change that fully addresses the task.
- Run `npm test` and `npm run lint` before opening a PR and ensure both pass.
- Update or add tests for any logic you change.
- Do not change `package.json` versions or add new dependencies unless strictly necessary. Check for known vulnerabilities with the advisory database before adding any new dependency.
- Scan changed files for secrets before committing.
