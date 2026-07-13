import { describe, expect, it } from "vitest";

import { createBaseMarket, createEventShopRotation } from ".";
import type { EventShopConfig, MarketCard } from ".";

const cards: MarketCard[] = [
  { id: "base-b", price: 300, setId: "base", isPermanent: true },
  { id: "base-a", price: 200, setId: "base", isPermanent: true },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `event-${index + 1}`,
    price: 1_000 + index * 100,
    setId: "winter",
    isPermanent: false,
  })),
];

const config: EventShopConfig = {
  seed: "rink-rivals-v1",
  eventSetId: "winter",
  periodDays: 1,
  offerCount: 4,
  spotlightDiscountPercent: 20,
};

describe("createBaseMarket", () => {
  it("keeps every permanent base card available in stable order", () => {
    const market = createBaseMarket(cards);
    expect(market.offers.map((offer) => offer.cardId)).toEqual([
      "base-a",
      "base-b",
    ]);
  });
});

describe("createEventShopRotation", () => {
  it("is deterministic throughout one UTC period", () => {
    const morning = createEventShopRotation(
      config,
      cards,
      new Date("2026-07-13T00:00:00.000Z"),
    );
    const evening = createEventShopRotation(
      config,
      [...cards].reverse(),
      new Date("2026-07-13T23:59:59.999Z"),
    );

    expect(evening).toEqual(morning);
    expect(morning.startsAt).toBe("2026-07-13T00:00:00.000Z");
    expect(morning.endsAt).toBe("2026-07-14T00:00:00.000Z");
    expect(morning.offers).toHaveLength(4);
    expect(morning.offers.filter((offer) => offer.placement === "spotlight"))
      .toHaveLength(1);
  });

  it("rotates deterministically in a later UTC period", () => {
    const first = createEventShopRotation(
      config,
      cards,
      new Date("2026-07-13T12:00:00.000Z"),
    );
    const next = createEventShopRotation(
      config,
      cards,
      new Date("2026-07-14T12:00:00.000Z"),
    );

    expect(next.rotationKey).not.toBe(first.rotationKey);
    expect(next.offers.map((offer) => offer.cardId))
      .not.toEqual(first.offers.map((offer) => offer.cardId));
  });

  it("returns every event card within a complete deterministic cycle", () => {
    const offeredIds = new Set<string>();
    for (let day = 13; day <= 14; day += 1) {
      const rotation = createEventShopRotation(
        config,
        cards,
        new Date(`2026-07-${day}T12:00:00.000Z`),
      );
      rotation.offers.forEach((offer) => offeredIds.add(offer.cardId));
    }

    expect(offeredIds).toEqual(
      new Set(Array.from({ length: 8 }, (_, index) => `event-${index + 1}`)),
    );
  });
});
