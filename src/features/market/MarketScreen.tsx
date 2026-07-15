import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { CatalogFilters } from "../../components/CatalogFilters";
import {
  ALL_CATALOG_FILTERS,
  createCatalogFilterState,
  matchesCatalogFilters,
} from "../../components/catalogFilterModel";
import { cardEligiblePositions, HOCKEY_POSITIONS, type ContentCatalog } from "../../domain/cards";
import type { OwnedCard } from "../../domain/economy";
import type {
  AccountMarketOffer,
  AccountMarketState,
  PurchaseCardResult,
} from "../../infrastructure/supabase";
import { HockeyCard } from "../../shared/HockeyCard";
import { formatRivalryPoints } from "../../shared/rivalryPoints";
import { createServerClockAnchor, serverTimestampAt } from "../../shared/serverClock";
import styles from "../Screens.module.css";
import { persistMarketTab, readMarketTab, type MarketTab } from "./marketTabStorage";

const OFFER_RENDER_BATCH = 6;

interface MarketScreenProps {
  readonly catalog: ContentCatalog;
  readonly collection: Record<string, OwnedCard>;
  readonly credits: number;
  readonly market: AccountMarketState;
  readonly onBuy: (offerId: string, clientRequestId: string) => Promise<PurchaseCardResult>;
}

interface PurchaseFeedback {
  readonly kind: "success" | "error";
  readonly title: string;
  readonly message: string;
}

interface PendingPurchase {
  readonly offer: AccountMarketOffer;
  readonly playerName: string;
}

