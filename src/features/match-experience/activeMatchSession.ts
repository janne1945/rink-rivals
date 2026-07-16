import type { AiDifficulty, BattleState } from "../../domain/battle";
import type { GameMode } from "../../domain/lineups";

const STORAGE_KEY = "rink-rivals:match-experience-v2:active-match";
const PENDING_ABANDONMENT_KEY = "rink-rivals:match-experience-v2:pending-abandonment";

export interface ActiveMatchSession {
  readonly version: 2;
  readonly clientMatchId: string;
  readonly mode: GameMode;
  readonly difficulty: AiDifficulty;
  readonly source: { readonly kind: "ai" } | { readonly kind: "arena" } | {
    readonly kind: "ghost-challenge";
    readonly slug: string;
    readonly lineupId: string;
  };
  readonly pendingSelection?: { readonly cardId: string; readonly roundIndex: number };
  readonly reviewingRound: boolean;
  readonly completedBattle?: BattleState;
}

export type PendingMatchAbandonment = Pick<ActiveMatchSession, "clientMatchId" | "source"> & {
  readonly version: 1;
};

function validMode(value: unknown): value is GameMode {
  return value === "nhl-circuit" || value === "pwhl-circuit" || value === "open-ice";
}

function validDifficulty(value: unknown): value is AiDifficulty {
  return value === "rookie" || value === "pro" || value === "elite";
}

export function readActiveMatchSession(): ActiveMatchSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Omit<Partial<ActiveMatchSession>, "version" | "source"> & {
      version?: 1 | 2;
      source?: ActiveMatchSession["source"];
    };
    if ((value.version !== 1 && value.version !== 2) || typeof value.clientMatchId !== "string" || !validMode(value.mode) || !validDifficulty(value.difficulty)) return null;
    const source = value.version === 1 ? { kind: "ai" as const } : value.source;
    if (!source || (source.kind !== "ai" && source.kind !== "arena" && (
      source.kind !== "ghost-challenge"
      || typeof source.slug !== "string"
      || !/^[0-9a-f]{32}$/.test(source.slug)
      || typeof source.lineupId !== "string"
    ))) return null;
    const pending = value.pendingSelection;
    if (pending && (typeof pending.cardId !== "string" || !Number.isInteger(pending.roundIndex) || pending.roundIndex! < 0 || pending.roundIndex! > 4)) return null;
    const completedBattle = value.completedBattle;
    if (completedBattle && (completedBattle.phase !== "complete" || completedBattle.results?.length !== 5 || typeof completedBattle.id !== "string")) return null;
    return {
      version: 2,
      clientMatchId: value.clientMatchId,
      mode: value.mode,
      difficulty: value.difficulty,
      source,
      pendingSelection: pending,
      reviewingRound: value.reviewingRound === true,
      completedBattle,
    };
  } catch {
    return null;
  }
}

export function writeActiveMatchSession(session: ActiveMatchSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function updateActiveMatchSession(update: (session: ActiveMatchSession) => ActiveMatchSession): void {
  const current = readActiveMatchSession();
  if (current) writeActiveMatchSession(update(current));
}

export function clearActiveMatchSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function markMatchForAbandonment(session: ActiveMatchSession): void {
  try {
    window.localStorage.setItem(PENDING_ABANDONMENT_KEY, JSON.stringify({
      version: 1,
      clientMatchId: session.clientMatchId,
      source: session.source,
    } satisfies PendingMatchAbandonment));
  } catch {
    // Explicit exits still call the server directly when durable browser
    // storage is unavailable.
  }
}

export function readPendingMatchAbandonment(): PendingMatchAbandonment | null {
  try {
    const raw = window.localStorage.getItem(PENDING_ABANDONMENT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingMatchAbandonment>;
    const source = value.source;
    if (value.version !== 1 || typeof value.clientMatchId !== "string" || !source || (
      source.kind !== "ai" && source.kind !== "arena" && (
        source.kind !== "ghost-challenge"
        || typeof source.slug !== "string"
        || !/^[0-9a-f]{32}$/.test(source.slug)
        || typeof source.lineupId !== "string"
      )
    )) return null;
    return { version: 1, clientMatchId: value.clientMatchId, source };
  } catch {
    return null;
  }
}

export function clearPendingMatchAbandonment(): void {
  try {
    window.localStorage.removeItem(PENDING_ABANDONMENT_KEY);
  } catch {
    // No pending marker can remain when storage itself is unavailable.
  }
}
