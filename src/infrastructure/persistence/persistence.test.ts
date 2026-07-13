import { describe, expect, it } from "vitest";

import { purchaseCard } from "../../domain/economy";
import {
  createDefaultSaveGame,
  InMemoryGameSaveRepository,
  parseOrCreateSaveGame,
  saveGameV1Schema,
} from ".";

describe("SaveGameV1", () => {
  it("creates a valid safe default with all three mode slots", () => {
    const save = createDefaultSaveGame();
    expect(saveGameV1Schema.parse(save)).toEqual(save);
    expect(save.credits).toBe(1_200);
    expect(save.activeLineupIds).toEqual({
      "nhl-circuit": null,
      "pwhl-circuit": null,
      "open-ice": null,
    });
  });

  it("migrates the legacy v0 format and preserves duplicate quantities", () => {
    const result = parseOrCreateSaveGame({
      version: 0,
      credits: 425,
      ownedCardIds: ["card-a", "card-a", "card-b"],
      completedMatches: 3,
      processedRewardIds: ["reward-1", "reward-1"],
    });

    expect(result.status).toBe("migrated");
    expect(result.save.credits).toBe(425);
    expect(result.save.collection["card-a"]?.quantity).toBe(2);
    expect(result.save.collection["card-b"]?.quantity).toBe(1);
    expect(result.save.completedMatches).toBe(3);
    expect(result.save.processedRewardIds).toEqual(["reward-1"]);
  });

  it.each([
    ["missing", undefined, "default_missing"],
    ["corrupt", { version: 1, credits: "many" }, "default_corrupt"],
    ["unknown", { version: 99, credits: 100 }, "default_unknown_version"],
  ])("falls back safely for %s saves", (_label, raw, status) => {
    const result = parseOrCreateSaveGame(raw);
    expect(result.status).toBe(status);
    expect(result.save).toEqual(createDefaultSaveGame());
  });
});

describe("InMemoryGameSaveRepository", () => {
  it("round-trips saves without leaking mutable references", async () => {
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

  it("serializes concurrent atomic updates", async () => {
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

  it("rejects invalid saves instead of persisting a partial state", async () => {
    const repository = new InMemoryGameSaveRepository(createDefaultSaveGame());
    const invalid = { ...createDefaultSaveGame(), credits: -1 };

    await expect(repository.save(invalid)).rejects.toThrow();
    expect((await repository.load()).credits).toBe(1_200);
  });
});
