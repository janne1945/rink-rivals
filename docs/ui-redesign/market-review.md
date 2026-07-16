# Rink Rivals Market — AAA redesign review

## Analyse vor dem Umbau

- `MarketScreen` verwendet weiterhin den serverseitigen `AccountMarketState` mit Base- und Event-Angeboten, Serverzeit, Eventfenster, Spotlight-Platzierung, regulärem Preis, aktuellem Preis und Besitzmenge.
- Suche, Liga, Team, Position, Kartentyp, Set, Besitz, OVR und Preis werden über das bestehende `CatalogFilters`-Modell gefiltert. Die neue Sortierung arbeitet ausschließlich auf der bereits gefilterten Client-Ansicht.
- Käufe laufen unverändert über `purchase_card`, verwenden weiterhin idempotente Request-IDs und prüfen Credits, Angebotsfenster und Doppel-Submit serverseitig.
- Rotation und Countdown bleiben an die monotone Serveruhr gekoppelt. Abgelaufene Event-Angebote werden weiter ausgeblendet.
- Lade- und Initialfehlerzustände bleiben im bestehenden `AccountGate`; Kauf- und Rotationsfehler bleiben im Market selbst zugänglich und wiederholbar.
- Der vorherige Aufbau trennte Hero und Eventbox optisch, behandelte die Filter wie ein Admin-Panel und gab Featured Releases sowie Kaufzuständen zu wenig visuelles Gewicht.

## Umgesetzte Komponenten

- `MarketScreen`: neue zusammenhängende Market-Stage mit `BUILD YOUR SIX / MARKET`, kuratiertem Live-Release, echten Featured-Karten, Rotationstimer und einer kompakten Marktübersicht.
- `MarketScreen.module.css`: vollständig isolierte Market-Komposition, responsive Raster, Hover-Lift, Fokuszustände, reduzierte Bewegung und mobile Umbrüche.
- `CatalogFilters`: optionaler `className`-Hook für seitenbezogene Darstellung ohne Änderung des gemeinsamen Filtermodells.
- Angebotskarten: klarere Preiszone, sichtbarer Owned-Zustand, `BUY CARD`, `ADD ANOTHER` und verständlicher RP-Fehlbetrag.
- Sortierung: stabile Server-/Market-Reihenfolge, Highest Overall, Lowest Price und Highest Price; keine Daten- oder Preislogik verändert.
- Event-Sprache: `Event Rotation` statt separatem Shop, damit der Market die einzige Erwerbsfläche bleibt.

## Assets

- Der schematische SVG-Platzhalter wurde durch die lokal gespeicherte, textfreie Hockey-Key-Art `public/assets/ui/market-hero-keyart.webp` ersetzt. Sie zeigt einen anonymen Spieler im Arena-Tunnel und besitzt links bewusst ruhige Fläche für die Hero-Texte.
- Desktop und Mobile verwenden eigene Overlay- und Fokuspositionen, damit der Spieler glaubwürdig bleibt und nicht wie eine übergroße Hintergrundfigur in die Typografie ragt.
- Featured Release verwendet die echten, bereits validierten Kartenassets der aktuellen Serverrotation.
- Keine Echtgeld-, Premium-, Bundle- oder Shop-Assets ergänzt.

## Geprüfte Zustände

- normale Base-Angebote und Featured Event Release
- aktive Liga-/Positionsfilter und lokale Sortierung
- leeres Suchergebnis mit Reset-Aktion
- kaufbare Karte und barrierefreier Bestätigungsdialog
- bereits besessene Karte mit eindeutiger Textkennzeichnung
- zu wenig Rivalry Points mit deaktiviertem CTA und Fehlbetrag
- Kaufserverfehler ohne Credit-Abzug und mit Retry
- abgelaufene Eventrotation
- Initial-Lade- und Account-Fehlerzustand über bestehende Account-Gate-Tests
- Desktop 1920×1080 und 1440×900, Tablet 820×1180, Mobile 390×844

## Erfolgreiche Prüfungen

- TypeScript Typecheck
- 41 Vitest-Dateien / 226 Tests
- Produktions-Build
- Market-E2E für Kauf, Double-Submit, Kaufserverfehler, unzureichende RP, Rotation, alle Filter, Starter-Ausschluss und DOM-Bounds auf Mobile, Mobile Landscape, Tablet und Desktop
- visuelle Screenshot-Abnahme einschließlich vorgeladener Lazy-Load-Karten
- `git diff --check`

## Review-Screenshots

- `docs/ui-redesign/screenshots/market-1920x1080.png`
- `docs/ui-redesign/screenshots/market-1440x900.png`
- `docs/ui-redesign/screenshots/market-tablet.png`
- `docs/ui-redesign/screenshots/market-mobile.png`
- `docs/ui-redesign/screenshots/market-hero-featured.png`
- `docs/ui-redesign/screenshots/market-filters.png`
- `docs/ui-redesign/screenshots/market-card-grid.png`
- `docs/ui-redesign/screenshots/market-active-filters.png`
- `docs/ui-redesign/screenshots/market-card-owned.png`
- `docs/ui-redesign/screenshots/market-insufficient-rp.png`
- `docs/ui-redesign/screenshots/market-empty-state.png`
