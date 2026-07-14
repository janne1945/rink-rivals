import { useEffect } from "react";
import { calculateCategoryValue, type BattleRoundResult, type BattleSituation, type BattleViewState } from "../../domain/battle";
import type { CardVersion } from "../../domain/cards";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "./MatchScreen.module.css";

interface MatchScreenProps {
  battle: BattleViewState;
  eligibleCardIds: readonly string[];
  rewardGranted: boolean;
  settling: boolean;
  roundPlaying: boolean;
  reviewingRound: boolean;
  roundError?: string;
  settlementError?: string;
  progressionMessage?: string;
  onSelect: (cardId: string) => void;
  onReveal: () => void;
  onContinue: () => void;
  onRetrySettlement: () => void;
  onPlayAgain: () => void;
  onFinish: () => void;
}
function resultLabel(result: BattleRoundResult): string {
  return result.winner === "player" ? "You win" : result.winner === "opponent" ? "Rival wins" : "Draw";
}

function tieExplanation(result: BattleRoundResult): string {
  if (result.tieBreaker === "category") return `Higher ${result.situation.name} wins.`;
  if (result.tieBreaker === "overall") return `Category tied. Higher OVR wins the tie-break.`;
  return "Category and OVR tied. The server match seed resolved the tie.";
}

function categoryValue(card: CardVersion, situation: BattleSituation): number | null {
  return card.role === situation.role ? calculateCategoryValue(card, situation) : null;
}

function RoundTimeline({ battle }: { battle: BattleViewState }) {
  return (
    <ol className={styles.timeline} aria-label="Round timeline">
      {Array.from({ length: 5 }, (_, index) => {
        const result = battle.results[index];
        const current = battle.phase !== "complete" && index === battle.roundIndex;
        const marker = result ? result.winner === "player" ? "W" : result.winner === "opponent" ? "L" : "T" : current ? String(index + 1) : "•";
        const label = result
          ? `Round ${index + 1}: ${result.situation.name}, ${resultLabel(result)}`
          : current ? `Round ${index + 1}: current` : `Round ${index + 1}: upcoming`;
        return <li key={index} className={`${styles.timelineSlot} ${result ? styles[result.winner] : ""} ${current ? styles.current : ""}`} aria-label={label}><span>{index + 1}</span><strong>{marker}</strong></li>;
      })}
    </ol>
  );
}

function Comparison({ result }: { result: BattleRoundResult }) {
  const announcement = `Round ${result.roundNumber} of 5. Category ${result.situation.name}. Your selected card has ${result.situation.name} ${result.playerScore.value}. Rival card has ${result.situation.name} ${result.opponentScore.value}. ${resultLabel(result)}. ${tieExplanation(result)}`;
  return (
    <section className={styles.comparison} aria-label={`Round ${result.roundNumber} result`}>
      <div className={`${styles.comparisonCard} ${result.winner === "player" ? styles.winningCard : styles.losingCard}`}>
        <span className={styles.sideLabel}>Your card</span>
        <HockeyCard compact eager card={result.playerCard.card} player={result.playerCard.player} highlightedStat={{ label: result.situation.name, value: result.playerScore.value }} />
      </div>
      <div className={styles.versus}>
        <span>{result.situation.name}</span>
        <div><strong>{result.playerScore.value}</strong><em>vs</em><strong>{result.opponentScore.value}</strong></div>
        <h2>{resultLabel(result)}</h2>
        <p>{tieExplanation(result)}</p>
      </div>
      <div className={`${styles.comparisonCard} ${result.winner === "opponent" ? styles.winningCard : styles.losingCard}`}>
        <span className={styles.sideLabel}>Rival card</span>
        <HockeyCard compact eager card={result.opponentCard.card} player={result.opponentCard.player} highlightedStat={{ label: result.situation.name, value: result.opponentScore.value }} />
      </div>
      <p className={styles.srOnly} role="status" aria-live="assertive">{announcement}</p>
    </section>
  );
}

function FinalScreen({ battle, rewardGranted, settling, settlementError, progressionMessage, onRetrySettlement, onPlayAgain, onFinish }: Pick<MatchScreenProps, "battle" | "rewardGranted" | "settling" | "settlementError" | "progressionMessage" | "onRetrySettlement" | "onPlayAgain" | "onFinish">) {
  const label = battle.winner === "player" ? "Rivalry won" : battle.winner === "opponent" ? "Hard-fought loss" : "Dead even";
  return (
    <section className={styles.final} aria-labelledby="final-title">
      <header className={styles.finalHero}>
        <p className={styles.eyebrow}>Final horn</p>
        <h1 id="final-title">{label}</h1>
        <div className={styles.finalScore} aria-label={`Final score ${battle.roundWins.player} to ${battle.roundWins.opponent}`}>{battle.roundWins.player}<span>—</span>{battle.roundWins.opponent}</div>
        <p>{battle.lineups.player.name} vs {battle.lineups.opponent.name} · {battle.difficulty}</p>
      </header>
      <RoundTimeline battle={battle} />
      <ol className={styles.finalRounds} aria-label="All round results">
        {battle.results.map((result) => <li key={result.roundNumber}><span>R{result.roundNumber}</span><strong>{result.situation.name}</strong><small>{result.playerCard.player.name} vs {result.opponentCard.player.name}</small><span>{result.playerScore.value}–{result.opponentScore.value}</span><b>{resultLabel(result)}</b></li>)}
      </ol>
      <div className={styles.settlement} role="status" aria-live="polite">
        <p>{rewardGranted ? progressionMessage : settling ? "Settling match securely…" : settlementError || "Recording match…"}</p>
      </div>
      <div className={styles.finalActions}>
        {settlementError && !rewardGranted ? <Button onClick={onRetrySettlement} disabled={settling}>Retry settlement</Button> : null}
        <Button onClick={onPlayAgain} disabled={!rewardGranted}>New match</Button>
        <Button onClick={onFinish} disabled={!rewardGranted}>Back to overview</Button>
      </div>
    </section>
  );
}

