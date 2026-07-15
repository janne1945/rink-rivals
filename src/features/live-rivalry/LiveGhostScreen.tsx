import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { calculateCategoryValue } from "../../domain/battle";
import type { CardVersion, ContentCatalog, Player } from "../../domain/cards";
import type { GameMode, LineupSlot } from "../../domain/lineups";
import type { AccountActions } from "../account/AccountGate";
import type { AccountLineup, LiveRivalryRoomState } from "../../infrastructure/supabase";
import { Button } from "../../shared/Button";
import { HockeyCard } from "../../shared/HockeyCard";
import styles from "./LiveGhostScreen.module.css";

const modeOptions: ReadonlyArray<{ id: GameMode; label: string; detail: string }> = [
  { id: "nhl-circuit", label: "NHL Circuit", detail: "NHL lineups only" },
  { id: "pwhl-circuit", label: "PWHL Circuit", detail: "PWHL lineups only" },
  { id: "open-ice", label: "Open Ice", detail: "Both leagues" },
];

const liveActionNames = [
  "loadLiveRivalryRoom", "createLiveRivalryRoom", "joinLiveRivalryRoom",
  "setLiveRivalryReady", "lockLiveRivalryChoice", "leaveLiveRivalryRoom",
  "createLiveRivalryRematch", "subscribeToLiveRivalryRoom",
] as const;

type LiveActions = Pick<AccountActions, typeof liveActionNames[number]>;

interface LiveGhostScreenProps {
  readonly lineups: readonly AccountLineup[];
  readonly catalog: ContentCatalog;
  readonly actions: LiveActions;
}

function modeLabel(mode: GameMode): string {
  return modeOptions.find((option) => option.id === mode)?.label ?? mode;
}

function readableRealtimeStatus(status: string): string {
  if (status === "SUBSCRIBED") return "Live connected";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") return "Reconnecting";
  if (status === "CLOSED") return "Offline";
  return "Connecting";
}

