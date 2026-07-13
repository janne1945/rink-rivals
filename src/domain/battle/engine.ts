import type { CardVersion } from '../cards/types';
import { resolveLineup } from '../lineups/validation';
import type { ResolvedLineupCard } from '../lineups/types';
import { randomBetween } from './rng';
import { DEFAULT_SITUATION_DECK, selectBattleSituations } from './situations';
import {
  BATTLE_ROUND_COUNT,
  BattleRuleError,
  type BattleSide,
  type BattleSituation,
  type BattleState,
  type BattleViewState,
  type BattleViewer,
  type CardRoundScore,
  type CreateBattleInput,
  type RoundWinner,
} from './types';

const MAX_SCORE_VARIANCE = 2.5;

function roundToHundredths(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBaseScore(card: CardVersion, situation: BattleSituation): number {
  if (card.role !== situation.role) {
    throw new BattleRuleError(
      'card-not-eligible',
      `${card.role} card ${card.id} cannot enter a ${situation.role} situation.`,
    );
  }

  if (card.role === 'skater' && situation.role === 'skater') {
    return roundToHundredths(
      Object.entries(situation.weights).reduce(
        (total, [attribute, weight]) =>
          total + card.attributes[attribute as keyof typeof card.attributes] * (weight ?? 0),
        0,
      ),
    );
  }

  if (card.role === 'goalie' && situation.role === 'goalie') {
    return roundToHundredths(
      Object.entries(situation.weights).reduce(
        (total, [attribute, weight]) =>
          total + card.attributes[attribute as keyof typeof card.attributes] * (weight ?? 0),
        0,
      ),
    );
  }

  throw new BattleRuleError('card-not-eligible', `Card ${card.id} is not eligible.`);
}

function isEligible(
  lineupCard: ResolvedLineupCard,
  situation: BattleSituation,
  usedCardIds: readonly string[],
): boolean {
  return (
    lineupCard.card.role === situation.role &&
    situation.eligibleSlots.includes(lineupCard.slot) &&
    !usedCardIds.includes(lineupCard.card.id)
  );
}

export function getEligibleCards(
  state: BattleState,
  side: BattleSide,
): readonly ResolvedLineupCard[] {
  if (state.phase === 'complete') {
    return [];
  }

  const situation = state.situations[state.roundIndex];
  return state.lineups[side].cards.filter((lineupCard) =>
    isEligible(lineupCard, situation, state.usedCardIds[side]),
  );
}

export function createBattle(input: CreateBattleInput): BattleState {
  if (input.playerLineup.mode !== input.mode || input.opponentLineup.mode !== input.mode) {
    throw new BattleRuleError(
      'lineup-mode-mismatch',
      'Both lineups must use the selected battle mode.',
    );
  }

  const seed = String(input.seed);
  const playerLineup = resolveLineup(input.playerLineup, input.catalog);
  const opponentLineup = resolveLineup(input.opponentLineup, input.catalog);
  const situations = selectBattleSituations(
    input.situationDeck ?? DEFAULT_SITUATION_DECK,
    seed,
  );

  return {
    id: `battle-${seed}`,
    seed,
    mode: input.mode,
    phase: 'selecting',
    roundIndex: 0,
    situations,
    lineups: { player: playerLineup, opponent: opponentLineup },
    usedCardIds: { player: [], opponent: [] },
    pendingSelections: {},
    roundWins: { player: 0, opponent: 0 },
    results: [],
  };
}

export function selectCard(
  state: BattleState,
  side: BattleSide,
  cardId: string,
): BattleState {
  if (state.phase !== 'selecting') {
    throw new BattleRuleError('invalid-phase', 'Cards can only be selected during selection.');
  }

  if (state.pendingSelections[side]) {
    throw new BattleRuleError(
      'side-already-selected',
      `${side} has already selected a card for this round.`,
    );
  }

  if (!getEligibleCards(state, side).some(({ card }) => card.id === cardId)) {
    throw new BattleRuleError(
      'card-not-eligible',
      `Card ${cardId} is used, missing, or ineligible for this situation.`,
    );
  }

  const pendingSelections = { ...state.pendingSelections, [side]: cardId };
  const bothSelected = Boolean(pendingSelections.player && pendingSelections.opponent);

  return {
    ...state,
    phase: bothSelected ? 'awaiting-reveal' : 'selecting',
    pendingSelections,
  };
}

function selectedCard(state: BattleState, side: BattleSide): ResolvedLineupCard {
  const cardId = state.pendingSelections[side];
  if (!cardId) {
    throw new BattleRuleError('missing-selection', `${side} has not selected a card.`);
  }

  const lineupCard = state.lineups[side].cards.find(({ card }) => card.id === cardId);
  if (!lineupCard) {
    throw new BattleRuleError('missing-selection', `Selected card ${cardId} is unavailable.`);
  }
  return lineupCard;
}

function calculateRoundScore(
  state: BattleState,
  side: BattleSide,
  lineupCard: ResolvedLineupCard,
  situation: BattleSituation,
): CardRoundScore {
  const base = calculateBaseScore(lineupCard.card, situation);
  const variance = roundToHundredths(
    randomBetween(
      `${state.seed}:round:${state.roundIndex}:${side}:${lineupCard.card.id}`,
      -MAX_SCORE_VARIANCE,
      MAX_SCORE_VARIANCE,
    ),
  );
  return { base, variance, total: roundToHundredths(base + variance) };
}

function winnerForScores(player: CardRoundScore, opponent: CardRoundScore): RoundWinner {
  if (player.total === opponent.total) {
    return 'tie';
  }
  return player.total > opponent.total ? 'player' : 'opponent';
}

function matchWinner(roundWins: BattleState['roundWins']): RoundWinner {
  if (roundWins.player === roundWins.opponent) {
    return 'tie';
  }
  return roundWins.player > roundWins.opponent ? 'player' : 'opponent';
}

export function revealRound(state: BattleState): BattleState {
  if (state.phase !== 'awaiting-reveal') {
    throw new BattleRuleError(
      'invalid-phase',
      'A round can only be revealed after both sides have selected.',
    );
  }

  const situation = state.situations[state.roundIndex];
  const playerCard = selectedCard(state, 'player');
  const opponentCard = selectedCard(state, 'opponent');
  const playerScore = calculateRoundScore(state, 'player', playerCard, situation);
  const opponentScore = calculateRoundScore(state, 'opponent', opponentCard, situation);
  const winner = winnerForScores(playerScore, opponentScore);
  const roundWins = {
    player: state.roundWins.player + (winner === 'player' ? 1 : 0),
    opponent: state.roundWins.opponent + (winner === 'opponent' ? 1 : 0),
  };
  const result = {
    roundNumber: state.roundIndex + 1,
    situation,
    playerCard,
    opponentCard,
    playerScore,
    opponentScore,
    winner,
  };
  const results = [...state.results, result];
  const complete = results.length === BATTLE_ROUND_COUNT;

  return {
    ...state,
    phase: complete ? 'complete' : 'selecting',
    roundIndex: complete ? state.roundIndex : state.roundIndex + 1,
    usedCardIds: {
      player: [...state.usedCardIds.player, playerCard.card.id],
      opponent: [...state.usedCardIds.opponent, opponentCard.card.id],
    },
    pendingSelections: {},
    roundWins,
    results,
    winner: complete ? matchWinner(roundWins) : undefined,
  };
}

export function getBattleView(state: BattleState, viewer: BattleViewer): BattleViewState {
  const { pendingSelections, ...safeState } = state;
  return {
    ...safeState,
    selectionStatus: {
      player: Boolean(pendingSelections.player),
      opponent: Boolean(pendingSelections.opponent),
    },
    visibleSelection:
      viewer === 'spectator' ? undefined : pendingSelections[viewer],
  };
}
