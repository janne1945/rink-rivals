import { useMemo, useState } from "react";

import { CatalogFilters } from "../../components/CatalogFilters";
import {
  createCatalogFilterState,
  matchesCatalogFilters,
} from "../../components/catalogFilterModel";
import {
  CARD_TYPES,
  cardEligiblePositions,
  HOCKEY_POSITIONS,
  type ContentCatalog,
} from "../../domain/cards";
import type { OwnedCard } from "../../domain/economy";
import { HockeyCard } from "../../shared/HockeyCard";
import { marketAvailabilityLabel } from "../../shared/marketAvailabilityLabel";
import styles from "../Screens.module.css";

const CARD_RENDER_BATCH = 48;

interface CollectionScreenProps {
  readonly catalog: ContentCatalog;
  readonly collection: Record<string, OwnedCard>;
}

export function CollectionScreen({ catalog, collection }: CollectionScreenProps) {
  const [filters, setFilters] = useState(() => createCatalogFilterState({ ownership: "owned" }));
  const [renderLimit, setRenderLimit] = useState(CARD_RENDER_BATCH);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog.players]);
  const teams = useMemo(() => new Map(catalog.teams.map((team) => [team.id, team])), [catalog.teams]);
  const setIds = useMemo(
    () => [...new Set(catalog.cards.map((card) => card.setId))].sort((left, right) => left.localeCompare(right)),
    [catalog.cards],
  );

  const cards = useMemo(() => catalog.cards.filter((card) => {
    const player = players.get(card.playerId);
    const team = teams.get(card.teamId);
    if (!player || !team) return false;
    return matchesCatalogFilters({
      searchText: [player.name, team.name, team.abbreviation, player.nationality ?? "", card.setId, card.cardType].join(" "),
      league: player.league,
      teamId: card.teamId,
      positions: cardEligiblePositions(card, player),
      cardType: card.cardType,
      setId: card.setId,
      overall: card.overall,
      price: card.price,
      owned: Boolean(collection[card.id]?.quantity),
    }, filters);
  }), [catalog.cards, collection, filters, players, teams]);
  const renderedCards = cards.slice(0, renderLimit);

  function updateFilters(nextFilters: typeof filters): void {
    setFilters(nextFilters);
    setRenderLimit(CARD_RENDER_BATCH);
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>The vault</p>
        <h1 className={styles.title}>Collection</h1>
        <p className={styles.lede}>Browse the full catalog across both leagues. Starter editions, Base upgrades, Events, and Rewards stay clearly separated.</p>
      </header>

      <CatalogFilters
        filters={filters}
        teams={catalog.teams}
        positions={HOCKEY_POSITIONS}
        cardTypes={CARD_TYPES}
        setIds={setIds}
        resultCount={cards.length}
        searchLabel="Search collection"
        resetOwnership="owned"
        onChange={updateFilters}
      />

      <div className={styles.cardGrid} aria-label="Collection results">
        {renderedCards.map((card) => {
          const player = players.get(card.playerId)!;
          const owned = collection[card.id];
          const ownershipLabel = owned ? `Owned ×${owned.quantity}` : "Not owned";
          const marketStatus = marketAvailabilityLabel(card.marketAvailability);
          return (
            <div className={styles.cardWrap} key={card.id}>
              <HockeyCard card={card} player={player} disabled={!owned} status={ownershipLabel} marketStatus={marketStatus} />
              <div className={styles.ownedMeta}>
                <span>{ownershipLabel}</span>
                <span>{card.price.toLocaleString("en-US")} CR</span>
              </div>
            </div>
          );
        })}
        {cards.length === 0 ? <div className={styles.empty}>No cards match these filters.</div> : null}
      </div>
      {renderedCards.length < cards.length ? (
        <div className={styles.loadMoreRow}>
          <p>Showing {renderedCards.length} of {cards.length} cards</p>
          <button type="button" onClick={() => setRenderLimit((current) => current + CARD_RENDER_BATCH)}>Show more cards</button>
        </div>
      ) : null}
    </div>
  );
}