export function LiveGhostScreen({ lineups, catalog, actions }: LiveGhostScreenProps) {
  const [room, setRoom] = useState<LiveRivalryRoomState | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedMode, setSelectedMode] = useState<GameMode>(lineups[0]?.mode ?? "nhl-circuit");
  const [lineupId, setLineupId] = useState(lineups[0]?.id ?? "");
  const [joinLineupId, setJoinLineupId] = useState(lineups[0]?.id ?? "");
  const [roomCode, setRoomCode] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  const roomRef = useRef<LiveRivalryRoomState | null>(null);
  const refreshPending = useRef(false);
  const createRequestId = useRef<string | null>(null);
  const joinRequestId = useRef<string | null>(null);
  const readyRequest = useRef<{ ready: boolean; id: string } | null>(null);
  const roundRequestIds = useRef(new Map<number, string>());
  const players = useMemo(() => new Map(catalog.players.map((player) => [player.id, player])), [catalog.players]);
  const cards = useMemo(() => new Map(catalog.cards.map((card) => [card.id, card])), [catalog.cards]);

  const adoptRoom = useCallback((next: LiveRivalryRoomState): void => {
    roomRef.current = next;
    setRoom((current) => !current || current.roomId !== next.roomId || next.stateVersion >= current.stateVersion ? next : current);
    if (!next.me.locked) setSelectedCardId(null);
  }, []);

  const refresh = useCallback(async (targetRoomId?: string): Promise<void> => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    try {
      const next = await actions.loadLiveRivalryRoom(targetRoomId);
      if (next) adoptRoom(next);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "The Live room could not be refreshed.");
    } finally {
      refreshPending.current = false;
    }
  }, [actions, adoptRoom]);

  useEffect(() => {
    let active = true;
    void actions.loadLiveRivalryRoom().then((next) => {
      if (active && next) adoptRoom(next);
    }).catch((restoreError: unknown) => {
      if (active) setError(restoreError instanceof Error ? restoreError.message : "The Live room could not be restored.");
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [actions, adoptRoom]);

  useEffect(() => {
    if (!room?.topic || ["completed", "cancelled", "expired"].includes(room.status)) return;
    const unsubscribe = actions.subscribeToLiveRivalryRoom(
      room.topic,
      (stateVersion) => {
        if (stateVersion > (roomRef.current?.stateVersion ?? 0)) void refresh(room.roomId);
      },
      setRealtimeStatus,
    );
    const heartbeat = window.setInterval(() => void refresh(room.roomId), 15_000);
    const onFocus = () => void refresh(room.roomId);
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe();
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", onFocus);
    };
  }, [actions, refresh, room?.roomId, room?.status, room?.topic]);

  const selectedModeLineups = lineups.filter((candidate) => candidate.mode === selectedMode);
  const currentSituation = room?.status === "active" ? room.situations[room.currentRound] : undefined;
  const usedCardIds = new Set(room?.rounds.map((round) => round.playerCardId) ?? []);
  const eligibleCards = currentSituation && room ? Object.entries(room.me.lineup.slots)
    .filter(([slot, cardId]) => currentSituation.eligibleSlots.includes(slot as LineupSlot) && !usedCardIds.has(cardId))
    .map(([slot, cardId]) => ({ slot: slot as LineupSlot, card: cards.get(cardId), player: players.get(cards.get(cardId)?.playerId ?? "") }))
    .filter((entry): entry is { slot: LineupSlot; card: NonNullable<typeof entry.card>; player: NonNullable<typeof entry.player> } => Boolean(entry.card && entry.player))
    : [];
  const latestRound = room?.rounds.at(-1);
  const latestSituation = latestRound ? room?.situations[latestRound.roundIndex] : undefined;
  const latestPlayerCard = latestRound ? cards.get(latestRound.playerCardId) : undefined;
  const latestPlayer = latestPlayerCard ? players.get(latestPlayerCard.playerId) : undefined;
  const latestOpponentCard = latestRound ? cards.get(latestRound.opponentCardId) : undefined;
  const latestOpponent = latestOpponentCard ? players.get(latestOpponentCard.playerId) : undefined;

  function chooseMode(mode: GameMode): void {
    setSelectedMode(mode);
    setLineupId(lineups.find((candidate) => candidate.mode === mode)?.id ?? "");
  }

  async function createRoom(): Promise<void> {
    if (!lineupId || busy) return;
    setBusy(true); setError(""); setStatusMessage("");
    const requestId = createRequestId.current ?? crypto.randomUUID();
    createRequestId.current = requestId;
    try {
      const next = await actions.createLiveRivalryRoom({ clientRequestId: requestId, mode: selectedMode, lineupId });
      createRequestId.current = null;
      adoptRoom(next);
      setStatusMessage("Room created. Share the code, then both players lock in.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The Live room could not be created.");
    } finally { setBusy(false); }
  }

  async function joinRoom(): Promise<void> {
    if (!joinLineupId || roomCode.length !== 6 || busy) return;
    setBusy(true); setError(""); setStatusMessage("");
    const requestId = joinRequestId.current ?? crypto.randomUUID();
    joinRequestId.current = requestId;
    try {
      const next = await actions.joinLiveRivalryRoom({ roomCode, clientRequestId: requestId, lineupId: joinLineupId });
      joinRequestId.current = null;
      adoptRoom(next);
      setStatusMessage("You are in. Ready up when your lineup is set.");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "The Live room could not be joined.");
    } finally { setBusy(false); }
  }

  async function setReady(ready: boolean): Promise<void> {
    if (!room || busy) return;
    setBusy(true); setError("");
    const request = readyRequest.current?.ready === ready
      ? readyRequest.current
      : { ready, id: crypto.randomUUID() };
    readyRequest.current = request;
    try {
      const next = await actions.setLiveRivalryReady(room.roomId, ready, request.id);
      readyRequest.current = null;
      adoptRoom(next);
    } catch (readyError) {
      setError(readyError instanceof Error ? readyError.message : "Ready state could not be saved.");
    } finally { setBusy(false); }
  }

  async function lockChoice(): Promise<void> {
    if (!room || !selectedCardId || room.me.locked || busy) return;
    setBusy(true); setError("");
    const requestId = roundRequestIds.current.get(room.currentRound) ?? crypto.randomUUID();
    roundRequestIds.current.set(room.currentRound, requestId);
    try {
      const next = await actions.lockLiveRivalryChoice({
        roomId: room.roomId,
        roundIndex: room.currentRound,
        cardId: selectedCardId,
        clientRequestId: requestId,
      });
      if (next.currentRound > room.currentRound || next.status === "completed") roundRequestIds.current.delete(room.currentRound);
      adoptRoom(next);
    } catch (lockError) {
      setError(lockError instanceof Error ? lockError.message : "Your card could not be locked.");
    } finally { setBusy(false); }
  }

  async function leaveRoom(): Promise<void> {
    if (!room || busy) return;
    setBusy(true); setError("");
    try {
      const next = await actions.leaveLiveRivalryRoom(room.roomId, crypto.randomUUID());
      adoptRoom(next);
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "The room could not be left.");
    } finally { setBusy(false); }
  }

  async function rematch(): Promise<void> {
    if (!room || busy) return;
    setBusy(true); setError("");
    try {
      const next = await actions.createLiveRivalryRematch(room.roomId, crypto.randomUUID(), room.me.lineupId);
      adoptRoom(next);
      setStatusMessage("Rematch room created. Share the new code with the same rival.");
    } catch (rematchError) {
      setError(rematchError instanceof Error ? rematchError.message : "The rematch could not be created.");
    } finally { setBusy(false); }
  }

  async function copyCode(): Promise<void> {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setStatusMessage("Room code copied.");
    } catch {
      setStatusMessage(`Room code: ${room.roomCode}`);
    }
  }

  if (restoring) return <div className={styles.loading}><div className={styles.puck} /><h1>Checking the Live room</h1></div>;

  if (!room || room.status === "cancelled" || room.status === "expired") {
    return (
      <div className={styles.page} data-live-screen>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Private synchronous multiplayer</p>
          <h1>Live Ghost Challenge</h1>
          <p>One code. Two authenticated clubs. Both choices stay hidden until both players lock.</p>
          <div className={styles.guardrails}><span>Exactly 2 players</span><span>No matchmaking</span><span>No rewards</span><span>No spectators</span></div>
        </header>
        {room?.status === "expired" ? <p className={styles.notice}>That room expired. Create a fresh code below.</p> : null}
        <div className={styles.setupGrid}>
          <section className={styles.panel} aria-labelledby="create-live-heading">
            <p className={styles.eyebrow}>Host</p><h2 id="create-live-heading">Create a room</h2>
            <div className={styles.modeGrid}>
              {modeOptions.map((mode) => <button key={mode.id} type="button" className={selectedMode === mode.id ? styles.selectedMode : ""} aria-pressed={selectedMode === mode.id} onClick={() => chooseMode(mode.id)}><strong>{mode.label}</strong><small>{mode.detail}</small></button>)}
            </div>
            <label className={styles.field}><span>Your lineup</span><select value={lineupId} onChange={(event) => setLineupId(event.target.value)}>{selectedModeLineups.map((lineup) => <option key={lineup.id} value={lineup.id}>{lineup.name}</option>)}</select></label>
            <Button disabled={!lineupId || busy} onClick={() => void createRoom()}>{busy ? "Opening room…" : "Create private room"}</Button>
          </section>
          <section className={styles.panel} aria-labelledby="join-live-heading">
            <p className={styles.eyebrow}>Guest</p><h2 id="join-live-heading">Enter your friend’s code</h2>
            <label className={styles.codeField}><span>Six-character code</span><input autoCapitalize="characters" autoComplete="off" inputMode="text" maxLength={6} placeholder="RANK26" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))} /></label>
            <label className={styles.field}><span>Your lineup</span><select value={joinLineupId} onChange={(event) => setJoinLineupId(event.target.value)}>{lineups.map((lineup) => <option key={lineup.id} value={lineup.id}>{lineup.name} · {modeLabel(lineup.mode)}</option>)}</select></label>
            <Button disabled={!joinLineupId || roomCode.length !== 6 || busy} onClick={() => void joinRoom()}>{busy ? "Joining…" : "Join Live match"}</Button>
          </section>
        </div>
        {(error || statusMessage) ? <p className={error ? styles.error : styles.notice} role={error ? "alert" : "status"}>{error || statusMessage}</p> : null}
      </div>
    );
  }

  if (room.status === "waiting") {
    return (
      <div className={styles.page} data-live-screen>
        <header className={styles.roomHeader}>
          <div><p className={styles.eyebrow}>Private room · {modeLabel(room.mode)}</p><h1>{room.opponent ? "Both clubs are here" : "Waiting for your rival"}</h1><p>{room.me.lineupName} is locked to this room snapshot.</p></div>
          <button type="button" className={styles.roomCode} onClick={() => void copyCode()} aria-label={`Copy room code ${room.roomCode}`}><span>Room code</span><strong>{room.roomCode}</strong><small>Tap to copy</small></button>
        </header>
        <section className={styles.versus}>
          <PlayerStatus label={room.me.displayLabel} lineup={room.me.lineupName} ready={room.me.ready} online />
          <div className={styles.vs}>VS</div>
          {room.opponent ? <PlayerStatus label={room.opponent.displayLabel} lineup={room.opponent.lineupName} ready={room.opponent.ready} online={room.opponent.online} /> : <div className={styles.emptyRival}><div className={styles.pulse} /><strong>Open slot</strong><span>Share {room.roomCode}</span></div>}
        </section>
        <section className={styles.readyPanel}>
          <div><p className={styles.eyebrow}>Puck drop</p><h2>{room.me.ready ? "You are ready" : "Ready when you are"}</h2><p>The server starts automatically when both clubs are ready.</p></div>
          <Button disabled={!room.opponent || busy} onClick={() => void setReady(!room.me.ready)}>{busy ? "Saving…" : room.me.ready ? "Not ready" : "Ready up"}</Button>
        </section>
        <div className={styles.roomFooter}><span>{readableRealtimeStatus(realtimeStatus)}</span><button type="button" disabled={busy} onClick={() => void leaveRoom()}>Close room</button></div>
        {(error || statusMessage) ? <p className={error ? styles.error : styles.notice} role={error ? "alert" : "status"}>{error || statusMessage}</p> : null}
      </div>
    );
  }

  if (room.status === "completed") {
    const completedByForfeit = room.currentRound < 5;
    return (
      <div className={styles.page} data-live-screen>
        <header className={`${styles.final} ${room.result?.outcome === "win" ? styles.win : styles.loss}`}>
          <p className={styles.eyebrow}>Final horn · private match</p>
          <h1>{completedByForfeit
            ? room.result?.outcome === "win" ? "You won by forfeit" : "You forfeited the match"
            : room.result?.outcome === "win" ? "You won the rivalry" : "Your rival took this one"}</h1>
          <div className={styles.finalScore}><strong>{room.result?.playerWins ?? 0}</strong><span>–</span><strong>{room.result?.opponentWins ?? 0}</strong></div>
          {completedByForfeit ? <p>The server ended the match after {room.currentRound} completed {room.currentRound === 1 ? "round" : "rounds"}.</p> : null}
          <p>No Credits, Season XP, cards, or objectives were awarded.</p>
        </header>
        <section className={styles.h2h}><div><span>Head-to-head</span><strong>{room.headToHead.playerWins}–{room.headToHead.opponentWins}</strong><small>{room.headToHead.matches} private matches</small></div><Button disabled={busy} onClick={() => void rematch()}>{busy ? "Creating…" : "Create rematch"}</Button></section>
        <RoundHistory room={room} cards={cards} players={players} />
        {error || statusMessage ? <p className={error ? styles.error : styles.notice} role={error ? "alert" : "status"}>{error || statusMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className={styles.livePage} data-live-screen>
      <header className={styles.liveHeader}>
        <div><p className={styles.eyebrow}>Live Ghost · {modeLabel(room.mode)}</p><h1>Round {room.currentRound + 1} of 5</h1></div>
        <div className={styles.liveScore}><span>{room.me.displayLabel}</span><strong>{room.rounds.filter((round) => round.winner === "player").length}–{room.rounds.filter((round) => round.winner === "opponent").length}</strong><span>{room.opponent?.displayLabel}</span></div>
        <div className={styles.connection}><i data-online={realtimeStatus === "SUBSCRIBED"} />{readableRealtimeStatus(realtimeStatus)}</div>
      </header>
      {latestRound && latestSituation && latestPlayerCard && latestPlayer && latestOpponentCard && latestOpponent ? (
        <section className={styles.latestReveal} aria-label={`Round ${latestRound.roundIndex + 1} result`}>
          <HockeyCard compact card={latestPlayerCard} player={latestPlayer} highlightedStat={{ label: latestSituation.name, value: latestRound.playerScore }} />
          <div><span>Last reveal</span><strong>{latestRound.playerScore}–{latestRound.opponentScore}</strong><p>{latestRound.winner === "player" ? "You won the round" : "Your rival won the round"}</p><small>{latestRound.tieBreaker === "category" ? `${latestSituation.name} decided it` : latestRound.tieBreaker === "overall" ? "Category tied · higher OVR decided it" : "Category and OVR tied · server seed decided it"}</small></div>
          <HockeyCard compact card={latestOpponentCard} player={latestOpponent} highlightedStat={{ label: latestSituation.name, value: latestRound.opponentScore }} />
        </section>
      ) : null}
      <section className={styles.categoryHero}>
        <div><span>Current category</span><h2>{currentSituation?.name}</h2><p>{currentSituation?.description}</p><small>On a tie: higher OVR, then the immutable server seed.</small></div>
        <div className={styles.lockSignals}><span data-locked={room.me.locked}>You {room.me.locked ? "locked" : "choosing"}</span><span data-locked={room.opponent?.locked}>Rival {room.opponent?.locked ? "locked" : "choosing"}</span></div>
      </section>
      <section>
        <div className={styles.handHeader}><div><p className={styles.eyebrow}>Your eligible cards</p><h2>{room.me.locked ? "Selection sealed" : "Choose, then lock"}</h2></div><div className={styles.lockAction}>
          <Button disabled={!selectedCardId || room.me.locked || busy} onClick={() => void lockChoice()}>
            {busy ? "Locking…" : selectedCardId ? "Lock this card" : "Choose a card to lock"}
          </Button>
        </div></div>
        <div className={styles.cardHand} data-live-hand>
          {eligibleCards.map(({ card, player }) => <HockeyCard key={card.id} compact card={card} player={player} disabled={room.me.locked || busy} selected={selectedCardId === card.id} highlightedStat={currentSituation ? { label: currentSituation.name, value: calculateCategoryValue(card, currentSituation) } : undefined} onClick={() => setSelectedCardId(card.id)} />)}
        </div>
        {room.me.locked ? <p className={styles.waitingLock}>{room.opponent?.locked ? "Both choices are locked. The server is resolving…" : "Your card cannot be changed. Waiting for your rival…"}</p> : null}
      </section>
      <div className={styles.roomFooter}><span>Room {room.roomCode} · 24-hour reconnect window</span><button type="button" disabled={busy} onClick={() => void leaveRoom()}>Forfeit match</button></div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}

function PlayerStatus({ label, lineup, ready, online }: { readonly label: string; readonly lineup: string; readonly ready: boolean; readonly online: boolean }) {
  return <div className={styles.playerStatus}><i data-online={online} /><span>{online ? "Online" : "Reconnecting"}</span><h2>{label}</h2><p>{lineup}</p><strong data-ready={ready}>{ready ? "Ready" : "Not ready"}</strong></div>;
}

function RoundHistory({ room, cards, players }: { readonly room: LiveRivalryRoomState; readonly cards: Map<string, CardVersion>; readonly players: Map<string, Player> }) {
  return <ol className={styles.history}>{room.rounds.map((round) => {
    const playerCard = cards.get(round.playerCardId);
    const opponentCard = cards.get(round.opponentCardId);
    const player = playerCard ? players.get(playerCard.playerId) : undefined;
    const opponent = opponentCard ? players.get(opponentCard.playerId) : undefined;
    return <li key={round.roundIndex}><span>R{round.roundIndex + 1}</span><strong>{player?.name ?? round.playerCardId}</strong><b>{round.playerScore}–{round.opponentScore}</b><strong>{opponent?.name ?? round.opponentCardId}</strong><em data-win={round.winner === "player"}>{round.winner === "player" ? "W" : "L"}</em></li>;
  })}</ol>;
}
