# Signature Series Artwork-Audit

Stand: 14. Juli 2026. Diese Matrix dokumentiert die visuelle Gegenprüfung der neun freigegebenen Signature-Series-Artworks gegen ihre finalen CardVersions. Die im Artwork gedruckten Werte sind für diese CardVersion verbindlich.

| Artwork / Spieler | Position | Sichtbarer OVR | Sichtbare Einzelwerte | Finale CardVersion-ID | Finaler Preis |
| --- | --- | ---: | --- | --- | ---: |
| Cale Makar | RD | 95 | SPD 97 · SHT 92 · PLY 96 · DEF 97 · CLT 95 | `nhl-cale-makar-signature-series` | 23.000 CR |
| Connor McDavid | C | 96 | SPD 99 · SHT 95 · PLY 98 · DEF 86 · CLT 97 | `nhl-connor-mcdavid-signature-series` | 24.500 CR |
| David Pastrnak | RW | 94 | SPD 93 · SHT 95 · PLY 94 · DEF 86 · CLT 92 | `nhl-david-pastrnak-signature-series` | 21.500 CR |
| Jeremy Swayman | G | 92 | HGH 93 · LOW 92 · QCK 93 · POS 91 · RBC 91 | `nhl-jeremy-swayman-signature-series` | 18.500 CR |
| Rasmus Dahlin | RD | 93 | SPD 92 · SHT 91 · PLY 93 · DEF 94 · CLT 93 | `nhl-rasmus-dahlin-signature-series` | 20.000 CR |
| Marie-Philip Poulin | C | 96 | SPD 94 · SHT 93 · PLY 96 · DEF 92 · CLT 95 | `pwhl-marie-philip-poulin-signature-series` | 24.500 CR |
| Megan Keller | RD | 94 | SPD 92 · SHT 88 · PLY 91 · DEF 95 · CLT 93 | `pwhl-megan-keller-signature-series` | 21.500 CR |
| Raygan Kirk | G | 92 | HGH 91 · LOW 92 · QCK 92 · POS 93 · RBC 90 | `pwhl-raygan-kirk-signature-series` | 18.500 CR |
| Sophie Jaques | RD | 93 | SPD 91 · SHT 87 · PLY 93 · DEF 94 · CLT 92 | `pwhl-sophie-jaques-signature-series` | 20.000 CR |

## Projektion der sichtbaren Werte

Für Skater gilt: `SPD → speed`, `SHT → shooting`, `PLY → passing / puckControl / hockeyIq`, `DEF → defense / physicality` und `CLT → clutch`.

Für Goalies gilt: `QCK → reflexes`, `POS → positioning / consistency / clutch`, `HGH → glove`, `LOW → blocker` und `RBC → reboundControl / puckHandling`. Beide Goalie-Artworks werden als Position `G` und mit Goalie-Attributen geführt.

Der Preis verwendet unverändert die bestehende Event-Preisfunktion `6.500 + (OVR − 84) × 1.500`. Nur die resultierenden Preise dieser neun artworkgebundenen CardVersions ändern sich mit ihrem sichtbaren OVR.

## Asset- und Historienstatus

Die kanonischen Laufzeitdateien liegen genau einmal unter `public/assets/players/<league>/<player>/signature.webp`; React-Komponenten kennen diese Dateipfade nicht und verwenden ausschließlich den zentralen Resolver. Acht originale PNGs bleiben im geprüften Source-Archiv erhalten. Für Marie-Philip Poulin ist nur das bereits vorhandene, per Hash inventarisierte kanonische WebP verfügbar; das ursprüngliche PNG bleibt als bekannte Archivlücke dokumentiert.

`pwhl-hilary-knight-signature-series` bleibt als bis 13. Juli 2026 gültige Historienzeile erhalten. Sie gehört nicht zu den neun freigegebenen Artworks, ist abgelaufen und kann deshalb weder in aktuellen noch in späteren Signature-Angeboten erscheinen.
