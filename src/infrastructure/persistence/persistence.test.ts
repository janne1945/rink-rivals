import { describe, expect, it } from "vitest";

import { purchaseCard } from "../../domain/economy";
import {
  createDefaultSaveGame,
  InMemoryGameSaveRepository,
  parseOrCreateSaveGame,
  saveGameV1Schema,
  saveGameV2Schema,
  type SaveGameV1,
} from ".";

function createV1Fixture(overrides: Partial<SaveGameV1> = {}): SaveGameV1 {
  const current = createDefaultSaveGame();
  return saveGameV1Schema.parse({
    version: 1,
    credits: current.credits,
    collection: current.collection,
    lineups: current.lineups,
    activeLineupIds: current.activeLineupIds,
    collectionScore: current.collectionScore,
    completedMatches: current.completedMatches,
    unlockedAiTierIds: current.unlockedAiTierIds,
    completedObjectiveIds: [],
    eventProgress: {},
    shopState: current.shopState,
    purchaseHistory: current.purchaseHistory,
    processedPurchaseIds: current.processedPurchaseIds,
    rewardHistory: current.rewardHistory,
    processedRewardIds: current.processedRewardIds,
    settings: current.settings,
    ...overrides,
  });
}

describe("SaveGameV2", () => {
  it("creates a valid safe default with current progression and all mode slots", () => {
    const save = createDefaultSaveGame();
    expect(saveGameV2Schema.parse(save)).toEqual(save);
    expect(save.version).toBe(2);
    expect(save.credits).toBe(1_200);
    expect(save.preferredAiDifficulty).toBe("rookie");
    expect(save.progression.daily.objectives).toHaveLength(3);
    expect(save.progression.weekly.objective.objectiveId).toBe("weekly-circuit-tour");
    expect(save.activeLineupIds).toEqual({
      "nhl-circuit": null,
      "pwhl-circuit": null,
      "open-ice": null,
    });
  });

  it("migrates v1 without losing economy, collection, match, or known objective data", () => {
    const v1 = createV1Fixture({
      credits: 725,
      collection: {
        "card-a": {
          cardId: "card-a",
          quantity: 2,
          acquiredAt: "2026-07-01T10:00:00.000Z",
        },
      },
      collectionScore: 1_750,
      completedMatches: 8,
      unlockedAiTierIds: ["rookie", "pro"],
      completedObjectiveIds: ["daily-match-complete"],
      eventProgress: { "daily-match-complete": 1, "daily-match-win": 0 },
      shopState: { lastEventRotationKey: "2026-W28" },
      purchaseHistory: [{
        requestId: "purchase-1",
        offerId: "base-market:card-a",
        cardId: "card-a",
        price: 100,
        source: "base_market",
        purchasedAt: "2026-07-01T10:00:00.000Z",
      }],
      processedPurchaseIds: ["purchase-1"],
      rewardHistory: [{
        rewardId: "match-reward-1",
        matchId: "match-1",
        credits: 180,
        grantedAt: "2026-07-01T11:00:00.000Z",
      }],
      processedRewardIds: ["match-reward-1"],
      settings: { soundEnabled: false, reducedMotion: true },
    });

    const result = parseOrCreateSaveGame(v1);

    expect(result.status).toBe("migrated");
    expect(result.save).toMatchObject({
      version: 2,
      credits: 725,
      collection: v1.collection,
      collectionScore: 1_750,
      completedMatches: 8,
      unlockedAiTierIds: ["rookie", "pro"],
      preferredAiDifficulty: "pro",
      shopState: v1.shopState,
      purchaseHistory: v1.purchaseHistory,
      processedPurchaseIds: v1.processedPurchaseIds,
      rewardHistory: v1.rewardHistory,
      processedRewardIds: v1.processedRewardIds,
      settings: v1.settings,
    });
    expect(
      result.save.progression.daily.objectives.find(
        (objective) => objective.objectiveId === "daily-match-complete",
      ),
    ).toMatchObject({ current: 1, completed: true });
  });

  it("uses Rookie when a v1 save had not unlocked Pro", () => {
    const result = parseOrCreateSaveGame(createV1Fixture());
    expect(result.save.preferredAiDifficulty).toBe("rookie");
  });

  it("migrates v0 through the legacy model and preserves duplicate quantities", () => {
    const result = parseOrCreateSaveGame({
      version: 0,
      credits: 425,
      ownedCardIds: ["card-a", "card-a", "card-b"],
      completedMatches: 3,
      processedRewardIds: ["reward-1", "reward-1"],
    });

    expect(result.status).toBe("migrated");
    expect(result.save.version).toBe(2);
    expect(result.save.credits).toBe(425);
    expect(result.save.collection["card-a"]?.quantity).toBe(2);
    expect(result.save.collection["card-b"]?.quantity).toBe(1);
    expect(result.save.completedMatches).toBe(3);
    expect(result.save.processedRewardIds).toEqual(["reward-1"]);
  });

  it.each([
    ["missing", undefined, "default_missing"],
    ["corrupt v1", { version: 1, credits: "many" }, "default_corrupt"],
    ["corrupt v2", { version: 2, credits: 100 }, "default_corrupt"],
    ["unknown", { version: 99, credits: 100 }, "default_unknown_version"],
  ])("falls back safely for %s saves", (_label, raw, status) => {
    const result = parseOrCreateSaveGame(raw);
    expect(result.status).toBe(status);
    expect(saveGameV2Schema.safeParse(result.save).success).toBe(true);
    expect(result.save.credits).toBe(1_200);
  });

  it("rejects locked preferred difficulties and duplicate progression ledgers", () => {
    const locked = {
      ...createDefaultSaveGame(),
      preferredAiDifficulty: "elite" as const,
    };
    expect(saveGameV2Schema.safeParse(locked).success).toBe(false);

    const driftedUnlocks = {
      ...createDefaultSaveGame(),
      unlockedAiTierIds: ["rookie", "pro"],
    };
    expect(saveGameV2Schema.safeParse(driftedUnlocks).success).toBe(false);

    const duplicateEvents = createDefaultSaveGame();
    duplicateEvents.progression = {
      ...duplicateEvents.progression,
      processedEventIds: ["event-1", "event-1"],
    };
    expect(saveGameV2Schema.safeParse(duplicateEvents).success).toBe(false);

    const duplicateRewards = createDefaultSaveGame();
    const reward = {
      id: "objective-reward-1",
      sourceId: "daily-match-complete" as const,
      eventId: "event-1",
      type: "credits" as const,
      credits: 75,
      grantedAt: "2026-07-13T10:00:00.000Z",
    };
    duplicateRewards.progression = {
      ...duplicateRewards.progression,
      rewardHistory: [reward, reward],
    };
    expect(saveGameV2Schema.safeParse(duplicateRewards).success).toBe(false);

    const missingDaily = createDefaultSaveGame();
    missingDaily.progression = {
      ...missingDaily.progression,
      daily: { ...missingDaily.progression.daily, objectives: [] },
    };
    expect(saveGameV2Schema.safeParse(missingDaily).success).toBe(false);

    const invalidWeekly = createDefaultSaveGame();
    invalidWeekly.progression = {
      ...invalidWeekly.progression,
      weekly: {
        ...invalidWeekly.progression.weekly,
        objective: {
          ...invalidWeekly.progression.weekly.objective,
          current: 5,
          completed: true,
          completedAt: "2026-07-13T10:00:00.000Z",
          rewardId: "weekly-circuit-tour:2026-07-13",
        },
      },
    };
    expect(saveGameV2Schema.safeParse(invalidWeekly).success).toBe(false);
  });
});

