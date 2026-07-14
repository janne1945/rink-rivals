# Rink Rivals — Content Foundation, Rating Rebalance und vollständige Teamabdeckung

Arbeite autonom im bestehenden Repository `janne1945/rink-rivals`.

Arbeite direkt auf `main`.

Erstelle keinen zusätzlichen Branch.

Vor jeder Änderung:

1. prüfe, dass `main` aktuell ist,
2. erstelle einen lokalen Sicherungs-Tag oder Backup-Commit,
3. ändere Production nicht automatisch,
4. wende keine produktive Supabase-Migration ohne erfolgreichen Dry Run an,
5. prüfe vor jedem Vercel-Deployment:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
6. deploye zuerst als Preview oder lokal,
7. aktualisiere Production erst nach erfolgreicher Verifikation.

Erstelle kleine, logisch getrennte Commits auf `main`.

Wenn ein kritischer Test fehlschlägt, stoppe vor dem Push oder Deployment und dokumentiere den Blocker.

Dies ist ein umfangreicher End-to-End-Auftrag. Untersuche zunächst vollständig den aktuellen Stand des Repositories, der Supabase-Datenbank, der Migrationen, des Kartenkatalogs, des Onboardings, der Economy, der KI-Gegner, der Eventrotation und sämtlicher Tests.

Beginne danach direkt mit der Umsetzung. Warte nicht auf eine separate Planfreigabe und stelle keine Rückfragen zu kleineren Produktentscheidungen. Triff nachvollziehbare Entscheidungen anhand der bestehenden Architektur und der Anforderungen dieses Auftrags.

Frage nur dann nach, wenn:

- eine externe Berechtigung fehlt,
- eine aktuelle offizielle Datenquelle nicht zugänglich ist,
- eine Änderung bestehenden Nutzerdatenbestand irreversibel beschädigen würde,
- oder eine konkrete rechtliche beziehungsweise lizenzrechtliche Freigabe erforderlich wäre.

Fabriziere niemals aktuelle Spieler, Teams, Positionen, Kader oder statistische Daten.

---

## Verbindliche Agent-Datei

Lies vor Beginn vollständig die Datei `AGENTS_RINK_RIVALS(1).md`.

Behandle die dort definierte **Autonomous Quality Loop**, die UI-Verifikation,
die Sicherheitsregeln sowie die Teststandards als verbindlich.

Die dort beschriebene Review-Schleife ist verpflichtend und muss für den
gesamten Auftrag angewendet werden.

Bei Widersprüchen zwischen `AGENTS_RINK_RIVALS(1).md` und diesem Dokument gilt
dieser Auftrag als aktueller und hat Vorrang.

Insbesondere gelten folgende Punkte aus der Agent-Datei als durch den aktuellen
Projektstand ersetzt:

- Supabase Auth ist Bestandteil des MVP.
- Supabase ist die serverautoritative Quelle für Accounts, Economy,
  Kartenbesitz, Lineups, Matches und Progression.
- Backend- und Datenbanklogik existieren bereits und sollen erweitert, nicht
  entfernt werden.

---

## 1. Hauptziel

Rink Rivals besitzt derzeit einen funktionierenden technischen MVP, aber noch keinen ausreichend großen und sinnvoll balancierten Content-Unterbau.

Das Spiel muss nach diesem Durchlauf folgende Content-Struktur besitzen:

1. alle aktuell aktiven NHL-Teams,
2. alle aktuell aktiven PWHL-Teams,
3. ein eigenes Starterteam für jedes Team,
4. separate Starterkarten,
5. dauerhaft erhältliche normale Base Cards,
6. Eventkarten als zusätzliche Versionen vorhandener Spieler,
7. eine langfristig sinnvolle Ratingkurve,
8. eine Economy, die tatsächliche Progression ermöglicht,
9. eine Datenpipeline, mit der zukünftige Spieler-, Team- und Eventkarten systematisch ergänzt werden können,
10. vollständige Datenbank-, UI-, Balance- und Testintegration.

Der zentrale Progressionsweg soll sein:

```text
Starterteam auswählen
→ mit schwachen Starterkarten beginnen
→ Credits verdienen
→ normale Base Cards kaufen
→ bessere Lineups aufbauen
→ Eventkarten freischalten oder kaufen
→ stärkere Gegner bewältigen
→ langfristig seltene Elitekarten sammeln
```

Ein Nutzer darf nicht bereits nach dem Onboarding ein beinahe fertiges Endgame-Lineup besitzen.

---

