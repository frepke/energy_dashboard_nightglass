# Stylesheetstructuur van Nightglass v2

`energy-dashboard.html` laadt de volgende bestanden in deze volgorde:

1. `tokens.css` — bestaande basisvariabelen;
2. `base.css` — reset en algemene basis;
3. `flow.css` — bestaande energiestroomcomponenten;
4. `cards.css` — bestaande kaartcomponenten;
5. `chart.css` — prijsbalken en tooltip;
6. `insights.css` — slim advies;
7. `weather-art.css` — lokale weerillustraties;
8. `nightglass-v2.css` — volledige layout, Nightglass-thema en alle responsive regels.

`nightglass-v2.css` is bewust de laatste laag. Het bestand bouwt de interface opnieuw op zonder vaste canvasmaat of `transform: scale(...)` en bevat ook de 1024×768-, ultrawide-, tablet- en telefoonregels.

De overige layout-, weather- en responsive-bestanden zijn als compatibiliteitsmateriaal aanwezig, maar worden door de v2-HTML niet geladen.
