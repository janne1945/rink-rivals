import { describe, expect, it } from 'vitest';
import { getMatchRewardCredits, MATCH_REWARDS } from '../rewards';

describe('match rewards', () => {
  it('uses the approved difficulty reward table', () => {
    expect(MATCH_REWARDS).toEqual({
      rookie: { player: 120, tie: 90, opponent: 60 },
      pro: { player: 180, tie: 120, opponent: 80 },
      elite: { player: 260, tie: 160, opponent: 100 },
    });
  });

  it('returns the reward for a difficulty and outcome', () => {
    expect(getMatchRewardCredits('rookie', 'opponent')).toBe(60);
    expect(getMatchRewardCredits('pro', 'tie')).toBe(120);
    expect(getMatchRewardCredits('elite', 'player')).toBe(260);
  });
});
