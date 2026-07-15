import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { applyAuthoritativeRound } from "../features/match/authoritativeBattle";
import {
  clearActiveMatchSession,
  readActiveMatchSession,
  updateActiveMatchSession,
  writeActiveMatchSession,
} from "../features/match-experience/activeMatchSession";
import { ObjectiveScreen } from "../features/objectives/ObjectiveScreen";
import { PlayScreen } from "../features/play/PlayScreen";
import { ChallengeSetupScreen } from "../features/rivalry-challenges/ChallengeSetupScreen";
import { RivalryInboxScreen } from "../features/rivalry-challenges/RivalryInboxScreen";
import {
  DexieGameSaveRepository,
  type SaveGameV2,
  updateLocalState,
  withoutAccountData,
} from "../infrastructure/persistence";
import type {
  AccountLineup,
  PlayMatchRoundResult,
  StartMatchResult,
} from "../infrastructure/supabase";
import { formatRivalryPoints } from "../shared/rivalryPoints";
import { createServerClockAnchor, serverTimestampAt } from "../shared/serverClock";
import { AppShell } from "./AppShell";
import { buildProgressionScreenModels } from "./progressionView";
import styles from "./App.module.css";

const repository = new DexieGameSaveRepository();
const LINEUP_SLOT_IDS = ["LW", "C", "RW", "LD", "RD", "G"] as const;
const MatchExperienceV2 = lazy(async () => {
  const module = await import("../features/match-experience/MatchExperienceV2");
  return { default: module.MatchExperienceV2 };
});
const LiveGhostScreen = lazy(async () => {
  const module = await import("../features/live-rivalry/LiveGhostScreen");
  return { default: module.LiveGhostScreen };
});
const SeasonLockerScreen = lazy(async () => {
  const module = await import("../features/season/SeasonLockerScreen");
  return { default: module.SeasonLockerScreen };
});

type MatchSource = { readonly kind: "ai" } | { readonly kind: "arena" } | {
  readonly kind: "ghost-challenge";
  readonly slug: string;
  readonly lineupId: string;
};

function completeLineup(lineup: AccountLineup): Lineup | null {
  if (!LINEUP_SLOT_IDS.every((slot) => lineup.slots[slot])) return null;
  return {
    id: lineup.id,
    name: lineup.name,
    mode: lineup.mode,
    slots: lineup.slots as Lineup["slots"],
  };
}

function withAuthoritativeOpponentReveal(
  state: BattleState,
  round: PlayMatchRoundResult,
  maskedOpponent: boolean,
): BattleState {
  if (state.lineups.opponent.cards.some(({ card, slot }) => card.id === round.opponentCardId && slot === round.opponentSlot)) {
    return state;
  }
  if (!maskedOpponent) {
    throw new Error("The server returned a card outside the match snapshot.");
  }
  const card = gameCatalog.cards.find((candidate) => candidate.id === round.opponentCardId);
  const player = card && gameCatalog.players.find((candidate) => candidate.id === card.playerId);
  const slotExists = state.lineups.opponent.cards.some(({ slot }) => slot === round.opponentSlot);
  if (!card || !player || !slotExists) {
    throw new Error("The server revealed a card outside the local game catalog.");
  }
  return {
    ...state,
    lineups: {
      ...state.lineups,
      opponent: {
        ...state.lineups.opponent,
        cards: state.lineups.opponent.cards.map((entry) => entry.slot === round.opponentSlot
          ? { slot: round.opponentSlot, card, player }
          : entry),
      },
    },
  };
}

function hydrateAuthoritativeRounds(
  initialBattle: BattleState,
  clientMatchId: string,
  rounds: readonly PlayMatchRoundResult[],
  maskedOpponent: boolean,
): BattleState {
  let hydrated = initialBattle;
  for (const [expectedIndex, round] of rounds.entries()) {
    if (round.clientMatchId !== clientMatchId || round.roundIndex !== expectedIndex) {
      throw new Error("The server returned an invalid resumed round sequence.");
    }
    const selected = selectCard(hydrated, "player", round.playerCardId);
    hydrated = applyAuthoritativeRound(
      withAuthoritativeOpponentReveal({ ...selected, phase: "awaiting-reveal" }, round, maskedOpponent),
      round,
    );
  }
  return hydrated;
}

function battleFromTicket(ticket: StartMatchResult, mode: GameMode, difficulty: AiDifficulty, maskedOpponent = false): BattleState {
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
  return hydrateAuthoritativeRounds(initialBattle, ticket.clientMatchId, ticket.rounds, maskedOpponent);
}

