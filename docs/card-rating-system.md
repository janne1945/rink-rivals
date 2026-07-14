# Card rating system

Das Launchmodell erzeugt Ratings deterministisch aus dem freigegebenen Snapshot. NHL und PWHL werden getrennt nach Liga und Rolle normalisiert. Damit gibt es keinen pauschalen Liga-Malus; die Werte sind Gameplay-Balance und keine wissenschaftliche Aussage über direkte Ligavergleichbarkeit.

## Base Overall

Skater-Signal:

- Punkte, Tore und Schüsse pro Spiel
- Eiszeit und Stichprobengröße
- Plus/Minus mit begrenztem Gewicht
- für PWHL zusätzlich Blocks/Hits; beim NHL-Summary werden diese Felder wegen der Quellenbegrenzung nicht als echte Nullen gewertet

Goalie-Signal:

- Save Percentage und Goals Against Average
- Siege und Shutouts pro Spiel
- Stichprobengröße

Innerhalb jedes Liga-/Rollenpools wird der Rang auf 68–86 OVR abgebildet. Fehlende Statistik oder reine Draftrechte bleiben im unteren Band. Die aktuelle Liga-Durchschnittsdifferenz beträgt weniger als 0,02 OVR.

## Attribute und Archetypen

Position, Archetyp und ein stabiler Hash erzeugen reproduzierbare, unterscheidbare Profile. Unterstützte Archetypen sind unter anderem Sniper, Playmaker, Power Forward, Two-Way Forward, Mobile/Offensive/Defensive Defense sowie Reflex/Positional/Hybrid Goalie. Ein Sniper erhält bei gleichem OVR beispielsweise mehr Shooting, ein Playmaker mehr Passing. Die Offsets bleiben eng genug am OVR, um keine versteckte zweite Overall-Skala zu erzeugen.

## Kartenkurve

- Starter: 68–76, Teamdurchschnitt exakt 72; nicht marktgängig.
- Base: 68–86; dauerhaft im Base Market.
- frühe Events: 84–90; nur im Event Shop und nur im gültigen Zeitfenster.
- Launch-Rewards: höchstens 90; `reward-only`, kostenlos und ohne Marktfenster.

Starter schließen mindestens die beiden besten Base-Spieler sowie alle Identitäten am dritthöchsten Team-OVR-Cutoff aus. Connor McDavid ist zusätzlich explizit ausgeschlossen. Fehlende Kader-Depth wird über belegte und markierte Quellen ergänzt, nicht durch eine künstliche Abwertung von Stars.

258 der 264 Starterversionen liegen im OVR strikt unter Base. Die sechs
quellen- und positionsbedingt unvermeidbaren 68/68-Floor-Fälle sind Michael
DiPietro, Arttu Hyry, Max Jones, Garnet Hathaway, Nils Höglander und Brandon
Duhaime. Sie stehen in einer codegeprüften, nach stabilen Player-IDs geführten
Allowlist; ihr
Attributprofil liegt nirgends über Base und in mindestens einem Attribut strikt
darunter. Dadurch bleiben 68–76, gültige Positionen und der Top-Star-Schutz
gleichzeitig erhalten.

## Eventidentität statt Blanket Upgrade

Jedes der zehn Events definiert eine Stärke, einen Support-Wert und einen Tradeoff. `Record Breakers` steigert zum Beispiel Shooting/Speed und senkt Defense; `Playoff Heroes` stärkt Clutch/Defense und reduziert Speed. Der Generator erzwingt gegenüber der Base-Version mindestens ein höheres und ein niedrigeres Attribut. Schema, Validator und Tests prüfen dieses Verhalten.

## Auditierbare Overrides

`data/content/rating-overrides.json` ist eine Liste mit:

```json
{
  "playerId": "nhl-example-player",
  "sourceGeneratedOverall": 80,
  "baseOverall": 81,
  "reason": "Manuell belegte Korrektur mit nachvollziehbarer Begründung."
}
```

`sourceGeneratedOverall` ist Pflicht. Wenn das Modell nach einer Datenänderung einen anderen Ausgangswert erzeugt, schlägt der Build wegen eines veralteten Overrides fehl. Der aktuelle Launch-Snapshot benötigt keine Overrides (`[]`).
