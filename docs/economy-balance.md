# Economy and balance

Stand: Launch-Katalog vom 14. Juli 2026. Die Zahlen sind Gameplay-Tuning, keine Aussage über reale Spielerstärke oder Marktwerte.

## Progressionskurve

- Starterteam: sechs nicht marktgängige Karten, 68–76 OVR, Teamdurchschnitt 72.
- Base Market: 68–86 OVR, dauerhaft verfügbar, 300–8.000 Credits; Median 1.500.
- früher Event Shop: sechs deterministisch rotierende Angebote, 84–90 OVR, 6.500–15.500 Credits; Median 12.500. Ein Event ist bei jedem vergleichbaren 84–86-OVR teurer als Base.
- Reward: kostenlos, `reward-only`, höchstens 90 OVR.

Spieler starten mit 1.000 Credits. Dadurch ist mindestens eine günstige Base-Verbesserung sofort erreichbar, während gute Base- und Eventkarten mehrere Matches und Objectives verlangen.

## Credits

Serverautoritativ abgerechnete Match-Rewards:

| Schwierigkeit | Sieg | Unentschieden | Niederlage |
| --- | ---: | ---: | ---: |
| Rookie | 120 | 90 | 60 |
| Pro | 180 | 120 | 80 |
| Elite | 260 | 160 | 100 |

Wiederkehrende Objectives liefern maximal 275 Credits pro Tag und 350 pro Woche. Die zwei Rivalry-Road-Credit-Schritte mit je 150 Credits sind einmalig und werden nicht als nachhaltiges Einkommen gerechnet.

Alle Auszahlungen benötigen Server-Receipts beziehungsweise idempotente Settlement-/Claim-Grenzen. Ein Retry darf weder Credits, Karten, Startergrant noch Match-Tickets doppelt erzeugen.

## Simulationsszenarien

`pnpm balance` arbeitet deterministisch mit Seeds und spiegelt die fünf festen serverautoritativen Matchsituationen, Karten-Eignung, Nichtwiederverwendung und Score-Varianz. Die Liga-Paritätsprobe bevorzugt Primärpositions-Pools und verwendet breite `F`/`D`- oder belegte Secondary-Eligibility nur als Fallback, damit mehrfache Eligibility keine Liga im Sampler übergewichtet. Der Bericht bildet 36 Kombinationen aus drei Modi, vier Kaderstufen und drei AI-Tiers getrennt ab:

- durchschnittliches Starterteam,
- schwaches Base-Lineup,
- gutes Base-Lineup,
- starkes Base/Event-Lineup,
- Rookie-, Pro- und Elite-AI.

Zielkorridore:

- Starter gegen Rookie: ungefähr 45–60 % Siegchance,
- Starter gegen Pro: klar niedriger,
- gutes Base-Lineup gegen Pro: ungefähr ausgeglichen,
- starkes Base/Event-Lineup gegen Elite: konkurrenzfähig,
- AI-Stärke muss in jedem Modus strikt Rookie < Pro < Elite steigen.

Der reproduzierbare Kalibrierungslauf

```sh
pnpm balance -- --paired-seeds 1000 --seed calibration
```

simuliert 36.000 AI-Matches und 2.000 direkte Liga-Matches. Die gezielten Progressionsszenarien ergaben:

| Spieler-Lineup gegen AI | NHL Circuit | PWHL Circuit | Open Ice |
| --- | ---: | ---: | ---: |
| durchschnittlicher Starter gegen Rookie | 59,9 % | 46,2 % | 52,8 % |
| durchschnittlicher Starter gegen Pro | 0,0 % | 0,0 % | 0,0 % |
| gutes Base-Lineup gegen Pro | 51,9 % | 43,1 % | 54,3 % |
| starkes Base/Event-Lineup gegen Elite | 58,5 % | 61,9 % | 61,5 % |

Die AI-Lineup-Durchschnitte steigen in allen drei Modi:

| Modus | Rookie | Pro | Elite |
| --- | ---: | ---: | ---: |
| NHL Circuit | 72,83 | 79,50 | 88,00 |
| PWHL Circuit | 72,83 | 80,00 | 88,00 |
| Open Ice | 72,50 | 79,67 | 88,17 |

Die 1.000-Seed-Kalibrierung lag bei 48,90 % NHL- und 51,10 % PWHL-Siegen ohne Unentschieden; die Lücke betrug 2,20 Prozentpunkte. Der normale `pnpm balance`-Lauf mit 2.000 Seed-Paaren war ebenfalls grün: 72.000 AI-Matches, 4.000 Liga-Matches und 4,10 Prozentpunkte Liga-Lücke. Ein zusätzlicher 10.000-Paar-Stabilitätslauf lag bei 49,36 % zu 50,64 % und 1,28 Prozentpunkten Lücke.

## Economy-Ergebnisse

Der 1.000-Seed-Kalibrierungslauf berechnet folgende nachhaltige Durchschnittserträge. „Mit Objectives“ verteilt die wiederkehrenden Tages- und Wochenziele auf fünf Matches pro Tag.

| Schwierigkeit | nur Match | mit wiederkehrenden Objectives |
| --- | ---: | ---: |
| Rookie | 91,78 | 156,78 |
| Pro | 129,77 | 194,77 |
| Elite | 197,01 | 262,01 |

Ausgehend von 1.000 Starter-Credits ergeben sich bei diesen nachhaltigen Raten:

| Zielpreis | Rookie | Pro | Elite |
| --- | ---: | ---: | ---: |
| typische Base, 1.500 | 4 Matches | 3 Matches | 2 Matches |
| starke Base, 6.750 | 37 | 30 | 22 |
| Event, 12.500 | 74 | 60 | 44 |
| Spotlight, 10.625 | 62 | 50 | 37 |

Zusätzlich prüft der Report Preisverteilungen, Team-/Positionsabdeckung, Eventabdeckung und Reward-Loop-Sicherheit. Alle 44 Teams besitzen Starter-, Base- und Eventkarten; jedes Starterteam liegt bei 72 OVR. Die primäre Positionsabdeckung beträgt LW 184, C 277, RW 193, LD 180, RD 191 und G 153 Karten. 1.000 simulierte Settlement-Replays erzeugten genau eine Matchauszahlung und die drei erwarteten Objective-Grants, also keine doppelten Rewards.

Lineups dürfen eine Karte oder Player Identity nie doppelt verwenden, auch wenn eine generische PWHL-Position mehrere Slots abdeckt.

## Tuning-Regeln

- Ratings werden nicht heimlich verändert, um Starterregeln oder Tests zu bestehen. Fehlende Depth braucht eine belegte, markierte Quelle.
- Starterkarten erscheinen nie im Base Market; `isPermanent` allein ist keine Marktberechtigung.
- Eventkarten brauchen `marketAvailability=event-shop`, ein gültiges Fenster und ein echtes Attribut-Tradeoff.
- Legacy-retained Karten bleiben renderbar und referenzierbar, sind aber `reward-only` und nicht kaufbar.
- Balance-Korridore sind Regression Guards, keine Garantie für perfekte Einzelmatch-Ergebnisse. Änderungen werden mit mehreren Seeds und ausreichend vielen Paarungen bewertet.
