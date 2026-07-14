import { cardEligiblePositions, indexCatalog } from '../cards/catalog';
import type { CardCatalog } from '../cards/types';
import {
  LINEUP_SLOTS,
  requiredLeagueForMode,
  type Lineup,
  type LineupSlot,
  type ResolvedLineup,
  type ResolvedLineupCard,
} from './types';

export type LineupIssueCode =
  | 'missing-card'
  | 'duplicate-card'
  | 'unknown-card'
  | 'invalid-player-reference'
  | 'role-mismatch'
  | 'invalid-position'
  | 'wrong-league';

export interface LineupValidationIssue {
  readonly code: LineupIssueCode;
  readonly slot: LineupSlot;
  readonly cardId?: string;
  readonly message: string;
}

export interface LineupValidationResult {
  readonly valid: boolean;
  readonly issues: readonly LineupValidationIssue[];
}

export class InvalidLineupError extends Error {
  readonly issues: readonly LineupValidationIssue[];

  constructor(issues: readonly LineupValidationIssue[]) {
    super(issues.map(({ message }) => message).join(' '));
    this.name = 'InvalidLineupError';
    this.issues = issues;
  }
}

export function validateLineup(lineup: Lineup, catalog: CardCatalog): LineupValidationResult {
  const issues: LineupValidationIssue[] = [];
  const cardsById = new Map(catalog.cards.map((card) => [card.id, card]));
  const playersById = new Map(catalog.players.map((player) => [player.id, player]));
  const usedCards = new Set<string>();
  const requiredLeague = requiredLeagueForMode(lineup.mode);

  for (const slot of LINEUP_SLOTS) {
    const cardId = lineup.slots[slot];

    if (!cardId) {
      issues.push({ code: 'missing-card', slot, message: `${slot} requires a card.` });
      continue;
    }

    if (usedCards.has(cardId)) {
      issues.push({
        code: 'duplicate-card',
        slot,
        cardId,
        message: `Card ${cardId} cannot fill more than one lineup slot.`,
      });
      continue;
    }
    usedCards.add(cardId);

    const card = cardsById.get(cardId);
    if (!card) {
      issues.push({
        code: 'unknown-card',
        slot,
        cardId,
        message: `Card ${cardId} does not exist in the catalog.`,
      });
      continue;
    }

    const player = playersById.get(card.playerId);
    if (!player) {
      issues.push({
        code: 'invalid-player-reference',
        slot,
        cardId,
        message: `Card ${cardId} references a missing player.`,
      });
      continue;
    }

    if (card.role !== player.role) {
      issues.push({
        code: 'role-mismatch',
        slot,
        cardId,
        message: `Card ${cardId} and player ${player.id} have different roles.`,
      });
      continue;
    }

    if (!cardEligiblePositions(card, player).some((position) => position === slot)) {
      issues.push({
        code: 'invalid-position',
        slot,
        cardId,
        message: `${player.name} is not eligible for ${slot}.`,
      });
    }

    if (requiredLeague && player.league !== requiredLeague) {
      issues.push({
        code: 'wrong-league',
        slot,
        cardId,
        message: `${lineup.mode} only accepts ${requiredLeague} cards.`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function resolveLineup(lineup: Lineup, catalog: CardCatalog): ResolvedLineup {
  const catalogValidation = indexCatalog(catalog);
  const lineupValidation = validateLineup(lineup, catalog);

  if (!lineupValidation.valid) {
    throw new InvalidLineupError(lineupValidation.issues);
  }

  const cards: ResolvedLineupCard[] = LINEUP_SLOTS.map((slot) => {
    const card = catalogValidation.cardsById.get(lineup.slots[slot]);
    if (!card) {
      throw new Error(`Validated card ${lineup.slots[slot]} was not found.`);
    }
    const player = catalogValidation.playersById.get(card.playerId);
    if (!player) {
      throw new Error(`Validated player ${card.playerId} was not found.`);
    }
    return { slot, card, player };
  });

  return { id: lineup.id, name: lineup.name, mode: lineup.mode, cards };
}
