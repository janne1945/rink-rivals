import type { BaseMarket, MarketCard } from "./types";

function assertValidPrice(card: MarketCard): void {
  if (!Number.isSafeInteger(card.price) || card.price < 0) {
    throw new RangeError(`Invalid price for market card ${card.id}.`);
  }
}

/** Creates the permanent direct-purchase inventory from catalog projections. */
export function createBaseMarket(cards: readonly MarketCard[]): BaseMarket {
  const permanentCards = cards.filter((card) => card.isPermanent);
  const ids = new Set<string>();

  for (const card of permanentCards) {
    if (card.id.trim().length === 0) {
      throw new TypeError("Base Market card ids must not be empty.");
    }
    if (ids.has(card.id)) {
      throw new TypeError(`Duplicate Base Market card id: ${card.id}.`);
    }
    ids.add(card.id);
    assertValidPrice(card);
  }

  return {
    kind: "base_market",
    offers: [...permanentCards]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((card) => ({
        id: `base-market:${card.id}`,
        cardId: card.id,
        price: card.price,
        source: "base_market",
        currency: "credits",
      })),
  };
}
