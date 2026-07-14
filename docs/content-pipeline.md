# Content pipeline

Die Pipeline trennt Netzwerkimport, Review-Snapshot, deterministische Generierung und Datenbankprojektion. Die React/Vite-App importiert nur das generierte lokale Artefakt.

## 1. Offiziellen Snapshot aktualisieren

```bash
pnpm content:snapshot
```

Der Befehl ist ein bewusst manueller Development-Schritt. Er liest offizielle NHL/PWHL-Quellen, validiert nichtleere aktive Teamsets, eindeutige Quell-IDs, eine lückenlose PWHL-Draftreihenfolge und den belegten Boston-Depth-Fallback und schreibt anschließend atomar nach `data/content/official-content-snapshot.json`. Bei einem Fehler bleibt das zuvor freigegebene Artefakt unverändert. Die Produktionspipeline nimmt keine feste NHL-, PWHL- oder Gesamt-Teamzahl an.

Vor der Freigabe sind mindestens zu prüfen:

- die für diesen Snapshot ermittelten 32 NHL- und 12 PWHL-Teams sowie jede spätere Expansion oder Deaktivierung,
- neue/entfernte Spieler und Teamwechsel,
- `rights`, `roster-candidate` und `legacy-retained`,
- alle `requiresManualReview`-Gründe,
- Positionsprojektionen und Nationalitäten,
- dass kein Feed-Key in Artefakten persistiert ist.

Quell-IDs werden vor der Kataloggenerierung über das reviewte Artefakt
`data/content/stable-id-registry.json` auf permanente interne IDs aufgelöst.
Anzeigenamen sind dort als Aliase hinterlegt: Eine Umbenennung ändert niemals
automatisch eine Team-, Player- oder CardVersion-ID. Neue Quell-IDs und neue
Namensaliase lassen die Generierung bis zu einem expliziten Review fehlschlagen.

Belegte Sekundärpositionen liegen getrennt in
`data/content/position-evidence.json`. Jede Zeile benötigt eine offizielle
HTTPS-Quelle, ein `reviewedAt` mindestens auf Snapshot-Stand und eine konkrete
Evidenzbeschreibung. Unbekannte, veraltete, doppelte oder im Launch-Set nicht
verwendete Evidenz lässt die Generierung fehlschlagen. Der aktuelle Snapshot
enthält ausschließlich vier solche NHL-Belege: Teuvo Teravainen (RW), Nicolas
Roy (RW), Timo Meier (LW) und Ben Meyers (LW). Ihre offizielle Primärposition
bleibt unverändert; nur `eligiblePositions` wird erweitert und der Datensatz
bleibt zur manuellen Prüfung markiert.

## 2. Katalog generieren

```bash
pnpm catalog:generate
pnpm catalog:generate:check
pnpm catalog:validate
```

Der Generator wählt 18 verwendbare Identitäten je aktuell aktivem Team und erzeugt je Team genau ein StarterSquad sowie Eventabdeckung und Rewards. Gesamtzahlen werden aus dem reviewten Snapshot abgeleitet. `generatedAt` wird deterministisch aus dessen validiertem `snapshotDate` gebildet; Seasons und Draftjahr stammen ebenfalls aus Snapshot-Metadaten. Volatile Importzeitpunkte gelangen nicht in den Katalog. Gleiche Inputs erzeugen byte-identisches JSON. `--check` schlägt fehl, wenn `src/data/generated/gameCatalog.json` veraltet ist.

Starter liegen grundsätzlich im OVR unter ihrer Base-Version. Sechs in Registry
und Validator namentlich auditierte 68-OVR-Floor-Fälle teilen ausnahmsweise den
Base-OVR, weil nach gültiger Position und Top-Star-Schutz keine niedrigere
Identität existiert. Auch dort ist jedes Starterattribut höchstens so hoch wie
Base und mindestens eines strikt niedriger.

Die schlanke Datei `src/data/generated/gameCatalog.ts` validiert JSON beim Import per Zod und exportiert `gameCatalog`, `teams`, `starterSquads`, `starterLineups` und `eventCardManifest`. Der große Katalog wird nicht von Hand in TypeScript gepflegt.

## 3. Datenbankprojektion und QA

```bash
pnpm catalog:sql:write
pnpm catalog:sql:check
pnpm typecheck
pnpm test
pnpm balance
pnpm build
```

Die SQL-Projektion verwendet denselben validierten Export. Team-, Spieler-, Karten- und Starter-Squad-IDs müssen deshalb zwischen Client, Migration, Receipts und Lineups identisch bleiben. Vorhandene IDs dürfen nur über eine explizite Legacy-/Aliasstrategie verschwinden. Die sechs alten Kendall/Claire-Karten bleiben addressierbar, sind aber nicht kaufbar.

Der kombinierte lokale Check ist:

```bash
pnpm qa:core
```

Netzwerkimport gehört absichtlich nicht in `qa:core`: CI und Laufzeit müssen reproduzierbar auf dem reviewten Snapshot arbeiten.

## Erweiterungen

- Ein neuer aktiver Teamdatensatz muss eine stabile ID, 16–20 spielbare Base-Identitäten (der aktuelle Generator wählt 18), ein vollständiges StarterSquad und mindestens zwei Launch-Events erhalten.
- Eventkarten verwenden bestehende Player Identities und die stabile ID `${playerId}-${eventId}`.
- Ein neuer Rating-Override benötigt Ausgangswert, Ersatzwert und Begründung; stale Overrides sind ein Fehler.
- Generische Positions- oder Rosterannahmen müssen im SourceMetadata-Status und in `manualReviewReasons` sichtbar sein. Exakte offizielle Positionen dürfen nicht umgeschrieben werden; zusätzliche Eligibility benötigt `position-evidence.json`.
- Offizielle Bilder oder Logos werden nicht automatisch übernommen. Neue Assets brauchen eine ausdrückliche Freigabe.
