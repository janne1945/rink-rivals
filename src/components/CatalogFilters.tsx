import {
  ALL_CATALOG_FILTERS,
  createCatalogFilterState,
  type CatalogFilterState,
} from "./catalogFilterModel";
import styles from "./CatalogFilters.module.css";

export interface CatalogFilterTeam {
  readonly id: string;
  readonly name: string;
  readonly league: string;
}

interface CatalogFiltersProps {
  readonly className?: string;
  readonly filters: CatalogFilterState;
  readonly teams: readonly CatalogFilterTeam[];
  readonly positions: readonly string[];
  readonly cardTypes: readonly string[];
  readonly setIds: readonly string[];
  readonly resultCount: number;
  readonly searchLabel?: string;
  readonly searchPlaceholder?: string;
  readonly title?: string;
  readonly description?: string;
  readonly resultLabel?: string;
  readonly resetOwnership?: CatalogFilterState["ownership"];
  readonly showOwnership?: boolean;
  readonly showPrice?: boolean;
  readonly onChange: (filters: CatalogFilterState) => void;
}

const cardTypeLabels: Readonly<Record<string, string>> = {
  starter: "Starter",
  base: "Base",
  event: "Event",
  reward: "Reward",
  featured: "Featured",
  elite: "Elite",
  signature: "Signature",
};

function numberOrNull(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function labelFor(value: string): string {
  return cardTypeLabels[value] ?? value.replaceAll("-", " ");
}

export function CatalogFilters({
  className = "",
  filters,
  teams,
  positions,
  cardTypes,
  setIds,
  resultCount,
  searchLabel = "Search",
  searchPlaceholder = "Player, team, set…",
  title = "Filter cards",
  description,
  resultLabel,
  resetOwnership = "all",
  showOwnership = true,
  showPrice = true,
  onChange,
}: CatalogFiltersProps) {
  const visibleTeams = filters.league === ALL_CATALOG_FILTERS
    ? teams
    : teams.filter((team) => team.league === filters.league);

  function update<Key extends keyof CatalogFilterState>(
    key: Key,
    value: CatalogFilterState[Key],
  ): void {
    onChange({ ...filters, [key]: value });
  }

  function changeLeague(league: string): void {
    const selectedTeamIsVisible = league === ALL_CATALOG_FILTERS
      || teams.some((team) => team.id === filters.teamId && team.league === league);
    onChange({
      ...filters,
      league,
      teamId: selectedTeamIsVisible ? filters.teamId : ALL_CATALOG_FILTERS,
    });
  }

  return (
    <section className={`${styles.panel} ${className}`.trim()} aria-labelledby="catalog-filter-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="catalog-filter-heading">{title}</h2>
          {description ? <p>{description}</p> : null}
          <p aria-live="polite">{resultLabel ?? `${resultCount} result${resultCount === 1 ? "" : "s"}`}</p>
        </div>
        <button
          className={styles.reset}
          type="button"
          onClick={() => onChange(createCatalogFilterState({ ownership: resetOwnership }))}
        >
          Reset filters
        </button>
      </div>

      <div className={styles.controls}>
        <label className={styles.searchField}>
          <span>{searchLabel}</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => update("query", event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>

        <label>
          <span>League</span>
          <select value={filters.league} onChange={(event) => changeLeague(event.target.value)}>
            <option value={ALL_CATALOG_FILTERS}>All leagues</option>
            <option value="NHL">NHL</option>
            <option value="PWHL">PWHL</option>
          </select>
        </label>

        <label>
          <span>Team</span>
          <select value={filters.teamId} onChange={(event) => update("teamId", event.target.value)}>
            <option value={ALL_CATALOG_FILTERS}>All teams</option>
            {visibleTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>

        <label>
          <span>Position</span>
          <select value={filters.position} onChange={(event) => update("position", event.target.value)}>
            <option value={ALL_CATALOG_FILTERS}>All positions</option>
            {positions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
        </label>

        <label>
          <span>Card type</span>
          <select value={filters.cardType} onChange={(event) => update("cardType", event.target.value)}>
            <option value={ALL_CATALOG_FILTERS}>All card types</option>
            {cardTypes.map((cardType) => <option key={cardType} value={cardType}>{labelFor(cardType)}</option>)}
          </select>
        </label>

        <label>
          <span>Set</span>
          <select value={filters.setId} onChange={(event) => update("setId", event.target.value)}>
            <option value={ALL_CATALOG_FILTERS}>All sets</option>
            {setIds.map((setId) => <option key={setId} value={setId}>{labelFor(setId)}</option>)}
          </select>
        </label>

        {showOwnership ? (
          <label>
            <span>Ownership</span>
            <select value={filters.ownership} onChange={(event) => update("ownership", event.target.value as CatalogFilterState["ownership"])}>
              <option value="all">Owned and missing</option>
              <option value="owned">Owned only</option>
              <option value="unowned">Not owned</option>
            </select>
          </label>
        ) : null}

        <fieldset className={styles.range}>
          <legend>Overall</legend>
          <label>
            <span>Minimum OVR</span>
            <input
              aria-label="Minimum overall"
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              placeholder="Min"
              value={filters.minOverall ?? ""}
              onChange={(event) => update("minOverall", numberOrNull(event.target.value))}
            />
          </label>
          <label>
            <span>Maximum OVR</span>
            <input
              aria-label="Maximum overall"
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              placeholder="Max"
              value={filters.maxOverall ?? ""}
              onChange={(event) => update("maxOverall", numberOrNull(event.target.value))}
            />
          </label>
        </fieldset>

        {showPrice ? (
          <fieldset className={styles.range}>
            <legend>Price</legend>
            <label>
              <span>Minimum price</span>
              <input
                aria-label="Minimum price"
                type="number"
                inputMode="numeric"
                min="0"
                step="25"
                placeholder="Min"
                value={filters.minPrice ?? ""}
                onChange={(event) => update("minPrice", numberOrNull(event.target.value))}
              />
            </label>
            <label>
              <span>Maximum price</span>
              <input
                aria-label="Maximum price"
                type="number"
                inputMode="numeric"
                min="0"
                step="25"
                placeholder="Max"
                value={filters.maxPrice ?? ""}
                onChange={(event) => update("maxPrice", numberOrNull(event.target.value))}
              />
            </label>
          </fieldset>
        ) : null}
      </div>
    </section>
  );
}
