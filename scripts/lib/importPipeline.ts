import { z } from 'zod';

import type {
  CardVersion,
  GoalieAttributes,
  Player,
  SkaterAttributes,
  SkaterPosition,
} from '../../src/domain/cards/types';
import { parseCatalog, type Catalog } from '../../src/data/catalogSchema';
import type { CsvRecord } from './csv';

const numericField = z.coerce.number().finite().nonnegative();
const snapshotDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const midnight = `${value}T00:00:00.000Z`;
  return !Number.isNaN(Date.parse(midnight)) && new Date(midnight).toISOString() === midnight;
}, 'Snapshot date must be a real UTC calendar date');

export const statRowSchema = z
  .object({
    player_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(2),
    league: z.enum(['NHL', 'PWHL']),
    season: z.string().regex(/^\d{4}-\d{2}$/),
    role: z.enum(['skater', 'goalie']),
    position: z.enum(['LW', 'C', 'RW', 'LD', 'RD', 'G']),
    team: z.string().trim().min(2),
    nationality: z.string().trim().length(3),
    handedness: z.enum(['left', 'right']),
    games_played: numericField,
    minutes_played: numericField,
    goals: numericField,
    assists: numericField,
    points: numericField,
    shots: numericField,
    blocks: numericField,
    hits: numericField,
    plus_minus: z.coerce.number().finite(),
    game_winning_goals: numericField,
    save_pct: numericField,
    goals_against_average: numericField,
    shutouts: numericField,
    wins: numericField,
  })
  .superRefine((row, context) => {
    if (row.role === 'goalie' && row.position !== 'G') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Goalie rows must use position G',
        path: ['position'],
      });
    }
    if (row.role === 'skater' && row.position === 'G') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Skater rows cannot use position G',
        path: ['position'],
      });
    }
    if (row.role === 'goalie' && row.minutes_played <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Goalie rows require minutes_played',
        path: ['minutes_played'],
      });
    }
    if (row.role === 'skater' && row.games_played <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Skater rows require games_played',
        path: ['games_played'],
      });
    }
  });

export type StatRow = z.infer<typeof statRowSchema>;

const attributeNameSchema = z.enum([
  'overall',
  'speed',
  'shooting',
  'passing',
  'puckControl',
  'defense',
  'physicality',
  'hockeyIq',
  'clutch',
  'reflexes',
  'positioning',
  'glove',
  'blocker',
  'reboundControl',
  'puckHandling',
  'consistency',
]);

export const overrideSchema = z.object({
  playerId: z.string().min(3),
  attribute: attributeNameSchema,
  sourceValue: z.number().int().min(40).max(99),
  replacementValue: z.number().int().min(40).max(99),
  reason: z.string().trim().min(12),
});

export type RatingOverride = z.infer<typeof overrideSchema>;

export interface ImportOptions {
  readonly seasons: readonly [string, string, string];
  readonly overrides?: readonly RatingOverride[];
  readonly generatedAt?: string;
  readonly snapshotDate?: string;
}

export interface ImportReport {
  readonly rowsRead: number;
  readonly playersCreated: number;
  readonly seasonWeights: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
  readonly appliedOverrides: readonly RatingOverride[];
  readonly proxyDefinitions: Readonly<Record<string, string>>;
  readonly approvalStatus: 'REQUIRES_MANUAL_REVIEW';
}

export interface ImportCandidate {
  readonly catalog: Catalog;
  readonly report: ImportReport;
}

type MetricMap = Readonly<Record<string, number>>;