function ChallengeRoute(props: {
  readonly lineups: readonly AccountLineup[];
  readonly starting: boolean;
  readonly errorMessage: string;
  readonly onAccept: (slug: string, lineupId: string) => void;
  readonly onLoad: AccountActions["loadPublicRivalryChallenge"];
}) {
  const { slug = "" } = useParams();
  if (!/^[0-9a-f]{32}$/i.test(slug)) return <Navigate to="/" replace />;
  return <ChallengeSetupScreen {...props} slug={slug.toLowerCase()} onAccept={(lineupId) => props.onAccept(slug.toLowerCase(), lineupId)} />;
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
  const [matchSource, setMatchSource] = useState<MatchSource>({ kind: "ai" });
  const [matchRestored, setMatchRestored] = useState(false);
  const [matchStarting, setMatchStarting] = useState(false);
  const [matchStartError, setMatchStartError] = useState("");
  const [rewardGranted, setRewardGranted] = useState(false);
  const [matchProgressionMessage, setMatchProgressionMessage] = useState("");
  const [matchSettlementError, setMatchSettlementError] = useState("");
  const [matchSettling, setMatchSettling] = useState(false);
  const [roundPlaying, setRoundPlaying] = useState(false);
  const [reviewingRound, setReviewingRound] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [monotonicClock, setMonotonicClock] = useState(() => performance.now());
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  const [goalsStatus, setGoalsStatus] = useState("");
  const [fatalError, setFatalError] = useState("");
  const choiceSubmittingRef = useRef(false);
  const choiceRequestId = useRef<string | null>(null);
  const matchStartingRef = useRef(false);
  const matchResumingRef = useRef(false);
  const matchSettlingRef = useRef(false);
  const roundPlayingRef = useRef(false);
  const roundRequestIds = useRef(new Map<number, string>());
  const startAttemptRef = useRef<{ id: string; mode: GameMode; difficulty: AiDifficulty } | null>(null);
  const arenaStartAttemptRef = useRef<{ id: string; mode: GameMode } | null>(null);
  const ghostStartAttemptRef = useRef<{ id: string; slug: string; lineupId: string } | null>(null);
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

  useEffect(() => {
    if (pathname !== "/match" || !save || battle || matchResumingRef.current) return;
    const session = readActiveMatchSession();
    if (!session) {
      navigate("/play", { replace: true });
      return;
    }
    if (session.completedBattle) {
      setMatchClientId(session.clientMatchId);
      setMatchSource(session.source);
      setBattle(session.completedBattle);
      setReviewingRound(false);
      setMatchRestored(true);
      void settleCompletedBattle(session.clientMatchId, session.source);
      return;
    }
    let active = true;
    matchResumingRef.current = true;
    setMatchStarting(true);
    setMatchStartError("");
    const resume = session.source.kind === "ai"
      ? actions.startMatch({ clientMatchId: session.clientMatchId, mode: session.mode, difficulty: session.difficulty })
      : session.source.kind === "arena"
        ? actions.startArenaMatch({ clientMatchId: session.clientMatchId, mode: session.mode })
        : actions.startRivalryChallenge({ slug: session.source.slug, clientMatchId: session.clientMatchId, lineupId: session.source.lineupId });
    void resume
      .then((ticket) => {
        if (!active) return;
        let resumed = battleFromTicket(ticket, session.mode, session.difficulty, session.source.kind !== "ai");
        const serverPassedPendingRound = session.pendingSelection && ticket.rounds.length > session.pendingSelection.roundIndex;
        if (session.pendingSelection && !serverPassedPendingRound && resumed.phase === "selecting" && resumed.roundIndex === session.pendingSelection.roundIndex) {
          resumed = { ...selectCard(resumed, "player", session.pendingSelection.cardId), phase: "awaiting-reveal" };
        }
        setMatchClientId(ticket.clientMatchId);
        setMatchSource(session.source);
        setBattle(resumed);
        setReviewingRound(Boolean(ticket.rounds.length && (session.reviewingRound || serverPassedPendingRound) && resumed.phase !== "complete"));
        setMatchRestored(true);
        setRoundError("");
        writeActiveMatchSession({
          ...session,
          clientMatchId: ticket.clientMatchId,
          pendingSelection: serverPassedPendingRound ? undefined : session.pendingSelection,
          reviewingRound: Boolean(ticket.rounds.length && (session.reviewingRound || serverPassedPendingRound) && resumed.phase !== "complete"),
        });
        if (resumed.phase === "complete") void settleCompletedBattle(ticket.clientMatchId, session.source);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMatchStartError(error instanceof Error ? error.message : "The active match could not be restored.");
        navigate("/play", { replace: true });
      })
      .finally(() => {
        matchResumingRef.current = false;
        if (active) setMatchStarting(false);
      });
    return () => { active = false; };
  }, [actions, battle, navigate, pathname, save]);

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
      const nextBattle = battleFromTicket(ticket, mode, difficulty);
      startAttemptRef.current = null;
      roundRequestIds.current.clear();
      setMatchClientId(ticket.clientMatchId);
      setMatchSource({ kind: "ai" });
      setBattle(nextBattle);
      setMatchRestored(ticket.rounds.length > 0);
      setRewardGranted(false);
      setMatchProgressionMessage("");
      setMatchSettlementError("");
      setRoundError("");
      setReviewingRound(false);
      writeActiveMatchSession({
        version: 2,
        clientMatchId: ticket.clientMatchId,
        mode,
        difficulty,
        source: { kind: "ai" },
        reviewingRound: false,
      });
      navigate("/match");
      if (nextBattle.phase === "complete") void settleCompletedBattle(ticket.clientMatchId, { kind: "ai" });
    } catch (error) {
      setMatchStartError(error instanceof Error ? error.message : "The match could not be started.");
    } finally {
      matchStartingRef.current = false;
      setMatchStarting(false);
    }
  }

  async function startArenaMatch(mode: GameMode) {
    if (!save || matchStartingRef.current) return;
    const activeLineup = account.lineups
      .filter((candidate) => candidate.mode === mode && candidate.isActive)
      .map(completeLineup)
      .find((candidate): candidate is Lineup => Boolean(candidate));
    if (!activeLineup) return;
    matchStartingRef.current = true;
    setMatchStarting(true);
    setMatchStartError("");
    try {
      const currentAttempt = arenaStartAttemptRef.current;
      const attempt = currentAttempt?.mode === mode ? currentAttempt : { id: crypto.randomUUID(), mode };
      arenaStartAttemptRef.current = attempt;
      const ticket = await actions.startArenaMatch({ clientMatchId: attempt.id, mode });
      const nextBattle = battleFromTicket(ticket, mode, "pro", true);
      arenaStartAttemptRef.current = null;
      roundRequestIds.current.clear();
      setMatchClientId(ticket.clientMatchId);
      setMatchSource({ kind: "arena" });
      setBattle(nextBattle);
      setMatchRestored(ticket.rounds.length > 0);
      setRewardGranted(false);
      setMatchProgressionMessage("");
      setMatchSettlementError("");
      setRoundError("");
      setReviewingRound(false);
      writeActiveMatchSession({
        version: 2,
        clientMatchId: ticket.clientMatchId,
        mode,
        difficulty: "pro",
        source: { kind: "arena" },
        reviewingRound: false,
      });
      navigate("/match");
      if (nextBattle.phase === "complete") void settleCompletedBattle(ticket.clientMatchId, { kind: "arena" });
    } catch (error) {
      setMatchStartError(error instanceof Error ? error.message : "Rivalry Arena could not find a valid rival.");
    } finally {
      matchStartingRef.current = false;
      setMatchStarting(false);
    }
  }

  async function startGhostChallenge(slug: string, lineupId: string) {
    if (!save || matchStartingRef.current) return;
    matchStartingRef.current = true;
    setMatchStarting(true);
    setMatchStartError("");
    const currentAttempt = ghostStartAttemptRef.current;
    const attempt = currentAttempt?.slug === slug && currentAttempt.lineupId === lineupId
      ? currentAttempt
      : { id: crypto.randomUUID(), slug, lineupId };
    ghostStartAttemptRef.current = attempt;
    const clientMatchId = attempt.id;
    const source: MatchSource = { kind: "ghost-challenge", slug, lineupId };
    try {
      const ticket = await actions.startRivalryChallenge({ slug, clientMatchId, lineupId });
      const nextBattle = battleFromTicket(ticket, ticket.mode, ticket.difficulty, true);
      ghostStartAttemptRef.current = null;
      roundRequestIds.current.clear();
      setMatchClientId(ticket.clientMatchId);
      setMatchSource(source);
      setBattle(nextBattle);
      setMatchRestored(ticket.rounds.length > 0);
      setRewardGranted(false);
      setMatchProgressionMessage("");
      setMatchSettlementError("");
      setRoundError("");
      setReviewingRound(false);
      writeActiveMatchSession({
        version: 2,
        clientMatchId: ticket.clientMatchId,
        mode: ticket.mode,
        difficulty: ticket.difficulty,
        source,
        reviewingRound: false,
      });
      navigate("/match");
      if (nextBattle.phase === "complete") void settleCompletedBattle(ticket.clientMatchId, source);
    } catch (error) {
      setMatchStartError(error instanceof Error ? error.message : "The Ghost Rivalry could not be started.");
    } finally {
      matchStartingRef.current = false;
      setMatchStarting(false);
    }
  }

  function chooseCard(cardId: string) {
    if (!battle || battle.phase !== "selecting" || reviewingRound) return;
    const playerSelected = selectCard(battle, "player", cardId);
    if (pathname === "/match") {
      updateActiveMatchSession((session) => ({
        ...session,
        pendingSelection: { cardId, roundIndex: battle.roundIndex },
        reviewingRound: false,
      }));
    }
    setRoundError("");
    setBattle({ ...playerSelected, phase: "awaiting-reveal" });
  }

  async function settleCompletedBattle(clientId: string | null = matchClientId, source: MatchSource = matchSource) {
    if (!clientId || matchSettlingRef.current) return;
    matchSettlingRef.current = true;
    setMatchSettling(true);
    setMatchSettlementError("");
    try {
      if (source.kind === "ghost-challenge") {
        const result = await actions.settleRivalryChallenge({ clientMatchId: clientId });
        setMatchProgressionMessage(result.status === "already-settled"
          ? `Ghost Rivalry already secured: ${result.playerWins}–${result.ghostWins}. No rewards were duplicated.`
          : `Ghost Rivalry secured: ${result.playerWins}–${result.ghostWins}. No Credits, cards, goals, or progression were awarded.`);
      } else if (source.kind === "arena") {
        const result = await actions.settleArenaMatch({ clientMatchId: clientId });
        setMatchProgressionMessage(result.status === "already-settled"
          ? "This Arena match was already settled. No reward or Season XP was duplicated."
          : `Arena settled against a real club lineup. +${formatRivalryPoints(result.rewardCredits)} plus goals and Season XP.`);
      } else {
        const result = await actions.settleMatch({ clientMatchId: clientId });
        setMatchProgressionMessage(result.status === "already-settled"
          ? "This match was already settled. No reward was granted twice."
          : `Match settled on the server. +${formatRivalryPoints(result.rewardCredits)} including completed goals.`);
      }
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
      const roundInput = {
        clientMatchId: matchClientId,
        roundIndex: battle.roundIndex,
        playerCardId,
        clientRequestId: requestId,
      };
      const result = matchSource.kind === "ghost-challenge"
        ? await actions.playRivalryChallengeRound(roundInput)
        : matchSource.kind === "arena"
          ? await actions.playArenaMatchRound(roundInput)
          : await actions.playMatchRound(roundInput);
      if (result.clientMatchId !== matchClientId) throw new Error("The server returned a different match.");
      const nextBattle = applyAuthoritativeRound(
        withAuthoritativeOpponentReveal(battle, result, matchSource.kind !== "ai"),
        result,
      );
      roundRequestIds.current.delete(battle.roundIndex);
      setBattle(nextBattle);
      setReviewingRound(nextBattle.phase !== "complete");
      if (pathname === "/match") {
        updateActiveMatchSession((session) => ({
          ...session,
          pendingSelection: undefined,
          reviewingRound: nextBattle.phase !== "complete",
          completedBattle: nextBattle.phase === "complete" ? nextBattle : undefined,
        }));
      }
      if (nextBattle.phase === "complete") void settleCompletedBattle(matchClientId, matchSource);
    } catch (error) {
      setRoundError(error instanceof Error ? error.message : "The round could not be played.");
    } finally {
      roundPlayingRef.current = false;
      setRoundPlaying(false);
    }
  }

  function continueRound() {
    setReviewingRound(false);
    if (pathname === "/match") {
      updateActiveMatchSession((session) => ({ ...session, reviewingRound: false }));
    }
  }

  function finishV2(destination: "/play" | "/") {
    clearActiveMatchSession();
    navigate(destination);
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
  const eligibleCardIds = battle && !reviewingRound
    ? getEligibleCards(battle, "player").map(({ card }) => card.id)
    : [];
  const progressionModels = buildProgressionScreenModels(progressionFromAccount(account, progressionClock), gameCatalog, progressionClock, {
    isSubmitting: choiceSubmitting,
    errorMessage: choiceError || undefined,
  });

  return (
    <AppShell credits={account.profile.credits} displayName={account.profile.displayName} seasonXp={account.season.xp} onLogout={actions.logout} logoutBusy={actions.busy} logoutError={actions.errorMessage} immersive={pathname === "/match"}>
      <Routes>
        <Route path="/" element={<HomeScreen credits={account.profile.credits} uniqueCards={uniqueCards} collectionScore={cloudCollectionScore} completedMatches={account.profile.completedMatches} seasonXp={account.season.xp} goals={progressionModels.goalsSummary} />} />
        <Route path="/collection" element={<CollectionScreen catalog={gameCatalog} collection={cloudCollection} />} />
        <Route path="/lineups" element={<LineupsScreen lineups={lineups} activeLineupIds={activeLineupIds} catalog={gameCatalog} collection={cloudCollection} onActivate={async (lineupId) => { await actions.activateLineup(lineupId); }} onSave={async (lineup) => { await actions.saveLineup({ lineupId: lineup.id, name: lineup.name, mode: lineup.mode, slots: lineup.slots }); }} />} />
        <Route path="/play" element={<PlayScreen lineups={lineups} activeLineupIds={activeLineupIds} collectionScore={cloudCollectionScore} preferredDifficulty={preferredDifficulty} seasonProgress={{ xp: account.season.xp, unlockedRewards: account.season.rewards.filter((reward) => reward.unlocked).length, totalRewards: account.season.rewards.length, maxXp: account.season.rewards.at(-1)?.xpRequired ?? 3_000 }} starting={matchStarting} startError={matchStartError} onDifficultyChange={(difficulty) => void selectDifficulty(difficulty)} onStart={startMatch} onStartArena={startArenaMatch} onOpenLive={() => navigate("/ghost")} onOpenSeason={() => navigate("/season")} />} />
        <Route path="/ghost" element={(
          <Suspense fallback={<div className={styles.loading}><div><div className={styles.puck} /><h1>Opening Live Ghost</h1><p>Restoring your private room…</p></div></div>}>
            <LiveGhostScreen lineups={account.lineups} catalog={gameCatalog} actions={actions} />
          </Suspense>
        )} />
        <Route path="/season" element={(
          <Suspense fallback={<div className={styles.loading}><div><div className={styles.puck} /><h1>Opening Season Locker</h1><p>Loading the reward path…</p></div></div>}>
            <SeasonLockerScreen locker={account.season} catalog={gameCatalog} onClaim={(seasonId, tier, clientRequestId) => actions.claimSeasonReward({ seasonId, tier, clientRequestId })} />
          </Suspense>
        )} />
        <Route path="/market" element={<MarketScreen catalog={gameCatalog} collection={cloudCollection} credits={account.profile.credits} market={account.market} onBuy={(offerId, clientRequestId) => actions.purchaseCard({ offerId, clientRequestId })} />} />
        <Route path="/objectives" element={<ObjectiveScreen dailyObjectives={progressionModels.dailyObjectives} dailyPeriodLabel={progressionModels.dailyPeriodLabel} weeklyObjective={progressionModels.weeklyObjective} weeklyPeriodLabel={progressionModels.weeklyPeriodLabel} rivalrySteps={progressionModels.rivalrySteps} rewardChoice={progressionModels.rewardChoice} statusMessage={goalsStatus || undefined} onChooseRivalryCard={(cardId) => void chooseRivalryCard(cardId)} />} />
        <Route path="/accept/:slug" element={<ChallengeRoute lineups={account.lineups} starting={matchStarting} errorMessage={matchStartError} onAccept={(slug, lineupId) => void startGhostChallenge(slug, lineupId)} onLoad={actions.loadPublicRivalryChallenge} />} />
        <Route path="/rivalries" element={<RivalryInboxScreen onLoad={actions.listRivalryChallenges} onRevoke={actions.revokeRivalryChallenge} />} />
        <Route path="/match" element={battle && safeBattle ? (
            <Suspense fallback={<div className={styles.loading}><div><div className={styles.puck} /><h1>Opening broadcast</h1><p>Preparing the live arena…</p></div></div>}>
              <MatchExperienceV2
                battle={safeBattle}
                eligibleCardIds={eligibleCardIds}
                rewardGranted={rewardGranted}
                settling={matchSettling}
                settlementError={matchSettlementError}
                progressionMessage={matchProgressionMessage}
                roundPlaying={roundPlaying}
                reviewingRound={reviewingRound}
                restored={matchRestored}
                roundError={roundError}
                onSelect={chooseCard}
                onReveal={() => void reveal()}
                onContinue={continueRound}
                onRetrySettlement={() => void settleCompletedBattle(matchClientId, matchSource)}
                onPlayAgain={() => finishV2("/play")}
                onFinish={() => finishV2("/")}
                onExit={() => navigate("/play")}
              />
            </Suspense>
          ) : <div className={styles.loading}><div><div className={styles.puck} /><h1>Restoring the broadcast</h1><p>Checking the active server match…</p></div></div>} />
        <Route path="/match-v2" element={<Navigate to="/match" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
