# Stylesheet structure

The dashboard has no build step, so CSS is split into browser-loaded files in the same order as `energy-dashboard.html`.

## Core files

- `tokens.css` — design tokens and theme variables.
- `base.css` — reset, body and background styling.
- `layout.css` — dashboard wrapper, topbar and generic panel layout.
- `flow.css` — live energy-flow nodes and connector lines.
- `cards.css` — statistic cards and price badges.
- `chart.css` — price bars, tooltip and usage-window selector.
- `insights.css` — Smart Insight bar.
- `kiosk.css` — kiosk/TV-mode rules.

## Weather files

The former large `weather.css` is now split without changing cascade order:

1. `weather-core.css`
2. `weather-command-desktop.css`
3. `weather-art.css`
4. `weather-final.css`

`weather.css` remains as an import manifest for custom deployments that still link it directly.

## Responsive files

The former large `responsive.css` is now split without changing cascade order:

1. `responsive-base.css`
2. `responsive-layout.css`
3. `responsive-weather.css`
4. `responsive-flow.css`
5. `responsive-chart.css`

`responsive.css` remains as an import manifest for custom deployments that still link it directly.
