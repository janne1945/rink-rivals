import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { cardEligiblePositions, type CardCatalog } from "../../domain/cards";
import { resolveCardImage } from "../../domain/cards/assets";
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
import styles from "./LineupsScreen.module.css";

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

const modeCopy: Readonly<Record<GameMode, { label: string; description: string; summary: string }>> = {
  "nhl-circuit": { label: "NHL Circuit", description: "NHL cards only", summary: "Build with NHL player cards and defend a classic six." },
  "pwhl-circuit": { label: "PWHL Circuit", description: "PWHL cards only", summary: "Create a dedicated six from the stars of the PWHL." },
  "open-ice": { label: "Open Ice", description: "NHL and PWHL cards", summary: "Mix both leagues freely and build without boundaries." },
};

function emptySlots(): Lineup["slots"] {
  return { LW: "", C: "", RW: "", LD: "", RD: "", G: "" };
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The lineup could not be saved. Please try again.";
}

function CircuitCrest({ mode, muted = false }: { readonly mode: GameMode; readonly muted?: boolean }) {
  if (mode === "nhl-circuit") {
    return <span className={`${styles.circuitCrest} ${muted ? styles.crestMuted : ""}`} aria-hidden="true"><img src="/assets/ui/nhl-shield.webp" alt="" /></span>;
  }
  if (mode === "pwhl-circuit") {
    return <span className={`${styles.circuitCrest} ${styles.pwhlCrest} ${muted ? styles.crestMuted : ""}`} aria-hidden="true"><img src="/assets/ui/pwhl-logo.webp" alt="" /></span>;
  }
  return (
    <span className={`${styles.circuitCrest} ${styles.hybridCrest} ${muted ? styles.crestMuted : ""}`} aria-hidden="true">
      <span className={styles.hybridMark}>
        <img className={styles.hybridNhl} src="/assets/ui/nhl-shield.webp" alt="" />
        <img className={styles.hybridPwhl} src="/assets/ui/pwhl-logo.webp" alt="" />
      </span>
    </span>
  );
}

