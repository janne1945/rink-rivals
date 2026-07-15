import { useMachine } from "@xstate/react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { calculateCategoryValue, type BattleViewState } from "../../domain/battle";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import { BroadcastSting } from "./BroadcastSting";
import { ComparisonLayer, roundResultLabel, tieBreakExplanation } from "./ComparisonLayer";
import { noopExperienceEventSink, type MatchExperienceEventSink } from "./experienceEvents";
import { MatchFinalLayer } from "./MatchFinalLayer";
import { MatchHud } from "./MatchHud";
import { motionPresets, reducedMotionPreset, type MotionPreset, type MotionPresetName } from "./motionPresets";
import { PlayerHand } from "./PlayerHand";
import { isFinalShift, isMatchPoint, presentationMachine, reconstructPresentation } from "./presentationMachine";
import { useReducedMotionPreference } from "./reducedMotion";
import styles from "./MatchExperienceV2.module.css";

export interface MatchExperienceV2Props {
  readonly battle: BattleViewState;
  readonly eligibleCardIds: readonly string[];
  readonly rewardGranted: boolean;
  readonly settling: boolean;
  readonly roundPlaying: boolean;
  readonly reviewingRound: boolean;
  readonly restored?: boolean;
  readonly roundError?: string;
  readonly settlementError?: string;
  readonly progressionMessage?: string;
  readonly riveAssetUrl?: string;
  readonly eventSink?: MatchExperienceEventSink;
  readonly onSelect: (cardId: string) => void;
  readonly onReveal: () => void;
  readonly onContinue: () => void;
  readonly onRetrySettlement: () => void;
  readonly onPlayAgain: () => void;
  readonly onFinish: () => void;
  readonly onExit: () => void;
}

const stablePresetStates = new Set(["awaitingSelection", "awaitingAuthoritativeReveal", "roundResult", "matchFinal", "settlementError", "complete"]);

function initialPreset(): MotionPresetName {
  const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("motion");
  return requested && requested in motionPresets ? requested as MotionPresetName : "broadcast";
}

export function MatchExperienceV2(props: MatchExperienceV2Props) {
  const [presetName, setPresetName] = useState<MotionPresetName>(initialPreset);
  const [stable, setStable] = useState(false);
  const [generation, setGeneration] = useState(0);

  function changePreset(next: MotionPresetName) {
    if (!stable || next === presetName) return;
    setPresetName(next);
    setGeneration((value) => value + 1);
  }

  return (
    <ExperienceSession
      key={`${presetName}-${generation}`}
      {...props}
      preset={motionPresets[presetName]}
      forceRestored={generation > 0}
      onStableChange={setStable}
      presetControl={(
        <label className={styles.presetControl}>
          <span>Motion</span>
          <select value={presetName} disabled={!stable} onChange={(event) => changePreset(event.target.value as MotionPresetName)} aria-label="Motion preset">
            <option value="broadcast">Broadcast</option>
            <option value="arena">Arena</option>
            <option value="fastBroadcast">Fast broadcast</option>
          </select>
        </label>
      )}
    />
  );
}