## 2. Kritisches aktuelles Balanceproblem

Das aktuelle Starterteam ist zu stark.

Insbesondere darf ein Nutzer nicht direkt eine vollwertige 90+- oder 96-OVR-Version eines Superstars wie Connor McDavid erhalten.

Das zerstört:

- den Nutzen normaler Base Cards,
- den Wert früher Eventkarten,
- die Motivation für den Markt,
- die Economy,
- die langfristige Progression,
- und die mögliche Ratingentwicklung zukünftiger Events.

Entferne daher die bisherige Logik, bei der das Onboarding fest ein starkes Edmonton-Oilers-Lineup oder vollwertige hoch bewertete Base Cards vergibt.

Das Onboarding darf nicht mehr fest auf `edmonton-oilers` verdrahtet sein.

---

## 3. Verbindliche Kartenhierarchie

Implementiere klar getrennte Kartentypen.

### 3.1 Starter Cards

Starterkarten sind spezielle schwache Versionen von Spielern.

Ratingbereich:

```text
68–76 OVR
```

Regeln:

- keine Starterkarte darf über 76 OVR liegen,
- der Durchschnitt eines Starterteams soll ungefähr 71–73 OVR betragen,
- Starterteams sollen spielbar, aber klar verbesserungswürdig sein,
- die besten zwei bis drei Base-Spieler eines Teams sollen grundsätzlich nicht Teil des Starterteams sein,
- Franchise-Superstars sollen nicht direkt im Starterteam vergeben werden,
- Connor McDavid darf ausdrücklich nicht Teil des Edmonton-Starterteams sein,
- Starterkarten sind von Base Cards getrennte `CardVersion`-Einträge,
- Starterkarten sind nicht regulär im Base Market erhältlich,
- Starterkarten dürfen nicht als Eventkarten behandelt werden,
- Starterkarten müssen eindeutig als `starter` markiert sein,
- Starterkarten sollen keinen oder nur einen sehr geringen Economy-Wert haben,
- Starterkarten sollen für Lineups und geeignete Objectives verwendbar sein,
- sie dürfen später durch Base- und Eventkarten derselben oder anderer Spieler ersetzt werden.

Jedes Starterteam besitzt genau:

```text
LW
C
RW
LD
RD
G
```

Alle sechs Karten müssen dem ausgewählten Team zugeordnet sein.

Wähle für Starterteams bevorzugt:

- Depth-Spieler,
- jüngere Spieler,
- solide Rollenspieler,
- Spieler aus der zweiten oder dritten Reihe,
- Backup-Goalies oder schwächer bewertete Starter,
- keine absoluten Team-Superstars.

Falls ein Spieler als Starterversion und als Base-Version existiert, müssen dies zwei unterschiedliche `CardVersion`-Einträge derselben `Player Identity` sein.

### 3.2 Base Cards

Base Cards sind die normalen dauerhaft erhältlichen Karten.

Ratingbereich:

```text
68–86 OVR
```

Orientierung:

```text
68–71: Tiefe Kaderspieler, junge Ergänzungsspieler, schwächere Backups
72–75: reguläre Depth-Spieler
76–79: solide Stammspieler
80–82: gute Spieler
83–84: Stars
85–86: absolute Topstars
```

Kein normales Base Card Overall darf über 86 liegen.

Connor McDavid und vergleichbare absolute Topspieler dürfen als Base Card maximal 86 OVR besitzen.

Base Cards müssen:

- dauerhaft erhältlich sein,
- über den Base Market direkt kaufbar sein,
- für jede Position ausreichend Auswahl bieten,
- unterschiedliche Preise besitzen,
- konsistente Attribute passend zu Position, Rolle und Overall haben,
- als Fundament der Sammlung dienen,
- langfristig noch durch Eventkarten verbessert werden können.

### 3.3 Event Cards

Eventkarten sind besondere zusätzliche Versionen bestehender Spieleridentitäten.

Sie dürfen nicht lediglich fehlende Base Cards ersetzen.

Initiale Ratingbereiche:

```text
frühe Events: 82–90
mittlere Events: 86–93
späte Events: 90–96
Endgame-Events: 95–99
```

Der aktuelle Projektzeitpunkt soll als früher Content-Zyklus behandelt werden.

Daher dürfen die aktuell verfügbaren Signature-Series- und vergleichbaren ersten Eventkarten grundsätzlich nicht bereits flächendeckend 95–99 OVR besitzen.

Für die initiale Version:

