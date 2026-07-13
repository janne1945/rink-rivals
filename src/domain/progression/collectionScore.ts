import type { CardId, OwnedCard } from "../economy";

export interface CollectionScoreCard {
  id: CardId;
  overall: number;
  setId: string;
  cardType: string;
}

export interface CollectionSetDefinition {
  id: string;
  cardIds: readonly CardId[];
}

export interface CollectionScoreRules {
  pointsPerUniqueCard: number;
  overallBaseline: number;
  overallPointMultiplier: number;
  nonBaseCardBonus: number;
  completedSetBonus: number;
}

export interface CollectionScoreBreakdown {
  score: number;
  uniqueCards: number;
  uniqueCardPoints: number;
  qualityPoints: number;
  nonBaseCardPoints: number;
  completedSetPoints: number;
  completedSetIds: string[];
  missingCatalogCardIds: CardId[];
}

export const DEFAULT_COLLECTION_SCORE_RULES: Readonly<CollectionScoreRules> = {
  pointsPerUniqueCard: 100,
  overallBaseline: 60,
  overallPointMultiplier: 2,
  nonBaseCardBonus: 50,
  completedSetBonus: 250,
};

function validateRules(rules: CollectionScoreRules): void {
  const values = Object.values(rules);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError("Collection Score rules must contain non-negative integers.");
  }
}

/**
 * Scores first-time ownership only. Duplicate quantities never add points.
 * Missing catalog entries are reported and ignored rather than breaking a save.
 */
export function calculateCollectionScore(
  collection: Readonly<Record<CardId, OwnedCard>>,
  catalog: readonly CollectionScoreCard[],
  sets: readonly CollectionSetDefinition[] = [],
  rules: CollectionScoreRules = DEFAULT_COLLECTION_SCORE_RULES,
): CollectionScoreBreakdown {
  validateRules(rules);

  const catalogById = new Map<CardId, CollectionScoreCard>();
  for (const card of catalog) {
    if (
      card.id.trim().length === 0 ||
      catalogById.has(card.id) ||
      !Number.isSafeInteger(card.overall) ||
      card.overall < 0
    ) {
      throw new TypeError(`Invalid or duplicate Collection Score card: ${card.id}.`);
    }
    catalogById.set(card.id, card);
  }
  const ownedIds = Object.entries(collection)
    .filter(([, ownedCard]) => ownedCard.quantity > 0)
    .map(([cardId]) => cardId)
    .sort();

  const knownOwnedCards: CollectionScoreCard[] = [];
  const missingCatalogCardIds: CardId[] = [];
  for (const cardId of ownedIds) {
    const card = catalogById.get(cardId);
    if (card) knownOwnedCards.push(card);
    else missingCatalogCardIds.push(cardId);
  }

  const uniqueCardPoints = knownOwnedCards.length * rules.pointsPerUniqueCard;
  const qualityPoints = knownOwnedCards.reduce(
    (total, card) =>
      total +
      Math.max(0, card.overall - rules.overallBaseline) *
        rules.overallPointMultiplier,
    0,
  );
  const nonBaseCardPoints = knownOwnedCards.filter(
    (card) => card.cardType.toLowerCase() !== "base",
  ).length * rules.nonBaseCardBonus;

  const ownedIdSet = new Set(knownOwnedCards.map((card) => card.id));
  const seenSetIds = new Set<string>();
  for (const set of sets) {
    if (set.id.trim().length === 0 || seenSetIds.has(set.id)) {
      throw new TypeError(`Invalid or duplicate Collection Score set: ${set.id}.`);
    }
    seenSetIds.add(set.id);
  }
  const completedSetIds = sets
    .filter(
      (set) =>
        set.cardIds.length > 0 &&
        set.cardIds.every((cardId) => ownedIdSet.has(cardId)),
    )
    .map((set) => set.id)
    .sort();
  const completedSetPoints = completedSetIds.length * rules.completedSetBonus;

  return {
    score:
      uniqueCardPoints +
      qualityPoints +
      nonBaseCardPoints +
      completedSetPoints,
    uniqueCards: knownOwnedCards.length,
    uniqueCardPoints,
    qualityPoints,
    nonBaseCardPoints,
    completedSetPoints,
    completedSetIds,
    missingCatalogCardIds,
  };
}
