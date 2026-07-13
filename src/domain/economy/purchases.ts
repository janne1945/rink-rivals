import type {
  CardOffer,
  EconomyState,
  PurchaseRecord,
} from "./types";

export type PurchaseResult<T extends EconomyState> =
  | {
      ok: true;
      status: "purchased" | "already_processed";
      state: T;
      record: PurchaseRecord;
    }
  | {
      ok: false;
      reason:
        | "invalid_request_id"
        | "invalid_offer"
        | "insufficient_credits"
        | "request_conflict";
      state: T;
    };

function isValidNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSamePurchase(record: PurchaseRecord, offer: CardOffer): boolean {
  return (
    record.offerId === offer.id &&
    record.cardId === offer.cardId &&
    record.price === offer.price &&
    record.source === offer.source
  );
}

/**
 * Applies a direct card purchase without mutating the supplied state.
 *
 * The request id is the idempotency key. Replaying the same request returns the
 * original record without charging Credits or adding another copy of the card.
 */
export function purchaseCard<T extends EconomyState>(
  state: T,
  offer: CardOffer,
  requestId: string,
  purchasedAt = new Date().toISOString(),
): PurchaseResult<T> {
  if (requestId.trim().length === 0) {
    return { ok: false, reason: "invalid_request_id", state };
  }

  const existing = state.purchaseHistory.find(
    (record) => record.requestId === requestId,
  );
  if (existing) {
    if (!isSamePurchase(existing, offer)) {
      return { ok: false, reason: "request_conflict", state };
    }

    return {
      ok: true,
      status: "already_processed",
      state,
      record: existing,
    };
  }

  if (state.processedPurchaseIds.includes(requestId)) {
    return { ok: false, reason: "request_conflict", state };
  }

  if (
    offer.id.trim().length === 0 ||
    offer.cardId.trim().length === 0 ||
    offer.currency !== "credits" ||
    !isValidNonNegativeInteger(offer.price)
  ) {
    return { ok: false, reason: "invalid_offer", state };
  }

  if (!isValidNonNegativeInteger(state.credits) || state.credits < offer.price) {
    return { ok: false, reason: "insufficient_credits", state };
  }

  const previousOwnedCard = state.collection[offer.cardId];
  const record: PurchaseRecord = {
    requestId,
    offerId: offer.id,
    cardId: offer.cardId,
    price: offer.price,
    source: offer.source,
    purchasedAt,
  };

  const nextState = {
    ...state,
    credits: state.credits - offer.price,
    collection: {
      ...state.collection,
      [offer.cardId]: previousOwnedCard
        ? { ...previousOwnedCard, quantity: previousOwnedCard.quantity + 1 }
        : { cardId: offer.cardId, quantity: 1, acquiredAt: purchasedAt },
    },
    purchaseHistory: [...state.purchaseHistory, record],
    processedPurchaseIds: [...state.processedPurchaseIds, requestId],
  } as T;

  return { ok: true, status: "purchased", state: nextState, record };
}