```text
normale Eventkarten: etwa 84–87
Event-Stars: etwa 87–89
Event-Headliner: maximal 90
```

Ein 96er McDavid gehört erst in ein deutlich späteres Endgame-Event und nicht in den aktuellen Startkatalog.

Eventkarten sollen sich nicht nur durch höheren Overall unterscheiden, sondern auch durch:

- andere Attributverteilung,
- Rollen,
- Archetypen,
- Clutch,
- Defensive,
- Physicality,
- Speed,
- Shooting,
- Passing,
- Eventidentität,
- spätere Chemistry-Anknüpfungspunkte.

Verhindere unkontrollierten Power Creep.

---

## 4. Player Identity und CardVersion sauber trennen

Prüfe das vorhandene Datenmodell.

Jede reale Spielerperson soll genau eine `Player Identity` besitzen.

Beispiel:

```text
Connor McDavid
├── Base Card
├── Signature Series
├── Halloween
├── Winter Event
├── Playoff Event
└── Record Breakers
```

Diese Karten dürfen nicht als voneinander unabhängige Spieleridentitäten geführt werden.

Das Zielmodell soll konzeptionell mindestens unterstützen:

```ts
Player {
  id
  name
  league
  currentTeamId
  nationality
  primaryPosition
  secondaryPositions
  handedness
  archetype
  active
  sourceMetadata
}
```

```ts
CardVersion {
  id
  playerId
  teamId
  cardTier
  setId
  overall
  attributes
  abilities
  price
  marketAvailability
  availableFrom
  availableTo
  isPermanent
  imageReference
  visualMetadata
}
```

Kartentypen mindestens:

```text
starter
base
event
reward
```

Falls das bestehende Modell diese Trennung bereits besitzt, erweitere es konsistent, statt unnötig alles neu zu schreiben.

Vermeide doppelte Spieleridentitäten aufgrund unterschiedlicher Kartenversionen.

---

## 5. Aktuelle Team- und Kaderdaten

Ermittle alle aktuell aktiven NHL- und PWHL-Teams zum Zeitpunkt der Umsetzung.

Verwende ausschließlich belastbare primäre Quellen:

- offizielle NHL-Quellen,
- offizielle PWHL-Quellen,
- offizielle Teamseiten,
- offiziell veröffentlichte Rosterdaten,
- offizielle Liga-APIs, sofern stabil und zulässig.

Nutze Drittquellen nur ergänzend, nicht als alleinige Wahrheit.

Dokumentiere:

- Datenquelle,
- Abrufdatum,
- Liga,
- Team,
- Kader-Snapshot,
- mögliche Unsicherheiten.

Erstelle eine Datei:

```text
docs/content-data-sources.md
```

Darin müssen alle verwendeten Quellen und der Stichtag der Kaderdaten beschrieben sein.

Keine Spieler, Teams, Positionen oder Kaderzugehörigkeiten dürfen erfunden werden.

Kann ein aktueller Status nicht sicher bestimmt werden, markiere ihn ausdrücklich zur manuellen Prüfung.

---

## 6. Vollständige Teamabdeckung

Jedes aktuell aktive NHL- und PWHL-Team muss mindestens besitzen:

1. Team Identity
2. Teamname
3. Liga
4. Teamfarben beziehungsweise neutrale visuelle Metadaten
5. ein vollständiges Starterteam
6. ausreichende Base Cards
7. Marktfilter-Unterstützung
8. Sammlungsfilter-Unterstützung
9. Lineup-Unterstützung
10. mindestens initiale Eventrepräsentation über den Launch-Content hinweg

Verwende keine fest verdrahtete Annahme über die Anzahl der Teams.

Ermittle die tatsächlich aktuell aktiven Teams aus den offiziellen Datenquellen.

---

## 7. Starterteam für jedes Team

Erstelle für jedes aktive NHL- und PWHL-Team ein kuratiertes Starter-Lineup.

Jedes Lineup:

- genau sechs Karten,
- gültige Positionen,
- nur Karten dieses Teams,
- alle Karten zwischen 68 und 76,
- Teamdurchschnitt ungefähr 71–73,
- keine absolute Superstar-Base-Version,
- keine Eventkarte,
- keine Rewardkarte,
- keine unzulässigen Positionswechsel.

Erstelle eine eigene strukturierte `StarterSquad`-Definition:

```ts
StarterSquad {
  teamId
  cards
  lineup
  averageOverall
  validationMetadata
}
```

Das Onboarding muss anschließend ermöglichen:

