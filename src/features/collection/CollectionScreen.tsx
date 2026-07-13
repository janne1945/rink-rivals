import { useMemo, useState } from "react";
import type { CardCatalog } from "../../domain/cards";
import type { OwnedCard } from "../../domain/economy";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "../Screens.module.css";

type LeagueFilter = "ALL" | "NHL" | "PWHL";

export function CollectionScreen({ catalog, collection }: { catalog: CardCatalog; collection: Record<string, OwnedCard> }) {
  const [league, setLeague] = useState<LeagueFilter>("ALL");
  const [ownership, setOwnership] = useState<"owned" | "all">("owned");
  const [query, setQuery] = useState("");
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog]);
  const cards = catalog.cards.filter((card) => {
    const player = players.get(card.playerId);
    if (!player) return false;
    if (league !== "ALL" && player.league !== league) return false;
    if (ownership === "owned" && !collection[card.id]) return false;
    const haystack = `${player.name} ${player.team} ${player.nationality} ${player.primaryPosition}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>The vault</p>
        <h1 className={styles.title}>Collection</h1>
        <p className={styles.lede}>One collection, two leagues. Build a focused circuit lineup or mix your favorites in Open Ice.</p>
      </header>
      <div className={styles.filters} aria-label="Collection filters">
        {(["ALL", "NHL", "PWHL"] as const).map((value) => (
          <button key={value} className={`${styles.filter} ${league === value ? styles.filterActive : ""}`} onClick={() => setLeague(value)}>{value === "ALL" ? "All leagues" : value}</button>
        ))}
        <button className={`${styles.filter} ${ownership === "owned" ? styles.filterActive : ""}`} onClick={() => setOwnership(ownership === "owned" ? "all" : "owned")}>{ownership === "owned" ? "Owned only" : "Show all"}</button>
        <label>
          <span className="sr-only">Search collection</span>
          <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player or team" />
        </label>
      </div>
      <div className={styles.cardGrid} aria-live="polite">
        {cards.map((card) => {
          const player = players.get(card.playerId)!;
          const owned = collection[card.id];
          return (
            <div className={styles.cardWrap} key={card.id}>
              <HockeyCard card={card} player={player} disabled={!owned} status={owned ? undefined : "Not owned"} />
              <div className={styles.ownedMeta}><span>{owned ? "Owned" : "Missing"}</span><span>{owned && owned.quantity > 1 ? `×${owned.quantity}` : card.cardType}</span></div>
            </div>
          );
        })}
        {cards.length === 0 ? <div className={styles.empty}>No cards match these filters.</div> : null}
      </div>
    </div>
  );
}
