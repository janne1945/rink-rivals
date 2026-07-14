import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  createBattle,
  getBattleView,
  getEligibleCards,
  selectCard,
  type AiDifficulty,
  type BattleState,
} from "../domain/battle";
import type { GameMode, Lineup } from "../domain/lineups";
import {
  AI_TIER_THRESHOLDS,
  calculateCollectionScore,
  getUnlockedAiTierIds,
  RIVALRY_REWARD_CARD_IDS,
} from "../domain/progression";
import { gameCatalog } from "../data/generated/gameCatalog";
import type { AccountActions } from "../features/account/AccountGate";
import type { AccountSnapshot } from "../features/account/types";
import { progressionFromAccount } from "../features/account/accountProgression";
import { CollectionScreen } from "../features/collection/CollectionScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { LineupsScreen } from "../features/lineup/LineupsScreen";
import { MarketScreen } from "../features/market/MarketScreen";
import { MatchScreen } from "../features/match/MatchScreen";
import { applyAuthoritativeRound } from "../features/match/authoritativeBattle";
import { ObjectiveScreen } from "../features/objectives/ObjectiveScreen";
import { PlayScreen } from "../features/play/PlayScreen";
import {
  DexieGameSaveRepository,
  type SaveGameV2,
  updateLocalState,
  withoutAccountData,
} from "../infrastructure/persistence";
import type {
  AccountLineup,
  PlayMatchRoundResult,
} from "../infrastructure/supabase";
import { createServerClockAnchor, serverTimestampAt } from "../shared/serverClock";
import { AppShell } from "./AppShell";
import { buildProgressionScreenModels } from "./progressionView";
import styles from "./App.module.css";

const repository = new DexieGameSaveRepository();
const LINEUP_SLOT_IDS = ["LW", "C", "RW", "LD", "RD", "G"] as const;

function completeLineup(lineup: AccountLineup): Lineup | null {
  if (!LINEUP_SLOT_IDS.every((slot) => lineup.slots[slot])) return null;
  return {
    id: lineup.id,
    name: lineup.name,
    mode: lineup.mode,
    slots: lineup.slots as Lineup["slots"],
  };
}