1. Auswahl der Liga
2. Auswahl eines Teams
3. Vorschau des Starterteams
4. Bestätigung
5. einmalige atomare Vergabe
6. Erstellung und Aktivierung des passenden Lineups

Der Nutzer darf das Onboarding nur einmal abschließen.

Wiederholte Requests dürfen keine weiteren Starterkarten oder Credits vergeben.

Das Team muss frei aus allen verfügbaren NHL- und PWHL-Teams gewählt werden können.

---

## 8. Umfang des Base Sets

Erstelle für jedes Team einen ausreichend großen initialen Base-Katalog.

Ziel:

```text
ungefähr 16–20 Base Cards pro Team
```

Bevorzugte Struktur pro Team:

```text
mindestens 8–10 Angreifer
mindestens 5 Verteidiger
mindestens 2 Goalies
```

Wichtig:

- Für `LW`, `C`, `RW`, `LD`, `RD` und `G` muss ausreichend Auswahl bestehen.
- Sekundärpositionen dürfen verwendet werden, wenn sie fachlich plausibel sind.
- Ein Spieler darf nicht willkürlich auf einer unpassenden Position geführt werden.
- Goalies müssen strikt getrennt bleiben.
- Der Katalog soll abwechslungsreiche Lineups ermöglichen.
- Nicht jedes Team muss exakt gleich viele Karten besitzen, aber kein Team darf faktisch unspielbar sein.

Erstelle nicht hunderte Karten als unstrukturierte Objekte direkt in React- oder App-Dateien.

Nutze eine skalierbare Datenpipeline:

```text
strukturierte JSON-, CSV- oder TypeScript-Quelldaten
→ Schema-Validierung
→ Generatoren
→ SQL-Projektion
→ Katalogvalidierung
→ Duplikatprüfung
→ Teamabdeckungsprüfung
→ Positionsprüfung
→ Ratingprüfung
→ Preisprüfung
```

---

## 9. Ratingberechnung

Entwickle ein nachvollziehbares und reproduzierbares Ratingmodell.

Das Ratingmodell soll berücksichtigen:

- Rolle im Team,
- Position,
- Eiszeit beziehungsweise Rolle,
- aktuelle oder jüngste offiziell verfügbare Leistung,
- Spielstärke relativ zur eigenen Liga,
- Spielerprofil,
- offensive und defensive Bedeutung,
- Goalie-Rolle,
- manuelle Overrides für besondere Fälle.

NHL und PWHL sollen gleichwertige Contentbereiche sein.

Ratings sollen die Stärke und Bedeutung eines Spielers innerhalb seiner Liga und Rolle darstellen.

Es geht nicht um eine naturwissenschaftlich exakte direkte NHL-vs.-PWHL-Vergleichbarkeit.

Erstelle:

- dokumentierte Ratingformeln,
- positionsabhängige Gewichtungen,
- Normalisierung,
- Caps und Floors,
- manuelle Override-Datei,
- Diagnoseberichte,
- Ausreißererkennung.

Beispielhafte Dateien:

```text
scripts/lib/ratingModel.ts
data/rating-overrides.json
docs/card-rating-system.md
```

Alle Ratings müssen deterministisch reproduzierbar sein.

Keine zufälligen Ratings.

---

## 10. Attribute

Skaterattribute:

```text
Speed
Shooting
Passing
Puck Control
Defense
Physicality
Hockey IQ
Clutch
```

Goalieattribute:

```text
Reflexes
Positioning
Glove
Blocker
Rebound Control
Puck Handling
Consistency
Clutch
```

Attribute müssen:

- mit dem Overall konsistent sein,
- zur Position passen,
- zum Archetyp passen,
- unterschiedliche Spielertypen erzeugen,
- nicht einfach alle identisch dem Overall entsprechen.

Ein defensiver Verteidiger und ein offensiver Verteidiger mit demselben Overall sollen unterschiedliche Profile besitzen.

Ein Sniper, Playmaker, Power Forward und Two-Way Forward sollen klar unterscheidbar sein.

---

## 11. Preise und Economy

Rebalance die Economy anhand der neuen Ratingkurve.

Starterkarten:

- nicht im normalen Markt,
- kein oder nur minimaler Marktwert,
- nicht als einfache Creditquelle missbrauchbar.

Base Cards:

```text
68–72: schnell erreichbar
73–76: günstig
77–80: mittlere Investition
81–83: starkes Sparziel
84–86: langfristiges Superstar-Ziel
```

Frühe Eventkarten:

