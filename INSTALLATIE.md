# Snelle installatie — Nightglass Energy Dashboard 2.7

1. Bewaar bij een upgrade je bestaande `config.js`.
2. Kopieer deze complete map naar de Domoticz-map `www/energy-dashboard`.
3. Maak bij een nieuwe installatie een lokale configuratie:

   ```bash
   cp config.example.js config.js
   ```

4. Open `config.js` en vul minimaal de locatie en Domoticz-instellingen in.
5. Open het dashboard via:

   ```text
   http://DOMOTICZ-IP:8080/user/energy-dashboard/energy-dashboard.html
   ```

Voor een wanddisplay of televisie:

```text
energy-dashboard.html?kiosk=1
```

`config.js` wordt bewust niet meegeleverd, zodat wachtwoorden en API-sleutels niet in het pakket staan.

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
