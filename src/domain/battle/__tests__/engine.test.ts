import { describe, expect, it } from 'vitest';

import { chooseAiCard, selectAiCard } from '../ai';
import {
  createBattle,
  getBattleView,
  getEligibleCards,
  revealRound,
  selectCard,
} from '../engine';
import { DEFAULT_SITUATION_DECK } from '../situations';
import { BattleRuleError, type BattleState } from '../types';
import { createTestCatalog, createTestLineup } from './fixtures';

function createState(seed: string | number = 'deterministic-seed'): BattleState {
  return createBattle({
    seed,
    mode: 'open-ice',
    catalog: createTestCatalog(),
    playerLineup: createTestLineup('nhl-alpha', 'open-ice'),
    opponentLineup: createTestLineup('pwhl-alpha', 'open-ice'),
  });
}

function playRound(state: BattleState): BattleState {
  const playerCard = getEligibleCards(state, 'player')[0];
  const withPlayerChoice = selectCard(state, 'player', playerCard.card.id);
  return revealRound(selectAiCard(withPlayerChoice, 'elite'));
}

function playMatch(seed: string | number = 'deterministic-seed'): BattleState {
  let state = createState(seed);
  while (state.phase !== 'complete') {
    state = playRound(state);
  }
  return state;
}

describe('battle engine', () => {
  it('selects five unique situations with exactly one guaranteed goalie round', () => {
    const state = createState();

    expect(state.situations).toHaveLength(5);
    expect(new Set(state.situations.map(({ id }) => id))).toHaveLength(5);
    expect(state.situations.filter(({ role }) => role === 'goalie')).toHaveLength(1);
  });

  it('is deterministic for the same seed and command choices', () => {
    const first = playMatch('same-seed');
    const second = playMatch('same-seed');

    expect(second.situations).toEqual(first.situations);
    expect(second.results).toEqual(first.results);
    expect(second.winner).toBe(first.winner);
  });

  it('completes after five reveals and consumes five distinct cards per side', () => {
    const state = playMatch();

    expect(state.phase).toBe('complete');
    expect(state.results).toHaveLength(5);
    expect(new Set(state.usedCardIds.player)).toHaveLength(5);
    expect(new Set(state.usedCardIds.opponent)).toHaveLength(5);
    expect(state.winner).toBeDefined();
    for (const result of state.results) {
      expect(Math.abs(result.playerScore.variance)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(result.opponentScore.variance)).toBeLessThanOrEqual(2.5);
    }
  });

  it('returns new states without mutating the prior state and blocks duplicate selection', () => {
    const state = createState();
    const playerCards = getEligibleCards(state, 'player');
    const selected = selectCard(state, 'player', playerCards[0].card.id);

    expect(state.pendingSelections).toEqual({});
    expect(selected).not.toBe(state);
    expect(selected.pendingSelections.player).toBe(playerCards[0].card.id);
    expect(() => selectCard(selected, 'player', playerCards[1].card.id)).toThrowError(
      expect.objectContaining<Partial<BattleRuleError>>({ code: 'side-already-selected' }),
    );
  });

  it('rejects a previously used card', () => {
    let state = playRound(createState());
    const usedCard = state.usedCardIds.player[0];

    expect(() => selectCard(state, 'player', usedCard)).toThrowError(
      expect.objectContaining<Partial<BattleRuleError>>({ code: 'card-not-eligible' }),
    );
  });

  it('requires both hidden choices before reveal and does not expose the opponent card', () => {
    let state = createState();
    const playerCard = getEligibleCards(state, 'player')[0];
    state = selectCard(state, 'player', playerCard.card.id);

    expect(() => revealRound(state)).toThrowError(
      expect.objectContaining<Partial<BattleRuleError>>({ code: 'invalid-phase' }),
    );

    state = selectAiCard(state, 'pro');
    const view = getBattleView(state, 'player');

    expect(state.phase).toBe('awaiting-reveal');
    expect(view.selectionStatus).toEqual({ player: true, opponent: true });
    expect(view.visibleSelection).toBe(playerCard.card.id);
    expect(view).not.toHaveProperty('pendingSelections');
    expect(getBattleView(state, 'spectator').visibleSelection).toBeUndefined();
  });

  it('keeps every AI choice legal for role, slot, league mode, and card use', () => {
    let state = createState('ai-rules');

    while (state.phase !== 'complete') {
      const legalIds = getEligibleCards(state, 'opponent').map(({ card }) => card.id);
      const choice = chooseAiCard(state, 'pro');
      expect(legalIds).toContain(choice.card.id);
      expect(state.usedCardIds.opponent).not.toContain(choice.card.id);

      const playerChoice = getEligibleCards(state, 'player')[0];
      state = selectCard(state, 'player', playerChoice.card.id);
      state = selectCard(state, 'opponent', choice.card.id);
      state = revealRound(state);
    }
  });

  it('rejects decks without a goalie situation', () => {
    const skaterOnlyDeck = DEFAULT_SITUATION_DECK.filter(({ role }) => role === 'skater');

    expect(() =>
      createBattle({
        seed: 'invalid-deck',
        mode: 'open-ice',
        catalog: createTestCatalog(),
        playerLineup: createTestLineup('nhl-alpha', 'open-ice'),
        opponentLineup: createTestLineup('pwhl-alpha', 'open-ice'),
        situationDeck: skaterOnlyDeck,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<BattleRuleError>>({ code: 'invalid-situation-deck' }),
    );
  });

  it('rejects a lineup configured for a different battle mode', () => {
    expect(() =>
      createBattle({
        seed: 'wrong-mode',
        mode: 'nhl-circuit',
        catalog: createTestCatalog(),
        playerLineup: createTestLineup('nhl-alpha', 'open-ice'),
        opponentLineup: createTestLineup('nhl-beta', 'nhl-circuit'),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<BattleRuleError>>({ code: 'lineup-mode-mismatch' }),
    );
  });
});
