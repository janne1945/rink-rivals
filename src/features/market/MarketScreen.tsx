import { useMemo, useState } from "react";
import type { CardCatalog } from "../../domain/cards";
import type { CardOffer, OwnedCard } from "../../domain/economy";
import type { EventShopRotation } from "../../domain/shop";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "../Screens.module.css";

interface MarketScreenProps {
  catalog: CardCatalog;
  collection: Record<string, OwnedCard>;
  credits: number;
  baseOffers: readonly CardOffer[];
  eventRotation: EventShopRotation;
  onBuy: (offer: CardOffer) => Promise<string>;
}

export function MarketScreen({ catalog, collection, credits, baseOffers, eventRotation, onBuy }: MarketScreenProps) {
  const [tab, setTab] = useState<"base" | "event">("base");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const cards = useMemo(() => new Map(catalog.cards.map((card) => [card.id, card])), [catalog]);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog]);
  const offers: readonly CardOffer[] = tab === "base" ? baseOffers : eventRotation.offers;

  async function buy(offer: CardOffer) {
    setBusy(offer.id);
    setMessage("");
    try {
      setMessage(await onBuy(offer));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Direct purchase. No paywall.</p>
        <h1 className={styles.title}>Player Market</h1>
        <p className={styles.lede}>Every Base card is always available. Event cards rotate, return later, and never require real money.</p>
      </header>
      <div className={styles.sectionHead}>
        <div className={styles.marketTabs} role="tablist" aria-label="Market type">
          <button role="tab" aria-selected={tab === "base"} className={tab === "base" ? styles.tabActive : ""} onClick={() => setTab("base")}>Base Market</button>
          <button role="tab" aria-selected={tab === "event"} className={tab === "event" ? styles.tabActive : ""} onClick={() => setTab("event")}>Rivalry Event</button>
        </div>
        {tab === "event" ? <p>Rotation ends {new Date(eventRotation.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</p> : null}
      </div>
      {message ? <div className={message.includes("Not enough") ? styles.error : styles.notice} role="status">{message}</div> : null}
      <div className={styles.cardGrid}>
        {offers.map((offer) => {
          const card = cards.get(offer.cardId);
          const player = card ? players.get(card.playerId) : undefined;
          if (!card || !player) return null;
          const owned = collection[card.id];
          const unaffordable = credits < offer.price;
          return (
            <div className={styles.shopCard} key={offer.id}>
              <HockeyCard card={card} player={player} status={owned ? `Owned ×${owned.quantity}` : undefined} />
              <button className={styles.shopAction} disabled={unaffordable || busy !== null} onClick={() => void buy(offer)}>
                {busy === offer.id ? "Processing…" : unaffordable ? "Not enough Credits" : `${offer.price.toLocaleString("en-US")} Credits`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
