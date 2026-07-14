import { describe, expect, it } from "vitest";

import {
  createBaseMarket,
  createEventShopRotation,
  EVENT_CALENDAR,
  EVENT_IDS,
  getActiveEvent,
  resolveEventCalendarRotation,
} from ".";
import type { EventShopConfig, MarketCard } from ".";

const cards: MarketCard[] = [
  { id: "base-b", price: 300, setId: "base", cardType: "base", marketAvailability: "base-market", isPermanent: true },
  { id: "base-a", price: 200, setId: "base", cardType: "base", marketAvailability: "base-market", isPermanent: true },
  { id: "starter-permanent", price: 0, setId: "starter", cardType: "starter", marketAvailability: "unavailable", isPermanent: true },
  { id: "reward-permanent", price: 0, setId: "reward", cardType: "reward", marketAvailability: "reward-only", isPermanent: true },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `event-${index + 1}`,
    price: 1_000 + index * 100,
    setId: "winter",
    cardType: "event" as const,
    marketAvailability: "event-shop" as const,
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

  it("uses explicit market availability and excludes permanent Starter and Reward cards", () => {
    const market = createBaseMarket(cards);
    expect(market.offers.map((offer) => offer.cardId)).not.toContain("starter-permanent");
    expect(market.offers.map((offer) => offer.cardId)).not.toContain("reward-permanent");
    expect(market.offers.every((offer) => offer.cardId.startsWith("base-"))).toBe(true);
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

  it("filters cards against their authoritative availability window", () => {
    const windowed = cards.map((card) => card.isPermanent ? card : {
      ...card,
      availableFrom: "2026-07-13T06:00:00.000Z",
      availableTo: "2026-07-14T06:00:00.000Z",
    });
    expect(createEventShopRotation(config, windowed, new Date("2026-07-13T05:59:59.999Z")).offers).toHaveLength(0);
    expect(createEventShopRotation(config, windowed, new Date("2026-07-13T06:00:00.000Z")).offers).toHaveLength(4);
    expect(createEventShopRotation(config, windowed, new Date("2026-07-14T06:00:00.000Z")).offers).toHaveLength(0);
  });
});

describe("recurring Event Calendar", () => {
  it("publishes exactly the ten named, metadata-rich events", () => {
    expect(EVENT_CALENDAR.map(({ id }) => id)).toEqual(EVENT_IDS);
    expect(EVENT_CALENDAR.map(({ name }) => name)).toEqual([
      "Frozen Frights", "Signature Series", "Winter Holidays", "Winter Classic",
      "International Ice", "Rising Stars", "Playoff Heroes", "Franchise Icons",
      "Record Breakers", "Clutch Performers",
    ]);
    expect(EVENT_CALENDAR.every(({ description, visual, gameplay, rotation }) =>
      description.length > 20 && visual.accentColor && visual.motif && gameplay.summary.length > 20 && rotation.recurrenceWeeks === 10)).toBe(true);
  });

  it("changes at Monday 00:00 UTC and repeats deterministically after ten weeks", () => {
    expect(getActiveEvent(new Date("2026-01-11T23:59:59.999Z")).id).toBe("frozen-frights");
    expect(getActiveEvent(new Date("2026-01-12T00:00:00.000Z")).id).toBe("signature-series");
    expect(getActiveEvent(new Date("2026-03-16T00:00:00.000Z")).id).toBe("frozen-frights");
    expect(getActiveEvent(new Date("2026-01-12T01:00:00.000+01:00")).id).toBe("signature-series");
  });

  it("returns several offers, one discounted Spotlight, and excludes unavailable cards", () => {
    const activeCards: MarketCard[] = Array.from({ length: 7 }, (_, index) => ({
      id: `frozen-${index}`,
      price: 2_000 + index * 50,
      setId: "frozen-frights",
      cardType: "event",
      marketAvailability: "event-shop",
      isPermanent: false,
      availableFrom: "2026-01-01T00:00:00.000Z",
      availableTo: index === 6 ? "2026-01-05T00:00:00.000Z" : "2030-01-01T00:00:00.000Z",
    }));
    const rotation = resolveEventCalendarRotation(activeCards, new Date("2026-01-05T12:00:00.000Z"));
    expect(rotation.event.id).toBe("frozen-frights");
    expect(rotation.shop.startsAt).toBe("2026-01-05T00:00:00.000Z");
    expect(rotation.shop.endsAt).toBe("2026-01-12T00:00:00.000Z");
    expect(rotation.shop.offers).toHaveLength(6);
    expect(rotation.shop.offers.every(({ cardId }) => cardId !== "frozen-6")).toBe(true);
    const spotlight = rotation.shop.offers.filter(({ placement }) => placement === "spotlight");
    expect(spotlight).toHaveLength(1);
    expect(spotlight[0].price).toBeLessThan(spotlight[0].regularPrice);
  });

  it("offers every card in every event pool across recurring calendar appearances", () => {
    const anchor = Date.parse("2026-01-05T12:00:00.000Z");
    const week = 7 * 86_400_000;
    const calendarCards: MarketCard[] = EVENT_CALENDAR.flatMap((event) =>
      Array.from({ length: 12 }, (_, index) => ({
        id: `${event.id}-${index}`,
        price: 2_000 + index * 50,
        setId: event.id,
        cardType: "event" as const,
        marketAvailability: "event-shop" as const,
        isPermanent: false,
        availableFrom: "2026-01-01T00:00:00.000Z",
        availableTo: "2035-01-01T00:00:00.000Z",
      })),
    );

    EVENT_CALENDAR.forEach((event, eventIndex) => {
      const offered = new Set<string>();
      for (let occurrence = 0; occurrence < 2; occurrence += 1) {
        const at = new Date(anchor + (eventIndex + occurrence * EVENT_CALENDAR.length) * week);
        const rotation = resolveEventCalendarRotation(calendarCards, at);
        expect(rotation.event.id).toBe(event.id);
        rotation.shop.offers.forEach((offer) => offered.add(offer.cardId));
      }
      expect(offered).toEqual(new Set(Array.from({ length: 12 }, (_, index) => `${event.id}-${index}`)));
    });
  });

  it("excludes Base, Starter, and Reward cards even if their set and window match", () => {
    const impostors: MarketCard[] = ["base", "starter", "reward"].map((cardType) => ({
      id: `impostor-${cardType}`,
      price: 1_000,
      setId: "frozen-frights",
      cardType: cardType as "base" | "starter" | "reward",
      marketAvailability: cardType === "base" ? "base-market" : cardType === "reward" ? "reward-only" : "unavailable",
      isPermanent: cardType !== "event",
      availableFrom: "2026-01-01T00:00:00.000Z",
      availableTo: "2030-01-01T00:00:00.000Z",
    }));
    const rotation = resolveEventCalendarRotation(impostors, new Date("2026-01-05T12:00:00.000Z"));
    expect(rotation.shop.offers).toHaveLength(0);
  });
});