export function LineupsScreen({ lineups, activeLineupIds, catalog, collection, onActivate, onSave }: LineupsScreenProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [slot, setSlot] = useState<LineupSlot>("LW");
  const [focusedLineupIds, setFocusedLineupIds] = useState<Partial<Record<GameMode, string>>>({});
  const [editorError, setEditorError] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const activatingRef = useRef(false);
  const editorRef = useRef<HTMLElement>(null);
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog]);
  const cards = useMemo(() => new Map(catalog.cards.map((card) => [card.id, card])), [catalog]);
  const editing = editor?.lineup ?? null;

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      editorRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing?.id]);

  const candidates = editing ? catalog.cards.filter((card) => {
    const player = players.get(card.playerId);
    const requiredLeague = requiredLeagueForMode(editing.mode);
    return Boolean(
      player
      && collection[card.id]
      && cardEligiblePositions(card, player).includes(slot)
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
      setFocusedLineupIds((current) => ({ ...current, [lineup.mode]: lineup.id }));
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

  const builderPanel = editing ? (
    <section ref={editorRef} className={styles.builder} data-mode={editing.mode} data-lineup-editor={editing.mode} aria-labelledby="builder-title">
      <div className={styles.builderHeader}>
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
      <div className={styles.candidateHeader}>
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
        {candidates.length === 0 ? <div className={styles.emptyCandidates}>No owned cards are eligible for {slot}.</div> : null}
      </div>
      {editorError ? <div className={styles.error} role="alert">{editorError}</div> : null}
      <div className={styles.builderActions}><Button onClick={() => void saveLineup()} disabled={saving}>{saving ? "Saving securely…" : "Save lineup"}</Button></div>
    </section>
  ) : null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Six cards. Every role matters.</p>
          <h1>Lineups</h1>
          <p>Build and activate a separate six for each mode. Every save is checked again by the server.</p>
        </div>
        <div className={styles.heroMonogram} aria-hidden="true"><span>RR</span><small>Team management</small></div>
      </header>

      {feedback ? <div className={feedback.kind === "error" ? styles.error : styles.notice} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

      <div className={styles.modeStack}>
        {GAME_MODES.map((mode) => {
          const modeLineups = lineups.filter((lineup) => lineup.mode === mode);
          const activeLineupId = activeLineupIds[mode];
          const focusedLineup = modeLineups.find(({ id }) => id === focusedLineupIds[mode])
            ?? modeLineups.find(({ id }) => id === activeLineupId)
            ?? modeLineups[0];
          const active = focusedLineup?.id === activeLineupId;
          const validation = focusedLineup ? validateLineup(focusedLineup, catalog) : null;
          const filledPositions = focusedLineup ? LINEUP_SLOTS.filter((position) => Boolean(focusedLineup.slots[position])).length : 0;

          return (
            <Fragment key={mode}>
              <section className={styles.modeSection} data-mode={mode} aria-labelledby={`${mode}-heading`}>
              <div className={styles.modeIdentity}>
                <CircuitCrest mode={mode} />
                <div className={styles.modeIdentityCopy}>
                  <p className={styles.eyebrow}>{modeCopy[mode].description}</p>
                  <h2 id={`${mode}-heading`}>{modeCopy[mode].label}</h2>
                  <p>{modeCopy[mode].summary}</p>
                  <span className={styles.modeStatus}>{activeLineupId ? "● Active lineup" : `${modeLineups.length} saved ${modeLineups.length === 1 ? "six" : "sixes"}`}</span>
                </div>
              </div>

              <div className={styles.lineupStage}>
                {focusedLineup ? (
                  <article className={`${styles.lineupPanel} ${active ? styles.lineupPanelActive : ""}`} aria-labelledby={`${focusedLineup.id}-title`}>
                    <div className={styles.lineupTopline}>
                      <div>
                        <p>{modeCopy[mode].label}</p>
                        <h3 id={`${focusedLineup.id}-title`}>{focusedLineup.name}</h3>
                      </div>
                      <div className={styles.lineupSignals}>
                        <span data-valid={validation?.valid}>{validation?.valid ? "✓ Server valid" : `${validation?.issues.length ?? 0} issues`}</span>
                        <strong>{active ? "Active" : `${filledPositions} of 6 filled`}</strong>
                      </div>
                    </div>

                    <div className={styles.rosterSlots} aria-label={`${focusedLineup.name} positions`}>
                      {LINEUP_SLOTS.map((position) => {
                        const card = cards.get(focusedLineup.slots[position]);
                        const player = card ? players.get(card.playerId) : undefined;
                        const cardImage = card && player ? resolveCardImage(card, player) : null;
                        const issue = validation?.issues.find((candidate) => candidate.slot === position);
                        return (
                          <div
                            className={`${styles.rosterSlot} ${card && player ? styles.rosterSlotFilled : styles.rosterSlotEmpty} ${issue ? styles.rosterSlotInvalid : ""}`}
                            key={position}
                            data-league={player?.league}
                            data-tier={card?.cardTier}
                            aria-label={`${position}: ${player?.name ?? issue?.message ?? "Empty position"}`}
                          >
                            <span className={styles.slotTop}><strong>{position}</strong>{card ? <b>{card.overall}<small>OVR</small></b> : <b>+</b>}</span>
                            {cardImage ? <img className={styles.slotPlayerImage} src={cardImage.src} alt="" aria-hidden="true" data-presentation={cardImage.presentation} /> : <span className={styles.emptyPosition} aria-hidden="true">{position}</span>}
                            <span className={styles.slotCopy}><small>{player?.league ?? "Position open"}</small><strong>{player?.name ?? "Add a card"}</strong></span>
                            {issue ? <span className={styles.slotIssue} title={issue.message} aria-hidden="true">!</span> : null}
                          </div>
                        );
                      })}
                    </div>

                    <div className={styles.lineupActions}>
                      <Button variant="secondary" onClick={() => openEditor(focusedLineup)}>Edit six <span aria-hidden="true">✎</span></Button>
                      <Button variant={active ? "ghost" : "secondary"} disabled={active || activatingId !== null} onClick={() => void activate(focusedLineup)}>
                        {activatingId === focusedLineup.id ? "Activating…" : active ? "Active" : "Set active"}
                      </Button>
                    </div>

                    {modeLineups.length > 1 ? (
                      <div className={styles.lineupRail} aria-label={`${modeCopy[mode].label} saved lineups`}>
                        {modeLineups.map((lineup) => (
                          <button
                            type="button"
                            key={lineup.id}
                            aria-pressed={lineup.id === focusedLineup.id}
                            aria-label={`Show ${lineup.name}`}
                            onClick={() => setFocusedLineupIds((current) => ({ ...current, [mode]: lineup.id }))}
                          >
                            <span>{lineup.name}</span><small>{lineup.id === activeLineupId ? "Active" : `${LINEUP_SLOTS.filter((position) => lineup.slots[position]).length}/6`}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ) : (
                  <div className={styles.emptyLineup}>
                    <CircuitCrest mode={mode} muted />
                    <div><strong>Your {modeCopy[mode].label} six starts here</strong><p>No lineup has been created for this circuit yet.</p></div>
                    <Button variant="ghost" onClick={() => createLineup(mode)}>Build your first six</Button>
                  </div>
                )}
              </div>

              <Button className={styles.newLineupButton} variant="secondary" onClick={() => createLineup(mode)}>New lineup <span aria-hidden="true">＋</span></Button>
              </section>
              {editing?.mode === mode ? builderPanel : null}
            </Fragment>
          );
        })}
      </div>

      <aside className={styles.lineupInfo} aria-label="Lineup verification information">
        <span aria-hidden="true">ⓘ</span>
        <p><strong>Lineups are saved per mode.</strong> Create multiple sixes and switch the active lineup at any time.</p>
        <span className={styles.serverVerified}>✓ Server verified</span>
      </aside>

    </div>
  );
}
