import { describe, expect, it } from "vitest";

import { grantMatchReward, purchaseCard } from ".";
import type { CardOffer, EconomyState } from ".";

function createState(): EconomyState {
  return {
    credits: 1_000,
    collection: {},
    purchaseHistory: [],
    processedPurchaseIds: [],
    rewardHistory: [],
    processedRewardIds: [],
    completedMatches: 0,
  };
}

const offer: CardOffer = {
  id: "base-market:card-1",
  cardId: "card-1",
  price: 400,
  source: "base_market",
  currency: "credits",
};

describe("purchaseCard", () => {
  it("atomically spends Credits and adds a card", () => {
    const original = createState();
    const result = purchaseCard(original, offer, "purchase-1", "2026-07-13T00:00:00.000Z");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("purchased");
    expect(result.state.credits).toBe(600);
    expect(result.state.collection["card-1"]?.quantity).toBe(1);
    expect(result.state.purchaseHistory).toHaveLength(1);
    expect(original).toEqual(createState());
  });

  it("does not change state when Credits are insufficient", () => {
    const original = { ...createState(), credits: 399 };
    const result = purchaseCard(original, offer, "purchase-1");

    expect(result).toEqual({
      ok: false,
      reason: "insufficient_credits",
      state: original,
    });
  });

  it("treats an exact replay as already processed", () => {
    const first = purchaseCard(createState(), offer, "purchase-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const replay = purchaseCard(first.state, offer, "purchase-1");
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.status).toBe("already_processed");
    expect(replay.state.credits).toBe(600);
    expect(replay.state.collection["card-1"]?.quantity).toBe(1);
  });

  it("rejects reuse of an idempotency key for a different purchase", () => {
    const first = purchaseCard(createState(), offer, "purchase-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const conflict = purchaseCard(
      first.state,
      { ...offer, cardId: "card-2" },
      "purchase-1",
    );
    expect(conflict).toEqual({
      ok: false,
      reason: "request_conflict",
      state: first.state,
    });
  });
});

describe("grantMatchReward", () => {
  it("grants a reward and counts its match only once", () => {
    const reward = { rewardId: "reward-match-1", matchId: "match-1", credits: 125 };
    const first = grantMatchReward(createState(), reward, "2026-07-13T00:00:00.000Z");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const replay = grantMatchReward(first.state, reward);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.status).toBe("already_processed");
    expect(replay.state.credits).toBe(1_125);
    expect(replay.state.completedMatches).toBe(1);
    expect(replay.state.rewardHistory).toHaveLength(1);
  });

  it("rejects a second reward for the same match", () => {
    const first = grantMatchReward(createState(), {
      rewardId: "reward-1",
      matchId: "match-1",
      credits: 100,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const conflict = grantMatchReward(first.state, {
      rewardId: "reward-2",
      matchId: "match-1",
      credits: 100,
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.reason).toBe("reward_conflict");
    expect(conflict.state).toBe(first.state);
  });
});