export function MatchScreen(props: MatchScreenProps) {
  const { battle, eligibleCardIds, rewardGranted, settling, roundPlaying, reviewingRound, roundError, settlementError, progressionMessage, onSelect, onReveal, onContinue, onRetrySettlement, onPlayAgain, onFinish } = props;
  useEffect(() => {
    if (!reviewingRound && battle.phase !== "complete") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }, [battle.phase, reviewingRound]);

  if (battle.phase === "complete") {
    return <FinalScreen battle={battle} rewardGranted={rewardGranted} settling={settling} settlementError={settlementError} progressionMessage={progressionMessage} onRetrySettlement={onRetrySettlement} onPlayAgain={onPlayAgain} onFinish={onFinish} />;
  }

  const situation = battle.situations[battle.roundIndex];
  const eligible = new Set(eligibleCardIds);
  const latest = battle.results.at(-1);
  const selected = battle.visibleSelection
    ? battle.lineups.player.cards.find(({ card }) => card.id === battle.visibleSelection)
    : undefined;

  return (
    <div className={styles.screen}>
      <header className={styles.hud}>
        <div className={styles.scoreBlock}><small>You</small><strong>{battle.roundWins.player}</strong></div>
        <div className={styles.matchMeta}><span>{battle.lineups.opponent.name}</span><b>{battle.difficulty}</b></div>
        <div className={styles.scoreBlock}><small>Rival</small><strong>{battle.roundWins.opponent}</strong></div>
        <RoundTimeline battle={battle} />
      </header>

      {reviewingRound && latest ? (
        <>
          <Comparison result={latest} />
          <div className={styles.continueAction}><Button onClick={onContinue}>Next round</Button></div>
        </>
      ) : (
        <>
          <section className={styles.categoryHero} aria-labelledby="category-title">
            <p className={styles.eyebrow}>Round {battle.roundIndex + 1} of 5 · {situation.role === "goalie" ? "Goalie" : "Skater"} category</p>
            <h1 id="category-title">{situation.name}</h1>
            <p>{situation.description}</p>
            <span>On a tie: higher OVR, then the server match seed.</span>
          </section>

          {battle.phase === "awaiting-reveal" && selected ? (
            <section className={styles.lockedStage} aria-label="Cards locked for concealed reveal">
              <div className={styles.lockedCard}>
                <span className={styles.sideLabel}>Your card</span>
                <HockeyCard compact eager card={selected.card} player={selected.player} highlightedStat={{ label: situation.name, value: calculateCategoryValue(selected.card, situation) }} />
              </div>
              <div className={styles.revealControl}>
                <span className={styles.lockedPill}>Card locked in</span>
                <h2>Rival card concealed</h2>
                <p>The server reveals the rival and compares the two visible {situation.name} values.</p>
                {roundError ? <p role="alert" className={styles.error}>{roundError}</p> : null}
                <Button onClick={onReveal} disabled={roundPlaying}>{roundPlaying ? "Playing round…" : roundError ? "Retry reveal" : "Reveal cards"}</Button>
              </div>
              <div className={styles.hiddenCard} aria-label="Rival card hidden"><span>?</span><strong>Rival</strong><small>Reveals after your choice</small></div>
            </section>
          ) : (
            <section className={styles.handSection} aria-label="Player hand">
              <div className={styles.handHeader}><div><p className={styles.eyebrow}>Your lineup</p><h2>Choose one card</h2></div><p>Eligible cards show the exact value that counts.</p></div>
              <div className={styles.hand}>
                {battle.lineups.player.cards.map(({ card, player }) => {
                  const used = battle.usedCardIds.player.includes(card.id);
                  const allowed = eligible.has(card.id);
                  const value = categoryValue(card, situation);
                  const status = used ? "Used" : !allowed ? `Ineligible for ${situation.name}` : "Eligible";
                  return <HockeyCard key={card.id} card={card} player={player} used={used} disabled={!allowed} status={status} highlightedStat={value === null ? undefined : { label: situation.name, value }} onClick={() => onSelect(card.id)} />;
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
