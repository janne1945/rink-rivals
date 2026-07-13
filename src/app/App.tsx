import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  createBattle,
  getBattleView,
  getEligibleCards,
  revealRound,
  selectAiCard,
  selectCard,
  type BattleState,
} from "../domain/battle";
import { grantMatchReward, purchaseCard, type CardOffer } from "../domain/economy";
import type { GameMode, Lineup } from "../domain/lineups";
import { calculateCollectionScore, getUnlockedAiTierIds } from "../domain/progression";
import { createBaseMarket, createEventShopRotation } from "../domain/shop";
import { gameCatalog, starterLineups } from "../data/generated/gameCatalog";
import { CollectionScreen } from "../features/collection/CollectionScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { LineupsScreen } from "../features/lineup/LineupsScreen";
import { MarketScreen } from "../features/market/MarketScreen";
import { MatchScreen } from "../features/match/MatchScreen";
import { PlayScreen } from "../features/play/PlayScreen";
import {
  createDefaultSaveGame,
  DexieGameSaveRepository,
  type SaveGameV1,
} from "../infrastructure/persistence";
import { AppShell } from "./AppShell";
import styles from "./App.module.css";

const repository = new DexieGameSaveRepository();
const AI_TIER_THRESHOLDS = [
  { id: "rookie", minimumCollectionScore: 0 },
  { id: "pro", minimumCollectionScore: 1_500 },
  { id: "elite", minimumCollectionScore: 3_500 },
] as const;
const baseMarket = createBaseMarket(gameCatalog.cards);
const eventRotation = createEventShopRotation(
  {
    seed: "rink-rivals-event-2026",
    eventSetId: "rivalry-series-2026",
    periodDays: 7,
    offerCount: 5,
    spotlightDiscountPercent: 15,
  },
  gameCatalog.cards,
  new Date(),
);

function scoreFor(save: SaveGameV1): number {
  return calculateCollectionScore(save.collection, gameCatalog.cards).score;
}

function createStarterSave(): SaveGameV1 {
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
  return save;
}

function rewardFor(battle: BattleState): number {
  if (battle.winner === "player") return 180;
  if (battle.winner === "tie") return 120;
  return 80;
}

export function App() {
  const navigate = useNavigate();
  const [save, setSave] = useState<SaveGameV1 | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [rewardGranted, setRewardGranted] = useState(false);
  const [fatalError, setFatalError] = useState("");

  useEffect(() => {
    let active = true;
    void repository.inspect().then(async (result) => {
      let loaded = result.save;
      if (result.status !== "valid" || Object.keys(loaded.lineups).length === 0) {
        loaded = await repository.save(createStarterSave());
      }
      if (active) setSave(loaded);
    }).catch((error: unknown) => {
      if (active) setFatalError(error instanceof Error ? error.message : "The local save could not be opened.");
    });
    return () => { active = false; };
  }, []);

  const lineups = useMemo(() => save ? Object.values(save.lineups) as Lineup[] : [], [save]);

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

  function startMatch(mode: GameMode) {
    if (!save) return;
    const activeId = save.activeLineupIds[mode];
    const lineup = activeId ? save.lineups[activeId] : undefined;
    if (!lineup) return;
    const nextBattle = createBattle({
      seed: crypto.randomUUID(),
      mode,
      catalog: gameCatalog,
      playerLineup: lineup,
      opponentLineup: lineup,
    });
    setBattle(nextBattle);
    setRewardGranted(false);
    navigate("/match");
  }

  function chooseCard(cardId: string) {
    if (!battle || battle.phase !== "selecting") return;
    const playerSelected = selectCard(battle, "player", cardId);
    setBattle(selectAiCard(playerSelected, "pro"));
  }

  function reveal() {
    if (!battle) return;
    const nextBattle = revealRound(battle);
    setBattle(nextBattle);
    if (nextBattle.phase === "complete") {
      const rewardCredits = rewardFor(nextBattle);
      void repository.update((current) => {
        const result = grantMatchReward(current, {
          rewardId: `reward-${nextBattle.id}`,
          matchId: nextBattle.id,
          credits: rewardCredits,
        });
        return result.ok ? result.state : current;
      }).then((updated) => {
        setSave(updated);
        setRewardGranted(true);
      }).catch((error: unknown) => setFatalError(error instanceof Error ? error.message : "The match reward could not be saved."));
    }
  }

  if (fatalError) {
    return <div className={styles.loading}><div className={styles.fatal}><h1>Save unavailable</h1><p>{fatalError}</p></div></div>;
  }

  if (!save) {
    return <div className={styles.loading}><div><div className={styles.puck} /><h1>Preparing the ice</h1><p>Loading your local collection…</p></div></div>;
  }

  const uniqueCards = Object.keys(save.collection).length;
  const safeBattle = battle ? getBattleView(battle, "player") : null;

  return (
    <AppShell credits={save.credits}>
      <Routes>
        <Route path="/" element={<HomeScreen credits={save.credits} uniqueCards={uniqueCards} collectionScore={save.collectionScore} completedMatches={save.completedMatches} />} />
        <Route path="/collection" element={<CollectionScreen catalog={gameCatalog} collection={save.collection} />} />
        <Route path="/lineups" element={<LineupsScreen lineups={lineups} activeLineupIds={Object.fromEntries(Object.entries(save.activeLineupIds).map(([mode, id]) => [mode, id ?? ""]))} catalog={gameCatalog} collection={save.collection} onActivate={(lineup) => void activateLineup(lineup)} onSave={saveLineup} />} />
        <Route path="/play" element={<PlayScreen lineups={lineups} activeLineupIds={Object.fromEntries(Object.entries(save.activeLineupIds).map(([mode, id]) => [mode, id ?? ""]))} onStart={startMatch} />} />
        <Route path="/market" element={<MarketScreen catalog={gameCatalog} collection={save.collection} credits={save.credits} baseOffers={baseMarket.offers} eventRotation={eventRotation} onBuy={buyCard} />} />
        <Route path="/match" element={battle && safeBattle ? <MatchScreen battle={safeBattle} eligibleCardIds={getEligibleCards(battle, "player").map(({ card }) => card.id)} rewardCredits={rewardFor(battle)} rewardGranted={rewardGranted} onSelect={chooseCard} onReveal={reveal} onFinish={() => navigate("/")} /> : <Navigate to="/play" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
