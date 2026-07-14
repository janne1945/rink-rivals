import type { MarketAvailability } from "../domain/cards";

const MARKET_AVAILABILITY_LABELS: Record<MarketAvailability, string> = {
  unavailable: "Unavailable",
  "base-market": "Base Market",
  "event-shop": "Event Shop",
  "reward-only": "Reward only",
};

export function marketAvailabilityLabel(availability: MarketAvailability): string {
  return MARKET_AVAILABILITY_LABELS[availability];
}
