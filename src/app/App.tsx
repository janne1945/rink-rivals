import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  createBattle,
  getBattleView,
  getEligibleCards,
  getMatchRewardCredits,
  revealRound,
  selectAiCard,
  selectCard,
  type AiDifficulty,
  type BattleState,
} from "../domain/battle";
import { grantMatchReward, purchaseCard, type CardOffer } from "../domain/economy";
import type { GameMode, Lineup } from "../domain/lineups";
import {
  AI_TIER_THRESHOLDS,
  applyProgressionEvent,
  chooseRivalryRoadCard,
  calculateCollectionScore,
  getUnlockedAiTierIds,
  RIVALRY_REWARD_CARD_IDS,
  type MatchOutcome,
  type ProgressionReward,
} from "../domain/progression";
import { createBaseMarket, createEventShopRotation } from "../domain/shop";
import { gameCatalog, starterLineups } from "../data/generated/gameCatalog";
import { AccountGate } from "../features/account/AccountGate";
import type { AccountSnapshot } from "../features/account/types";
import { CollectionScreen } from "../features/collection/CollectionScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { LineupsScreen } from "../features/lineup/LineupsScreen";
import { MarketScreen } from "../features/market/MarketScreen";
import { MatchScreen } from "../features/match/MatchScreen";
import { ObjectiveScreen } from "../features/objectives/ObjectiveScreen";
import { PlayScreen } from "../features/play/PlayScreen";
import {
  createDefaultSaveGame,
  DexieGameSaveRepository,
  type SaveGameV2,
} from "../infrastructure/persistence";
import {
  createAccountRepository,
  createAuthService,
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

function scoreFor(save: SaveGameV2): number {
  return calculateCollectionScore(save.collection, gameCatalog.cards).score;
}

function createStarterSave(): SaveGameV2 {
  const save = createDefaultSaveGame();
  const acquiredAt = new Date().toISOString();
  for (const lineup of starterLineups) {
    save.lineups[lineup.id] = { ...lineup, slots: { ...lineup.slots } };
    save.activeLineupIds[lineup.mode] = lineup.id;
    for (const cardId of Object.values(lineup.slots)) {
      if (!save.collection[cardId]) save.collection[cardId] = { cardId, quantity: 1, acquiredAt };
    }
  }
  save.collectionScore = scoreFor(save);
  save.unlockedAiTierIds = getUnlockedAiTierIds(save.collectionScore, AI_TIER_THRESHOLDS);
  save.preferredAiDifficulty = save.unlockedAiTierIds.includes("pro") ? "pro" : "rookie";
  return save;
}

function addStarterContent(save: SaveGameV2): SaveGameV2 {
  if (Object.keys(save.lineups).length > 0) return save;

  const starter = createStarterSave();
  const collection = { ...starter.collection, ...save.collection };
  const collectionScore = calculateCollectionScore(collection, gameCatalog.cards).score;
  const unlockedAiTierIds = getUnlockedAiTierIds(collectionScore, AI_TIER_THRESHOLDS);
  return {
    ...save,
    collection,
    lineups: starter.lineups,
    activeLineupIds: starter.activeLineupIds,
    collectionScore,
    unlockedAiTierIds,
    preferredAiDifficulty: unlockedAiTierIds.includes(save.preferredAiDifficulty)
      ? save.preferredAiDifficulty
      : unlockedAiTierIds.includes("pro")
        ? "pro"
        : "rookie",
  };
}

function outcomeFor(battle: BattleState): MatchOutcome {
  if (battle.winner === "player") return "win";
  if (battle.winner === "tie") return "draw";
  return "loss";
}

function creditTotal(rewards: readonly ProgressionReward[]): number {
  return rewards.reduce((total, reward) => total + (reward.type === "credits" ? reward.credits : 0), 0);
}

export function App() {
  return (
    <AccountGate auth={authService} repository={accountRepository}>
      {(account, logout) => <GameApp account={account} onLogout={logout} />}
    </AccountGate>
  );
}

function GameApp({ account, onLogout }: { readonly account: AccountSnapshot; readonly onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [save, setSave] = useState<SaveGameV2 | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [rewardGranted, setRewardGranted] = useState(false);
  const [displayedRewardCredits, setDisplayedRewardCredits] = useState(0);
  const [matchProgressionMessage, setMatchProgressionMessage] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  const [goalsStatus, setGoalsStatus] = useState("");
  const [fatalError, setFatalError] = useState("");

  useEffect(() => {
    let active = true;
    void repository.inspect().then(async (result) => {
      let loaded = result.save;
      if (result.status === "default_missing" || result.status === "default_corrupt" || result.status === "default_unknown_version") {
        loaded = await repository.save(createStarterSave());
      } else if (result.status === "migrated" || Object.keys(loaded.lineups).length === 0) {
        loaded = await repository.save(addStarterContent(loaded));
      }
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

  const localLineups = useMemo(() => save ? Object.values(save.lineups) as Lineup[] : [], [save]);

  async function activateLineup(lineup: Lineup) {
    const updated = await repository.update((current) => ({
      ...current,
      activeLineupIds: { ...current.activeLineupIds, [lineup.mode]: lineup.id },
    }));
    setSave(updated);
  }

  async function saveLineup(lineup: Lineup) {
    const updated = await repository.update((current) => ({
      ...current,
      lineups: { ...current.lineups, [lineup.id]: lineup },
    }));
    setSave(updated);
  }

  async function buyCard(offer: CardOffer): Promise<string> {
    let response = "Purchase complete. The card is now in your collection.";
    const requestId = `purchase-${crypto.randomUUID()}`;
    const updated = await repository.update((current) => {
      const result = purchaseCard(current, offer, requestId);
      if (!result.ok) {
        response = result.reason === "insufficient_credits" ? "Not enough Credits for this card." : "This purchase could not be completed.";
        return current;
      }
      const next = result.state;
      const collectionScore = scoreFor(next);
      return { ...next, collectionScore, unlockedAiTierIds: getUnlockedAiTierIds(collectionScore, AI_TIER_THRESHOLDS) };
    });
    setSave(updated);
    return response;
  }

  async function selectDifficulty(difficulty: AiDifficulty) {
    if (!save?.unlockedAiTierIds.includes(difficulty)) return;
    const updated = await repository.update((current) => ({
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
    const activeId = save.activeLineupIds[mode];
    const lineup = cloudLineup ?? (activeId ? save.lineups[activeId] : undefined);
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
    setDisplayedRewardCredits(0);
    setMatchProgressionMessage("");
    navigate("/match");
  }

  function chooseCard(cardId: string) {
    if (!battle || battle.phase !== "selecting") return;
    const playerSelected = selectCard(battle, "player", cardId);
    setBattle(selectAiCard(playerSelected));
  }

  function reveal() {
    if (!battle) return;
    const nextBattle = revealRound(battle);
    setBattle(nextBattle);
    if (nextBattle.phase === "complete") {
      const rewardCredits = getMatchRewardCredits(nextBattle.difficulty, nextBattle.winner ?? "tie");
      const completedAt = new Date();
      let totalRewardCredits = rewardCredits;
      let completionMessage = "";
      void repository.update((current) => {
        const matchResult = grantMatchReward(current, {
          rewardId: `reward-${nextBattle.id}`,
          matchId: nextBattle.id,
          credits: rewardCredits,
        }, completedAt.toISOString());
        if (!matchResult.ok) {
          throw new Error(matchResult.reason === "reward_conflict"
            ? "This match reward conflicts with the saved reward history."
            : "This match reward is invalid.");
        }
        const progressionResult = applyProgressionEvent(matchResult.state.progression, {
          id: `progression-${nextBattle.id}`,
          type: "match-completed",
          matchId: nextBattle.id,
          mode: nextBattle.mode,
          outcome: outcomeFor(nextBattle),
          difficulty: nextBattle.difficulty,
        }, completedAt);
        const bonusCredits = creditTotal(progressionResult.grantedRewards);
        totalRewardCredits = matchResult.record.credits + bonusCredits;
        const hasCardChoice = progressionResult.grantedRewards.some((reward) => reward.type === "card-choice");
        completionMessage = hasCardChoice
          ? "Rivalry Road complete — choose your Featured star in Goals."
          : bonusCredits > 0
            ? `Objective bonus included: +${bonusCredits} Credits.`
            : "";
        return {
          ...matchResult.state,
          credits: matchResult.state.credits + bonusCredits,
          progression: progressionResult.state,
        };
      }).then((updated) => {
        setSave(updated);
        setDisplayedRewardCredits(totalRewardCredits);
        setMatchProgressionMessage(completionMessage);
        setRewardGranted(true);
      }).catch((error: unknown) => setFatalError(error instanceof Error ? error.message : "The match reward could not be saved."));
    }
  }

  async function chooseRivalryCard(cardId: string) {
    setChoiceSubmitting(true);
    setChoiceError("");
    setGoalsStatus("");
    const chosenAt = new Date();
    let choiceWasAlreadySaved = false;
    try {
      const updated = await repository.update((current) => {
        const result = chooseRivalryRoadCard(
          current.progression,
          cardId,
          "rivalry-road-card-choice-v1",
          chosenAt,
        );
        if (result.status !== "applied") {
          if (current.progression.rivalryRoad.selectedCardId === cardId) {
            choiceWasAlreadySaved = true;
            return current;
          }
          throw new Error(result.status === "invalid-card"
            ? "This card is not a valid Rivalry Road reward."
            : "The Rivalry Road reward is not ready to be selected.");
        }
        const cardReward = result.grantedRewards.find((reward) => reward.type === "card");
        if (!cardReward || cardReward.type !== "card") {
          throw new Error("The Rivalry Road card reward history is inconsistent.");
        }
        const owned = current.collection[cardReward.cardId];
        const next = {
          ...current,
          collection: {
            ...current.collection,
            [cardReward.cardId]: owned
              ? { ...owned, quantity: owned.quantity + 1 }
              : { cardId: cardReward.cardId, quantity: 1, acquiredAt: chosenAt.toISOString() },
          },
          progression: result.state,
        };
        const collectionScore = scoreFor(next);
        return {
          ...next,
          collectionScore,
          unlockedAiTierIds: getUnlockedAiTierIds(collectionScore, AI_TIER_THRESHOLDS),
        };
      });
      setSave(updated);
      setGoalsStatus(choiceWasAlreadySaved
        ? "This Featured card was already added to your collection."
        : "Featured card added to your collection.");
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
  const lineups = cloudLineup
    ? [cloudLineup, ...localLineups.filter((lineup) => lineup.mode !== cloudLineup.mode)]
    : localLineups;
  const activeLineupIds = {
    ...save.activeLineupIds,
    ...(cloudLineup ? { [cloudLineup.mode]: cloudLineup.id } : {}),
  };
  const cloudCollectionScore = calculateCollectionScore(cloudCollection, gameCatalog.cards).score;
  const cloudUnlockedDifficultyIds = getUnlockedAiTierIds(cloudCollectionScore, AI_TIER_THRESHOLDS);
  const preferredDifficulty = cloudUnlockedDifficultyIds.includes(save.preferredAiDifficulty)
    ? save.preferredAiDifficulty
    : "rookie";
  const uniqueCards = account.cards.length;
  const safeBattle = battle ? getBattleView(battle, "player") : null;
  const progressionModels = buildProgressionScreenModels(save.progression, gameCatalog, clock, {
    isSubmitting: choiceSubmitting,
    errorMessage: choiceError || undefined,
  });

  return (
    <AppShell credits={account.profile.credits} displayName={account.profile.displayName} onLogout={onLogout}>
      <Routes>
        <Route path="/" element={<HomeScreen credits={account.profile.credits} uniqueCards={uniqueCards} collectionScore={cloudCollectionScore} completedMatches={save.completedMatches} goals={progressionModels.goalsSummary} />} />
        <Route path="/collection" element={<CollectionScreen catalog={gameCatalog} collection={cloudCollection} />} />
        <Route path="/lineups" element={<LineupsScreen lineups={lineups} activeLineupIds={Object.fromEntries(Object.entries(activeLineupIds).map(([mode, id]) => [mode, id ?? ""]))} catalog={gameCatalog} collection={cloudCollection} onActivate={(lineup) => void activateLineup(lineup)} onSave={saveLineup} />} />
        <Route path="/play" element={<PlayScreen lineups={lineups} activeLineupIds={Object.fromEntries(Object.entries(activeLineupIds).map(([mode, id]) => [mode, id ?? ""]))} collectionScore={cloudCollectionScore} preferredDifficulty={preferredDifficulty} onDifficultyChange={(difficulty) => void selectDifficulty(difficulty)} onStart={startMatch} />} />
        <Route path="/market" element={<MarketScreen catalog={gameCatalog} collection={cloudCollection} credits={account.profile.credits} baseOffers={baseMarket.offers} eventRotation={eventRotation} onBuy={buyCard} />} />
        <Route path="/objectives" element={<ObjectiveScreen dailyObjectives={progressionModels.dailyObjectives} dailyPeriodLabel={progressionModels.dailyPeriodLabel} weeklyObjective={progressionModels.weeklyObjective} weeklyPeriodLabel={progressionModels.weeklyPeriodLabel} rivalrySteps={progressionModels.rivalrySteps} rewardChoice={progressionModels.rewardChoice} statusMessage={goalsStatus || undefined} onChooseRivalryCard={(cardId) => void chooseRivalryCard(cardId)} />} />
        <Route path="/match" element={battle && safeBattle ? <MatchScreen battle={safeBattle} eligibleCardIds={getEligibleCards(battle, "player").map(({ card }) => card.id)} rewardCredits={displayedRewardCredits || getMatchRewardCredits(battle.difficulty, battle.winner ?? "tie")} rewardGranted={rewardGranted} progressionMessage={matchProgressionMessage} onSelect={chooseCard} onReveal={reveal} onFinish={() => navigate("/")} /> : <Navigate to="/play" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
