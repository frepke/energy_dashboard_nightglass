# Nightglass Energy Dashboard 2.7

Een zelfstandig fullscreen energiedashboard voor **Domoticz**, in de visuele taal van Nightglass. Het dashboard gebruikt alleen HTML, CSS en JavaScript: geen framework en geen buildstap voor productie.

Versie 2.7 maakt de energietegels inhoudelijk rustiger en gebruikt de grafiekfunctie van Nightglass zoals bedoeld: als subtiele achtergrondwatermerken op basis van echte Domoticz-daghistorie. De dubbele dagtotalen in de drie grote live-tegels en de lokaal opgebouwde 60-minutenlijntjes zijn verwijderd.

## Functies

- live energiestroom tussen net, woning en zonnepanelen;
- dagtotalen voor net, woning, zon en gas;
- zelfvoorziening en zelfconsumptie;
- Nightglass-achtergrondgrafieken met echte Domoticz-daghistorie;
- actuele stroom- en gasprijs;
- Zonneplan-uurgrafiek met voordeligste aaneengesloten reeks;
- slim verbruiks- en terugleveradvies;
- tijd, datum, zonsopkomst, zonsondergang en daglengte;
- prominente maanmodule met fase, verlichting, opkomst, ondergang, leeftijd, afstand en volgende volle/nieuwe maan;
- meerdere weerbronnen, waaronder Open-Meteo en Weerstation Vierlingsbeek;
- Nederlands en Engels, donker en licht thema;
- synchronisatie met de gekozen Nightglass-preset en handmatig ingestelde Nightglass-kleuren;
- kioskmodus, Visual Viewport-aanpassing en WebSocket-updates.

## Bronstatus en zoncyclus

De bronindicatoren in de klok-, weer- en bovenbalk zijn niet alleen decoratief.

### Domoticz en weer

De kleur toont de echte gegevensstatus:

- **blauw:** verbinden of laden;
- **groen:** recent bijgewerkt;
- **oranje:** laatste goede waarde is verouderd;
- **rood:** bron niet bereikbaar;
- **grijs:** bron niet geconfigureerd.

De volledige status en het tijdstip van de laatste goede update staan in de tooltip en in het toegankelijke label. De indicator in de bovenbalk gebruikt dezelfde Domoticz-statuslogica.

### Zoncyclus

De losse ronde indicator is verwijderd. Onder zonsopkomst en zonsondergang staat nu een horizontale daglichttijdlijn:

- het linkereinde is zonsopkomst;
- het rechtereinde is zonsondergang;
- de marker staat op het huidige punt van de daglichtperiode;
- de vulling toont het verstreken deel van het daglicht;
- de tekst toont bijvoorbeeld `Daglicht 58% · nog 6u 44m`;
- voor of na de daglichtperiode verschijnt een gedimde nachtstatus met de resterende tijd tot de volgende zonsopkomst.

De gewone waarden voor zonsopkomst, zonsondergang en daglengte blijven zichtbaar.

## Domoticz-daghistorie als Nightglass-watermerk

De zes dagtegels gebruiken geen lokale browsermetingen meer. Iedere tegel vraagt dezelfde Domoticz-grafiekgegevens op die het Nightglass-thema voor apparaatkaarten gebruikt:

```text
json.htm?type=command&param=graph&sensor=...&idx=...&range=day
```

De grafiek staat over het volledige tegeloppervlak op de achtergrond. Tekst en bedragen blijven op de voorgrond; er is geen aparte, krappe grafiekstrook meer. De lijn en vulling gebruiken `currentColor` en volgen daardoor automatisch de actieve Nightglass-preset en handmatig ingestelde accent-, succes-, waarschuwing- en foutkleuren.

| Tegel | Historiebron | Gedrag |
|---|---|---|
| Net | P1-apparaat | import positief, teruglevering negatief en een echte nullijn |
| Huis | geconfigureerd verbruiksapparaat | direct; anders berekend uit echte net- en zonhistorie |
| Zon | zonne-energieapparaat | Domoticz-daghistorie van de productie |
| Zelfvoorziening | optioneel percentageapparaat | direct; anders berekend uit uitgelijnde huis- en zonhistorie |
| Zelfconsumptie | optioneel percentageapparaat | direct; anders berekend uit uitgelijnde huis- en zonhistorie |
| Gas | gasmeter | Domoticz-daghistorie van het huidige dagbereik |

Er worden geen willekeurige of kunstmatige meetwaarden gemaakt. Alleen ontbrekende afgeleide reeksen worden berekend, en uitsluitend uit echte, op tijd uitgelijnde Domoticz-punten. Bij aanwijzen van een tegel vermeldt de browsertooltip of de reeks rechtstreeks uit Domoticz komt of is afgeleid, hoeveel punten zijn gebruikt en wanneer de historie is opgehaald.

Om Domoticz niet onnodig te belasten worden de achtergrondgrafieken maximaal eenmaal per tien minuten ververst. De normale livewaarden blijven onafhankelijk daarvan via polling of WebSocket bijgewerkt worden. Oude lokale opslag uit de 60-minutenimplementatie wordt bij de eerste start opgeruimd.

