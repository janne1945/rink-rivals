import { motion } from "motion/react";

import type { BattleRoundResult } from "../../domain/battle";
import { HockeyCard } from "../../shared/HockeyCard";
import type { MotionPreset } from "./motionPresets";
import styles from "./MatchExperienceV2.module.css";

export function roundResultLabel(result: BattleRoundResult): string {
  return result.winner === "player" ? "Shift won" : result.winner === "opponent" ? "Rival takes it" : "Dead even";
}

export function tieBreakExplanation(result: BattleRoundResult): string {
  if (result.tieBreaker === "category") return `Higher ${result.situation.name} wins.`;
  if (result.tieBreaker === "overall") return `The ${result.situation.name} values tied. Higher visible OVR wins.`;
  return `The ${result.situation.name} and OVR values tied. The immutable server match seed resolved the round.`;
}

export function ComparisonLayer({ result, preset, revealOnly = false }: {
  readonly result: BattleRoundResult;
  readonly preset: MotionPreset;
  readonly revealOnly?: boolean;
}) {
  return (
    <section className={styles.comparison} aria-label={`Round ${result.roundNumber} result`}>
      <motion.div
        className={`${styles.stageCard} ${result.winner === "player" ? styles.winnerCard : styles.subduedCard}`}
        layoutId={`v2-card-${result.playerCard.card.id}`}
        initial={{ x: -preset.distance, opacity: 0 }}
        animate={{ x: 0, opacity: 1, y: revealOnly ? 0 : result.winner === "player" ? -8 : 0 }}
        transition={{ duration: preset.duration.reveal / 1000 }}
      >
        <span className={styles.cardSide}>Your card</span>
        <HockeyCard compact eager card={result.playerCard.card} player={result.playerCard.player} highlightedStat={{ label: result.situation.name, value: result.playerScore.value }} />
      </motion.div>
      <motion.div
        className={styles.comparisonReadout}
        initial={{ opacity: 0, scale: .94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: preset.distance === 0 ? 0 : revealOnly ? .05 : .12, duration: preset.duration.comparison / 1000 }}
      >
        <span>{result.situation.name}</span>
        <div className={styles.values} aria-label={`${result.playerScore.value} versus ${result.opponentScore.value}`}>
          <strong>{result.playerScore.value}</strong><i>vs</i><strong>{result.opponentScore.value}</strong>
        </div>
        <h2>{roundResultLabel(result)}</h2>
        <p>{tieBreakExplanation(result)}</p>
      </motion.div>
      <motion.div
        className={`${styles.stageCard} ${result.winner === "opponent" ? styles.winnerCard : styles.subduedCard}`}
        initial={{ x: preset.distance, opacity: 0, rotateY: revealOnly ? 90 : 0 }}
        animate={{ x: 0, opacity: 1, rotateY: 0, y: revealOnly ? 0 : result.winner === "opponent" ? -8 : 0 }}
        transition={{ duration: preset.duration.reveal / 1000 }}
      >
        <span className={styles.cardSide}>Rival card</span>
        <HockeyCard compact eager card={result.opponentCard.card} player={result.opponentCard.player} highlightedStat={{ label: result.situation.name, value: result.opponentScore.value }} />
      </motion.div>
    </section>
  );
}
