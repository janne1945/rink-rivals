import { useMemo, useRef, useState } from "react";
import type { CardCatalog } from "../../domain/cards";
import type { OwnedCard } from "../../domain/economy";
import {
  GAME_MODES,
  LINEUP_SLOTS,
  requiredLeagueForMode,
  validateLineup,
  type GameMode,
  type Lineup,
  type LineupSlot,
} from "../../domain/lineups";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "../Screens.module.css";

interface LineupsScreenProps {
  readonly lineups: readonly Lineup[];
  readonly activeLineupIds: Record<string, string>;
  readonly catalog: CardCatalog;
  readonly collection: Record<string, OwnedCard>;
  readonly onActivate: (lineupId: string) => Promise<void>;
  readonly onSave: (lineup: Lineup, isNew: boolean) => Promise<void>;
}

interface EditorState {
  readonly lineup: Lineup;
  readonly isNew: boolean;
}

const modeCopy: Readonly<Record<GameMode, { label: string; description: string }>> = {
  "nhl-circuit": { label: "NHL Circuit", description: "NHL cards only" },
  "pwhl-circuit": { label: "PWHL Circuit", description: "PWHL cards only" },
  "open-ice": { label: "Open Ice", description: "NHL and PWHL cards" },
};

function emptySlots(): Lineup["slots"] {
  return { LW: "", C: "", RW: "", LD: "", RD: "", G: "" };
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The lineup could not be saved. Please try again.";
}