- teurer als vergleichbare Base Cards,
- erreichbar, aber nicht sofort,
- Spotlight-Angebot mit echtem Vorteil,
- keine kostenlosen Endgame-Karten direkt nach Onboarding.

Prüfe:

- Starter-Credits,
- durchschnittliche Matchbelohnungen,
- Objective-Rewards,
- Matches bis zu einer günstigen Base Card,
- Matches bis zu einer guten Base Card,
- Matches bis zu einem Superstar,
- Matches bis zu einer Eventkarte,
- Duplikatwirkung,
- mögliche Farming-Loops.

Erweitere die Balance-Diagnostik.

Sie muss mindestens ausgeben:

- Starterteam-Durchschnitt je Team,
- niedrigster und höchster Starter-OVR,
- Base-Ratingverteilung,
- Event-Ratingverteilung,
- Kartenanzahl je Team,
- Kartenanzahl je Position,
- Preise je Ratingband,
- erwartete Matches pro Kauf,
- Teamabdeckung,
- Ligaabdeckung,
- Eventabdeckung,
- Progressionsgeschwindigkeit,
- Warnungen bei Power Creep.

---

## 12. Event-Content

Behalte das bestehende Eventkalendersystem, aber rebalance alle vorhandenen Eventkarten.

Prüfe insbesondere die bereits vorhandenen Signature-Series-Karten.

Kein frühes Event soll flächendeckend 95–99 OVR besitzen.

Erstelle für den initialen Content-Zyklus ausreichend Eventkarten, sodass jedes Team vertreten ist.

Mindestanforderung:

- über den gesamten initialen Eventbestand mindestens zwei Eventkarten pro Team,
- möglichst über unterschiedliche Events verteilt,
- NHL und PWHL angemessen vertreten,
- keine dauerhafte Konzentration nur auf wenige populäre Teams,
- Team-Abdeckungsdiagnostik.

Nicht jedes einzelne Event muss zwingend jedes Team enthalten.

Große Events sollen breite Abdeckung besitzen.

Kleinere Events dürfen thematisch kuratiert sein.

Bestehende Bildassets dürfen weiterverwendet werden, sofern sie korrekt zugeordnet sind.

Lade nicht automatisiert urheberrechtlich geschützte Spielerbilder aus dem Internet herunter.

Für fehlende Bilder muss ein hochwertiger neutraler Fallback bestehen.

---

## 13. Bestehende Nutzerdaten sicher migrieren

Untersuche genau, welche Nutzer bereits das alte starke Edmonton-Starterteam erhalten haben.

Lösche niemals pauschal Besitzdaten.

Entwickle eine sichere Migration.

Bevorzugte Strategie:

1. Prüfe Starter-Receipts und Herkunft vorhandener Karten.
2. Identifiziere Karten, die nachweisbar ausschließlich durch das alte Onboarding vergeben wurden.
3. Ersetze nur nachweisbare alte Starter-Grants durch das neue Starterteam.
4. Legitiment gekaufte, erspielte oder separat erhaltene Karten dürfen nicht entfernt werden.
5. Sind Herkunftsdaten nicht eindeutig, lösche nichts automatisch.
6. Erstelle einen Migrationsreport für unklare Accounts.
7. Die Migration muss idempotent sein.
8. Kein Nutzer darf doppelte Starterbelohnungen erhalten.
9. Credits und Lineups müssen konsistent bleiben.

Wenn ein automatischer sicherer Austausch nicht möglich ist, implementiere eine kontrollierte Re-Onboarding- oder Admin-Migrationsstrategie, ohne legitimen Besitz zu zerstören.

Dokumentiere die Entscheidung.

---

## 14. Supabase und Datenbank

Erweitere das bestehende serverautoritative Modell.

Supabase bleibt alleinige Quelle für:

- Teamwahl,
- Startergrant,
- Kartenbesitz,
- Credits,
- Lineups,
- Käufe,
- Rewards,
- Progression.

Erstelle additive Migrationen.

Keine destruktive Neuinitialisierung des Produktionsprojekts.

Migrationen müssen:

- alle neuen Teams und Karten abbilden,
- eindeutige IDs verwenden,
- Foreign Keys besitzen,
- geeignete Indizes enthalten,
- bestehende Nutzerdaten erhalten,
- idempotente Onboarding- und Starterlogik besitzen,
- Marktpreise serverseitig bestimmen,
- Kartentypen serverseitig validieren,
- Starterkarten aus dem Base Market ausschließen,
- Eventverfügbarkeit serverseitig kontrollieren.