function stableSlug(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const proxyDefinitions = {
  speed: 'weighted points/game and shots/game proxy; official box scores do not directly measure skating speed',
  shooting: 'weighted goals/game plus shooting percentage',
  passing: 'weighted assists/game and points/game',
  puckControl: 'weighted points/game, shots/game and plus-minus/game proxy',
  defense: 'weighted blocks/game and plus-minus/game',
  physicality: 'weighted hits/game and blocks/game',
  hockeyIq: 'weighted points/game, assists/game and plus-minus/game',
  clutch: 'weighted game-winning-goals/game and points/game',
  reflexes: 'weighted save percentage',
  positioning: 'weighted save percentage and inverse goals-against average',
  glove: 'weighted save percentage and shutouts/game',
  blocker: 'weighted save percentage and inverse goals-against average',
  reboundControl: 'weighted inverse goals-against average and save percentage',
  puckHandling: 'weighted wins/game and consistency proxy; public box scores do not isolate puck handling',
  consistency: 'weighted save percentage, inverse goals-against average and games played',
  goalieClutch: 'weighted wins/game and shutouts/game',
} as const;

function safeRate(value: number, divisor: number): number {
  return divisor <= 0 ? 0 : value / divisor;
}

function metricsForRow(row: StatRow): MetricMap {
  if (row.role === 'goalie') {
    const games = Math.max(row.games_played, row.minutes_played / 60, 1);
    return {
      reflexes: row.save_pct,
      positioning: row.save_pct * 0.7 - row.goals_against_average * 0.3,
      glove: row.save_pct * 0.75 + safeRate(row.shutouts, games) * 0.25,
      blocker: row.save_pct * 0.8 - row.goals_against_average * 0.2,
      reboundControl: -row.goals_against_average * 0.65 + row.save_pct * 0.35,
      puckHandling: safeRate(row.wins, games),
      consistency: row.save_pct * 0.55 - row.goals_against_average * 0.25 + Math.log1p(games) * 0.2,
      clutch: safeRate(row.wins, games) * 0.65 + safeRate(row.shutouts, games) * 0.35,
    };
  }

  const games = Math.max(row.games_played, 1);
  const pointsPerGame = safeRate(row.points, games);
  const shotsPerGame = safeRate(row.shots, games);
  const plusMinusPerGame = safeRate(row.plus_minus, games);
  const goalsPerGame = safeRate(row.goals, games);
  const assistsPerGame = safeRate(row.assists, games);
  const blocksPerGame = safeRate(row.blocks, games);
  const hitsPerGame = safeRate(row.hits, games);

  return {
    speed: pointsPerGame * 0.55 + shotsPerGame * 0.45,
    shooting: goalsPerGame * 0.7 + safeRate(row.goals, Math.max(row.shots, 1)) * 0.3,
    passing: assistsPerGame * 0.7 + pointsPerGame * 0.3,
    puckControl: pointsPerGame * 0.55 + shotsPerGame * 0.3 + plusMinusPerGame * 0.15,
    defense: blocksPerGame * 0.65 + plusMinusPerGame * 0.35,
    physicality: hitsPerGame * 0.7 + blocksPerGame * 0.3,
    hockeyIq: pointsPerGame * 0.5 + assistsPerGame * 0.35 + plusMinusPerGame * 0.15,
    clutch: safeRate(row.game_winning_goals, games) * 0.6 + pointsPerGame * 0.4,
  };
}

function assertStableIdentity(rows: readonly StatRow[]): void {
  const byId = new Map<string, StatRow>();
  for (const row of rows) {
    const previous = byId.get(row.player_id);
    if (!previous) {
      byId.set(row.player_id, row);
      continue;
    }

    const identityFields = ['name', 'league', 'role', 'position', 'nationality'] as const;
    for (const field of identityFields) {
      if (previous[field] !== row[field]) {
        throw new Error(
          `Conflicting ${field} for ${row.player_id}: ${previous[field]} vs ${row[field]}`,
        );
      }
    }
  }
}

export function parseStatRows(records: readonly CsvRecord[]): StatRow[] {
  const parsed = records.map((record, index) => {
    const result = statRowSchema.safeParse(record);
    if (!result.success) {
      throw new Error(`Invalid stats row ${index + 2}: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  });

  assertStableIdentity(parsed);
  return parsed;
}

function weightedMetrics(
  playerRows: readonly StatRow[],
  seasonWeights: Readonly<Record<string, number>>,
): MetricMap {
  const presentRows = playerRows.filter((row) => seasonWeights[row.season] !== undefined);
  const availableWeight = presentRows.reduce((sum, row) => sum + seasonWeights[row.season], 0);
  if (availableWeight <= 0) {
    throw new Error(`No configured seasons found for ${playerRows[0]?.player_id ?? 'unknown player'}`);
  }

  const result: Record<string, number> = {};
  for (const row of presentRows) {
    const normalizedWeight = seasonWeights[row.season] / availableWeight;
    for (const [metric, value] of Object.entries(metricsForRow(row))) {
      result[metric] = (result[metric] ?? 0) + value * normalizedWeight;
    }
  }
  return result;
}

export function percentileRating(value: number, peerValues: readonly number[]): number {
  if (peerValues.length <= 1 || peerValues.every((peer) => peer === peerValues[0])) {
    return 85;
  }

  const below = peerValues.filter((peer) => peer < value).length;
  const equal = peerValues.filter((peer) => peer === value).length;
  const percentile = (below + Math.max(0, equal - 1) / 2) / (peerValues.length - 1);
  return Math.round(70 + Math.min(1, Math.max(0, percentile)) * 29);
}

function playerArchetype(row: StatRow): string {
  if (row.role === 'goalie') return 'stats-derived goalie';
  if (row.position === 'LD' || row.position === 'RD') return 'stats-derived defender';
  if (row.position === 'C') return 'stats-derived center';
  return 'stats-derived winger';
}

function applyOverrides(
  cards: CardVersion[],
  overrides: readonly RatingOverride[],
): RatingOverride[] {
  const applied: RatingOverride[] = [];
  for (const rawOverride of overrides) {
    const override = overrideSchema.parse(rawOverride);
    const card = cards.find((candidate) => candidate.playerId === override.playerId);
    if (!card) {
      throw new Error(`Override references unknown player: ${override.playerId}`);
    }

    const sourceValue =
      override.attribute === 'overall'
        ? card.overall
        : (card.attributes as unknown as Record<string, number>)[override.attribute];

    if (sourceValue === undefined) {
      throw new Error(
        `Override attribute ${override.attribute} is not valid for ${override.playerId}`,
      );
    }
    if (sourceValue !== override.sourceValue) {
      throw new Error(
        `Override source mismatch for ${override.playerId}.${override.attribute}: expected ${sourceValue}, received ${override.sourceValue}`,
      );
    }

    if (override.attribute === 'overall') {
      (card as { overall: number }).overall = override.replacementValue;
    } else {
      (card.attributes as unknown as Record<string, number>)[override.attribute] =
        override.replacementValue;
    }
    applied.push(override);
  }
  return applied;
}

export function buildImportCandidate(
  inputRows: readonly StatRow[],
  options: ImportOptions,
): ImportCandidate {
  const [oldest, middle, newest] = options.seasons;
  if (new Set(options.seasons).size !== 3) {
    throw new Error('Exactly three distinct seasons are required');
  }
  const generatedAt = z.string().datetime().parse(options.generatedAt ?? new Date().toISOString());
  const snapshotDate = snapshotDateSchema.parse(options.snapshotDate ?? generatedAt.slice(0, 10));

  const seasonWeights = { [oldest]: 0.1, [middle]: 0.3, [newest]: 0.6 };
  const unknownSeasons = [...new Set(inputRows.map((row) => row.season))].filter(
    (season) => seasonWeights[season] === undefined,
  );
  if (unknownSeasons.length > 0) {
    throw new Error(`Rows contain unconfigured seasons: ${unknownSeasons.join(', ')}`);
  }

  const rowsByPlayer = new Map<string, StatRow[]>();
  for (const row of inputRows) {
    const existing = rowsByPlayer.get(row.player_id) ?? [];
    if (existing.some((candidate) => candidate.season === row.season)) {
      throw new Error(`Duplicate player-season row: ${row.player_id} ${row.season}`);
    }
    existing.push(row);
    rowsByPlayer.set(row.player_id, existing);
  }

  const weightedByPlayer = new Map<string, MetricMap>();
  for (const [playerId, rows] of rowsByPlayer) {
    weightedByPlayer.set(playerId, weightedMetrics(rows, seasonWeights));
  }

  const peersByGroup = new Map<string, MetricMap[]>();
  for (const [playerId, metrics] of weightedByPlayer) {
    const identity = rowsByPlayer.get(playerId)?.[0];
    if (!identity) continue;
    const key = `${identity.league}:${identity.role}:${identity.position}`;
    peersByGroup.set(key, [...(peersByGroup.get(key) ?? []), metrics]);
  }

  const players: Player[] = [];
  const cards: CardVersion[] = [];
  const warnings: string[] = [];

  for (const [playerId, rows] of rowsByPlayer) {
    const identity = rows[0];
    const metrics = weightedByPlayer.get(playerId);
    if (!identity || !metrics) continue;
    const groupKey = `${identity.league}:${identity.role}:${identity.position}`;
    const peers = peersByGroup.get(groupKey) ?? [];
    const attributes = Object.fromEntries(
      Object.entries(metrics).map(([metric, value]) => [
        metric,
        percentileRating(value, peers.map((peer) => peer[metric] ?? 0)),
      ]),
    );

    const attributeValues = Object.values(attributes);
    const rawOverall = Math.round(
      attributeValues.reduce((sum, value) => sum + value, 0) / attributeValues.length,
    );
    const overall = Math.min(86, Math.max(68, Math.round(68 + ((rawOverall - 70) / 29) * 18)));
    const currentTeamId = `${identity.league.toLowerCase()}-${stableSlug(identity.team)}`;

    const commonPlayer = {
      id: playerId,
      name: identity.name,
      league: identity.league,
      currentTeamId,
      team: identity.team,
      nationality: identity.nationality.toUpperCase(),
      archetype: playerArchetype(identity),
      handedness: identity.handedness,
      imageReference: `placeholder:player/${playerId}`,
      active: true as const,
      sourceMetadata: {
        provider: 'manual-import' as const,
        sourceIds: [playerId],
        sourceUrls: [`https://example.invalid/import/${playerId}`],
        snapshotDate,
        rosterSeason: options.seasons[2],
        statsSeason: options.seasons[2],
        sourceRosterStatus: 'active-roster' as const,
        positionSource: 'official-exact' as const,
        requiresManualReview: true,
        manualReviewReasons: ['Offline import candidate requires official-source verification.'],
      },
    } as const;

    if (identity.role === 'goalie') {
      players.push({
        ...commonPlayer,
        role: 'goalie',
        primaryPosition: 'G',
        eligiblePositions: ['G'],
      });
      cards.push({
        id: `${playerId}-base`,
        playerId,
        teamId: currentTeamId,
        setId: 'base-import-candidate',
        cardType: 'base',
        cardTier: 'standard',
        role: 'goalie',
        overall,
        attributes: attributes as unknown as GoalieAttributes,
        abilities: [],
        price: 450 + Math.max(0, overall - 70) * 75,
        marketAvailability: 'base-market',
        isPermanent: true,
        imageReference: `placeholder:card/${playerId}-base`,
        visualMetadata: { treatment: 'neutral-placeholder', accent: '#667788', frame: 'standard' },
      });
    } else {
      const position = identity.position as SkaterPosition;
      players.push({
        ...commonPlayer,
        role: 'skater',
        primaryPosition: position,
        eligiblePositions: [position],
      });
      cards.push({
        id: `${playerId}-base`,
        playerId,
        teamId: currentTeamId,
        setId: 'base-import-candidate',
        cardType: 'base',
        cardTier: 'standard',
        role: 'skater',
        overall,
        attributes: attributes as unknown as SkaterAttributes,
        abilities: [],
        price: 450 + Math.max(0, overall - 70) * 75,
        marketAvailability: 'base-market',
        isPermanent: true,
        imageReference: `placeholder:card/${playerId}-base`,
        visualMetadata: { treatment: 'neutral-placeholder', accent: '#667788', frame: 'standard' },
      });
    }

    if (rows.length < 3) {
      warnings.push(
        `${playerId}: only ${rows.length}/3 configured seasons available; weights were renormalized`,
      );
    }
    const totalGames = rows.reduce((sum, row) => sum + row.games_played, 0);
    const totalMinutes = rows.reduce((sum, row) => sum + row.minutes_played, 0);
    if (
      (identity.role === 'skater' && totalGames < 30) ||
      (identity.role === 'goalie' && totalMinutes < 480)
    ) {
      warnings.push(`${playerId}: low sample size; manual rating review required`);
    }
  }

  const appliedOverrides = applyOverrides(cards, options.overrides ?? []);
  const teams = [...new Map(inputRows.map((row) => {
    const id = `${row.league.toLowerCase()}-${stableSlug(row.team)}`;
    return [id, {
      id, name: row.team, abbreviation: stableSlug(row.team).slice(0, 3).toUpperCase(),
      league: row.league, active: true as const,
      visualMetadata: { treatment: 'neutral-unlicensed' as const, primaryColor: '#556677', secondaryColor: '#8899aa', abbreviation: stableSlug(row.team).slice(0, 3).toUpperCase() },
      sourceMetadata: {
        provider: row.league === 'NHL' ? 'nhl-api' as const : 'pwhl-hockeytech' as const,
        sourceId: id, sourceUrl: `https://example.invalid/team/${id}`,
        snapshotDate, rosterSeason: options.seasons[2],
      },
    }];
  })).values()];
  const catalog = parseCatalog({
    metadata: {
      catalogId: 'rink-rivals-import-candidate',
      generatedAt,
      snapshotDate,
      sourceWindow: [...options.seasons],
      disclaimer: 'Unofficial import candidate using fantasy proxies. Manual review is mandatory before replacing the approved catalog.',
      requiresManualApproval: true,
    },
    teams,
    players,
    cards,
    starterSquads: [],
  });

  return {
    catalog,
    report: {
      rowsRead: inputRows.length,
      playersCreated: players.length,
      seasonWeights,
      warnings,
      appliedOverrides,
      proxyDefinitions,
      approvalStatus: 'REQUIRES_MANUAL_REVIEW',
    },
  };
}