function ExperienceSession(props: MatchExperienceV2Props & {
  readonly preset: MotionPreset;
  readonly forceRestored: boolean;
  readonly onStableChange: (stable: boolean) => void;
  readonly presetControl: React.ReactNode;
}) {
  const { battle } = props;
  const reducedMotion = useReducedMotionPreference();
  const preset = useMemo(
    () => reducedMotion.reduced ? reducedMotionPreset(props.preset) : props.preset,
    [props.preset, reducedMotion.reduced],
  );
  const [machineInput] = useState(() => ({
    ...reconstructPresentation({
      battle,
      reviewingRound: props.reviewingRound,
      restored: Boolean(props.restored || props.forceRestored),
      settling: props.settling,
      settlementComplete: props.rewardGranted,
      settlementError: props.settlementError,
    }),
    preset,
    reducedMotion: reducedMotion.reduced,
  }));
  const [snapshot, send] = useMachine(presentationMachine, {
    input: machineInput,
  });
  const state = String(snapshot.value);
  const latestResult = battle.results.at(-1);
  const situation = battle.situations[Math.min(battle.roundIndex, battle.situations.length - 1)];
  const selected = battle.visibleSelection
    ? battle.lineups.player.cards.find(({ card }) => card.id === battle.visibleSelection)
    : undefined;
  const resultCountAtCommit = useRef(battle.results.length);
  const emitted = useRef(new Set<string>());
  const eventSink = props.eventSink ?? noopExperienceEventSink;
  const rootRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => props.onStableChange(stablePresetStates.has(state)), [props.onStableChange, state]);
  useEffect(() => send({ type: "REDUCED_MOTION_CHANGED", reduced: reducedMotion.reduced }), [reducedMotion.reduced, send]);

  useEffect(() => {
    if (state !== "awaitingAuthoritativeReveal") return;
    if (battle.results.length <= resultCountAtCommit.current) return;
    const finalShift = isFinalShift(battle);
    const matchPoint = isMatchPoint(battle);
    eventSink({ type: "authoritative_reveal_received", matchId: battle.id, roundNumber: latestResult?.roundNumber ?? battle.results.length });
    send({ type: "AUTHORITATIVE_REVEAL_RECEIVED", matchComplete: battle.phase === "complete", matchPoint, finalShift });
  }, [battle, eventSink, latestResult?.roundNumber, send, state]);

  useEffect(() => {
    if (state === "awaitingAuthoritativeReveal" && props.roundError) send({ type: "REVEAL_FAILED" });
  }, [props.roundError, send, state]);

  useEffect(() => {
    if (props.rewardGranted && state !== "complete") send({ type: "SETTLEMENT_COMPLETED" });
    else if (props.settlementError && state !== "settlementError") send({ type: "SETTLEMENT_FAILED" });
    else if (props.settling && state === "matchFinal") send({ type: "SETTLEMENT_STARTED" });
  }, [props.rewardGranted, props.settlementError, props.settling, send, state]);

  useEffect(() => {
    const roundNumber = latestResult?.roundNumber ?? Math.min(battle.roundIndex + 1, 5);
    const key = `${state}:${roundNumber}`;
    if (emitted.current.has(key)) return;
    emitted.current.add(key);
    if (state === "matchIntro") eventSink({ type: "match_intro_started", matchId: battle.id });
    if (state === "categoryIntro") eventSink({ type: "category_announced", matchId: battle.id, roundNumber, categoryId: situation.id });
    if (state === "cardCommit" && selected) eventSink({ type: "card_committed", matchId: battle.id, roundNumber, cardId: selected.card.id });
    if (state === "rivalEntrance") eventSink({ type: "rival_entered", matchId: battle.id, roundNumber });
    if (state === "reveal") eventSink({ type: "cards_revealed", matchId: battle.id, roundNumber });
    if (state === "comparison" && latestResult) eventSink({ type: "comparison_resolved", matchId: battle.id, roundNumber, winner: latestResult.winner });
    if (state === "roundResult" && latestResult) {
      eventSink({ type: latestResult.winner === "player" ? "round_won" : latestResult.winner === "opponent" ? "round_lost" : "round_tied", matchId: battle.id, roundNumber });
      setAnnouncement(`Round ${roundNumber} of 5. ${latestResult.situation.name}: ${latestResult.playerScore.value} to ${latestResult.opponentScore.value}. ${roundResultLabel(latestResult)}. ${tieBreakExplanation(latestResult)}`);
    }
    if (state === "scoreUpdate") eventSink({ type: "score_updated", matchId: battle.id, roundNumber, playerScore: battle.roundWins.player, rivalScore: battle.roundWins.opponent });
    if (state === "matchPoint") eventSink({ type: "match_point", matchId: battle.id, roundNumber: battle.roundIndex + 1 });
    if (state === "finalShift") eventSink({ type: "final_shift", matchId: battle.id, roundNumber: 5 });
    if (state === "matchFinal" && battle.winner) eventSink({ type: "match_completed", matchId: battle.id, winner: battle.winner });
    if (state === "complete") eventSink({ type: "settlement_completed", matchId: battle.id });
    if (state === "settlementError") eventSink({ type: "settlement_failed", matchId: battle.id });
  }, [battle, eventSink, latestResult, selected, situation.id, state]);

  useEffect(() => {
    if (state === "awaitingSelection") rootRef.current?.querySelector<HTMLButtonElement>("[data-player-hand] button:not(:disabled)")?.focus();
    if (state === "awaitingAuthoritativeReveal") rootRef.current?.querySelector<HTMLButtonElement>("[data-reveal-action]")?.focus();
    if (state === "roundResult") rootRef.current?.querySelector<HTMLButtonElement>("[data-continue-action]")?.focus();
    if (["matchFinal", "settling", "settlementError", "complete"].includes(state)) rootRef.current?.querySelector<HTMLElement>("#v2-final-heading")?.focus();
  }, [state]);

  function selectCard(cardId: string) {
    if (state !== "awaitingSelection") return;
    resultCountAtCommit.current = battle.results.length;
    props.onSelect(cardId);
    send({ type: "CARD_SELECTED" });
  }

  function reveal() {
    if (state !== "awaitingAuthoritativeReveal" || props.roundPlaying || snapshot.context.requestPending) return;
    send({ type: "REVEAL_REQUESTED" });
    props.onReveal();
  }

  function continueRound() {
    if (state !== "roundResult") return;
    props.onContinue();
    send({ type: "CONTINUE" });
  }

  const finalState = ["matchFinal", "settling", "settlementError", "complete"].includes(state);
  const showComparison = ["reveal", "comparison", "roundResult", "scoreUpdate"].includes(state) && latestResult;
  const showHand = !finalState && !showComparison;
  const matchPoint = state === "matchPoint" || isMatchPoint(battle);
  const finalShift = state === "finalShift" || isFinalShift(battle);

  return (
    <MotionConfig reducedMotion={reducedMotion.reduced ? "always" : "never"} transition={reducedMotion.reduced ? { duration: 0 } : undefined}>
    <div ref={rootRef} className={`${styles.experience} ${styles[`preset_${preset.name}`]}`} data-presentation-state={state} data-reduced-motion={reducedMotion.reduced ? "true" : "false"}>
      <div className={styles.utilityBar}>
        <span className={styles.v2Badge}>Match Experience V2</span>
        <div>{props.presetControl}<button type="button" className={styles.exitButton} onClick={props.onExit}>Exit match</button></div>
      </div>
      <MatchHud battle={battle} preset={preset} scorePulse={state === "scoreUpdate"} matchPoint={matchPoint} finalShift={finalShift} />
      <LayoutGroup id={`match-${battle.id}`}>
        <main className={styles.arena}>
          <div className={styles.iceLines} aria-hidden="true"><span /><span /><span /></div>
          <AnimatePresence mode="wait">
            {finalState ? (
              <MatchFinalLayer
                key="final"
                battle={battle}
                preset={preset}
                rewardGranted={props.rewardGranted}
                settling={props.settling}
                settlementError={props.settlementError}
                progressionMessage={props.progressionMessage}
                onRetrySettlement={() => { send({ type: "RETRY_SETTLEMENT" }); props.onRetrySettlement(); }}
                onPlayAgain={props.onPlayAgain}
                onFinish={props.onFinish}
              />
            ) : showComparison && latestResult ? (
              <motion.div key={`comparison-${latestResult.roundNumber}`} className={styles.battleStage} exit={{ opacity: 0 }} transition={{ duration: preset.duration.transition / 1000 }}>
                <ComparisonLayer result={latestResult} preset={preset} revealOnly={state === "reveal"} />
                {state === "roundResult" ? <Button data-continue-action onClick={continueRound}>{battle.phase === "complete" ? "Final horn" : "Continue"}</Button> : null}
              </motion.div>
            ) : (
              <motion.div key={`stage-${battle.roundIndex}`} className={styles.battleStage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: preset.duration.transition / 1000 }}>
                <div className={styles.cardPositions}>
                  <div className={styles.playerSlot}>
                    {selected ? (
                      <motion.div layoutId={`v2-card-${selected.card.id}`} className={styles.stageCard} transition={{ duration: preset.duration.commit / 1000 }}>
                        <span className={styles.cardSide}>Your card</span>
                        <HockeyCard compact eager card={selected.card} player={selected.player} highlightedStat={{ label: situation.name, value: calculateCategoryValue(selected.card, situation) }} />
                      </motion.div>
                    ) : <div className={styles.emptySlot} aria-hidden="true"><span>Your card</span></div>}
                  </div>
                  <div className={styles.centerIce}>
                    <span>Round {battle.roundIndex + 1}</span>
                    <strong>{situation.name}</strong>
                    <p>{situation.description}</p>
                    <small>On a tie: higher OVR, then the immutable server match seed.</small>
                    {state === "awaitingAuthoritativeReveal" ? (
                      <div className={styles.revealAction}>
                        <b>Card locked in</b>
                        <p>{props.roundPlaying || snapshot.context.requestPending ? "Server is choosing and scoring the rival card…" : "The rival selection remains concealed until the server response."}</p>
                        {props.roundError ? <p className={styles.error} role="alert">{props.roundError}</p> : null}
                        <Button data-reveal-action disabled={props.roundPlaying || snapshot.context.requestPending} onClick={reveal}>{props.roundPlaying || snapshot.context.requestPending ? "Awaiting server…" : props.roundError ? "Retry reveal" : "Reveal cards"}</Button>
                      </div>
                    ) : null}
                  </div>
                  <motion.div className={styles.rivalSlot} initial={{ x: preset.distance, opacity: state === "cardCommit" ? 0 : 1 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: preset.duration.rivalEntrance / 1000 }}>
                    <div className={styles.concealedCard} aria-label="Rival card concealed"><span>RR</span><strong>Rival locked</strong><small>Identity and value hidden</small></div>
                  </motion.div>
                </div>
                {showHand ? <PlayerHand battle={battle} situation={situation} eligibleCardIds={props.eligibleCardIds} disabled={state !== "awaitingSelection"} preset={preset} onSelect={selectCard} /> : null}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {state === "matchIntro" ? <BroadcastOverlay key="intro" kicker="Rink Rivals presents" title="Five shifts. One rivalry." detail={`${battle.lineups.player.name} vs ${battle.lineups.opponent.name}`} preset={preset} /> : null}
            {state === "categoryIntro" ? <BroadcastOverlay key={`category-${battle.roundIndex}`} kicker={`Round ${battle.roundIndex + 1} category`} title={situation.name} detail={situation.description} preset={preset} /> : null}
            {state === "matchPoint" ? <BroadcastOverlay key="match-point" kicker="One shift can decide it" title="Match Point" detail={`${battle.roundWins.player} — ${battle.roundWins.opponent}`} preset={preset} /> : null}
            {state === "finalShift" ? (
              <motion.section key="final-shift" className={styles.finalShift} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: preset.duration.finalShift / 1000 }}>
                <BroadcastSting assetUrl={props.riveAssetUrl} reducedMotion={reducedMotion.reduced} />
                <span>2 — 2</span><h1>Final Shift</h1><p>Round five. The full rink narrows to one decision.</p>
              </motion.section>
            ) : null}
          </AnimatePresence>
        </main>
      </LayoutGroup>
      <p className={styles.srOnly} role="status" aria-live="assertive" aria-atomic="true">{announcement}</p>
    </div>
    </MotionConfig>
  );
}

function BroadcastOverlay({ kicker, title, detail, preset }: {
  readonly kicker: string;
  readonly title: string;
  readonly detail: string;
  readonly preset: MotionPreset;
}) {
  return (
    <motion.section
      className={styles.broadcastOverlay}
      initial={{ opacity: 0, y: -preset.distance, filter: `blur(${preset.blur}px)` }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: preset.distance / 2 }}
      transition={{ duration: preset.duration.category / 2000 }}
    >
      <span>{kicker}</span><h1>{title}</h1><p>{detail}</p>
    </motion.section>
  );
}
