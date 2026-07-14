export type CatalogOwnershipFilter = "all" | "owned" | "unowned";

export interface CatalogFilterState {
  readonly query: string;
  readonly league: string;
  readonly teamId: string;
  readonly position: string;
  readonly cardType: string;
  readonly setId: string;
  readonly ownership: CatalogOwnershipFilter;
  readonly minOverall: number | null;
  readonly maxOverall: number | null;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
}

export interface CatalogFilterEntry {
  readonly searchText: string;
  readonly league: string;
  readonly teamId: string;
  readonly positions: readonly string[];
  readonly cardType: string;
  readonly setId: string;
  readonly overall: number;
  readonly price: number;
  readonly owned: boolean;
}

export const ALL_CATALOG_FILTERS = "ALL";

export function createCatalogFilterState(
  initial: Partial<CatalogFilterState> = {},
): CatalogFilterState {
  return {
    query: "",
    league: ALL_CATALOG_FILTERS,
    teamId: ALL_CATALOG_FILTERS,
    position: ALL_CATALOG_FILTERS,
    cardType: ALL_CATALOG_FILTERS,
    setId: ALL_CATALOG_FILTERS,
    ownership: "all",
    minOverall: null,
    maxOverall: null,
    minPrice: null,
    maxPrice: null,
    ...initial,
  };
}

export function matchesCatalogFilters(
  entry: CatalogFilterEntry,
  filters: CatalogFilterState,
): boolean {
  const query = filters.query.trim().toLocaleLowerCase();
  if (query && !entry.searchText.toLocaleLowerCase().includes(query)) return false;
  if (filters.league !== ALL_CATALOG_FILTERS && entry.league !== filters.league) return false;
  if (filters.teamId !== ALL_CATALOG_FILTERS && entry.teamId !== filters.teamId) return false;
  if (filters.position !== ALL_CATALOG_FILTERS && !entry.positions.includes(filters.position)) return false;
  if (filters.cardType !== ALL_CATALOG_FILTERS && entry.cardType !== filters.cardType) return false;
  if (filters.setId !== ALL_CATALOG_FILTERS && entry.setId !== filters.setId) return false;
  if (filters.ownership === "owned" && !entry.owned) return false;
  if (filters.ownership === "unowned" && entry.owned) return false;
  if (filters.minOverall !== null && entry.overall < filters.minOverall) return false;
  if (filters.maxOverall !== null && entry.overall > filters.maxOverall) return false;
  if (filters.minPrice !== null && entry.price < filters.minPrice) return false;
  if (filters.maxPrice !== null && entry.price > filters.maxPrice) return false;
  return true;
}
