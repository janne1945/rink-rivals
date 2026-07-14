import { useEffect, useMemo, useRef, useState } from "react";

import { CatalogFilters } from "../../components/CatalogFilters";
import {
  ALL_CATALOG_FILTERS,
  createCatalogFilterState,
  matchesCatalogFilters,
} from "../../components/catalogFilterModel";
import { HOCKEY_POSITIONS, type ContentCatalog } from "../../domain/cards";
import type { OwnedCard } from "../../domain/economy";
import type {
  AccountMarketOffer,
  AccountMarketState,
  PurchaseCardResult,
} from "../../infrastructure/supabase";
import { HockeyCard } from "../../shared/HockeyCard";
import { createServerClockAnchor, serverTimestampAt } from "../../shared/serverClock";
import styles from "../Screens.module.css";
import { persistMarketTab, readMarketTab, type MarketTab } from "./marketTabStorage";

const OFFER_RENDER_BATCH = 48;

interface MarketScreenProps {
  readonly catalog: ContentCatalog;
  readonly collection: Record<string, OwnedCard>;
  readonly credits: number;
  readonly market: AccountMarketState;
  readonly onBuy: (offerId: string, clientRequestId: string) => Promise<PurchaseCardResult>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The purchase could not be completed. Please try again.";
}

function countdownLabel(milliseconds: number): string {
  if (milliseconds <= 0) return "Ended";
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0
    ? `${days}d ${hours}h ${minutes}m`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function MarketScreen({ catalog, collection, credits, market, onBuy }: MarketScreenProps) {
  const [tab, setTab] = useState<MarketTab>(readMarketTab);
  const [filters, setFilters] = useState(createCatalogFilterState);
  const [renderLimit, setRenderLimit] = useState(OFFER_RENDER_BATCH);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [monotonicClock, setMonotonicClock] = useState(() => performance.now());
  const requestIds = useRef(new Map<string, string>());
  const purchaseInFlight = useRef(false);
  const anchor = useMemo(
    () => createServerClockAnchor(market.serverTime, performance.now(), Date.now()),
    [market.serverTime],
  );
  const cards = useMemo(() => new Map(catalog.cards.map((card) => [card.id, card])), [catalog.cards]);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog.players]);
  const teams = useMemo(() => new Map(catalog.teams.map((team) => [team.id, team])), [catalog.teams]);

  useEffect(() => {
    if (tab !== "event" || !market.currentEvent) return undefined;
    const timer = window.setInterval(() => setMonotonicClock(performance.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [market.currentEvent, tab]);

  const serverNow = serverTimestampAt(anchor, monotonicClock);
  const eventRemaining = market.currentEvent ? Date.parse(market.currentEvent.endsAt) - serverNow : 0;
  const eventEnded = Boolean(market.currentEvent && eventRemaining <= 0);
  const activeEvent = eventEnded ? null : market.currentEvent;
  const requiredSource = tab === "base" ? "base_market" : "event_shop";
  const requiredType = tab === "base" ? "base" : "event";
  const requiredAvailability = tab === "base" ? "base-market" : "event-shop";

  const offers = useMemo(() => (tab === "event" && eventEnded ? [] : market.offers.filter((offer) => {
    const card = cards.get(offer.cardId);
    const startsAt = offer.startsAt === null ? Number.NEGATIVE_INFINITY : Date.parse(offer.startsAt);
    const endsAt = offer.endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(offer.endsAt);
    return offer.source === requiredSource
      && card?.cardType === requiredType
      && card.marketAvailability === requiredAvailability
      && startsAt <= serverNow
      && serverNow < endsAt;
  })), [cards, eventEnded, market.offers, requiredAvailability, requiredSource, requiredType, serverNow, tab]);

  const cardTypes = useMemo(
    () => [...new Set(offers.flatMap((offer) => {
      const cardType = cards.get(offer.cardId)?.cardType;
      return cardType ? [cardType] : [];
    }))],
    [cards, offers],
  );
  const setIds = useMemo(
    () => [...new Set(offers.flatMap((offer) => {
      const setId = cards.get(offer.cardId)?.setId;
      return setId ? [setId] : [];
    }))].sort((left, right) => left.localeCompare(right)),
    [cards, offers],
  );
  const visibleOffers = useMemo(() => offers.filter((offer) => {
    const card = cards.get(offer.cardId);
    const player = card ? players.get(card.playerId) : undefined;
    const team = card ? teams.get(card.teamId) : undefined;
    if (!card || !player || !team) return false;
    return matchesCatalogFilters({
      searchText: [player.name, team.name, team.abbreviation, player.nationality ?? "", card.setId, card.cardType].join(" "),
      league: player.league,
      teamId: card.teamId,
      positions: player.eligiblePositions,
      cardType: card.cardType,
      setId: card.setId,
      overall: card.overall,
      price: offer.price,
      owned: Boolean(collection[card.id]?.quantity),
    }, filters);
  }), [cards, collection, filters, offers, players, teams]);
  const renderedOffers = visibleOffers.slice(0, renderLimit);

  function updateFilters(nextFilters: typeof filters): void {
    setFilters(nextFilters);
    setRenderLimit(OFFER_RENDER_BATCH);
  }

  async function buy(offer: AccountMarketOffer) {
    if (purchaseInFlight.current) return;
    purchaseInFlight.current = true;
    const requestId = requestIds.current.get(offer.id) ?? crypto.randomUUID();
    requestIds.current.set(offer.id, requestId);
    setBusyOfferId(offer.id);
    setFeedback(null);
    try {
      const result = await onBuy(offer.id, requestId);
      requestIds.current.delete(offer.id);
      setFeedback({
        kind: "success",
        message: result.status === "already-processed"
          ? `Purchase already processed. Your collection and ${result.credits.toLocaleString("en-US")} Credits are up to date.`
          : `Card added to your collection. ${result.credits.toLocaleString("en-US")} Credits remaining.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      purchaseInFlight.current = false;
      setBusyOfferId(null);
    }
  }

  function switchTab(nextTab: MarketTab) {
    if (busyOfferId) return;
    if (nextTab === "event") setMonotonicClock(performance.now());
    setTab(nextTab);
    persistMarketTab(nextTab);
    setRenderLimit(OFFER_RENDER_BATCH);
    setFilters((current) => ({
      ...current,
      cardType: ALL_CATALOG_FILTERS,
      setId: ALL_CATALOG_FILTERS,
    }));
    setFeedback(null);
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Direct purchase. Server verified.</p>
        <h1 className={styles.title}>Player Market</h1>
        <p className={styles.lede}>Base cards stay available. Starter cards are never sold here, and Event offers only appear during their server-controlled window.</p>
      </header>

      <section className={styles.marketHero}>
        <div>
          <p className={styles.eyebrow}>{tab === "event" ? "Live event" : "Permanent catalog"}</p>
          <h2>{tab === "event" ? activeEvent?.name ?? "No active event" : "Base Market"}</h2>
          <p>{tab === "event" ? activeEvent?.description ?? "The next event rotation will appear here." : "Save toward a normal Base edition and upgrade your Starter six."}</p>
        </div>
        {tab === "event" && activeEvent ? (
          <div className={styles.countdown} aria-label={`Event time remaining ${countdownLabel(eventRemaining)}`}>
            <span>Rotation ends in</span>
            <strong>{countdownLabel(eventRemaining)}</strong>
            <small>{new Date(activeEvent.endsAt).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</small>
          </div>
        ) : null}
      </section>

      <div className={styles.sectionHead}>
        <div className={styles.marketTabs} role="group" aria-label="Market type">
          <button type="button" aria-pressed={tab === "base"} className={tab === "base" ? styles.tabActive : ""} onClick={() => switchTab("base")}>Base Market</button>
          <button type="button" aria-pressed={tab === "event"} className={tab === "event" ? styles.tabActive : ""} onClick={() => switchTab("event")}>Event Shop</button>
        </div>
        <p>{visibleOffers.length} offer{visibleOffers.length === 1 ? "" : "s"}</p>
      </div>

      <CatalogFilters
        filters={filters}
        teams={catalog.teams}
        positions={HOCKEY_POSITIONS}
        cardTypes={cardTypes}
        setIds={setIds}
        resultCount={visibleOffers.length}
        searchLabel="Search market"
        onChange={updateFilters}
      />

      {feedback ? <div className={feedback.kind === "error" ? styles.error : styles.notice} role={feedback.kind === "error" ? "alert" : "status"} aria-live="polite">{feedback.message}</div> : null}

      <div className={styles.cardGrid} aria-label="Market offers">
        {renderedOffers.map((offer) => {
          const card = cards.get(offer.cardId);
          const player = card ? players.get(card.playerId) : undefined;
          if (!card || !player) return null;
          const owned = collection[card.id];
          const unaffordable = credits < offer.price;
          const ended = offer.source === "event_shop" && eventEnded;
          return (
            <article className={`${styles.shopCard} ${offer.placement === "spotlight" ? styles.shopCardSpotlight : ""}`} key={offer.id}>
              {offer.placement === "spotlight" ? <span className={styles.spotlightBadge}>Spotlight</span> : null}
              <HockeyCard
                card={card}
                player={player}
                status={owned ? `Owned ×${owned.quantity}` : "Not owned"}
                marketStatus={tab === "base" ? "Base Market" : "Event Shop"}
              />
              <div className={styles.offerMeta}>
                <span>{owned ? `Owned ×${owned.quantity}` : "Not owned"}</span>
                {offer.regularPrice > offer.price ? <span><s>{offer.regularPrice.toLocaleString("en-US")}</s> CR</span> : <span>{card.overall} OVR</span>}
              </div>
              <button
                type="button"
                className={styles.shopAction}
                disabled={ended || unaffordable || busyOfferId !== null}
                aria-label={`Buy ${player.name} for ${offer.price.toLocaleString("en-US")} Credits`}
                onClick={() => void buy(offer)}
              >
                {busyOfferId === offer.id ? "Processing…" : ended ? "Offer ended" : unaffordable ? "Not enough Credits" : `${offer.price.toLocaleString("en-US")} Credits`}
              </button>
            </article>
          );
        })}
        {visibleOffers.length === 0 ? <div className={styles.empty}>{tab === "event" && !activeEvent ? "No event is active right now." : "No offers match these filters."}</div> : null}
      </div>
      {renderedOffers.length < visibleOffers.length ? (
        <div className={styles.loadMoreRow}>
          <p>Showing {renderedOffers.length} of {visibleOffers.length} offers</p>
          <button type="button" onClick={() => setRenderLimit((current) => current + OFFER_RENDER_BATCH)}>Show more offers</button>
        </div>
      ) : null}
    </div>
  );
}
