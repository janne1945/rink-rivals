import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  createBattle,
  getBattleView,
  getEligibleCards,
  revealRound,
  selectAiCard,
  selectCard,
  type AiDifficulty,
  type BattleState,
} from "../domain/battle";
import { type CardOffer } from "../domain/economy";
import type { GameMode, Lineup } from "../domain/lineups";
import {
  AI_TIER_THRESHOLDS,
  calculateCollectionScore,
  getUnlockedAiTierIds,
  RIVALRY_REWARD_CARD_IDS,
  type MatchOutcome,
} from "../domain/progression";
import { createBaseMarket, createEventShopRotation } from "../domain/shop";
import { gameCatalog } from "../data/generated/gameCatalog";
import { AccountGate } from "../features/account/AccountGate";
import type { AccountSnapshot } from "../features/account/types";
import { progressionFromAccount } from "../features/account/accountProgression";
import { CollectionScreen } from "../features/collection/CollectionScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { LineupsScreen } from "../features/lineup/LineupsScreen";
import { MarketScreen } from "../features/market/MarketScreen";
import { MatchScreen } from "../features/match/MatchScreen";
import { ObjectiveScreen } from "../features/objectives/ObjectiveScreen";
import { PlayScreen } from "../features/play/PlayScreen";
import {
  DexieGameSaveRepository,
  type SaveGameV2,
  updateLocalState,
  withoutAccountData,
} from "../infrastructure/persistence";
import {
  createAccountRepository,
  createAuthService,
  type SettleMatchInput,
  type SettleMatchResult,
} from "../infrastructure/supabase";
import { AppShell } from "./AppShell";
import { buildProgressionScreenModels } from "./progressionView";
import styles from "./App.module.css";

const repository = new DexieGameSaveRepository();
const accountRepository = createAccountRepository();
const authService = createAuthService();
const baseMarket = createBaseMarket(gameCatalog.cards);
const rivalryRewardCardIds = new Set<string>(RIVALRY_REWARD_CARD_IDS);
const eventRotation = createEventShopRotation(
  {
    seed: "rink-rivals-event-2026",
    eventSetId: "rivalry-series-2026",
    periodDays: 7,
    offerCount: 5,
    spotlightDiscountPercent: 15,
  },
  gameCatalog.cards.filter((card) => !rivalryRewardCardIds.has(card.id)),
  new Date(),
);

function outcomeFor(battle: BattleState): MatchOutcome {
  if (battle.winner === "player") return "win";
  if (battle.winner === "tie") return "draw";
  return "loss";
}

export function App() {
  return (
    <AccountGate auth={authService} repository={accountRepository}>
      {(account, actions) => <GameApp account={account} onLogout={actions.logout} onSettleMatch={actions.settleMatch} />}
    </AccountGate>
  );
}

