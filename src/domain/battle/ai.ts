import type { ResolvedLineupCard } from '../lineups/types';
import { calculateCategoryValue, getEligibleCards, selectCard } from './engine';
import { randomIndex } from './rng';
import {
  BattleRuleError,
  type AiDifficulty,
  type BattleState,
} from './types';

function opportunityCost(state: BattleState, candidate: ResolvedLineupCard): number {
  const futureSituations = state.situations.slice(state.roundIndex + 1);
  const otherAvailable = state.lineups.opponent.cards.filter(
    ({ card }) =>
      card.id !== candidate.card.id && !state.usedCardIds.opponent.includes(card.id),
  );

  return futureSituations.reduce((cost, situation) => {
    if (
      candidate.card.role !== situation.role ||
      !situation.eligibleSlots.includes(candidate.slot)
    ) {
      return cost;
    }

    const alternativeScores = otherAvailable
      .filter(
        ({ card, slot }) =>
          card.role === situation.role && situation.eligibleSlots.includes(slot),
      )
      .map(({ card }) => calculateCategoryValue(card, situation));
    const bestAlternative = alternativeScores.length > 0 ? Math.max(...alternativeScores) : 0;
    return cost + Math.max(0, calculateCategoryValue(candidate.card, situation) - bestAlternative);
  }, 0);
}

export function chooseAiCard(
  state: BattleState,
  difficulty: AiDifficulty = state.difficulty,
): ResolvedLineupCard {
  const eligible = getEligibleCards(state, 'opponent');
  if (eligible.length === 0) {
    throw new BattleRuleError('card-not-eligible', 'AI has no eligible card for this round.');
  }

  const situation = state.situations[state.roundIndex];
  const ranked = [...eligible].sort((left, right) => {
    const leftUtility = calculateCategoryValue(left.card, situation) - opportunityCost(state, left);
    const rightUtility = calculateCategoryValue(right.card, situation) - opportunityCost(state, right);
    return rightUtility - leftUtility || left.card.id.localeCompare(right.card.id);
  });

  if (difficulty === 'elite') {
    return ranked[0];
  }

  const pool = difficulty === 'rookie' ? ranked : ranked.slice(0, Math.ceil(ranked.length / 2));
  const index = randomIndex(
    `${state.seed}:ai:${difficulty}:${state.roundIndex}:${state.usedCardIds.opponent.join(',')}`,
    pool.length,
  );
  return pool[index];
}

export function selectAiCard(
  state: BattleState,
  difficulty: AiDifficulty = state.difficulty,
): BattleState {
  const choice = chooseAiCard(state, difficulty);
  return selectCard(state, 'opponent', choice.card.id);
}
