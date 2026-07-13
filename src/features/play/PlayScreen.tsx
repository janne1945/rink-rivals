import { useState } from "react";
import type { GameMode, Lineup } from "../../domain/lineups";
import { Button } from "../../shared/Button";
import styles from "../Screens.module.css";

const modes: Array<{ id: GameMode; label: string; kicker: string; copy: string }> = [
  { id: "nhl-circuit", label: "NHL Circuit", kicker: "League locked", copy: "Take a six-card NHL lineup through a pure circuit matchup." },
  { id: "pwhl-circuit", label: "PWHL Circuit", kicker: "League locked", copy: "Build around PWHL stars and face a dedicated circuit rival." },
  { id: "open-ice", label: "Open Ice", kicker: "Fantasy lineup", copy: "Mix both leagues freely. No penalty, only the right card for the moment." },
];

export function PlayScreen({ lineups, activeLineupIds, onStart }: { lineups: readonly Lineup[]; activeLineupIds: Record<string, string>; onStart: (mode: GameMode) => void }) {
  const [selected, setSelected] = useState<GameMode>("open-ice");
  const active = lineups.find((lineup) => lineup.id === activeLineupIds[selected]);

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Choose your ice</p>
        <h1 className={styles.title}>Faceoff</h1>
        <p className={styles.lede}>Five situations. Five hidden selections. Read the matchup and save the right card for the right shift.</p>
      </header>
      <div className={styles.modeGrid}>
        {modes.map((mode) => (
          <button key={mode.id} className={`${styles.modeCard} ${selected === mode.id ? styles.modeSelected : ""}`} onClick={() => setSelected(mode.id)} aria-pressed={selected === mode.id}>
            <small>{mode.kicker}</small><h3>{mode.label}</h3><p>{mode.copy}</p>
          </button>
        ))}
      </div>
      <section className={styles.panel}>
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Active six</p><h2>{active?.name ?? "No valid lineup"}</h2><p>Pro difficulty · five rounds · goalie guaranteed</p></div>
          <Button onClick={() => onStart(selected)} disabled={!active}>Start match</Button>
        </div>
      </section>
    </div>
  );
}
