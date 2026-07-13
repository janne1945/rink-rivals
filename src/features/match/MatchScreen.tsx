import type { BattleViewState } from "../../domain/battle";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "./MatchScreen.module.css";

interface MatchScreenProps {
  battle: BattleViewState;
  eligibleCardIds: readonly string[];
  rewardCredits: number;
  rewardGranted: boolean;
  onSelect: (cardId: string) => void;
  onReveal: () => void;
  onFinish: () => void;
}

export function MatchScreen({ battle, eligibleCardIds, rewardCredits, rewardGranted, onSelect, onReveal, onFinish }: MatchScreenProps) {
  if (battle.phase === "complete") {
    const label = battle.winner === "player" ? "Rivalry won" : battle.winner === "opponent" ? "Hard-fought loss" : "Dead even";
    return (
      <section className={styles.final}>
        <div><p className={styles.round}>Final horn</p><h1>{label}</h1><div className={styles.finalScore}>{battle.roundWins.player} — {battle.roundWins.opponent}</div><p className={styles.reward}>{rewardGranted ? `+${rewardCredits} Credits added to your club` : "Securing match reward…"}</p><Button onClick={onFinish} disabled={!rewardGranted}>Return to club</Button></div>
      </section>
    );
  }

  const situation = battle.situations[battle.roundIndex];
  const eligible = new Set(eligibleCardIds);
  const latest = battle.results.at(-1);

  return (
    <div className={styles.screen}>
      <section className={styles.arena} aria-labelledby="situation-title">
        <div className={styles.scoreSide}><small>Your rounds</small><strong>{battle.roundWins.player}</strong></div>
        <div className={styles.situation}><span className={styles.round}>Round {battle.roundIndex + 1} of 5</span><h1 id="situation-title">{situation.name}</h1><p>{situation.description}</p></div>
        <div className={styles.scoreSide}><small>Rival rounds</small><strong>{battle.roundWins.opponent}</strong></div>
      </section>

      {battle.phase === "awaiting-reveal" ? (
        <div className={styles.result}>
          <div aria-hidden="true" />
          <div className={styles.resultCopy}><strong>Both locked in</strong><span>Selections stay hidden until the reveal</span><div style={{ marginTop: 14 }}><Button onClick={onReveal}>Reveal shift</Button></div></div>
          <div aria-hidden="true" />
        </div>
      ) : latest ? (
        <div className={styles.result} aria-live="polite">
          <HockeyCard compact card={latest.playerCard.card} player={latest.playerCard.player} />
          <div className={styles.resultCopy}><strong>{latest.winner === "player" ? "Round won" : latest.winner === "opponent" ? "Rival wins" : "Tie"}</strong><span>{latest.playerScore.total.toFixed(1)} vs {latest.opponentScore.total.toFixed(1)}</span></div>
          <HockeyCard compact card={latest.opponentCard.card} player={latest.opponentCard.player} />
        </div>
      ) : null}

      <section aria-label="Player hand">
        <div className={styles.handHeader}><div><h2>Choose your card</h2><p>Eligible cards are lit. Used cards stay on the bench.</p></div></div>
        <div className={styles.hand}>
          {battle.lineups.player.cards.map(({ card, player }) => {
            const used = battle.usedCardIds.player.includes(card.id);
            const allowed = eligible.has(card.id);
            return <HockeyCard key={card.id} card={card} player={player} used={used} disabled={!allowed || battle.phase !== "selecting"} status={used ? "Used" : !allowed ? "Ineligible" : undefined} onClick={() => onSelect(card.id)} />;
          })}
        </div>
      </section>
    </div>
  );
}
