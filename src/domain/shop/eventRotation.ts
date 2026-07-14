import type {
  EventShopConfig,
  EventShopOffer,
  EventShopRotation,
  MarketCard,
} from "./types";

const DAY_IN_MS = 86_400_000;

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function validateConfig(config: EventShopConfig): void {
  if (config.seed.trim().length === 0 || config.eventSetId.trim().length === 0) {
    throw new TypeError("Event Shop seed and event set id must not be empty.");
  }
  if (!Number.isSafeInteger(config.periodDays) || config.periodDays <= 0) {
    throw new RangeError("Event Shop periodDays must be a positive integer.");
  }
  if (!Number.isSafeInteger(config.offerCount) || config.offerCount <= 0) {
    throw new RangeError("Event Shop offerCount must be a positive integer.");
  }
  if (config.periodAnchor !== undefined && !Number.isFinite(Date.parse(config.periodAnchor))) {
    throw new TypeError("Event Shop periodAnchor must be a valid ISO timestamp.");
  }
  if (config.deckRotationIndex !== undefined && !Number.isSafeInteger(config.deckRotationIndex)) {
    throw new TypeError("Event Shop deck rotation index must be a safe integer.");
  }
  if (
    !Number.isFinite(config.spotlightDiscountPercent) ||
    config.spotlightDiscountPercent < 0 ||
    config.spotlightDiscountPercent > 100
  ) {
    throw new RangeError("Event Shop spotlight discount must be between 0 and 100.");
  }
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex] as T,
      shuffled[index] as T,
    ];
  }
  return shuffled;
}

function discountedPrice(price: number, discountPercent: number): number {
  if (price === 0) return 0;
  return Math.max(1, Math.round(price * (1 - discountPercent / 100)));
}

/** Builds a UTC-period rotation. The same config, catalog and period are stable. */
export function createEventShopRotation(
  config: EventShopConfig,
  cards: readonly MarketCard[],
  at: Date,
): EventShopRotation {
  validateConfig(config);
  const timestamp = at.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Event Shop rotation date must be valid.");
  }

  const periodMs = config.periodDays * DAY_IN_MS;
  const anchorMs = config.periodAnchor === undefined ? 0 : Date.parse(config.periodAnchor);
  const periodIndex = Math.floor((timestamp - anchorMs) / periodMs);
  const deckRotationIndex = config.deckRotationIndex ?? periodIndex;
  const startsAtMs = anchorMs + periodIndex * periodMs;
  const rotationKey = `${config.eventSetId}:${config.periodDays}d:${periodIndex}`;

  const eligibleCards = cards
    .filter((card) => {
      if (card.cardType !== "event"
        || card.marketAvailability !== "event-shop"
        || card.isPermanent
        || card.setId !== config.eventSetId) return false;
      const availableFrom = card.availableFrom === undefined ? Number.NEGATIVE_INFINITY : Date.parse(card.availableFrom);
      const availableTo = card.availableTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(card.availableTo);
      if (!Number.isFinite(availableFrom) && availableFrom !== Number.NEGATIVE_INFINITY) {
        throw new TypeError(`Invalid availableFrom for Event Shop card ${card.id}.`);
      }
      if (!Number.isFinite(availableTo) && availableTo !== Number.POSITIVE_INFINITY) {
        throw new TypeError(`Invalid availableTo for Event Shop card ${card.id}.`);
      }
      if (availableFrom >= availableTo) {
        throw new RangeError(`Invalid availability window for Event Shop card ${card.id}.`);
      }
      return timestamp >= availableFrom && timestamp < availableTo;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const ids = new Set<string>();
  for (const card of eligibleCards) {
    if (card.id.trim().length === 0 || ids.has(card.id)) {
      throw new TypeError(`Invalid or duplicate Event Shop card id: ${card.id}.`);
    }
    if (!Number.isSafeInteger(card.price) || card.price < 0) {
      throw new RangeError(`Invalid price for Event Shop card ${card.id}.`);
    }
    ids.add(card.id);
  }

  // A stable seeded deck plus a period-based window guarantees that every
  // event card returns, while still keeping the order unpredictable to users.
  const deckRandom = createRandom(hashString(`${config.seed}:${config.eventSetId}`));
  const seededDeck = shuffle(eligibleCards, deckRandom);
  const selectedCount = Math.min(config.offerCount, seededDeck.length);
  const startIndex = seededDeck.length === 0
    ? 0
    : ((deckRotationIndex * selectedCount) % seededDeck.length + seededDeck.length) %
      seededDeck.length;
  const selectedCards = Array.from(
    { length: selectedCount },
    (_, index) => seededDeck[(startIndex + index) % seededDeck.length] as MarketCard,
  );
  const random = createRandom(hashString(`${config.seed}:${rotationKey}:spotlight`));
  const spotlightIndex = selectedCards.length > 0
    ? Math.floor(random() * selectedCards.length)
    : -1;

  const offers: EventShopOffer[] = selectedCards.map((card, index) => {
    const isSpotlight = index === spotlightIndex;
    return {
      id: `event-shop:${rotationKey}:${card.id}`,
      cardId: card.id,
      regularPrice: card.price,
      price: isSpotlight
        ? discountedPrice(card.price, config.spotlightDiscountPercent)
        : card.price,
      placement: isSpotlight ? "spotlight" : "standard",
      source: "event_shop",
      currency: "credits",
    };
  });

  return {
    kind: "event_shop",
    eventSetId: config.eventSetId,
    rotationKey,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(startsAtMs + periodMs).toISOString(),
    offers,
  };
}
