# Content data sources

Stand: 14. Juli 2026. Der Katalog ist ein in der Entwicklung manuell aktualisierter Snapshot; die App lädt zur Laufzeit keine offiziellen Daten nach.

## Quellen

NHL:

- aktive Teams: `https://api-web.nhle.com/v1/standings/now`
- stabile Team-IDs: `https://api.nhle.com/stats/rest/en/team`
- 2026/27-Kader: `https://api-web.nhle.com/v1/roster/{ABBR}/20262027`
- 2025/26-Regular-Season-Statistiken: NHL Stats REST `skater/summary` und `goalie/summary`
- Boston-Depth-Fallback Michael DiPietro: offizieller NHL Player Search und NHL.com-Artikel „Bruins roster changes for 2026-27“. Beide Quellen führen ihn bei Boston; weil der Preseason-Roster-Endpunkt ihn noch nicht enthält, bleibt `sourceRosterStatus=roster-candidate` mit manueller Prüfung.
- reviewte Sekundärpositionen: NHL.com-Lineups beziehungsweise offizielle Team-Roster belegen Teuvo Teravainen (RW), Nicolas Roy (RW), Timo Meier (LW) und Ben Meyers (LW). URLs, Reviewdatum und Begründung stehen in `data/content/position-evidence.json`; ihre Primärposition aus dem Roster-Snapshot wird nicht ersetzt.

PWHL:

- Teams, Kader, Profile und 2025/26-Statistiken: offizieller HockeyTech-Feed der PWHL
- 2026 Draft: `https://www.thepwhl.com/en/draft`
- der Feed-Key wird bei einem manuellen Import aus der offiziellen PWHL-Stats-Seite entdeckt und ausschließlich transient für Requests verwendet. Persistierte Snapshot-, Katalog- und SQL-URLs enthalten weder den Key noch einen `key`-Parameter.

Der Import schlägt bei Quell- oder Schema-Drift fehl und ersetzt den freigegebenen Snapshot erst nach einem vollständigen erfolgreichen Lauf (atomarer Dateitausch).

## Quellenstatus statt Kaderbehauptung

- `active-roster`: im offiziellen 2026/27-Kader-Endpunkt vorhanden.
- `roster-candidate`: offizielle aktive Teamzuordnung und offizielle Roster-Planung, aber noch nicht im Preseason-Roster-Endpunkt; manuelle Prüfung erforderlich.
- `rights`: offizielles PWHL-Draftrecht. Das ist ausdrücklich keine Behauptung über einen aktiven Kaderplatz.
- `legacy-retained`: inaktive Identität, die nur bestehende Karten-, Lineup- oder Receipt-Referenzen stabil hält.

Der Launch-Katalog enthält 792 verwendbare Identitäten (18 je Team), darunter 38 PWHL-Draftrechte und einen NHL-Roster-Candidate. Zusätzlich bleiben Kendall Coyne Schofield und Claire Thompson als zwei inaktive `legacy-retained`-Identitäten erhalten. Ihre sechs alten Karten-IDs sind `reward-only` und nicht marktgängig.

## Datenqualität und Grenzen

- NHL-Geburtsland wird nicht als Nationalität ausgegeben. Deshalb ist die Nationalität vieler NHL-Spieler bewusst `null`.
- Nationalitäten werden nur als eindeutiger ISO-3-Code gespeichert. Mehrfachwerte wie `CAN/ITA` bleiben `null` und werden zur Prüfung markiert.
- Generische offizielle PWHL-Positionen `F` und `D` werden deterministisch auf Gameplay-Slots projiziert. `F` bleibt für alle Forward-Slots, `D` für beide Defense-Slots einsetzbar; Primärslot und Herleitung sind markiert.
- Exakte offizielle NHL-Positionen bleiben unverändert. Eine zusätzliche Eligibility ist nur mit einem verwendeten, snapshotaktuellen Eintrag in `position-evidence.json` erlaubt; Generator und Regressionstest schlagen bei unbelegten Positionen fehl.
- Der verwendete NHL-Summary-Endpunkt liefert keine Blocks/Hits. Importierte Nullen werden im Ratingmodell nicht als Beleg für fehlendes Defensivspiel interpretiert.
- 371 Identitäten sind wegen Draftrechten, Roster-Fallback, Positionsprojektion, belegter Sekundärposition oder mehrdeutiger Quelldaten zur manuellen Prüfung markiert (369 aktiv, zwei inaktiv-legacy).
- Spieler- und Kartenbilder bleiben neutrale Platzhalter. Nur vorhandene, freigegebene Signature-Series-Dateien werden als lokale Assets referenziert. Teamlogos und nicht freigegebene Bilder werden nicht importiert.

Alle Namen, Fantasy-Ratings und abgeleiteten Positionen müssen vor einer Veröffentlichung manuell geprüft werden. Rink Rivals ist ein inoffizieller Fan-Prototyp.
