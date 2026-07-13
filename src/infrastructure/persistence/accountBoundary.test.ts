import { describe, expect, it } from "vitest";

import { createDefaultSaveGame } from "./saveSchema";
import { withoutAccountData } from "./accountBoundary";

describe("Supabase account boundary", () => {
  it("removes legacy account fields while preserving local progression and settings", () => {
    const save = createDefaultSaveGame();
    save.credits = 900;
    save.collection["nhl-connor-mcdavid-base"] = {
      cardId: "nhl-connor-mcdavid-base",
      quantity: 1,
      acquiredAt: "2026-07-13T00:00:00.000Z",
    };
    save.lineups.legacy = {
      id: "legacy",
      name: "Legacy",
      mode: "nhl-circuit",
      slots: { LW: "lw", C: "c", RW: "rw", LD: "ld", RD: "rd", G: "g" },
    };
    save.activeLineupIds["nhl-circuit"] = "legacy";
    save.settings.soundEnabled = false;
    save.completedMatches = 4;

    const localOnly = withoutAccountData(save);

    expect(localOnly.credits).toBe(0);
    expect(localOnly.collection).toEqual({});
    expect(localOnly.lineups).toEqual({});
    expect(localOnly.activeLineupIds["nhl-circuit"]).toBeNull();
    expect(localOnly.unlockedAiTierIds).toEqual(["rookie"]);
    expect(localOnly.settings.soundEnabled).toBe(false);
    expect(localOnly.completedMatches).toBe(0);
    expect(localOnly.rewardHistory).toEqual([]);
    expect(localOnly.progression.processedMatchIds).toEqual([]);
    expect(localOnly.progression).toEqual(save.progression);
  });

  it("preserves a local Pro preference without retaining cloud collection data", () => {
    const save = createDefaultSaveGame();
    save.preferredAiDifficulty = "pro";
    save.collectionScore = 1_500;
    save.unlockedAiTierIds = ["rookie", "pro"];
    save.collection["cloud-card"] = {
      cardId: "cloud-card",
      quantity: 1,
      acquiredAt: "2026-07-13T00:00:00.000Z",
    };

    const localOnly = withoutAccountData(save);

    expect(localOnly.preferredAiDifficulty).toBe("pro");
    expect(localOnly.collection).toEqual({});
    expect(localOnly.unlockedAiTierIds).toEqual(["rookie", "pro"]);
  });
});
