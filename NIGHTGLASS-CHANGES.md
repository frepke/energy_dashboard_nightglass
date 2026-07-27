## 2.7.20

- Neerslagregel blijft zichtbaar in korte desktop-browservensters (`dashboard-fit-dense`).
- Weermetadata gebruikt in die modus drie badges op regel 1 en neerslag op regel 2.
- Compactere temperatuur- en metadata-afmetingen voorkomen verticale clipping.

# Nightglass wijzigingen

## 2.7.10

- compacte iPhone-portraitverbindingen gebruiken nu eigen korte keyframes in plaats van de brede desktopbaan;
- drie duidelijk zichtbare partikels blijven daardoor het grootste deel van hun cyclus binnen de flowbalk;
- de partikels zijn korter en helderder gemaakt voor de smalle Grid–House–Solar-verbindingen;
- bij ingeschakelde verminderde beweging blijven statische energiemarkers zichtbaar zonder animatie.

## 2.7.0

- de dagtotalen rechts in de drie grote live-energietegels zijn verwijderd; deze tegels tonen nu uitsluitend actuele W-waarden en richting/status;
- de lokaal opgebouwde 60-minuten-sparklines en hun aparte onderste grafiekstrook zijn volledig verwijderd;
- alle zes dagtegels gebruiken nu echte Domoticz `range=day`-grafiekgegevens als subtiel Nightglass-watermerk over de volledige kaart;
- net, huis, zon en gas gebruiken bij voorkeur hun eigen Domoticz-devicehistorie;
- ontbrekende huis-, zelfvoorzienings- en zelfconsumptiereeksen worden uitsluitend afgeleid uit echte, op tijd uitgelijnde net- en zonhistorie;
- er worden geen willekeurige, geïnterpoleerde of lokaal verzonnen meetwaarden weergegeven;
- de netgrafiek bewaart de richting: import positief, teruglevering negatief, met een echte nullijn;
- lijnen en vlakken gebruiken `currentColor` en volgen daardoor de actieve Nightglass-preset en handmatig aangepaste themakleuren;
- de grafieken worden maximaal eenmaal per tien minuten vernieuwd, los van de snelle live-updatecyclus;
- de tegeltooltip vermeldt bron, aantal meetpunten en ophaaltijd;
- oude lokale sparkline-opslag wordt automatisch opgeruimd;
- 9 gerichte tests toegevoegd voor Domoticz-velden, tijdstempels, afgeleide reeksen en SVG-geometrie; in totaal 402 tests geslaagd.


## 2.6.0

- de onduidelijke ronde daglichtindicator rechtsboven in de zoncyclus-tegel is verwijderd;
- een horizontale tijdlijn toont nu zonsopkomst, zonsondergang, verstreken daglicht en de huidige positie;
- de begeleidende tekst vermeldt overdag het daglichtpercentage en de resterende tijd tot zonsondergang;
- voor en na zonsopkomst toont de tijdlijn een rustige nachtstatus en de resterende tijd tot de volgende zonsopkomst;
- na zonsondergang wordt de zonsopkomst correct als gebeurtenis van de volgende dag berekend;
- de compacte en micro-layouts hebben afzonderlijke tijdlijnmaten zonder overlap of verticale overflow;
- 1 aanvullende duurtest toegevoegd; in totaal 398 tests geslaagd.


## 2.5.0

- de Domoticz-, push- en weerindicatoren tonen nu echte toestanden: laden, actueel, verouderd, fout of uitgeschakeld;
- statuskleur, tooltip en toegankelijk label bevatten de toestand en het tijdstip van de laatste goede update;
- de decoratieve zonstip is vervangen door een daglicht-voortgangsring van zonsopkomst naar zonsondergang;
- alle zes sparklines hebben een expliciete eenheid en periode;
- netvermogen gebruikt een getekende, symmetrische schaal: import boven nul en teruglevering onder nul;
- huis- en zonnevermogen gebruiken een nulbasis met een stabiele minimale schaal, zodat kleine afwijkingen niet overdreven groot lijken;
- zelfvoorziening en zelfconsumptie gebruiken altijd een vaste schaal van 0–100%;
- gas toont uitsluitend de cumulatieve huidige lokale dag en start opnieuw bij een dagwissel of tellerreset;
- horizontale posities volgen echte tijdstempels en onderbrekingen in de meetreeks worden niet kunstmatig verbonden;
- hover en touch tonen een compacte tooltip met tijdstip, exacte waarde, richting, periode en schaal;
- de nieuwe opslag `nightglass-energy-sparklines-v3` vervangt de inhoudelijk ongeschikte v2-historie;
- 9 gerichte tests toegevoegd voor sparklinegeometrie, dagfiltering, richtingsformattering, bronveroudering en zoncyclus.


## 2.4.0

- PV-beperkingslabels hebben een vaste compacte hoogte en blijven volledig binnen de zonnebrontegel;
- de oude bovenmarge van bronlabels is expliciet gereset, zodat label, waarde en status als één gecentreerde groep worden uitgelijnd;
- alle energiepartikels lopen exact door het verticale midden van de flowbalk, ook wanneer meerdere partikels tegelijk actief zijn;
- flowlabels, balken en richtingspijlen gebruiken afzonderlijke grid-rijen en kunnen niet meer over elkaar schuiven;
- de zes dagtegels hebben afzonderlijke titel-, meetwaarde- en trendzones met extra regelafstand;
- compacte en dense vensters krijgen iets meer hoogte voor het energiepaneel, terwijl de prijsgrafiek volledig zichtbaar blijft;
- geautomatiseerde geometriechecks bewaken badge-containment, particle-centering en kaartinterne overlap;
- gecontroleerd op 2048×984, 2048×944, 1920×1080, 1536×864, 1366×768, 1280×720 en 1024×500 CSS-pixels.