function GameApp({ account, onLogout, onSettleMatch }: {
  readonly account: AccountSnapshot;
  readonly onLogout: () => Promise<void>;
  readonly onSettleMatch: (input: SettleMatchInput) => Promise<SettleMatchResult>;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [save, setSave] = useState<SaveGameV2 | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [rewardGranted, setRewardGranted] = useState(false);
  const [matchProgressionMessage, setMatchProgressionMessage] = useState("");
  const [matchSettlementError, setMatchSettlementError] = useState("");
  const [matchSettling, setMatchSettling] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  const [goalsStatus, setGoalsStatus] = useState("");
  const [fatalError, setFatalError] = useState("");

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
    const refreshClock = () => setClock(new Date());
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

  async function rejectCloudLineupWrite(_lineup: Lineup): Promise<void> {
    throw new Error("Server-backed lineup editing is not available yet.");
  }

  async function rejectCloudPurchase(_offer: CardOffer): Promise<string> {
    return "Server-backed purchases are not available yet. No Credits were charged.";
  }

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

  function startMatch(mode: GameMode, difficulty: AiDifficulty) {
    if (!save) return;
    const cloudScore = calculateCollectionScore(
      Object.fromEntries(account.cards.map((card) => [card.cardId, { cardId: card.cardId, quantity: card.quantity, acquiredAt: card.acquiredAt }])),
      gameCatalog.cards,
    ).score;
    if (!getUnlockedAiTierIds(cloudScore, AI_TIER_THRESHOLDS).includes(difficulty)) return;
    const cloudLineup = account.activeLineup?.mode === mode
      && ["LW", "C", "RW", "LD", "RD", "G"].every((slot) => account.activeLineup?.slots[slot as keyof typeof account.activeLineup.slots])
      ? { id: account.activeLineup.id, name: account.activeLineup.name, mode, slots: account.activeLineup.slots as Lineup["slots"] }
      : undefined;
    const lineup = cloudLineup;
    if (!lineup) return;
    const nextBattle = createBattle({
      seed: crypto.randomUUID(),
      mode,
      difficulty,
      catalog: gameCatalog,
      playerLineup: lineup,
      opponentLineup: lineup,
    });
    setBattle(nextBattle);
    setRewardGranted(false);
    setMatchProgressionMessage("");
    setMatchSettlementError("");
    navigate("/match");
  }

  function chooseCard(cardId: string) {
    if (!battle || battle.phase !== "selecting") return;
    const playerSelected = selectCard(battle, "player", cardId);
    setBattle(selectAiCard(playerSelected));
  }

  async function settleCompletedBattle(completedBattle: BattleState) {
    setMatchSettling(true);
    setMatchSettlementError("");
    try {
      const result = await onSettleMatch({
        clientMatchId: completedBattle.id,
        mode: completedBattle.mode,
        difficulty: completedBattle.difficulty,
        outcome: outcomeFor(completedBattle),
      });
      setMatchProgressionMessage(result.status === "already-settled"
        ? "This match was already settled. No reward was granted twice."
        : `Match settled on the server. +${result.rewardCredits} Credits including completed goals.`);
      setRewardGranted(true);
    } catch (error) {
      setMatchSettlementError(error instanceof Error ? error.message : "The match could not be settled.");
    } finally {
      setMatchSettling(false);
    }
  }

  function reveal() {
    if (!battle) return;
    const nextBattle = revealRound(battle);
    setBattle(nextBattle);
    if (nextBattle.phase === "complete") {
      void settleCompletedBattle(nextBattle);
    }
  }

  async function chooseRivalryCard(cardId: string) {
    setChoiceSubmitting(true);
    setChoiceError("");
    setGoalsStatus("");
    try {
      if (!RIVALRY_REWARD_CARD_IDS.includes(cardId as (typeof RIVALRY_REWARD_CARD_IDS)[number])) {
        throw new Error("This card is not a valid Rivalry Road reward.");
      }
      throw new Error("Server-backed reward claiming is not available yet. Your collection was not changed.");
    } catch (error) {
      setChoiceError(error instanceof Error ? error.message : "The reward card could not be added.");
    } finally {
      setChoiceSubmitting(false);
    }
  }

  if (fatalError) {
    return <div className={styles.loading}><div className={styles.fatal}><h1>Save unavailable</h1><p>{fatalError}</p></div></div>;
  }

  if (!save) {
    return <div className={styles.loading}><div><div className={styles.puck} /><h1>Preparing the ice</h1><p>Loading your local collection…</p></div></div>;
  }

  const cloudCollection = Object.fromEntries(account.cards.map((card) => [
    card.cardId,
    { cardId: card.cardId, quantity: card.quantity, acquiredAt: card.acquiredAt },
  ]));
  const cloudLineup = account.activeLineup && ["LW", "C", "RW", "LD", "RD", "G"].every((slot) => account.activeLineup?.slots[slot as keyof typeof account.activeLineup.slots])
    ? {
        id: account.activeLineup.id,
        name: account.activeLineup.name,
        mode: account.activeLineup.mode,
        slots: account.activeLineup.slots as Lineup["slots"],
      }
    : null;
  const lineups = cloudLineup ? [cloudLineup] : [];
  const activeLineupIds = {
    "nhl-circuit": cloudLineup?.mode === "nhl-circuit" ? cloudLineup.id : null,
    "pwhl-circuit": cloudLineup?.mode === "pwhl-circuit" ? cloudLineup.id : null,
    "open-ice": cloudLineup?.mode === "open-ice" ? cloudLineup.id : null,
  };
  const cloudCollectionScore = calculateCollectionScore(cloudCollection, gameCatalog.cards).score;
  const cloudUnlockedDifficultyIds = getUnlockedAiTierIds(cloudCollectionScore, AI_TIER_THRESHOLDS);
  const preferredDifficulty = cloudUnlockedDifficultyIds.includes(save.preferredAiDifficulty)
    ? save.preferredAiDifficulty
    : "rookie";
  const uniqueCards = account.cards.length;
  const safeBattle = battle ? getBattleView(battle, "player") : null;
  const serverProgressionClock = new Date(
    clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate(),
    clock.getUTCHours(), clock.getUTCMinutes(), clock.getUTCSeconds(), clock.getUTCMilliseconds(),
  );
  const progressionModels = buildProgressionScreenModels(progressionFromAccount(account, clock), gameCatalog, serverProgressionClock, {
    isSubmitting: choiceSubmitting,
    errorMessage: choiceError || undefined,
  });

  return (
    <AppShell credits={account.profile.credits} displayName={account.profile.displayName} onLogout={onLogout}>
      <Routes>
        <Route path="/" element={<HomeScreen credits={account.profile.credits} uniqueCards={uniqueCards} collectionScore={cloudCollectionScore} completedMatches={account.profile.completedMatches} goals={progressionModels.goalsSummary} />} />
        <Route path="/collection" element={<CollectionScreen catalog={gameCatalog} collection={cloudCollection} />} />
        <Route path="/lineups" element={<LineupsScreen lineups={lineups} activeLineupIds={Object.fromEntries(Object.entries(activeLineupIds).map(([mode, id]) => [mode, id ?? ""]))} catalog={gameCatalog} collection={cloudCollection} onActivate={() => undefined} onSave={rejectCloudLineupWrite} />} />
        <Route path="/play" element={<PlayScreen lineups={lineups} activeLineupIds={Object.fromEntries(Object.entries(activeLineupIds).map(([mode, id]) => [mode, id ?? ""]))} collectionScore={cloudCollectionScore} preferredDifficulty={preferredDifficulty} onDifficultyChange={(difficulty) => void selectDifficulty(difficulty)} onStart={startMatch} />} />
        <Route path="/market" element={<MarketScreen catalog={gameCatalog} collection={cloudCollection} credits={account.profile.credits} baseOffers={baseMarket.offers} eventRotation={eventRotation} onBuy={rejectCloudPurchase} />} />
        <Route path="/objectives" element={<ObjectiveScreen dailyObjectives={progressionModels.dailyObjectives} dailyPeriodLabel={progressionModels.dailyPeriodLabel} weeklyObjective={progressionModels.weeklyObjective} weeklyPeriodLabel={progressionModels.weeklyPeriodLabel} rivalrySteps={progressionModels.rivalrySteps} rewardChoice={progressionModels.rewardChoice} statusMessage={goalsStatus || undefined} onChooseRivalryCard={(cardId) => void chooseRivalryCard(cardId)} />} />
        <Route path="/match" element={battle && safeBattle ? <MatchScreen battle={safeBattle} eligibleCardIds={getEligibleCards(battle, "player").map(({ card }) => card.id)} rewardGranted={rewardGranted} settling={matchSettling} settlementError={matchSettlementError} progressionMessage={matchProgressionMessage} onSelect={chooseCard} onReveal={reveal} onRetrySettlement={() => void settleCompletedBattle(battle)} onFinish={() => navigate("/")} /> : <Navigate to="/play" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
