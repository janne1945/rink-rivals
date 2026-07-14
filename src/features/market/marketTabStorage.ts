export type MarketTab = "base" | "event";

const MARKET_TAB_STORAGE_KEY = "rink-rivals:market-tab";

type MarketTabStorage = Pick<Storage, "getItem" | "setItem">;

function browserSessionStorage(): MarketTabStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.sessionStorage;
}

export function readMarketTab(storage?: MarketTabStorage): MarketTab {
  try {
    const value = (storage ?? browserSessionStorage())?.getItem(MARKET_TAB_STORAGE_KEY);
    return value === "event" || value === "base" ? value : "base";
  } catch {
    return "base";
  }
}

export function persistMarketTab(tab: MarketTab, storage?: MarketTabStorage): void {
  try {
    (storage ?? browserSessionStorage())?.setItem(MARKET_TAB_STORAGE_KEY, tab);
  } catch {
    // Storage may be disabled or unavailable. The in-memory tab still works.
  }
}
