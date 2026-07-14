import type {
  CardCatalog,
  CardVersion,
  League,
  Player,
} from '../../cards/types';
import { createCardImageReference } from '../../cards/assets';
import { LINEUP_SLOTS, type GameMode, type Lineup, type LineupSlot } from '../../lineups/types';

const skaterAttributes = {
  speed: 82,
  shooting: 84,
  passing: 86,
  puckControl: 83,
  defense: 80,
  physicality: 81,
  hockeyIq: 85,
  clutch: 87,
} as const;

const goalieAttributes = {
  reflexes: 86,
  positioning: 85,
  glove: 84,
  blocker: 83,
  reboundControl: 82,
  puckHandling: 80,
  consistency: 87,
  clutch: 88,
} as const;

function createPlayer(prefix: string, league: League, slot: LineupSlot, index: number): Player {
  const id = `${prefix}-${slot.toLowerCase()}-player`;
  const common = {
    id,
    name: `${prefix.toUpperCase()} ${slot}`,
    league,
    currentTeamId: `${league.toLowerCase()}-test-club`,
    team: `${league} Test Club`,
    nationality: 'CAN',
    archetype: slot === 'G' ? 'Hybrid' : 'Two-way',
    handedness: index % 2 === 0 ? ('left' as const) : ('right' as const),
    imageReference: `placeholder:${id}`,
    active: true as const,
    sourceMetadata: {
      provider: league === 'NHL' ? 'nhl-api' as const : 'pwhl-hockeytech' as const,
      sourceIds: [id],
      sourceUrls: ['https://example.test/fixture'],
      snapshotDate: '2026-07-14',
      rosterSeason: 'test',
      statsSeason: 'test',
      sourceRosterStatus: 'active-roster' as const,
      positionSource: 'official-exact' as const,
      requiresManualReview: false,
      manualReviewReasons: [],
    },
  };

  if (slot === 'G') {
    return { ...common, role: 'goalie', primaryPosition: 'G', eligiblePositions: ['G'] };
  }

  return { ...common, role: 'skater', primaryPosition: slot, eligiblePositions: [slot] };
}

function createCard(player: Player, prefix: string, index: number): CardVersion {
  const id = `${prefix}-${player.primaryPosition.toLowerCase()}-card`;
  const common = {
    id,
    playerId: player.id,
    teamId: player.currentTeamId,
    setId: 'base-set',
    cardType: 'base' as const,
    cardTier: 'standard' as const,
    overall: 82 + (index % 6),
    abilities: [],
    price: 1_000 + index * 100,
    marketAvailability: 'base-market' as const,
    isPermanent: true,
    imageReference: createCardImageReference(player.id, 'base', id),
    visualMetadata: { treatment: 'neutral-placeholder' as const, accent: '#667788', frame: 'standard' as const },
  };

  return player.role === 'goalie'
    ? { ...common, role: 'goalie', attributes: goalieAttributes }
    : {
        ...common,
        role: 'skater',
        attributes: Object.fromEntries(
          Object.entries(skaterAttributes).map(([key, value]) => [key, value + (index % 4)]),
        ) as unknown as typeof skaterAttributes,
      };
}

function createRoster(prefix: string, league: League): CardCatalog {
  const players = LINEUP_SLOTS.map((slot, index) => createPlayer(prefix, league, slot, index));
  return {
    players,
    cards: players.map((player, index) => createCard(player, prefix, index)),
  };
}

export function createTestCatalog(): CardCatalog {
  const rosters = [
    createRoster('nhl-alpha', 'NHL'),
    createRoster('nhl-beta', 'NHL'),
    createRoster('pwhl-alpha', 'PWHL'),
    createRoster('pwhl-beta', 'PWHL'),
  ];
  return {
    players: rosters.flatMap(({ players }) => players),
    cards: rosters.flatMap(({ cards }) => cards),
  };
}

export function createTestLineup(prefix: string, mode: GameMode): Lineup {
  return {
    id: `${prefix}-${mode}`,
    name: `${prefix} lineup`,
    mode,
    slots: Object.fromEntries(
      LINEUP_SLOTS.map((slot) => [slot, `${prefix}-${slot.toLowerCase()}-card`]),
    ) as Record<LineupSlot, string>,
  };
}
