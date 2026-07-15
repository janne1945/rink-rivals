import { motion } from "motion/react";

import type { BattleViewState } from "../../domain/battle";
import type { MotionPreset } from "./motionPresets";
import styles from "./MatchExperienceV2.module.css";

function roundMarker(battle: BattleViewState, index: number): { label: string; marker: string; tone: string } {
  const result = battle.results[index];
  const current = battle.phase !== "complete" && battle.roundIndex === index;
  if (result) {
    const marker = result.winner === "player" ? "W" : result.winner === "opponent" ? "L" : "T";
    const label = `Round ${index + 1}: ${result.situation.name}, ${result.winner === "player" ? "won" : result.winner === "opponent" ? "lost" : "tied"}`;
    return { label, marker, tone: styles[result.winner] };
  }
  return {
    label: current ? `Round ${index + 1}: current` : `Round ${index + 1}: upcoming`,
    marker: current ? String(index + 1) : "·",
    tone: current ? styles.currentRound : "",
  };
}

export function MatchHud({ battle, preset, scorePulse, matchPoint, finalShift }: {
  readonly battle: BattleViewState;
  readonly preset: MotionPreset;
  readonly scorePulse: boolean;
  readonly matchPoint: boolean;
  readonly finalShift: boolean;
}) {
  return (
    <header className={styles.hud} aria-label="Match scoreboard">
      <div className={styles.clubBlock}>
        <span>Your club</span>
        <strong>{battle.lineups.player.name}</strong>
      </div>
      <motion.div
        className={styles.scoreboard}
        animate={scorePulse ? { scale: [1, preset.scale, 1], y: [0, -4, 0] } : { scale: 1, y: 0 }}
        transition={{ duration: preset.duration.score / 1000 }}
      >
        <motion.strong key={`player-${battle.roundWins.player}`} aria-label={`Your score ${battle.roundWins.player}`}>{battle.roundWins.player}</motion.strong>
        <span>—</span>
        <motion.strong key={`rival-${battle.roundWins.opponent}`} aria-label={`Rival score ${battle.roundWins.opponent}`}>{battle.roundWins.opponent}</motion.strong>
      </motion.div>
      <div className={`${styles.clubBlock} ${styles.rivalClub}`}>
        <span>{battle.difficulty} rival</span>
        <strong>{battle.lineups.opponent.name}</strong>
      </div>
      <div className={styles.hudStatus}>
        <span>Round {Math.min(battle.roundIndex + 1, 5)} / 5</span>
        {finalShift ? <b>Final Shift</b> : matchPoint ? <b>Match Point</b> : <b>{battle.mode.replaceAll("-", " ")}</b>}
      </div>
      <ol className={styles.timeline} aria-label="Round timeline">
        {Array.from({ length: 5 }, (_, index) => {
          const marker = roundMarker(battle, index);
          return (
            <li key={index} className={`${styles.timelineSlot} ${marker.tone}`} aria-label={marker.label}>
              <span>{index + 1}</span><strong>{marker.marker}</strong>
            </li>
          );
        })}
      </ol>
    </header>
  );
}

