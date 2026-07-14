import type { CardId, CardOffer } from "../economy";
import type { CardType, MarketAvailability } from "../cards/types";

/** Minimal catalog projection required by the shop domain. */
export interface MarketCard {
  id: CardId;
  price: number;
  setId: string;
  cardType: CardType;
  marketAvailability: MarketAvailability;
  isPermanent: boolean;
  availableFrom?: string;
  availableTo?: string;
}

export interface BaseMarket {
  kind: "base_market";
  offers: CardOffer[];
}

export interface EventShopConfig {
  seed: string;
  eventSetId: string;
  periodDays: number;
  /** Optional UTC ISO anchor used to align recurring periods, for example to Monday. */
  periodAnchor?: string;
  /** Optional occurrence counter used to advance a recurring event's deck independently of calendar gaps. */
  deckRotationIndex?: number;
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

export interface EventVisualMetadata {
  readonly accentColor: string;
  readonly surfaceColor: string;
  readonly emblem: string;
  readonly motif: string;
}

export interface EventGameplayIdentity {
  readonly headlineAttribute: string;
  readonly supportingAttribute: string;
  readonly tradeoffAttribute: string;
  readonly summary: string;
}

export interface EventCalendarDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly visual: EventVisualMetadata;
  readonly gameplay: EventGameplayIdentity;
  readonly rotation: Readonly<{
    durationWeeks: 1;
    recurrenceWeeks: number;
    offerCount: number;
    spotlightDiscountPercent: number;
    seed: string;
  }>;
}

export interface EventCalendarRotation {
  readonly event: EventCalendarDefinition;
  readonly weekIndex: number;
  readonly shop: EventShopRotation;
}
