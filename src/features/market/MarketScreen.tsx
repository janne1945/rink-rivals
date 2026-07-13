import { useEffect, useMemo, useRef, useState } from "react";
import type { CardCatalog } from "../../domain/cards";
import type { OwnedCard } from "../../domain/economy";
import type {
  AccountMarketOffer,
  AccountMarketState,
  PurchaseCardResult,
} from "../../infrastructure/supabase";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "../Screens.module.css";

type MarketTab = "base" | "event";
type LeagueFilter = "ALL" | "NHL" | "PWHL";

interface MarketScreenProps {
  readonly catalog: CardCatalog;
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
  const [tab, setTab] = useState<MarketTab>("base");
  const [league, setLeague] = useState<LeagueFilter>("ALL");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const requestIds = useRef(new Map<string, string>());
  const purchaseInFlight = useRef(false);
  const anchor = useMemo(() => ({
    clientTime: Date.now(),
    serverTime: Number.isFinite(Date.parse(market.serverTime)) ? Date.parse(market.serverTime) : Date.now(),
  }), [market.serverTime]);
  const cards = useMemo(() => new Map(catalog.cards.map((card) => [card.id, card])), [catalog]);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const serverNow = anchor.serverTime + (clock - anchor.clientTime);
  const eventRemaining = market.currentEvent ? Date.parse(market.currentEvent.endsAt) - serverNow : 0;
  const eventEnded = Boolean(market.currentEvent && eventRemaining <= 0);
  const offers = market.offers.filter((offer) => offer.source === (tab === "base" ? "base_market" : "event_shop"));
  const visibleOffers = offers.filter((offer) => {
    const card = cards.get(offer.cardId);
    const player = card ? players.get(card.playerId) : undefined;
    if (!player) return false;
    if (league !== "ALL" && player.league !== league) return false;
    const haystack = `${player.name} ${player.team} ${player.nationality} ${player.primaryPosition}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

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
    setTab(nextTab);
    setFeedback(null);
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Direct purchase. Server verified.</p>
        <h1 className={styles.title}>Player Market</h1>
        <p className={styles.lede}>Base cards stay available. Event offers rotate on server time and every price is verified before Credits are charged.</p>
      </header>

      <section className={styles.marketHero} aria-live="polite">
        <div>
          <p className={styles.eyebrow}>{tab === "event" ? "Live event" : "Permanent catalog"}</p>
          <h2>{tab === "event" ? market.currentEvent?.name ?? "No active event" : "Base Market"}</h2>
          <p>{tab === "event" ? market.currentEvent?.description ?? "The next event rotation will appear here." : "Save toward a specific favorite and buy it directly."}</p>
        </div>
        {tab === "event" && market.currentEvent ? (
          <div className={styles.countdown} aria-label={`Event time remaining ${countdownLabel(eventRemaining)}`}>
            <span>Rotation ends in</span>
            <strong>{countdownLabel(eventRemaining)}</strong>
            <small>{new Date(market.currentEvent.endsAt).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</small>
          </div>
        ) : null}
      </section>

      <div className={styles.sectionHead}>
        <div className={styles.marketTabs} role="tablist" aria-label="Market type">
          <button type="button" role="tab" aria-selected={tab === "base"} className={tab === "base" ? styles.tabActive : ""} onClick={() => switchTab("base")}>Base Market</button>
          <button type="button" role="tab" aria-selected={tab === "event"} className={tab === "event" ? styles.tabActive : ""} onClick={() => switchTab("event")}>Event Shop</button>
        </div>
        <p>{visibleOffers.length} offer{visibleOffers.length === 1 ? "" : "s"}</p>
      </div>

      <div className={styles.filters} aria-label="Market filters">
        {(["ALL", "NHL", "PWHL"] as const).map((value) => (
          <button type="button" key={value} className={`${styles.filter} ${league === value ? styles.filterActive : ""}`} onClick={() => setLeague(value)}>
            {value === "ALL" ? "All leagues" : value}
          </button>
        ))}
        <label>
          <span className="sr-only">Search market</span>
          <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player or team" />
        </label>
      </div>

      {feedback ? <div className={feedback.kind === "error" ? styles.error : styles.notice} role={feedback.kind === "error" ? "alert" : "status"} aria-live="polite">{feedback.message}</div> : null}

      <div className={styles.cardGrid}>
        {visibleOffers.map((offer) => {
          const card = cards.get(offer.cardId);
          const player = card ? players.get(card.playerId) : undefined;
          if (!card || !player) return null;
          const owned = collection[card.id];
          const unaffordable = credits < offer.price;
          const ended = offer.source === "event_shop" && eventEnded;
          return (
            <article className={`${styles.shopCard} ${offer.placement === "spotlight" ? styles.shopCardSpotlight : ""}`} key={offer.id}>
              {offer.placement === "spotlight" ? <span className={styles.spotlightBadge}>Spotlight</span> : null}
              <HockeyCard card={card} player={player} status={owned ? `Owned ×${owned.quantity}` : undefined} />
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
        {visibleOffers.length === 0 ? <div className={styles.empty}>{tab === "event" && !market.currentEvent ? "No event is active right now." : "No offers match these filters."}</div> : null}
      </div>
    </div>
  );
}