Alle `SECURITY DEFINER`-Funktionen müssen:

- einen sicheren `search_path` besitzen,
- `auth.uid()` korrekt prüfen,
- keine fremden Accounts verändern können,
- keine Clientpreise oder Clientratings vertrauen,
- mit Transaktionen und Constraints arbeiten.

---

## 15. Onboarding-UI

Ersetze die feste Oilers-Vergabe durch einen vollständigen Team-Auswahlflow.

Ablauf:

1. Begrüßung
2. Liga wählen: NHL oder PWHL
3. Team wählen
4. Starterkarten-Vorschau
5. Teamdurchschnitt anzeigen
6. Auswahl bestätigen
7. atomare serverseitige Vergabe
8. Sammlung und Lineup laden

Die Auswahl soll:

- mobil gut funktionieren,
- Teamfilter und Suche unterstützen,
- verständlich erklären, dass Starterkarten schwächere Einstiegsversionen sind,
- keine falsche Erwartung erzeugen, dass dies die normalen Base Cards seien.

Nach Abschluss darf der Flow nicht erneut erscheinen.

---

## 16. Collection und Market UI

Passe Sammlung und Markt an die neuen Kartentypen an.

Filter mindestens:

- Liga
- Team
- Position
- Starter
- Base
- Event
- Reward
- Set
- Overall
- Preis
- besessen
- nicht besessen

Karten müssen klar anzeigen:

- Kartentyp
- Set
- Team
- Position
- Overall
- Besitzmenge
- Marktstatus

Starterkarten dürfen nicht versehentlich im Base Market erscheinen.

Eventkarten dürfen nur bei aktivem Event beziehungsweise gültigem Angebot kaufbar sein.

---

## 17. KI-Gegner neu balancieren

Die vorhandenen neun KI-Gegner wurden auf Basis des alten Ratingniveaus erstellt.

Rebalance alle Gegner nach der neuen Skala.

Rookie:

- passend für ein frisches Starterteam,
- Spieler soll realistische Siegchancen haben.

Pro:

- passend für verbesserte Base-Lineups.

Elite:

- benötigt starke Base- und frühe Eventkarten,
- darf nicht unfair oder praktisch unschlagbar sein.

Simuliere viele Matches mit:

- durchschnittlichen Starterteams,
- schwachen Base-Lineups,
- guten Base-Lineups,
- frühen Event-Lineups.

Dokumentiere erwartete Siegquoten.

Zielorientierung:

```text
Starterteam gegen Rookie: ungefähr 45–60 % Siegchance
Starterteam gegen Pro: deutlich niedriger
gutes Base-Lineup gegen Pro: ungefähr ausgeglichen
starkes Base-/Event-Lineup gegen Elite: konkurrenzfähig
```

Verwende keine exakten Ziele, wenn Simulationen eine bessere nachvollziehbare Balance nahelegen, dokumentiere dann aber die Entscheidung.

---

## 18. Tests

Erweitere alle Testebenen.

### 18.1 Katalogtests

Prüfe:

- jedes aktive Team vorhanden,
- jedes Team besitzt ein Starterteam,
- jedes Starterteam besitzt sechs gültige Slots,
- Starterkarten liegen zwischen 68 und 76,
- kein Starterteam enthält einen der zwei bestbewerteten Base-Spieler des Teams,
- Edmonton-Starterteam enthält keine Connor-McDavid-Karte,
- jede Base Card liegt zwischen 68 und 86,
- frühe Events überschreiten nicht die festgelegten Grenzen,
- jede `CardVersion` referenziert eine `Player Identity`,
- keine doppelten IDs,
- gültige Positionen,
- ausreichende Team- und Positionsabdeckung,
- keine Starterkarte im Base Market,
- gültige Preise,
- Eventabdeckung.

### 18.2 Datenbanktests

Prüfe:

- jedes Team kann gewählt werden,
- Startergrant genau einmal,
- wiederholter Request ist idempotent,
- fremder Nutzer kann Starterwahl nicht manipulieren,
- ungültige Team-ID wird abgelehnt,
- Starterkarten gelangen nicht in reguläre Marktangebote,
- Preise werden serverseitig bestimmt,
- bestehende legitime Karten bleiben bei Migration erhalten,
- alte Startergrants werden nur bei eindeutiger Provenienz ersetzt,
- RLS schützt alle Nutzerdaten.

### 18.3 E2E

Mindestens:

1. neuer Nutzer registriert sich,
2. NHL auswählen,
3. Team auswählen,
4. Starterteam prüfen,
5. Onboarding abschließen,
6. Sammlung enthält genau die erwarteten Starterkarten,
7. Lineup ist aktiv,
8. Base Market enthält bessere erreichbare Karten,
9. Match gegen Rookie,
10. Credits erhalten,
11. Base Card kaufen,
12. Starterkarte im Lineup ersetzen,
13. Logout und erneuter Login,
14. Daten bleiben bestehen.

Zusätzlicher Flow für ein PWHL-Team.

Teste:

- Smartphone Hochformat,
- Smartphone Querformat,
- Tablet,
- Desktop.

---

## 19. Frischer Datenbankaufbau

Der vorherige MVP-Lauf konnte keinen vollständigen lokalen Supabase-Reset durchführen.

Dieser Punkt darf nicht erneut ungeprüft bleiben.

Führe mit einer Docker-kompatiblen lokalen Supabase-Umgebung aus:

```sh
pnpm supabase:start
pnpm exec supabase db reset
pnpm supabase:test
```

Beweise, dass ein vollständig frisches Projekt allein aus den eingecheckten Migrationen aufgebaut werden kann.

Falls Docker in der Umgebung nicht verfügbar ist:

- dokumentiere den Blocker klar,
- behaupte nicht, der Check sei durchgeführt worden,
- führe keinen Ersatztest als identisch auf,
- trenne Hosted-Schema-Tests und Fresh-Reset-Test im Bericht eindeutig.

---

## 20. Deployment- und Environment-Sicherheit

Der vorherige Merge verursachte vorübergehend eine leere Produktionsseite, weil Vercel die benötigten Environment Variables nicht enthielt.

Verhindere eine Wiederholung.

Vor jedem Deployment prüfen:

- `VITE_SUPABASE_URL` vorhanden,
- `VITE_SUPABASE_PUBLISHABLE_KEY` vorhanden,
- Variablen für Preview verfügbar,
- Production-Variablen nicht überschrieben,
- keine Secret- oder Service-Role-Keys im Client,
- `.env` bleibt aus Git ausgeschlossen,
- `.env.example` enthält nur Platzhalter.

Füge einen klaren Build- oder Startup-Check hinzu.

Eine fehlende Environment Variable soll nicht nur einen leeren Hintergrund erzeugen.

Stattdessen muss eine sichtbare, verständliche Konfigurationsfehlermeldung erscheinen.

Beispiel:

```text
Rink Rivals konnte nicht gestartet werden, weil die Serverkonfiguration fehlt.
```

Der Fehler darf weiterhin in der Konsole stehen, aber die UI muss eine sichtbare Fallback-Seite anzeigen.

---

## 21. Qualität und Architektur

Erhalte die bestehende Struktur:

```text
src/domain
src/data
src/features
src/infrastructure
scripts
supabase
docs
tests
```

Vermeide:

- riesige manuelle Katalogdateien,
- unstrukturierte Duplikate,
- Kartendaten direkt in React-Komponenten,
- Monsterdateien,
- Clientautorität über Preise, Ratings oder Rewards,
- zufällige Ratings,
- unprüfbare automatisch erfundene Daten.

Extrahiere große Contentdaten in strukturierte, validierte Quelldateien.

Generatoren sollen reproduzierbare Ergebnisse erzeugen.

---

## 22. Verifikation

Führe am Ende mindestens aus:

```sh
pnpm typecheck
pnpm test
pnpm catalog:validate
pnpm catalog:sql:check
pnpm balance
pnpm build
pnpm test:e2e
pnpm test:e2e:production
pnpm exec supabase db reset
pnpm supabase:test
```

Ergänze bei Bedarf weitere Befehle.

Alle durch die Änderungen verursachten Fehler müssen behoben werden.

Keine Tests entfernen oder abschwächen, um ein fehlerhaftes Ergebnis grün erscheinen zu lassen.

---

## 23. Dokumentation

Erstelle oder aktualisiere:

```text
README.md
MVP_STATUS.md
docs/card-rating-system.md
docs/content-data-sources.md
docs/content-pipeline.md
docs/supabase-migration.md
docs/economy-balance.md
```

Dokumentiere:

- Ratingbereiche,
- Starterregeln,
- Base-Ratingmodell,
- Event-Power-Curve,
- Datenquellen,
- Kader-Stichtag,
- Teamabdeckung,
- Kartenanzahl,
- Economy,
- Migrationsstrategie,
- Tests,
- bekannte Unsicherheiten,
- Bild- und Rechtehinweise.

---

