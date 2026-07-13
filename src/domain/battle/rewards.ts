import type { AiDifficulty, RoundWinner } from './types';

export interface MatchRewardTable {
  readonly player: number;
  readonly tie: number;
  readonly opponent: number;
}

export const MATCH_REWARDS: Readonly<Record<AiDifficulty, MatchRewardTable>> = {
  rookie: { player: 120, tie: 90, opponent: 60 },
  pro: { player: 180, tie: 120, opponent: 80 },
  elite: { player: 260, tie: 160, opponent: 100 },
};

export function getMatchRewardCredits(difficulty: AiDifficulty, winner: RoundWinner): number {
  return MATCH_REWARDS[difficulty][winner];
}