export function LineupsScreen({ lineups, activeLineupIds, catalog, collection, onActivate, onSave }: LineupsScreenProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [slot, setSlot] = useState<LineupSlot>("LW");
  const [editorError, setEditorError] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const activatingRef = useRef(false);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog]);
  const cards = useMemo(() => new Map(catalog.cards.map((card) => [card.id, card])), [catalog]);
  const editing = editor?.lineup ?? null;

  const candidates = editing ? catalog.cards.filter((card) => {
    const player = players.get(card.playerId);
    const requiredLeague = requiredLeagueForMode(editing.mode);
    return Boolean(
      player
      && collection[card.id]
      && player.eligiblePositions.includes(slot as never)
      && (!requiredLeague || player.league === requiredLeague),
    );
  }) : [];

  function openEditor(lineup: Lineup) {
    setEditor({ lineup: { ...lineup, slots: { ...lineup.slots } }, isNew: false });
    setSlot("LW");
    setEditorError("");
    setFeedback(null);
  }

  function createLineup(mode: GameMode) {
    setEditor({
      isNew: true,
      lineup: {
        id: crypto.randomUUID(),
        name: `${modeCopy[mode].label} Six`,
        mode,
        slots: emptySlots(),
      },
    });
    setSlot("LW");
    setEditorError("");
    setFeedback(null);
  }

  function updateEditing(update: (lineup: Lineup) => Lineup) {
    setEditor((current) => current ? { ...current, lineup: update(current.lineup) } : current);
    setEditorError("");
  }

  function assign(cardId: string) {
    if (!editing) return;
    updateEditing((lineup) => ({ ...lineup, slots: { ...lineup.slots, [slot]: cardId } }));
    const nextSlot = LINEUP_SLOTS[LINEUP_SLOTS.indexOf(slot) + 1];
    if (nextSlot) setSlot(nextSlot);
  }

  function clearSlot() {
    if (!editing) return;
    updateEditing((lineup) => ({ ...lineup, slots: { ...lineup.slots, [slot]: "" } }));
  }

  function validateOwnedCards(lineup: Lineup): string | null {
    for (const position of LINEUP_SLOTS) {
      const cardId = lineup.slots[position];
      if (cardId && !collection[cardId]) return `${position} uses a card that is not in your collection.`;
    }
    return null;
  }

  async function saveLineup() {
    if (!editor || savingRef.current) return;
    const lineup = { ...editor.lineup, name: editor.lineup.name.trim() };
    if (lineup.name.length < 2) {
      setEditorError("Lineup name must contain at least two characters.");
      return;
    }
    const ownershipIssue = validateOwnedCards(lineup);
    const result = validateLineup(lineup, catalog);
    if (ownershipIssue || !result.valid) {
      setEditorError(ownershipIssue ?? result.issues[0]?.message ?? "This lineup is not valid.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setEditorError("");
    try {
      await onSave(lineup, editor.isNew);
      setEditor(null);
      setFeedback({ kind: "success", message: `${lineup.name} was saved securely.` });
    } catch (error) {
      setEditorError(messageFor(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function activate(lineup: Lineup) {
    if (activatingRef.current) return;
    activatingRef.current = true;
    setActivatingId(lineup.id);
    setFeedback(null);
    try {
      await onActivate(lineup.id);
      setFeedback({ kind: "success", message: `${lineup.name} is now active for ${modeCopy[lineup.mode].label}.` });
    } catch (error) {
      setFeedback({ kind: "error", message: messageFor(error) });
    } finally {
      activatingRef.current = false;
      setActivatingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Six cards. Every role matters.</p>
        <h1 className={styles.title}>Lineups</h1>
        <p className={styles.lede}>Build and activate a separate six for each mode. Every save is checked again by the server.</p>
      </header>

      {feedback ? <div className={feedback.kind === "error" ? styles.error : styles.notice} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

      <div className={styles.modeLineupGrid}>
        {GAME_MODES.map((mode) => {
          const modeLineups = lineups.filter((lineup) => lineup.mode === mode);
          return (
            <section className={styles.modeLineupSection} key={mode} aria-labelledby={`${mode}-heading`}>
              <div className={styles.lineupSectionHead}>
                <div>
                  <p className={styles.eyebrow}>{modeCopy[mode].description}</p>
                  <h2 id={`${mode}-heading`}>{modeCopy[mode].label}</h2>
                </div>
                <Button variant="secondary" onClick={() => createLineup(mode)}>New lineup</Button>
              </div>
              <div className={styles.lineupGrid}>
                {modeLineups.map((lineup) => {
                  const active = activeLineupIds[lineup.mode] === lineup.id;
                  return (
                    <article key={lineup.id} className={`${styles.lineupCard} ${active ? styles.lineupCardActive : ""}`}>
                      <div className={styles.lineupTop}>
                        <div><span className={styles.badge}>{modeCopy[lineup.mode].label}</span><h3>{lineup.name}</h3></div>
                        {active ? <span className={styles.badge}>Active</span> : null}
                      </div>
                      <div className={styles.miniSlots} aria-label={`${lineup.name} positions`}>
                        {LINEUP_SLOTS.map((position) => {
                          const card = cards.get(lineup.slots[position]);
                          const player = card ? players.get(card.playerId) : undefined;
                          return <span className={styles.miniSlot} key={position} title={player?.name}><strong>{position}</strong><small>{player?.name ?? "Empty"}</small></span>;
                        })}
                      </div>
                      <div className={styles.lineupActions}>
                        <Button variant="secondary" onClick={() => openEditor(lineup)}>Edit six</Button>
                        <Button variant={active ? "ghost" : "secondary"} disabled={active || activatingId !== null} onClick={() => void activate(lineup)}>
                          {activatingId === lineup.id ? "Activating…" : active ? "Active" : "Set active"}
                        </Button>
                      </div>
                    </article>
                  );
                })}
                {modeLineups.length === 0 ? <div className={styles.lineupEmpty}><p>No {modeCopy[mode].label} lineup yet.</p><Button variant="ghost" onClick={() => createLineup(mode)}>Build your first six</Button></div> : null}
              </div>
            </section>
          );
        })}
      </div>

      {editing ? (
        <section className={styles.builder} aria-labelledby="builder-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>{editor?.isNew ? "New lineup" : "Lineup builder"}</p>
              <h2 id="builder-title">{modeCopy[editing.mode].label}</h2>
              <p>Choose a position, then assign one of your eligible owned cards.</p>
            </div>
            <Button variant="ghost" disabled={saving} onClick={() => setEditor(null)}>Close editor</Button>
          </div>
          <label className={styles.lineupNameLabel}>
            Lineup name
            <input className={styles.lineupNameInput} value={editing.name} maxLength={48} disabled={saving} onChange={(event) => updateEditing((lineup) => ({ ...lineup, name: event.target.value }))} />
          </label>
          <div className={styles.slotPicker} role="tablist" aria-label="Lineup slots">
            {LINEUP_SLOTS.map((position) => {
              const card = cards.get(editing.slots[position]);
              const player = card ? players.get(card.playerId) : undefined;
              return (
                <button type="button" key={position} role="tab" aria-selected={slot === position} className={`${styles.slotButton} ${slot === position ? styles.slotButtonActive : ""}`} onClick={() => setSlot(position)}>
                  <span>{position}</span><small>{player?.name ?? "Empty"}</small>
                </button>
              );
            })}
          </div>
          <div className={styles.sectionHead}>
            <div><h2>Eligible for {slot}</h2><p>{requiredLeagueForMode(editing.mode) ?? "NHL and PWHL"} · owned cards only</p></div>
            <Button variant="ghost" disabled={!editing.slots[slot] || saving} onClick={clearSlot}>Clear {slot}</Button>
          </div>
          <div className={styles.candidateGrid}>
            {candidates.map((card) => {
              const player = players.get(card.playerId)!;
              const usedAt = LINEUP_SLOTS.find((position) => position !== slot && editing.slots[position] === card.id);
              return (
                <HockeyCard
                  key={card.id}
                  card={card}
                  player={player}
                  selected={editing.slots[slot] === card.id}
                  disabled={Boolean(usedAt) || saving}
                  status={usedAt ? `Used at ${usedAt}` : collection[card.id]?.quantity > 1 ? `Owned ×${collection[card.id]?.quantity}` : undefined}
                  onClick={() => assign(card.id)}
                />
              );
            })}
            {candidates.length === 0 ? <div className={styles.empty}>No owned cards are eligible for {slot}.</div> : null}
          </div>
          {editorError ? <div className={styles.error} role="alert">{editorError}</div> : null}
          <div className={styles.builderActions}><Button onClick={() => void saveLineup()} disabled={saving}>{saving ? "Saving securely…" : "Save lineup"}</Button></div>
        </section>
      ) : null}
    </div>
  );
}