## 24. Deployment-Regeln

Arbeite direkt auf `main`.

Erstelle keinen zusätzlichen Branch und keinen Pull Request nur für diesen Auftrag.

Prüfe vor Beginn:

- dass der lokale Stand mit dem aktuellen Remote-`main` übereinstimmt,
- dass keine unbeabsichtigten lokalen Änderungen offen sind,
- dass ein Sicherungs-Tag oder Backup-Commit für den bisherigen stabilen Stand existiert.

Erstelle verständliche, kleine und logisch getrennte Commits auf `main`.

Pushe nicht automatisch, solange nicht alle Kernprüfungen erfolgreich sind.

Merge-Schritte entfallen, da direkt auf `main` gearbeitet wird.

Ändere die Production-Domain nicht automatisch.

Ein lokaler Test oder ein separates Preview-Deployment ist vor jedem Production-Deployment verpflichtend.

Vor jedem Vercel-Deployment muss geprüft werden:

- `VITE_SUPABASE_URL` ist für die Zielumgebung vorhanden,
- `VITE_SUPABASE_PUBLISHABLE_KEY` ist für die Zielumgebung vorhanden,
- Preview- und Production-Variablen sind korrekt gesetzt,
- keine Secret- oder `service_role`-Keys werden an den Browser ausgeliefert.

Produktionsmigrationen dürfen nur angewendet werden, wenn:

- sie additiv sind,
- die Migration geprüft wurde,
- ein erfolgreicher Dry Run durchgeführt wurde,
- Datenverlust ausgeschlossen ist,
- Backups beziehungsweise Wiederherstellbarkeit berücksichtigt wurden,
- alle relevanten Tests bestanden haben.

Wenn ein kritischer Test, der Datenbank-Dry-Run oder die Environment-Prüfung fehlschlägt, stoppe vor Push, Migration oder Production-Deployment und dokumentiere den exakten Blocker.

---

## 25. Definition of Done

Der Auftrag ist erst abgeschlossen, wenn:

- alle aktiven NHL-Teams vorhanden sind,
- alle aktiven PWHL-Teams vorhanden sind,
- jedes Team ein vollständiges Starterteam besitzt,
- das Onboarding freie Teamwahl erlaubt,
- kein Nutzer automatisch ein starkes 90+-Starterteam erhält,
- Connor McDavid nicht im Edmonton-Starterteam enthalten ist,
- keine Starterkarte über 76 OVR liegt,
- keine normale Base Card über 86 OVR liegt,
- frühe Eventkarten sinnvoll begrenzt sind,
- `Player Identity` und `CardVersion` sauber getrennt sind,
- jedes Team ausreichend Base Cards besitzt,
- jede relevante Position ausreichend vertreten ist,
- Starterkarten nicht im Base Market auftauchen,
- Base Cards dauerhaft kaufbar sind,
- Eventkarten serverseitig korrekt rotieren,
- Economy und KI auf das neue Ratingniveau angepasst sind,
- bestehende Nutzerdaten sicher behandelt werden,
- ein frischer Datenbankreset funktioniert,
- alle Tests erfolgreich laufen,
- die App bei fehlenden Environment Variables eine sichtbare Fehlerseite zeigt,
- die Dokumentation dem tatsächlichen Stand entspricht,
- ein Preview-Deployment erfolgreich getestet wurde.

---

## 26. Abschlussbericht

Liefere am Ende einen präzisen Abschlussbericht mit:

1. Anzahl der NHL-Teams
2. Anzahl der PWHL-Teams
3. Anzahl der `Player Identities`
4. Anzahl der Starterkarten
5. Anzahl der Base Cards
6. Anzahl der Eventkarten
7. Anzahl der Rewardkarten
8. Ratingverteilungen
9. Starterteam-Durchschnitte
10. Economy-Ergebnisse
11. KI-Simulationsresultate
12. neue Migrationen
13. Migrationsstrategie für bestehende Nutzer
14. ausgeführte Tests
15. frischer Supabase-Reset und Ergebnis
16. Preview-Deployment
17. verbleibende Unsicherheiten
18. manuell zu prüfende Spieler- oder Kaderdaten
19. besonders kritische Dateien
20. klare Aussage, ob die Definition of Done vollständig erfüllt ist

Behaupte nichts als getestet, wenn es nicht tatsächlich getestet wurde.

Beginne jetzt mit der vollständigen Analyse des aktuellen Repositories und der offiziellen Team- und Kaderdaten. Setze danach den gesamten Auftrag autonom um.
