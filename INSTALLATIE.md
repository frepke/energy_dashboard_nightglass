# Snelle installatie — Nightglass Energy Dashboard 2.10.4

1. Bewaar bij een upgrade je bestaande `config.js`.
2. Kopieer deze complete map naar de Domoticz-map `www/energy-dashboard`.
3. Maak bij een nieuwe installatie een lokale configuratie:

   ```bash
   cp config.example.js config.js
   ```

4. Open `config.js` en vul minimaal de locatie en Domoticz-instellingen in.
   Laat `energyLogger.baseUrl` leeg wanneer energy-logger op dezelfde host op
   poort 8787 draait. Vul anders bijvoorbeeld `http://192.168.1.20:8787` in.
5. Open het dashboard via:

   ```text
   http://DOMOTICZ-IP:8080/user/energy-dashboard/energy-dashboard.html
   ```

Voor een wanddisplay of televisie:

```text
energy-dashboard.html?kiosk=1
```

`config.js` wordt bewust niet meegeleverd, zodat wachtwoorden en API-sleutels niet in het pakket staan.

## Insight voorlopig uit

De oude Smart Insight-balk is standaard uitgeschakeld. De aparte passieve
energy-logger-prognose blijft zichtbaar. Wil je Insight later terugzetten, voeg
dan aan `config.js` toe:

```js
insight: {
  enabled: true,
},
```

## Energy-logger-prognose

De prognosekaart gebruikt alleen `GET /v1/advice` van energy-logger v1.3 of hoger.
Controleer vanaf de browsermachine dat `http://DOMOTICZ-IP:8787/v1/advice`
bereikbaar is. Wanneer de logger tijdelijk uitvalt, blijven alle overige
Nightglass-onderdelen normaal werken. De kaart accepteert alleen advies wanneer
de API `mode: passive`, `locked: true`, `control_capable: false` en
`automatic_activation: false` meldt.

## Upgrade van 2.6

Alle runtimebestanden mogen worden vervangen; zet daarna je eigen `config.js` terug. Versie 2.7 verandert geen bestaande Domoticz-indices. De dubbele dagtotalen in de grote live-tegels en de oude lokale 60-minutenlijntjes zijn verwijderd. De zes dagtegels halen voortaan echte Domoticz-daghistorie op via `param=graph&range=day`.

Na de upgrade is een harde browserrefresh aanbevolen. De eerste achtergrondgrafieken verschijnen zodra Domoticz ten minste twee historiepunten voor het betreffende apparaat teruggeeft. Huis en de twee percentagekaarten worden alleen afgeleid wanneer daarvoor geen eigen history-device is geconfigureerd.

## Zeer laag Safari-venster of zichtbare macOS Dock

De compacte `micro`-layout wordt automatisch gekozen bij een zeer laag zichtbaar browservenster. Ligt een zichtbare Dock over de onderrand, reserveer dan expliciet ruimte:

```text
energy-dashboard.html?kiosk=1&safeBottom=80
```

De waarde is in CSS-pixels. In echte browser-fullscreen- of kioskmodus is deze extra marge doorgaans niet nodig.

## Nightglass-kleuren

Open het dashboard via dezelfde Domoticz-host en poort als de Nightglass-interface. Dan deelt het dezelfde `localStorage` en worden de gekozen preset en handmatige kleuren automatisch toegepast. Na een kleurwijziging volstaat herladen of opnieuw focussen.