function hydrateAuthoritativeRounds(
  initialBattle: BattleState,
  clientMatchId: string,
  rounds: readonly PlayMatchRoundResult[],
): BattleState {
  let hydrated = initialBattle;
  for (const [expectedIndex, round] of rounds.entries()) {
    if (round.clientMatchId !== clientMatchId || round.roundIndex !== expectedIndex) {
      throw new Error("The server returned an invalid resumed round sequence.");
    }
    const selected = selectCard(hydrated, "player", round.playerCardId);
    hydrated = applyAuthoritativeRound({ ...selected, phase: "awaiting-reveal" }, round);
  }
  return hydrated;
}
export function GameApp({ account, actions }: {
  readonly account: AccountSnapshot;
  readonly actions: AccountActions;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [save, setSave] = useState<SaveGameV2 | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [matchClientId, setMatchClientId] = useState<string | null>(null);
  const [matchStarting, setMatchStarting] = useState(false);
  const [matchStartError, setMatchStartError] = useState("");
  const [rewardGranted, setRewardGranted] = useState(false);
  const [matchProgressionMessage, setMatchProgressionMessage] = useState("");
  const [matchSettlementError, setMatchSettlementError] = useState("");
  const [matchSettling, setMatchSettling] = useState(false);
  const [roundPlaying, setRoundPlaying] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [monotonicClock, setMonotonicClock] = useState(() => performance.now());
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  const [goalsStatus, setGoalsStatus] = useState("");
  const [fatalError, setFatalError] = useState("");
  const choiceSubmittingRef = useRef(false);
  const choiceRequestId = useRef<string | null>(null);
  const matchStartingRef = useRef(false);
  const matchSettlingRef = useRef(false);
  const roundPlayingRef = useRef(false);
  const roundRequestIds = useRef(new Map<number, string>());
  const startAttemptRef = useRef<{ id: string; mode: GameMode; difficulty: AiDifficulty } | null>(null);
  const serverClockAnchor = useMemo(
    () => createServerClockAnchor(account.market.serverTime, performance.now(), Date.now()),
    [account.market.serverTime],
  );
  const progressionClock = new Date(serverTimestampAt(serverClockAnchor, monotonicClock));

  useEffect(() => {
    let active = true;
    void repository.inspect().then(async (result) => {
      const localOnly = withoutAccountData(result.save);
      const loaded = await repository.save(localOnly);
      if (active) setSave(loaded);
    }).catch((error: unknown) => {
      if (active) setFatalError(error instanceof Error ? error.message : "The local save could not be opened.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refreshClock = () => setMonotonicClock(performance.now());
    const timer = window.setInterval(refreshClock, 60_000);
    window.addEventListener("focus", refreshClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshClock);
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/match" || battle?.phase !== "complete" || !rewardGranted) return;
    roundRequestIds.current.clear();
    setBattle(null);
    setMatchClientId(null);
  }, [battle?.phase, pathname, rewardGranted]);

  async function selectDifficulty(difficulty: AiDifficulty) {
    const cloudScore = calculateCollectionScore(
      Object.fromEntries(account.cards.map((card) => [card.cardId, { cardId: card.cardId, quantity: card.quantity, acquiredAt: card.acquiredAt }])),
      gameCatalog.cards,
    ).score;
    if (!getUnlockedAiTierIds(cloudScore, AI_TIER_THRESHOLDS).includes(difficulty)) return;
    const updated = await updateLocalState(repository, (current) => ({
      ...current,
      preferredAiDifficulty: difficulty,
    }));
    setSave(updated);
  }

  async function startMatch(mode: GameMode, difficulty: AiDifficulty) {
    if (!save || matchStartingRef.current) return;
    const cloudScore = calculateCollectionScore(
      Object.fromEntries(account.cards.map((card) => [card.cardId, { cardId: card.cardId, quantity: card.quantity, acquiredAt: card.acquiredAt }])),
      gameCatalog.cards,
    ).score;
    if (!getUnlockedAiTierIds(cloudScore, AI_TIER_THRESHOLDS).includes(difficulty)) return;
    const activeLineup = account.lineups
      .filter((candidate) => candidate.mode === mode && candidate.isActive)
      .map(completeLineup)
      .find((candidate): candidate is Lineup => Boolean(candidate));
    if (!activeLineup) return;
    matchStartingRef.current = true;
    setMatchStarting(true);
    setMatchStartError("");
    try {
      const currentAttempt = startAttemptRef.current;
      const attempt = currentAttempt?.mode === mode && currentAttempt.difficulty === difficulty
        ? currentAttempt
        : { id: crypto.randomUUID(), mode, difficulty };
      startAttemptRef.current = attempt;
      const ticket = await actions.startMatch({ clientMatchId: attempt.id, mode, difficulty });
      if (ticket.mode !== mode || ticket.difficulty !== difficulty || ticket.opponent.id !== ticket.opponentId || ticket.lineup.mode !== mode) {
        throw new Error("The server returned an inconsistent match ticket. Please start a new match.");
      }
      const initialBattle = createBattle({
        seed: ticket.seed,
        mode,
        difficulty,
        catalog: gameCatalog,
        playerLineup: ticket.lineup,
        opponentLineup: {
          id: `server-opponent:${ticket.opponent.id}`,
          name: ticket.opponent.name,
          mode: ticket.opponent.mode,
          slots: ticket.opponent.slots,
        },
        situationSequence: ticket.situations,
      });
      const nextBattle = hydrateAuthoritativeRounds(initialBattle, ticket.clientMatchId, ticket.rounds);
      startAttemptRef.current = null;
      roundRequestIds.current.clear();
      setMatchClientId(ticket.clientMatchId);
      setBattle(nextBattle);
      setRewardGranted(false);
      setMatchProgressionMessage("");
      setMatchSettlementError("");
      setRoundError("");
      navigate("/match");
      if (nextBattle.phase === "complete") void settleCompletedBattle(ticket.clientMatchId);
    } catch (error) {
      setMatchStartError(error instanceof Error ? error.message : "The match could not be started.");
    } finally {
      matchStartingRef.current = false;
      setMatchStarting(false);
    }
  }

  function chooseCard(cardId: string) {
    if (!battle || battle.phase !== "selecting") return;
    const playerSelected = selectCard(battle, "player", cardId);
    setRoundError("");
    setBattle({ ...playerSelected, phase: "awaiting-reveal" });
  }

  async function settleCompletedBattle(clientId: string | null = matchClientId) {
    if (!clientId || matchSettlingRef.current) return;
    matchSettlingRef.current = true;
    setMatchSettling(true);
    setMatchSettlementError("");
    try {
      const result = await actions.settleMatch({ clientMatchId: clientId });
      setMatchProgressionMessage(result.status === "already-settled"
        ? "This match was already settled. No reward was granted twice."
        : `Match settled on the server. +${result.rewardCredits} Credits including completed goals.`);
      setRewardGranted(true);
    } catch (error) {
      setMatchSettlementError(error instanceof Error ? error.message : "The match could not be settled.");
    } finally {
      matchSettlingRef.current = false;
      setMatchSettling(false);
    }
  }

  async function reveal() {
    if (!battle || !matchClientId || battle.phase !== "awaiting-reveal" || roundPlayingRef.current) return;
    const playerCardId = battle.pendingSelections.player;
    if (!playerCardId) return;
    roundPlayingRef.current = true;
    setRoundPlaying(true);
    setRoundError("");
    const requestId = roundRequestIds.current.get(battle.roundIndex) ?? crypto.randomUUID();
    roundRequestIds.current.set(battle.roundIndex, requestId);
    try {
      const result = await actions.playMatchRound({
        clientMatchId: matchClientId,
        roundIndex: battle.roundIndex,
        playerCardId,
        clientRequestId: requestId,
      });
      if (result.clientMatchId !== matchClientId) throw new Error("The server returned a different match.");
      const nextBattle = applyAuthoritativeRound(battle, result);
      roundRequestIds.current.delete(battle.roundIndex);
      setBattle(nextBattle);
      if (nextBattle.phase === "complete") void settleCompletedBattle();
    } catch (error) {
      setRoundError(error instanceof Error ? error.message : "The round could not be played.");
    } finally {
      roundPlayingRef.current = false;
      setRoundPlaying(false);
    }
  }

  async function chooseRivalryCard(cardId: string) {
    if (choiceSubmittingRef.current) return;
    choiceSubmittingRef.current = true;
    setChoiceSubmitting(true);
    setChoiceError("");
    setGoalsStatus("");
    try {
      if (!RIVALRY_REWARD_CARD_IDS.includes(cardId as (typeof RIVALRY_REWARD_CARD_IDS)[number])) {
        throw new Error("This card is not a valid Rivalry Road reward.");
      }
      const requestId = choiceRequestId.current ?? crypto.randomUUID();
      choiceRequestId.current = requestId;
      const result = await actions.claimRivalryReward({ clientRequestId: requestId, cardId });
      choiceRequestId.current = null;
      setGoalsStatus(result.status === "already-claimed"
        ? "Your Rivalry Road selection was already recorded. Your collection is up to date."
        : "Featured star added to your collection.");
    } catch (error) {
      setChoiceError(error instanceof Error ? error.message : "The reward card could not be added.");
    } finally {
      choiceSubmittingRef.current = false;
      setChoiceSubmitting(false);
    }
  }

  if (fatalError) {
    return <div className={styles.loading}><div className={styles.fatal}><h1>Save unavailable</h1><p>{fatalError}</p></div></div>;
  }

  if (!save) {
    return <div className={styles.loading}><div><div className={styles.puck} /><h1>Preparing the ice</h1><p>Loading your local preferences…</p></div></div>;
  }

  const cloudCollection = Object.fromEntries(account.cards.map((card) => [
    card.cardId,
    { cardId: card.cardId, quantity: card.quantity, acquiredAt: card.acquiredAt },
  ]));
  const lineups = account.lineups.map(completeLineup).filter((lineup): lineup is Lineup => Boolean(lineup));
  const activeLineupIds = {
    "nhl-circuit": account.lineups.find((lineup) => lineup.mode === "nhl-circuit" && lineup.isActive)?.id ?? "",
    "pwhl-circuit": account.lineups.find((lineup) => lineup.mode === "pwhl-circuit" && lineup.isActive)?.id ?? "",
    "open-ice": account.lineups.find((lineup) => lineup.mode === "open-ice" && lineup.isActive)?.id ?? "",
  };
  const cloudCollectionScore = calculateCollectionScore(cloudCollection, gameCatalog.cards).score;
  const cloudUnlockedDifficultyIds = getUnlockedAiTierIds(cloudCollectionScore, AI_TIER_THRESHOLDS);
  const preferredDifficulty = cloudUnlockedDifficultyIds.includes(save.preferredAiDifficulty)
    ? save.preferredAiDifficulty
    : "rookie";
  const uniqueCards = account.cards.length;
  const safeBattle = battle ? getBattleView(battle, "player") : null;
  const progressionModels = buildProgressionScreenModels(progressionFromAccount(account, progressionClock), gameCatalog, progressionClock, {
    isSubmitting: choiceSubmitting,
    errorMessage: choiceError || undefined,
  });

  return (
    <AppShell credits={account.profile.credits} displayName={account.profile.displayName} onLogout={actions.logout} logoutBusy={actions.busy} logoutError={actions.errorMessage}>
      <Routes>
        <Route path="/" element={<HomeScreen credits={account.profile.credits} uniqueCards={uniqueCards} collectionScore={cloudCollectionScore} completedMatches={account.profile.completedMatches} goals={progressionModels.goalsSummary} />} />
        <Route path="/collection" element={<CollectionScreen catalog={gameCatalog} collection={cloudCollection} />} />
        <Route path="/lineups" element={<LineupsScreen lineups={lineups} activeLineupIds={activeLineupIds} catalog={gameCatalog} collection={cloudCollection} onActivate={async (lineupId) => { await actions.activateLineup(lineupId); }} onSave={async (lineup) => { await actions.saveLineup({ lineupId: lineup.id, name: lineup.name, mode: lineup.mode, slots: lineup.slots }); }} />} />
        <Route path="/play" element={<PlayScreen lineups={lineups} activeLineupIds={activeLineupIds} collectionScore={cloudCollectionScore} preferredDifficulty={preferredDifficulty} starting={matchStarting} startError={matchStartError} onDifficultyChange={(difficulty) => void selectDifficulty(difficulty)} onStart={startMatch} />} />
        <Route path="/market" element={<MarketScreen catalog={gameCatalog} collection={cloudCollection} credits={account.profile.credits} market={account.market} onBuy={(offerId, clientRequestId) => actions.purchaseCard({ offerId, clientRequestId })} />} />
        <Route path="/objectives" element={<ObjectiveScreen dailyObjectives={progressionModels.dailyObjectives} dailyPeriodLabel={progressionModels.dailyPeriodLabel} weeklyObjective={progressionModels.weeklyObjective} weeklyPeriodLabel={progressionModels.weeklyPeriodLabel} rivalrySteps={progressionModels.rivalrySteps} rewardChoice={progressionModels.rewardChoice} statusMessage={goalsStatus || undefined} onChooseRivalryCard={(cardId) => void chooseRivalryCard(cardId)} />} />
        <Route path="/match" element={battle && safeBattle ? <MatchScreen battle={safeBattle} eligibleCardIds={getEligibleCards(battle, "player").map(({ card }) => card.id)} rewardGranted={rewardGranted} settling={matchSettling} settlementError={matchSettlementError} progressionMessage={matchProgressionMessage} roundPlaying={roundPlaying} roundError={roundError} onSelect={chooseCard} onReveal={() => void reveal()} onRetrySettlement={() => void settleCompletedBattle()} onFinish={() => navigate("/")} /> : <Navigate to="/play" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