## 2.3.0

- actieve Nightglass-preset en handmatige kleuren worden overgenomen uit `ngThemeSettings`;
- opgeslagen instellingen worden aanvullend gelezen uit `ThemeSettings.Nightglass` of de oudere gebruikersvariabele `ngTheme_settings`;
- achtergrond, oppervlakken, randen, tekst en statuskleuren zijn centrale runtime-tokens;
- ook de kleuren van de Zonneplan-prijsgrafiek volgen het gekozen Nightglass-thema;
- beide maanmomenten gebruiken exact dezelfde notatie: datum plus relatieve tijd, met volledige datum en tijd als tooltip;
- maanleeftijd en afstand zijn taalkundig en numeriek consistent geformatteerd;
- grote energienodes zijn vervangen door compacte bronkaarten met actuele waarde én dagtotaal;
- de verbinding met zonnepanelen heet en loopt nu correct als `HUIS ← ZON` bij productie;
- compacte, dense en micro-layouts hebben exact passende rijen zonder intrinsieke overflow;
- gecontroleerd op 2048×1152, 1440×900, 1366×768 en 1024×500 CSS-pixels.

## 2.2.0

- werkelijke Visual Viewport-hoogte wordt gebruikt in Safari en op tablets;
- nieuwe `micro`-layout voor circa 1024 × 500 CSS-pixels;
- bovenbalk, hemelmodules, energiestroom, KPI-tegels en prijsgrafiek hebben in micro-modus exact berekende rijen;
- alle vier hoofdpanelen blijven binnen de viewport zonder overlap of afkappen;
- optionele URL-marges `safeTop`, `safeRight`, `safeBottom` en `safeLeft`;
- verborgen PV-limietbadges veroorzaken geen intrinsieke hoogte meer;
- kaartkoppen zijn in de laagste compositie niet meer afgesneden;
- bestaande maan-, Domoticz-, Zonneplan-, weer- en sparkline-logica is ongewijzigd gebleven.

## 2.1.0

Dit is een volledige herbouw van de presentatie-laag van het bestaande Energy Dashboard. De bestaande Domoticz-, energie-, prijs-, weer- en maanlogica is behouden, maar de HTML-structuur en responsive lay-out zijn opnieuw ontworpen.

## Belangrijkste wijzigingen

- Volledig nieuwe Nightglass-interface met het originele donkerblauwe kleurenpalet, glasachtige panelen en consistente randen, schaduwen en accenten.
- Geen vast 1920 x 1080-canvas en geen `transform: scale(...)`. De interface gebruikt een echte responsive CSS-grid.
- Alle hoofdpanelen, energienodes en dagtegels hebben consistente afmetingen, uitlijning en interne marges.
- De dagtegels gebruiken aparte meetwaarde- en trendzones, zodat teksten, prijzen en sparklines niet meer over elkaar heen kunnen vallen.
- Prominente maanmodule met fasecanvas, verlichtingspercentage, maanopkomst, maanondergang, maanleeftijd, afstand en volgende volle/nieuwe maan.
- Live sparklines zonder extra Domoticz-verzoeken. De laatste 48 metingen worden lokaal bewaard.
- Configureerbare icon-overrides via `config.js`, uitsluitend met meegeleverde veilige SVG-iconen.
- Adaptieve energiestroom voor breedbeeld, compact landschap en portret.
- Prijsgrafiek met randbeveiliging voor labels, markeringen voor de volgende dag en een responsive selectiebalk voor het beste tijdvenster.
- Nieuwe installaties starten in het Nederlands; de taalkeuze blijft lokaal bewaard.
- Kioskmodus gebruikt normale responsive lay-out in plaats van visuele schaaltrucs.

## Geteste schermformaten

De lay-out is gecontroleerd op 1920 x 1080, 1536 x 960, 1366 x 768, 1024 x 768, 800 x 1280 en 412 x 915 pixels.

In landschap vult het dashboard de beschikbare ruimte. In portret stapelen de onderdelen in een logische, leesbare volgorde; inhoud wordt niet kunstmatig verkleind om alles onleesbaar op een enkel scherm te persen.

## Installatie

1. Pak de map uit in de `www`-map van Domoticz, bijvoorbeeld:

   ```text
   /home/pi/domoticz/www/energy-dashboard/
   ```

2. Kopieer `config.example.js` naar `config.js`.
3. Vul de Domoticz-verbinding, locatie en gewenste weerbron in.
4. Open:

   ```text
   http://DOMOTICZ-IP:8080/user/energy-dashboard/energy-dashboard.html
   ```

De nieuwe ontwerp- en responsive laag staat in `styles/nightglass-v2.css`. De aangepaste HTML staat in `energy-dashboard.html`.

## Aanpassen

Iconen kunnen in `config.js` worden aangepast:

```js
window.DASHBOARD_CONFIG = {
  ui: {
    iconOverrides: {
      grid: 'grid',
      house: 'home',
      solar: 'panel',
      'gas-card': 'flame'
    }
  }
};
```

Beschikbare iconen: `bolt`, `grid`, `plug`, `home`, `solar`, `panel`, `flame`, `leaf`, `gauge`, `battery`, `water`, `wind` en `check`.

## 2.7.9

- iPhone portrait toont de live energiestroom opnieuw horizontaal als `Net → Huis ← Zon`.
- De drie live knooppunten vormen één compacte visual zonder afzonderlijke kaartvlakken.
- Horizontale flowanimaties blijven correct na draaien tussen portrait en landscape.
- De maan en decoratieve baan schalen nu ten opzichte van de maanmodule en worden begrensd door de beschikbare hoogte, zodat korte of afwijkende resoluties niet meer afkappen.
