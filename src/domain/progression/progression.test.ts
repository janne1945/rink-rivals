import { describe, expect, it } from "vitest";

import {
  calculateCollectionScore,
  getUnlockedAiTierIds,
} from ".";
import type { OwnedCard } from "../economy";

const owned = (cardId: string, quantity = 1): OwnedCard => ({
  cardId,
  quantity,
  acquiredAt: "2026-07-13T00:00:00.000Z",
});

describe("calculateCollectionScore", () => {
  it("scores unique ownership, quality, event cards and completed sets", () => {
    const result = calculateCollectionScore(
      {
        base: owned("base", 4),
        event: owned("event"),
      },
      [
        { id: "base", overall: 80, setId: "base", cardType: "base" },
        { id: "event", overall: 90, setId: "winter", cardType: "featured" },
      ],
      [{ id: "duo", cardIds: ["base", "event"] }],
    );

    expect(result).toEqual({
      score: 600,
      uniqueCards: 2,
      uniqueCardPoints: 200,
      qualityPoints: 100,
      nonBaseCardPoints: 50,
      completedSetPoints: 250,
      completedSetIds: ["duo"],
      missingCatalogCardIds: [],
    });
  });

  it("ignores duplicate quantities and safely reports unknown saved cards", () => {
    const oneCopy = calculateCollectionScore(
      { base: owned("base") },
      [{ id: "base", overall: 80, setId: "base", cardType: "base" }],
    );
    const duplicates = calculateCollectionScore(
      { base: owned("base", 99), missing: owned("missing") },
      [{ id: "base", overall: 80, setId: "base", cardType: "base" }],
    );

    expect(duplicates.score).toBe(oneCopy.score);
    expect(duplicates.missingCatalogCardIds).toEqual(["missing"]);
  });
});

describe("getUnlockedAiTierIds", () => {
  it("returns all tiers whose score threshold is met", () => {
    expect(
      getUnlockedAiTierIds(600, [
        { id: "all-star", minimumCollectionScore: 1_000 },
        { id: "rookie", minimumCollectionScore: 0 },
        { id: "pro", minimumCollectionScore: 500 },
      ]),
    ).toEqual(["rookie", "pro"]);
  });
});
