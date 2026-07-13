import type { CardId, CardOffer } from "../economy";

/** Minimal catalog projection required by the shop domain. */
export interface MarketCard {
  id: CardId;
  price: number;
  setId: string;
  isPermanent: boolean;
}

export interface BaseMarket {
  kind: "base_market";
  offers: CardOffer[];
}

export interface EventShopConfig {
  seed: string;
  eventSetId: string;
  periodDays: number;
  offerCount: number;
  spotlightDiscountPercent: number;
}

export interface EventShopOffer extends CardOffer {
  regularPrice: number;
  placement: "standard" | "spotlight";
}

export interface EventShopRotation {
  kind: "event_shop";
  eventSetId: string;
  rotationKey: string;
  startsAt: string;
  endsAt: string;
  offers: EventShopOffer[];
}

