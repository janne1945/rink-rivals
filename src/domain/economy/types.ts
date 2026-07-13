export type CardId = string;

export interface OwnedCard {
  cardId: CardId;
  quantity: number;
  acquiredAt: string;
}

export interface PurchaseRecord {
  requestId: string;
  offerId: string;
  cardId: CardId;
  price: number;
  source: "base_market" | "event_shop";
  purchasedAt: string;
}

export interface MatchRewardRecord {
  rewardId: string;
  matchId: string;
  credits: number;
  grantedAt: string;
}

export interface EconomyState {
  credits: number;
  collection: Record<CardId, OwnedCard>;
  purchaseHistory: PurchaseRecord[];
  processedPurchaseIds: string[];
  rewardHistory: MatchRewardRecord[];
  processedRewardIds: string[];
  completedMatches: number;
}

export interface CardOffer {
  id: string;
  cardId: CardId;
  price: number;
  source: PurchaseRecord["source"];
  currency: "credits";
}

export interface MatchReward {
  rewardId: string;
  matchId: string;
  credits: number;
}
