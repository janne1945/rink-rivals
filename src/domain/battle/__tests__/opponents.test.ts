import { describe, expect, it } from 'vitest';

import { gameCatalog } from '../../../data/generated/gameCatalog';
import { validateLineup } from '../../lineups/validation';
import {
  AI_OPPONENTS,
  calculateAiOpponentOverall,
  getAiOpponents,
  selectAiOpponent,
  validateAiOpponentDefinitions,
} from '../opponents';

describe('curated AI opponents', () => {
  it('contains one identity-rich, valid rival for every MVP mode and tier', () => {
    expect(AI_OPPONENTS).toHaveLength(9);
    expect(new Set(AI_OPPONENTS.map(({ id }) => id)).size).toBe(9);
    expect(() => validateAiOpponentDefinitions(gameCatalog)).not.toThrow();
    for (const opponent of AI_OPPONENTS) {
      expect(opponent.identity.nickname.length).toBeGreaterThan(3);
      expect(opponent.identity.playStyle.length).toBeGreaterThan(15);
      expect(validateLineup(opponent.lineup, gameCatalog).valid).toBe(true);
    }
  });

  it('keeps circuit leagues pure and makes every Open Ice rival mixed', () => {
    const players = new Map(gameCatalog.players.map((player) => [player.id, player]));
    const cards = new Map(gameCatalog.cards.map((card) => [card.id, card]));
    for (const opponent of AI_OPPONENTS) {
      const leagues = new Set(Object.values(opponent.lineup.slots).map((cardId) => {
        const card = cards.get(cardId);
        return card ? players.get(card.playerId)?.league : undefined;
      }));
      if (opponent.mode === 'nhl-circuit') expect(leagues).toEqual(new Set(['NHL']));
      if (opponent.mode === 'pwhl-circuit') expect(leagues).toEqual(new Set(['PWHL']));
      if (opponent.mode === 'open-ice') expect(leagues).toEqual(new Set(['NHL', 'PWHL']));
    }
  });

  it('raises curated lineup strength clearly from Rookie to Pro to Elite', () => {
    for (const mode of ['nhl-circuit', 'pwhl-circuit', 'open-ice'] as const) {
      const overalls = (['rookie', 'pro', 'elite'] as const).map((difficulty) =>
        calculateAiOpponentOverall(getAiOpponents(mode, difficulty)[0], gameCatalog));
      expect(overalls[1] - overalls[0]).toBeGreaterThanOrEqual(1);
      expect(overalls[2] - overalls[1]).toBeGreaterThanOrEqual(1);
    }
  });

  it('selects deterministically through an App-friendly API', () => {
    const first = selectAiOpponent('open-ice', 'pro', 'stable-seed');
    const repeated = selectAiOpponent('open-ice', 'pro', 'stable-seed');
    expect(repeated).toBe(first);
    expect(first.mode).toBe('open-ice');
    expect(first.difficulty).toBe('pro');
    expect(first.lineup.mode).toBe('open-ice');
  });
});
