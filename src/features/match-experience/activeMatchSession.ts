import type { AiDifficulty, BattleState } from "../../domain/battle";
import type { GameMode } from "../../domain/lineups";

const STORAGE_KEY = "rink-rivals:match-experience-v2:active-match";

export interface ActiveMatchSession {
  readonly version: 1;
  readonly clientMatchId: string;
  readonly mode: GameMode;
  readonly difficulty: AiDifficulty;
  readonly pendingSelection?: { readonly cardId: string; readonly roundIndex: number };
  readonly reviewingRound: boolean;
  readonly completedBattle?: BattleState;
}

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
    const value = JSON.parse(raw) as Partial<ActiveMatchSession>;
    if (value.version !== 1 || typeof value.clientMatchId !== "string" || !validMode(value.mode) || !validDifficulty(value.difficulty)) return null;
    const pending = value.pendingSelection;
    if (pending && (typeof pending.cardId !== "string" || !Number.isInteger(pending.roundIndex) || pending.roundIndex! < 0 || pending.roundIndex! > 4)) return null;
    const completedBattle = value.completedBattle;
    if (completedBattle && (completedBattle.phase !== "complete" || completedBattle.results?.length !== 5 || typeof completedBattle.id !== "string")) return null;
    return {
      version: 1,
      clientMatchId: value.clientMatchId,
      mode: value.mode,
      difficulty: value.difficulty,
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
