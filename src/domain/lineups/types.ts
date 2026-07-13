import type { CardVersion, League, Player } from '../cards/types';

export const LINEUP_SLOTS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const;

export type LineupSlot = (typeof LINEUP_SLOTS)[number];

export const GAME_MODES = ['nhl-circuit', 'pwhl-circuit', 'open-ice'] as const;

export type GameMode = (typeof GAME_MODES)[number];

export interface Lineup {
  readonly id: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly slots: Readonly<Record<LineupSlot, string>>;
}

export interface ResolvedLineupCard {
  readonly slot: LineupSlot;
  readonly player: Player;
  readonly card: CardVersion;
}

export interface ResolvedLineup {
  readonly id: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly cards: readonly ResolvedLineupCard[];
}

export function requiredLeagueForMode(mode: GameMode): League | undefined {
  if (mode === 'nhl-circuit') {
    return 'NHL';
  }
  if (mode === 'pwhl-circuit') {
    return 'PWHL';
  }
  return undefined;
}