function purchaseError(error: unknown): PurchaseFeedback {
  const rawMessage = error instanceof Error
    ? error.message
    : "The acquisition could not be completed. Please try again.";
  if (/not enough credits|insufficient/i.test(rawMessage)) {
    return {
      kind: "error",
      title: "Insufficient Rivalry Points",
      message: "Your current RP balance is not enough to complete this acquisition.",
    };
  }
  if (/not available|offer ended|rotation|closed/i.test(rawMessage)) {
    return {
      kind: "error",
      title: "Rotation Closed",
      message: "This player release is no longer available through the Player Market.",
    };
  }
  return {
    kind: "error",
    title: "Acquisition Unavailable",
    message: rawMessage.replaceAll("Credits", "Rivalry Points").replaceAll("credits", "Rivalry Points"),
  };
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
  const [feedback, setFeedback] = useState<PurchaseFeedback | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [monotonicClock, setMonotonicClock] = useState(() => performance.now());
  const requestIds = useRef(new Map<string, string>());
  const purchaseInFlight = useRef(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const acquisitionTriggerRef = useRef<HTMLButtonElement>(null);
  const feedbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const anchor = useMemo(
    () => createServerClockAnchor(market.serverTime, performance.now(), Date.now()),
    [market.serverTime],
  );
  const cards = useMemo(() => new Map(catalog.cards.map((card) => [card.id, card])), [catalog.cards]);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog.players]);
  const teams = useMemo(() => new Map(catalog.teams.map((team) => [team.id, team])), [catalog.teams]);

  useEffect(() => {
    if (!market.currentEvent) return undefined;
    const timer = window.setInterval(() => setMonotonicClock(performance.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [market.currentEvent]);

  useEffect(() => {
    if (!pendingPurchase) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingPurchase]);

  useEffect(() => {
    if (feedback && !pendingPurchase) feedbackHeadingRef.current?.focus();
  }, [feedback, pendingPurchase]);

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
      positions: cardEligiblePositions(card, player),
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

  function resetFilters(): void {
    updateFilters(createCatalogFilterState());
  }

  function cancelPurchase(): void {
    setPendingPurchase(null);
    window.requestAnimationFrame(() => acquisitionTriggerRef.current?.focus());
  }

  async function buy({ offer }: PendingPurchase) {
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
        title: result.status === "already-processed" ? "Collection Updated" : "Player Acquired",
        message: result.status === "already-processed"
          ? "Your latest player release is already secured and your Collection is up to date."
          : `The card has been added to your Collection and is ready for lineup use. ${formatRivalryPoints(result.credits)} remaining.`,
      });
    } catch (error) {
      setFeedback(purchaseError(error));
    } finally {
      purchaseInFlight.current = false;
      setBusyOfferId(null);
      setPendingPurchase(null);
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

  const emptyState = tab === "event" && !activeEvent
    ? {
        title: eventEnded ? "Rotation Closed" : "No Active Rotation",
        message: eventEnded
          ? "This Event Series is no longer available. Check back soon for the next featured Market Rotation."
          : "The Event Shop is currently between releases. A new limited series will enter the Market soon.",
      }
    : {
        title: "No Releases Found",
        message: "No player releases match your current filters. Adjust your search or reset the filters to continue browsing the Market.",
      };
  const rotationState = eventEnded
    ? {
        title: "Rotation Closed",
        message: "This Event Series is no longer available. Check back soon for the next featured Market Rotation.",
      }
    : {
        title: "No Active Rotation",
        message: "The Event Shop is currently between releases. A new limited series will enter the Market soon.",
      };
  const activeEventDescription = activeEvent?.id === "signature-series"
    ? "Great players are remembered for the qualities that define them. Signature Series celebrates those unmistakable strengths through limited player editions available during the current Market Rotation."
    : activeEvent?.description;

  return (
    <div className={styles.page}>
      <header className={styles.marketPageHeader}>
        <p className={styles.eyebrow}>Official player releases</p>
        <h1 className={styles.title}>Player Market</h1>
        <p className={styles.lede}>Build your legacy through official player releases. Acquire permanent Base cards, explore limited Event Rotations and strengthen your Collection with every new addition.</p>
        <p className={styles.marketTrust}>Server verified <span aria-hidden="true">·</span> Instant delivery to your Collection</p>
      </header>

      <section className={styles.marketHero} aria-labelledby="market-event-heading">
        <div>
          <p className={styles.eyebrow}>{activeEvent ? "Live event" : "Market rotation"}</p>
          <h2 id="market-event-heading">{activeEvent?.name ?? rotationState.title}</h2>
          <p>{activeEvent
            ? activeEventDescription ?? "Discover limited player editions available during the current Market Rotation."
            : rotationState.message}</p>
          {activeEvent && tab !== "event" ? <button type="button" className={styles.marketHeroAction} onClick={() => switchTab("event")}>Explore the Series</button> : null}
        </div>
        {activeEvent ? (
          <div className={styles.countdown} aria-label={`Rotation time remaining ${countdownLabel(eventRemaining)}`}>
            <span>Rotation ends in</span>
            <strong>{countdownLabel(eventRemaining)}</strong>
            <small>{new Date(activeEvent.endsAt).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</small>
          </div>
        ) : null}
      </section>

      <section className={styles.marketBrowse} aria-labelledby="market-browse-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>{tab === "base" ? "Permanent releases" : "Limited releases"}</p>
            <h2 id="market-browse-heading">{tab === "base" ? "Base Market" : "Event Shop"}</h2>
            <p>{tab === "base"
              ? "Browse permanent player releases available throughout the season. Base cards form the foundation of every Collection and never leave the Market."
              : "Discover limited player editions released through featured Market Rotations. Once a rotation ends, its offers leave the Market."}</p>
          </div>
          <div className={styles.marketTabs} role="group" aria-label="Market type">
            <button type="button" aria-pressed={tab === "base"} className={tab === "base" ? styles.tabActive : ""} onClick={() => switchTab("base")}>Base Market</button>
            <button type="button" aria-pressed={tab === "event"} className={tab === "event" ? styles.tabActive : ""} onClick={() => switchTab("event")}>Event Shop</button>
          </div>
        </div>

        <CatalogFilters
          filters={filters}
          teams={catalog.teams}
          positions={HOCKEY_POSITIONS}
          cardTypes={cardTypes}
          setIds={setIds}
          resultCount={visibleOffers.length}
          resultLabel={`${visibleOffers.length} available offer${visibleOffers.length === 1 ? "" : "s"}`}
          searchLabel="Search market"
          searchPlaceholder="Search players, teams or collections…"
          title="Explore the Market"
          description="Find players across leagues, teams, positions, sets and active releases."
          onChange={updateFilters}
        />
      </section>

      {feedback ? (
        <section className={feedback.kind === "error" ? styles.marketFeedbackError : styles.marketFeedback} role={feedback.kind === "error" ? "alert" : "status"} aria-live="polite">
          <p className={styles.eyebrow}>{feedback.kind === "error" ? "Acquisition status" : "Instant delivery"}</p>
          <h2 ref={feedbackHeadingRef} tabIndex={-1}>{feedback.title}</h2>
          <p>{feedback.message}</p>
          <div className={styles.marketFeedbackActions}>
            {feedback.kind === "success" ? <Link to="/collection">View Collection</Link> : null}
            <button type="button" onClick={() => setFeedback(null)}>{feedback.kind === "success" ? "Continue Browsing" : "Return to Market"}</button>
          </div>
        </section>
      ) : null}

      <div className={styles.cardGrid} aria-label="Market offers">
        {renderedOffers.map((offer) => {
          const card = cards.get(offer.cardId);
          const player = card ? players.get(card.playerId) : undefined;
          if (!card || !player) return null;
          const owned = collection[card.id];
          const unaffordable = credits < offer.price;
          const ended = offer.source === "event_shop" && eventEnded;
          const shortfall = Math.max(0, offer.price - credits);
          return (
            <article className={`${styles.shopCard} ${offer.placement === "spotlight" ? styles.shopCardSpotlight : ""}`} key={offer.id}>
              <HockeyCard
                card={card}
                player={player}
                status={owned ? `Collection owned ×${owned.quantity}` : "Available now"}
                marketStatus={tab === "base" ? "Base release" : "Rotation exclusive"}
              />
              <div className={styles.offerDetails}>
                <div className={styles.offerBadgeRow}>
                  {offer.placement === "spotlight" ? <span className={styles.spotlightBadge}>Featured Release</span> : <span className={styles.releaseBadge}>{tab === "base" ? "Permanent Release" : "Limited Rotation"}</span>}
                </div>
                <div className={styles.offerMeta}>
                  <span>{owned ? `Collection owned ×${owned.quantity}` : "Available now"}</span>
                  <span className={styles.offerPrice}>
                    {offer.regularPrice > offer.price ? <s>{formatRivalryPoints(offer.regularPrice)}</s> : null}
                    <strong>{formatRivalryPoints(offer.price)}</strong>
                  </span>
                </div>
                {unaffordable ? <small className={styles.offerRequirement}>{formatRivalryPoints(shortfall)} additional required</small> : null}
              </div>
              <button
                type="button"
                className={styles.shopAction}
                disabled={ended || unaffordable || busyOfferId !== null}
                aria-label={ended
                  ? `${player.name} rotation closed`
                  : unaffordable
                    ? `${player.name} requires ${formatRivalryPoints(shortfall)} additional`
                    : `Add ${player.name} to Collection for ${formatRivalryPoints(offer.price)}`}
                onClick={(event) => {
                  acquisitionTriggerRef.current = event.currentTarget;
                  setPendingPurchase({ offer, playerName: player.name });
                }}
              >
                {busyOfferId === offer.id ? "Acquiring…" : ended ? "Rotation Closed" : unaffordable ? `Requires ${formatRivalryPoints(offer.price)}` : "Add to Collection"}
              </button>
            </article>
          );
        })}
        {visibleOffers.length === 0 ? (
          <section className={styles.empty} aria-labelledby="market-empty-heading">
            <h2 id="market-empty-heading">{emptyState.title}</h2>
            <p>{emptyState.message}</p>
            {offers.length > 0 ? <button type="button" onClick={resetFilters}>Reset Filters</button> : null}
          </section>
        ) : null}
      </div>
      {renderedOffers.length < visibleOffers.length ? (
        <div className={styles.loadMoreRow}>
          <p>Showing {renderedOffers.length} of {visibleOffers.length} releases</p>
          <button type="button" onClick={() => setRenderLimit((current) => current + OFFER_RENDER_BATCH)}>Show More Releases</button>
        </div>
      ) : null}

      {pendingPurchase ? (
        <div className={styles.marketDialogBackdrop}>
          <section
            className={styles.marketDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="acquisition-title"
            aria-describedby="acquisition-description"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busyOfferId) cancelPurchase();
              if (event.key !== "Tab") return;
              const actions = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
              const first = actions[0];
              const last = actions.at(-1);
              if (!first || !last) return;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <p className={styles.eyebrow}>Secure acquisition</p>
            <h2 id="acquisition-title">Confirm Acquisition</h2>
            <p id="acquisition-description">Acquire {pendingPurchase.playerName} for <strong>{formatRivalryPoints(pendingPurchase.offer.price)}</strong>?</p>
            <p className={styles.marketDialogSupport}>The card will be delivered instantly to your Collection and become available for lineup use.</p>
            <div className={styles.marketDialogActions}>
              <button ref={confirmButtonRef} type="button" disabled={Boolean(busyOfferId)} onClick={() => void buy(pendingPurchase)}>{busyOfferId ? "Acquiring Player…" : "Acquire Player"}</button>
              <button type="button" aria-disabled={Boolean(busyOfferId)} onClick={() => {
                if (!busyOfferId) cancelPurchase();
              }}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
