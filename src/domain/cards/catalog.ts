import type {
  CardCatalog,
  CardVersion,
  GoalieAttributes,
  Player,
  ResolvedCard,
  SkaterAttributes,
} from './types';

export type CatalogIssueCode =
  | 'duplicate-player-id'
  | 'duplicate-card-id'
  | 'invalid-player-reference'
  | 'role-mismatch'
  | 'invalid-player-position'
  | 'invalid-rating'
  | 'invalid-price';

export interface CatalogValidationIssue {
  readonly code: CatalogIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface CatalogValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CatalogValidationIssue[];
}

const skaterAttributeKeys: readonly (keyof SkaterAttributes)[] = [
  'speed',
  'shooting',
  'passing',
  'puckControl',
  'defense',
  'physicality',
  'hockeyIq',
  'clutch',
];

const goalieAttributeKeys: readonly (keyof GoalieAttributes)[] = [
  'reflexes',
  'positioning',
  'glove',
  'blocker',
  'reboundControl',
  'puckHandling',
  'consistency',
  'clutch',
];

function isRating(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function findDuplicates(values: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return duplicates;
}

function validatePlayer(player: Player, index: number): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  const positions = new Set(player.eligiblePositions);
  const hasInvalidPosition =
    positions.size !== player.eligiblePositions.length ||
    !positions.has(player.primaryPosition) ||
    (player.role === 'goalie' &&
      (player.primaryPosition !== 'G' || positions.size !== 1 || !positions.has('G'))) ||
    (player.role === 'skater' && positions.has('G'));

  if (hasInvalidPosition) {
    issues.push({
      code: 'invalid-player-position',
      path: `players[${index}].eligiblePositions`,
      message: `Player ${player.id} has positions that do not match the ${player.role} role.`,
    });
  }

  return issues;
}

function validateCard(card: CardVersion, index: number): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];

  if (!isRating(card.overall)) {
    issues.push({
      code: 'invalid-rating',
      path: `cards[${index}].overall`,
      message: `Card ${card.id} has an overall outside 0-100.`,
    });
  }

  if (card.role === 'skater') {
    for (const key of skaterAttributeKeys) {
      if (!isRating(card.attributes[key])) {
        issues.push({
          code: 'invalid-rating',
          path: `cards[${index}].attributes.${String(key)}`,
          message: `Card ${card.id} has an attribute outside 0-100.`,
        });
      }
    }
  } else {
    for (const key of goalieAttributeKeys) {
      if (!isRating(card.attributes[key])) {
        issues.push({
          code: 'invalid-rating',
          path: `cards[${index}].attributes.${String(key)}`,
          message: `Card ${card.id} has an attribute outside 0-100.`,
        });
      }
    }
  }

  if (!Number.isSafeInteger(card.price) || card.price < 0) {
    issues.push({
      code: 'invalid-price',
      path: `cards[${index}].price`,
      message: `Card ${card.id} has an invalid price.`,
    });
  }

  return issues;
}

export function validateCatalog(catalog: CardCatalog): CatalogValidationResult {
  const issues: CatalogValidationIssue[] = [];
  const playerIds = findDuplicates(catalog.players.map(({ id }) => id));
  const cardIds = findDuplicates(catalog.cards.map(({ id }) => id));
  const playersById = new Map(catalog.players.map((player) => [player.id, player]));

  for (const duplicateId of playerIds) {
    issues.push({
      code: 'duplicate-player-id',
      path: 'players',
      message: `Player ID ${duplicateId} is duplicated.`,
    });
  }

  for (const duplicateId of cardIds) {
    issues.push({
      code: 'duplicate-card-id',
      path: 'cards',
      message: `Card ID ${duplicateId} is duplicated.`,
    });
  }

  catalog.players.forEach((player, index) => issues.push(...validatePlayer(player, index)));

  catalog.cards.forEach((card, index) => {
    issues.push(...validateCard(card, index));
    const player = playersById.get(card.playerId);

    if (!player) {
      issues.push({
        code: 'invalid-player-reference',
        path: `cards[${index}].playerId`,
        message: `Card ${card.id} references missing player ${card.playerId}.`,
      });
    } else if (player.role !== card.role) {
      issues.push({
        code: 'role-mismatch',
        path: `cards[${index}].role`,
        message: `Card ${card.id} and player ${player.id} have different roles.`,
      });
    }
  });

  return { valid: issues.length === 0, issues };
}

export function indexCatalog(catalog: CardCatalog): {
  readonly playersById: ReadonlyMap<string, Player>;
  readonly cardsById: ReadonlyMap<string, CardVersion>;
} {
  const validation = validateCatalog(catalog);
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(' '));
  }

  return {
    playersById: new Map(catalog.players.map((player) => [player.id, player])),
    cardsById: new Map(catalog.cards.map((card) => [card.id, card])),
  };
}

export function resolveCard(catalog: CardCatalog, cardId: string): ResolvedCard | undefined {
  const card = catalog.cards.find(({ id }) => id === cardId);
  if (!card) {
    return undefined;
  }

  const player = catalog.players.find(({ id }) => id === card.playerId);
  return player ? { player, card } : undefined;
}
