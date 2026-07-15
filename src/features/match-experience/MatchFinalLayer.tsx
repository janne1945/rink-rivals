import { motion } from "motion/react";

import type { BattleRoundResult, BattleViewState } from "../../domain/battle";
import { Button } from "../../shared/Button";
import { roundResultLabel } from "./ComparisonLayer";
import type { MotionPreset } from "./motionPresets";
import styles from "./MatchExperienceV2.module.css";

function decisiveRound(results: readonly BattleRoundResult[]): number | null {
  let player = 0;
  let opponent = 0;
  for (const result of results) {
    if (result.winner === "player") player += 1;
    if (result.winner === "opponent") opponent += 1;
    if (player === 3 || opponent === 3) return result.roundNumber;
  }
  return null;
}

export function MatchFinalLayer({ battle, preset, rewardGranted, settling, settlementError, progressionMessage, challengeBusy, challengeUrl, challengeError, onCreateChallenge, onShareChallenge, onRetrySettlement, onPlayAgain, onFinish }: {
  readonly battle: BattleViewState;
  readonly preset: MotionPreset;
  readonly rewardGranted: boolean;
  readonly settling: boolean;
  readonly settlementError?: string;
  readonly progressionMessage?: string;
  readonly challengeBusy?: boolean;
  readonly challengeUrl?: string;
  readonly challengeError?: string;
  readonly onCreateChallenge?: () => void;
  readonly onShareChallenge?: () => void;
  readonly onRetrySettlement: () => void;
  readonly onPlayAgain: () => void;
  readonly onFinish: () => void;
}) {
  const title = battle.winner === "player" ? "Rivalry secured" : battle.winner === "opponent" ? "Rival takes the night" : "Nothing separates them";
  const clincher = decisiveRound(battle.results);
  return (
    <motion.section
      className={styles.finalLayer}
      aria-labelledby="v2-final-heading"
      initial={{ opacity: 0, scale: .98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: preset.duration.final / 1000 }}
    >
      <header className={styles.finalHero}>
        <span>Final horn</span>
        <h1 id="v2-final-heading" tabIndex={-1}>{title}</h1>
        <div className={styles.finalScore} aria-label={`Final score ${battle.roundWins.player} to ${battle.roundWins.opponent}`}>
          <strong>{battle.roundWins.player}</strong><i>—</i><strong>{battle.roundWins.opponent}</strong>
        </div>
        <p>{battle.lineups.player.name} vs {battle.lineups.opponent.name}{clincher ? ` · decided in round ${clincher}` : ""}</p>
      </header>
      <ol className={styles.finalRounds} aria-label="All round results">
        {battle.results.map((result) => (
          <li key={result.roundNumber} className={styles[result.winner]}>
            <span>R{result.roundNumber}</span>
            <div><strong>{result.situation.name}</strong><small>{result.playerCard.player.name} vs {result.opponentCard.player.name}</small></div>
            <b>{result.playerScore.value}<i>—</i>{result.opponentScore.value}</b>
            <em>{roundResultLabel(result)}</em>
          </li>
        ))}
      </ol>
      <div className={`${styles.settlementPanel} ${settlementError ? styles.settlementFailed : rewardGranted ? styles.settlementComplete : ""}`} aria-live="polite">
        <span>{rewardGranted ? "Server confirmed" : settlementError ? "Settlement interrupted" : "Secure settlement"}</span>
        <p>{rewardGranted ? progressionMessage : settlementError || (settling ? "Recording the result and progression on the server…" : "Waiting for server confirmation…")}</p>
      </div>
      {rewardGranted && onCreateChallenge ? (
        <div className={styles.challengePanel} aria-live="polite">
          <div><span>Keep the rivalry alive</span><strong>{challengeUrl ? "Your ghost is ready" : "Turn your five choices into a challenge"}</strong></div>
          {challengeUrl ? <Button onClick={onShareChallenge}>Share challenge</Button> : <Button onClick={onCreateChallenge} disabled={challengeBusy}>{challengeBusy ? "Creating ghost…" : "Create Ghost Rivalry"}</Button>}
          {challengeError ? <p role="alert">{challengeError}</p> : null}
        </div>
      ) : null}
      <div className={styles.finalActions}>
        {settlementError && !rewardGranted ? <Button onClick={onRetrySettlement} disabled={settling}>Retry settlement</Button> : null}
        <Button onClick={onPlayAgain} disabled={!rewardGranted}>Rematch setup</Button>
        <Button onClick={onFinish} disabled={!rewardGranted}>Back to overview</Button>
      </div>
    </motion.section>
  );
}
