import { describe, expect, it } from "vitest";

import {
  createCatalogFilterState,
  matchesCatalogFilters,
  type CatalogFilterEntry,
} from "./catalogFilterModel";

const entry: CatalogFilterEntry = {
  searchText: "Alex Example Toronto Sceptres starter-2026",
  league: "PWHL",
  teamId: "pwhl-toronto-sceptres",
  positions: ["C", "RW"],
  cardType: "starter",
  setId: "starter-2026",
  overall: 72,
  price: 0,
  owned: true,
};

describe("catalog filters", () => {
  it("matches every supported filter at the same time", () => {
    expect(matchesCatalogFilters(entry, createCatalogFilterState({
      query: "sceptres",
      league: "PWHL",
      teamId: "pwhl-toronto-sceptres",
      position: "C",
      cardType: "starter",
      setId: "starter-2026",
      ownership: "owned",
      minOverall: 70,
      maxOverall: 74,
      minPrice: 0,
      maxPrice: 100,
    }))).toBe(true);
  });

  it("matches a secondary eligible position, not only the primary slot", () => {
    expect(matchesCatalogFilters(entry, createCatalogFilterState({ position: "RW" }))).toBe(true);
  });

  it.each([
    { query: "montreal" },
    { league: "NHL" },
    { teamId: "pwhl-montreal-victoire" },
    { position: "G" },
    { cardType: "base" },
    { setId: "base-2026" },
    { ownership: "unowned" as const },
    { minOverall: 73 },
    { maxOverall: 71 },
    { minPrice: 1 },
    { maxPrice: -1 },
  ])("rejects a card when $query$league$teamId$position$cardType$setId$ownership does not match", (override) => {
    expect(matchesCatalogFilters(entry, createCatalogFilterState(override))).toBe(false);
  });
});
