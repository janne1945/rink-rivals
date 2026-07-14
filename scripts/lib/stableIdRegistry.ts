import { z } from 'zod';

import type { League } from '../../src/domain/cards/types';
import { STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET } from '../../src/data/starterFloorExceptions';

const stableIdSchema = z
  .string()
  .min(3)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Stable IDs must use lowercase kebab-case');

const registryRowSchema = z.tuple([
  z.enum(['NHL', 'PWHL']),
  z.string().trim().min(1),
  stableIdSchema,
  z.array(z.string().trim().min(2)).min(1),
]);

export const stableIdRegistrySchema = z.object({
  metadata: z.object({
    schemaVersion: z.literal(1),
    reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rowFormat: z.literal('[league, sourceId, stableId, displayNameAliases]'),
    strategy: z.string().trim().min(40),
    starterOverallFloorExceptionPlayerIds: z.array(stableIdSchema).length(6),
  }),
  teams: z.array(registryRowSchema).min(1),
  players: z.array(registryRowSchema).min(1),
});

export type StableIdRegistry = z.infer<typeof stableIdRegistrySchema>;
type RegistryKind = 'team' | 'player';
type RegistryRow = z.infer<typeof registryRowSchema>;

function sourceKey(league: League, sourceId: string): string {
  return `${league}:${sourceId}`;
}

function buildIndex(kind: RegistryKind, rows: readonly RegistryRow[]): Map<string, RegistryRow> {
  const index = new Map<string, RegistryRow>();
  const aliasesByStableId = new Map<string, string>();
  for (const row of rows) {
    const [league, sourceId, stableId, aliases] = row;
    const key = sourceKey(league, sourceId);
    if (index.has(key)) throw new Error(`Duplicate ${kind} source ID in stable registry: ${key}`);
    if (new Set(aliases).size !== aliases.length) {
      throw new Error(`Duplicate display-name alias for stable ${kind} ID ${stableId}`);
    }
    const canonicalAliases = JSON.stringify([...aliases].sort());
    const existingAliases = aliasesByStableId.get(stableId);
    if (existingAliases !== undefined && existingAliases !== canonicalAliases) {
      throw new Error(`Source aliases for stable ${kind} ID ${stableId} must share one reviewed name list`);
    }
    aliasesByStableId.set(stableId, canonicalAliases);
    index.set(key, row);
  }
  return index;
}

export interface StableIdResolver {
  readonly registry: StableIdRegistry;
  resolveTeam(league: League, sourceId: string, displayName: string): string;
  resolvePlayer(league: League, sourceId: string, displayName: string): string;
}

export function createStableIdResolver(input: unknown): StableIdResolver {
  const registry = stableIdRegistrySchema.parse(input);
  const reviewedFloorIds = new Set(registry.metadata.starterOverallFloorExceptionPlayerIds);
  if (reviewedFloorIds.size !== STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.size
    || [...reviewedFloorIds].some((id) => !STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.has(id))) {
    throw new Error('Stable ID registry must contain the exact reviewed Starter/Base 68-OVR floor exception set.');
  }
  const teamIndex = buildIndex('team', registry.teams);
  const playerIndex = buildIndex('player', registry.players);

  const resolve = (
    kind: RegistryKind,
    index: ReadonlyMap<string, RegistryRow>,
    league: League,
    sourceId: string,
    displayName: string,
  ): string => {
    const key = sourceKey(league, sourceId);
    const row = index.get(key);
    if (!row) {
      throw new Error(`Unreviewed ${kind} source ID ${key}; add it to stable-id-registry.json before generating content.`);
    }
    const [, , stableId, aliases] = row;
    if (!aliases.includes(displayName)) {
      throw new Error(
        `Unreviewed display name ${JSON.stringify(displayName)} for stable ${kind} ID ${stableId}; add it as an alias before generating content.`,
      );
    }
    return stableId;
  };

  return {
    registry,
    resolveTeam: (league, sourceId, displayName) =>
      resolve('team', teamIndex, league, sourceId, displayName),
    resolvePlayer: (league, sourceId, displayName) =>
      resolve('player', playerIndex, league, sourceId, displayName),
  };
}
