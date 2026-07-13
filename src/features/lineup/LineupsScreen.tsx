import { useMemo, useState } from "react";
import type { CardCatalog } from "../../domain/cards";
import type { OwnedCard } from "../../domain/economy";
import { LINEUP_SLOTS, requiredLeagueForMode, validateLineup, type Lineup, type LineupSlot } from "../../domain/lineups";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "../Screens.module.css";

interface LineupsScreenProps {
  lineups: readonly Lineup[];
  activeLineupIds: Record<string, string>;
  catalog: CardCatalog;
  collection: Record<string, OwnedCard>;
  onActivate: (lineup: Lineup) => void;
  onSave: (lineup: Lineup) => Promise<void>;
}

export function LineupsScreen({ lineups, activeLineupIds, catalog, collection, onActivate, onSave }: LineupsScreenProps) {
  const [editing, setEditing] = useState<Lineup | null>(null);
  const [slot, setSlot] = useState<LineupSlot>("LW");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog]);

  const candidates = editing ? catalog.cards.filter((card) => {
    const player = players.get(card.playerId);
    const requiredLeague = requiredLeagueForMode(editing.mode);
    return Boolean(
      player &&
      collection[card.id] &&
      player.eligiblePositions.includes(slot as never) &&
      (!requiredLeague || player.league === requiredLeague),
    );
  }) : [];

  function openEditor(lineup: Lineup) {
    setEditing({ ...lineup, slots: { ...lineup.slots } });
    setSlot("LW");
    setMessage("");
  }

  function assign(cardId: string) {
    if (!editing) return;
    setEditing({ ...editing, slots: { ...editing.slots, [slot]: cardId } });
    const nextSlot = LINEUP_SLOTS[LINEUP_SLOTS.indexOf(slot) + 1];
    if (nextSlot) setSlot(nextSlot);
  }

  async function saveLineup() {
    if (!editing) return;
    const result = validateLineup(editing, catalog);
    if (!result.valid) {
      setMessage(result.issues[0]?.message ?? "This lineup is not valid.");
      return;
    }
    setSaving(true);
    try {
      await onSave(editing);
      setMessage("Lineup saved to this device.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Six cards. Every role matters.</p>
        <h1 className={styles.title}>Lineups</h1>
        <p className={styles.lede}>Circuit lineups stay league-pure. Open Ice can mix NHL and PWHL cards without a chemistry penalty.</p>
      </header>
      <div className={styles.lineupGrid}>
        {lineups.map((lineup) => {
          const active = activeLineupIds[lineup.mode] === lineup.id;
          return (
            <article key={lineup.id} className={`${styles.lineupCard} ${active ? styles.lineupCardActive : ""}`}>
              <div className={styles.lineupTop}>
                <div><span className={styles.badge}>{lineup.mode.replace("-", " ")}</span><h3>{lineup.name}</h3></div>
                {active ? <span className={styles.badge}>Active</span> : null}
              </div>
              <div className={styles.miniSlots} aria-label={`${lineup.name} positions`}>
                {LINEUP_SLOTS.map((position) => <span className={styles.miniSlot} key={position}>{position}</span>)}
              </div>
              <div className={styles.lineupActions}>
                <Button variant="secondary" onClick={() => openEditor(lineup)}>Edit six</Button>
                <Button variant={active ? "ghost" : "secondary"} disabled={active} onClick={() => onActivate(lineup)}>{active ? "Active" : "Set active"}</Button>
              </div>
            </article>
          );
        })}
      </div>

      {editing ? (
        <section className={styles.builder} aria-labelledby="builder-title">
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}>Lineup builder</p><h2 id="builder-title">{editing.name}</h2><p>Choose a position, then assign one of your eligible cards.</p></div>
            <Button variant="ghost" onClick={() => setEditing(null)}>Close editor</Button>
          </div>
          <div className={styles.slotPicker} role="tablist" aria-label="Lineup slots">
            {LINEUP_SLOTS.map((position) => (
              <button key={position} role="tab" aria-selected={slot === position} className={`${styles.slotButton} ${slot === position ? styles.slotButtonActive : ""}`} onClick={() => setSlot(position)}>
                <span>{position}</span><small>{players.get(catalog.cards.find((card) => card.id === editing.slots[position])?.playerId ?? "")?.name ?? "Empty"}</small>
              </button>
            ))}
          </div>
          <div className={styles.sectionHead}><div><h2>Eligible for {slot}</h2><p>{requiredLeagueForMode(editing.mode) ?? "NHL and PWHL"} · owned cards only</p></div></div>
          <div className={styles.candidateGrid}>
            {candidates.map((card) => {
              const player = players.get(card.playerId)!;
              return <HockeyCard key={card.id} card={card} player={player} selected={editing.slots[slot] === card.id} onClick={() => assign(card.id)} />;
            })}
          </div>
          {message ? <div className={message.includes("saved") ? styles.notice : styles.error} role="status">{message}</div> : null}
          <div className={styles.builderActions}><Button onClick={() => void saveLineup()} disabled={saving}>{saving ? "Saving…" : "Save lineup"}</Button></div>
        </section>
      ) : null}
    </div>
  );
}
