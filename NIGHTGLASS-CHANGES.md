## 2.10.13

- De prijstooltip blijft tijdens desktop- en laptophover continu zichtbaar bij het passeren van de smalle ruimte tussen twee prijsbalkjes.
- Inhoud en horizontale positie wisselen binnen hetzelfde label; de tooltip wordt niet meer per balk verborgen en opnieuw getoond.
- De door de gebruiker gekozen verticale hoverhoogte van 2.10.10 blijft exact behouden; de latere hoogtewijzigingen uit 2.10.11 en 2.10.12 zijn niet overgenomen.
- Touch- en iPhonegedrag blijven ongewijzigd.

## 2.10.10

- `brace-expansion` is bijgewerkt van 5.0.8 naar 5.0.9 om GHSA-rgw5-rvv9-x895 te verhelpen.
- `npm audit --audit-level=high` meldt geen kwetsbaarheden.
- De dashboardfunctionaliteit en configuratie zijn ongewijzigd.

## 2.10.9

- De vaste prijstooltipbaan staat op desktop en laptop 12 pixels hoger voor meer ruimte boven de prijsbalken.
- De bestaande iPhone-positie, horizontale beweging en begrenzing binnen het scherm blijven ongewijzigd.

## 2.10.8

- De prijstooltip gebruikt op desktop, laptop en touchschermen één vaste verticale baan boven de grafiek.
- Tijdens hoveren volgt alleen de horizontale positie de actieve prijsbalk; verschillen in balkhoogte veroorzaken geen verticale sprongen meer.
- De bestaande begrenzing houdt het label binnen de zichtbare browserranden.

## 2.10.5

- Alle liggende venstergroottes gebruiken nu natuurlijke inhoudshoogte; als de beschikbare hoogte te klein is, scrolt het document zonder Energiestroom samen te drukken.
- Fullscreen houdt de bestaande veilige ondermarge voor de tijdas.

## 2.10.4

- Korte landscape-vensters gebruiken weer normale verticale scrolling, zodat Energiestroom, het passieve energieadvies en de prijsgrafiek niet buiten beeld worden afgesneden.
- Fullscreen- en kioskhoogtes blijven gekoppeld aan de gemeten Visual Viewport.
- De onderste tijdlabels van de prijsgrafiek hebben een grotere veilige binnenmarge.

## 2.10.3

- Landschap/fullscreen gebruikt voor `html`, `body` en het dashboard exact dezelfde gemeten Visual Viewport-hoogte.
- De overbodige verticale browser-scrollbar is verwijderd zonder dashboardinhoud af te knippen.
- Insight blijft standaard uit en Energiestroom plus het passieve energieadvies blijven volledig zichtbaar.

## 2.10.2

- Herstelt de volledige live Energiestroom-weergave wanneer Insight uit staat.
- De dashboard-grid gebruikt dan vier echte inhoudsrijen; Energiestroom neemt niet langer per ongeluk de oude, lage Insight-rij over.
- Insight blijft standaard uit en de aparte passieve energy-loggerkaart blijft actief.

## 2.10.1

- De oude Smart Insight-balk is voorlopig standaard uitgeschakeld en wordt niet meer bijgewerkt.
- De afzonderlijke, passieve energy-logger-advieskaart blijft volledig actief.
- Insight kan later bewust worden teruggezet met `insight.enabled: true` of tijdelijk met `?insight=1`.

## 2.10.0

- Nieuwe Nightglass-kaart voor de alleen-lezen `/v1/advice`-uitvoer van energy-logger v1.3+.
- Toont het beste venster van één uur, alle vensters van 1/2/3/4/6 uur, verwachte zon-, huis-, import- en terugleverenergie, netto kosten, modelversie, horizon en evaluatiefout.
- Lege `energyLogger.baseUrl` gebruikt automatisch dezelfde host als het dashboard op poort 8787; een afwijkend adres blijft configureerbaar.
- De client doet uitsluitend `GET` zonder credentials en weigert advies wanneer de bron niet `passive`, `locked`, niet-aanstuurbaar en zonder automatische activering meldt.
- Uitval of uitschakeling van energy-logger beïnvloedt Domoticz, weer, prijzen en de bestaande slimme inzichten niet.
- Nederlandse en Engelse labels, licht/donker thema en responsive weergave toegevoegd.

## 2.9.0

- de Zonneplan-grafiek verwerkt de nieuwe kwartierprijzen uit Forecast JSON zonder tijden op hele uren af te ronden;
- tijdlabels verschijnen alleen op zinvolle hele-uurpunten, plus op het actuele kwartier, zodat labels niet meer viermaal over elkaar staan;
- hoverinformatie toont datum, begin- en eindtijd, afnameprijs, terugleverprijs exclusief belasting en het actieve beste venster;
- de selectie `Alle / 1u / 2u / 3u / 4u / 6u` berekent voortaan echte klokuren uit aaneengesloten kwartieren (bijvoorbeeld vier kwartieren voor 1u);
- iedere vensterknop toont bij aanwijzen begin/einde, gemiddelde prijs, voordeel ten opzichte van het beschikbare gemiddelde en het aantal kwartieren;
- prijsdata wordt bij ieder nieuw kwartier opgehaald; uurdata blijft als terugval ondersteund;
- advies- en prijsvenstertijden tonen nu ook minuten (`:15`, `:30`, `:45`);
- 414 geautomatiseerde tests slagen, inclusief gerichte kwartierprijs-, kwartiergrens- en tooltiptests.

## 2.8.0

- Hoofdpanelen gebruiken inhoudgestuurde hoogtes en groeien mee met extra regels of langere teksten.
- Het dashboard vult minimaal de viewport, maar schakelt bij te weinig hoogte over op normale verticale pagina-scroll in plaats van inhoud af te knippen.
- Weermetadata gebruikt flexibele rijen; neerslag blijft op een eigen tweede regel met dynamische ondermarge.
- Vaste micro-, dense-, compact- en cozy-hoogtes voor weer, advies, energiekaarten en prijspaneel worden door inhoudgestuurde minima vervangen.
- Advies-, kaart- en badge-inhoud mag wrappen wanneer de beschikbare ruimte kleiner is.
- Cacheversies verhoogd naar 2.8.0.

## 2.7.21

- Neerslagregel blijft zichtbaar in cozy, compact, dense en micro desktopweergaven.
- Vierlingsbeek toont de neerslagregel ook wanneer de losse regenintensiteitssensor tijdelijk ontbreekt; uur- en dagwaarden worden als fallback gebruikt.
- CSS- en JavaScript-cacheversies verhoogd naar 2.7.21.

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
# Nightglass v2.9.1

- Hoverinformatie wisselt nu direct mee tussen Nederlands en Engels.
- De dynamisch aangemaakte labels voor afname en teruglevering blijven niet meer in de vorige taal staan.
# Nightglass v2.10.6

- De keuze `1u`, `2u`, `3u`, `4u` of `6u` werkt nu door in de grote passieve advieskaart.
- De bijbehorende energy-loggervenstertegel krijgt dezelfde actieve markering.
- De prijsgrafiek markeert exact het begin en einde van het gekozen energy-loggervenster.
- De vijf venstertegels zijn aanklikbaar en bedienen dezelfde centrale duurkeuze.
# Nightglass v2.10.7

- `start_local` en `end_local` uit de energy-logger worden als lokale wandkloktijden getoond en niet opnieuw omgerekend naar de tijdzone van de browser of CI-runner.
- De geselecteerde `4u`-kaart toont daardoor overal het verwachte tijdvak `13:00–17:00`, ook wanneer de tests onder UTC draaien.
