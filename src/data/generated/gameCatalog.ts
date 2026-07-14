import type { ContentCatalog } from '../../domain/cards/types';
import type { Lineup } from '../../domain/lineups/types';
import { parseCatalog } from '../catalogSchema';
import rawCatalog from './gameCatalog.json' with { type: 'json' };
import { buildEventCardManifest } from './eventCardManifest';

const generated = parseCatalog(rawCatalog);

export const catalogMetadata = generated.metadata;
export const teams = generated.teams;
export const starterSquads = generated.starterSquads;

export const gameCatalog: ContentCatalog = {
  teams,
  players: generated.players,
  cards: generated.cards,
  starterSquads,
};

export const eventCardManifest = buildEventCardManifest(
  gameCatalog.players,
  gameCatalog.cards,
);

/**
 * Backward-compatible lineup projections for battle/balance tooling. The
 * authoritative onboarding choice is the full per-team `starterSquads` set.
 */
export const starterLineups: readonly Lineup[] = starterSquads.map((squad) => {
  const team = teams.find((candidate) => candidate.id === squad.teamId);
  if (!team) throw new TypeError(`StarterSquad references missing team ${squad.teamId}.`);
  return {
    id: `starter-${team.id}`,
    name: `${team.name} Starter`,
    mode: team.league === 'NHL' ? 'nhl-circuit' : 'pwhl-circuit',
    slots: squad.lineup,
  };
});