De drie grote energietegels tonen vanaf 2.7 uitsluitend unieke live-informatie:

- actueel netvermogen en import/terugleverrichting;
- actuele huisbelasting;
- actuele zonneproductie en lokaal gebruikt vermogen.

De dagtotalen blijven alleen in de zes kaarten eronder staan, zodat dezelfde gegevens niet tweemaal vlak onder elkaar worden getoond.

## Responsive ontwerp

De pagina gebruikt geen vaste canvasmaat en geen algemene `transform: scale(...)`. Op liggende schermen vult het dashboard de werkelijke **Visual Viewport** met een adaptief grid. Voor zeer lage Safari-vensters is een aparte `micro`-compositie aanwezig. Op tablets en telefoons worden panelen gestapeld zodat informatie leesbaar blijft.

## Installatie of upgrade

1. Bewaar bij een bestaande installatie je eigen `config.js`.
2. Kopieer de inhoud van deze map naar bijvoorbeeld:

   ```text
   /home/pi/domoticz/www/energy-dashboard/
   ```

3. Nieuwe installatie: kopieer `config.example.js` naar `config.js`.
4. Vul je Domoticz- en weerinstellingen in.
5. Open:

   ```text
   http://DOMOTICZ-IP:8080/user/energy-dashboard/energy-dashboard.html
   ```

Het pakket bevat bewust geen echte `config.js`, zodat wachtwoorden en API-sleutels niet worden overschreven of verspreid.

## Nightglass-thema synchroniseren

Wanneer het dashboard op dezelfde Domoticz-origin wordt geopend, leest het automatisch de Nightglass-instellingen uit `ngThemeSettings`. Op recente Domoticz-versies worden ook opgeslagen waarden uit `ThemeSettings.Nightglass` opgehaald; oudere installaties vallen terug op de gebruikersvariabele `ngTheme_settings`.

Achtergrond, panelen, kaarten, randen, tekst en semantische accent-, succes-, waarschuwing- en foutkleuren volgen daardoor de gekozen preset of handmatige instellingen. Ook de prijsgrafiek, statusindicatoren en Domoticz-historiewatermerken gebruiken deze runtime-tokens.

Handmatig opnieuw synchroniseren kan vanuit de browserconsole met:

```js
window.refreshNightglassTheme();
```

## Minimale configuratie

```js
window.DASHBOARD_CONFIG = {
  weatherProvider: 'openmeteo',
  latitude: 51.596,
  longitude: 5.947,
  timezone: 'Europe/Amsterdam',

  domoticz: {
    baseUrl: '',
    username: '',
    password: '',
    auth: 'none',
    ws: false,

    forecastIdx: '',
    usageIdx: '',
    electricityPriceIdx: '',
    gasPriceIdx: '',
    inverterLimitIdx: ''
  }
};
```

Een lege `baseUrl` betekent same-origin en werkt wanneer het dashboard vanuit de `www`-map van Domoticz wordt geladen.

## Iconen aanpassen

Overrides staan in `config.js` en gebruiken lokale SVG-iconen:

```js
window.DASHBOARD_CONFIG = {
  ui: {
    iconOverrides: {
      grid: 'grid',
      house: 'home',
      solar: 'panel',
      'grid-card': 'plug',
      'house-card': 'home',
      'solar-card': 'panel',
      'self-suff-card': 'check',
      'self-cons-card': 'gauge',
      'gas-card': 'flame'
    }
  }
};
```

Beschikbare namen:

```text
bolt, grid, plug, home, solar, panel, flame,
leaf, gauge, battery, water, wind, check
```

## Weerbronnen

Ondersteund:

- `visualcrossing` — API-sleutel nodig;
- `openweathermap` — API-sleutel nodig;
- `openmeteo` — geen sleutel nodig;
- `vierlingsbeek` — leest de apparaten van de Domoticz-plugin.

## URL-opties

```text
?refresh=5             pollinterval in seconden
?ws=1                  WebSocket-push inschakelen
?kiosk=1               kioskmodus
?theme=light           licht thema forceren
?fetchTimeoutMs=15000  netwerktime-out
?safeBottom=80         extra vrije ruimte onderaan
?safeTop=20            optionele extra bovenmarge
?safeLeft=0            optionele extra linkermarge
?safeRight=0           optionele extra rechtermarge
```

## Belangrijke bestanden

```text
energy-dashboard.html          semantische dashboardstructuur
styles/nightglass-v2.css       adaptieve Nightglass-layout en componentstijlen
scripts/main.js                initialisatie en gegevensbronstatus
scripts/ui/weather.js          weer-, zoncyclus- en maanweergave
scripts/ui/deviceHistoryWatermarks.js  Domoticz-daghistorie en Nightglass-watermerken
scripts/ui/kiosk.js            Visual Viewport en veilige marges
scripts/ui/iconOverrides.js    configureerbare lokale SVG-iconen
config.example.js              configuratievoorbeeld
```

## Ontwikkelcontrole

Node.js is alleen nodig voor tests en linting:

```bash
npm ci
npm test
npm run lint
```

Status van 2.7.0:

```text
22 testbestanden geslaagd
402 tests geslaagd
ESLint: 0 fouten, 0 waarschuwingen
```