describe("InMemoryGameSaveRepository", () => {
  it("round-trips v2 saves without leaking mutable references", async () => {
    const repository = new InMemoryGameSaveRepository();
    const save = createDefaultSaveGame();
    save.credits = 777;
    await repository.save(save);
    save.credits = 0;

    const loaded = await repository.load();
    expect(loaded.credits).toBe(777);
    loaded.credits = 1;
    expect((await repository.load()).credits).toBe(777);
  });

  it("serializes concurrent atomic economy updates", async () => {
    const repository = new InMemoryGameSaveRepository(createDefaultSaveGame());
    const buy = (requestId: string) => repository.update((save) => {
      const result = purchaseCard(
        save,
        {
          id: "base-market:card-a",
          cardId: "card-a",
          price: 100,
          source: "base_market",
          currency: "credits",
        },
        requestId,
      );
      if (!result.ok) throw new Error(result.reason);
      return result.state;
    });

    await Promise.all([buy("purchase-1"), buy("purchase-2")]);
    const saved = await repository.load();
    expect(saved.credits).toBe(1_000);
    expect(saved.collection["card-a"]?.quantity).toBe(2);
    expect(saved.processedPurchaseIds).toEqual(["purchase-1", "purchase-2"]);
  });

  it("atomically processes a progression event only once under contention", async () => {
    const repository = new InMemoryGameSaveRepository(createDefaultSaveGame());
    const applyEvent = () => repository.update((save) => {
      if (save.progression.processedEventIds.includes("match-event-1")) return save;
      return {
        ...save,
        credits: save.credits + 75,
        progression: {
          ...save.progression,
          processedEventIds: [...save.progression.processedEventIds, "match-event-1"],
          processedMatchIds: [...save.progression.processedMatchIds, "match-1"],
        },
      };
    });

    await Promise.all([applyEvent(), applyEvent()]);
    const saved = await repository.load();
    expect(saved.credits).toBe(1_275);
    expect(saved.progression.processedEventIds).toEqual(["match-event-1"]);
    expect(saved.progression.processedMatchIds).toEqual(["match-1"]);
  });

  it("rejects invalid saves instead of persisting a partial state", async () => {
    const repository = new InMemoryGameSaveRepository(createDefaultSaveGame());
    const invalid = { ...createDefaultSaveGame(), credits: -1 };

    await expect(repository.save(invalid)).rejects.toThrow();
    expect((await repository.load()).credits).toBe(1_200);
  });
});
