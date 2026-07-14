import type { ContentCatalog, HockeyPosition, League } from '../../src/domain/cards/types';
import type { Lineup } from '../../src/domain/lineups/types';
import { EVENT_CALENDAR, EVENT_IDS, type EventId } from '../../src/domain/shop/eventCalendar';
import { catalogSchema } from '../../src/data/catalogSchema';
import { STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET } from '../../src/data/starterFloorExceptions';

const SLOTS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const;
const LEGACY_REQUIRED_CARD_IDS = [
  'pwhl-claire-thompson-base',
  'pwhl-claire-thompson-international-ice',
  'pwhl-kendall-coyne-schofield-base',
  'pwhl-kendall-coyne-schofield-international-ice',
  'pwhl-kendall-coyne-schofield-record-breakers',
  'pwhl-kendall-coyne-schofield-rivalry-2026',
] as const;

export interface CatalogValidationReport {
  readonly teams: number;
  readonly players: number;
  readonly activePlayers: number;
  readonly legacyPlayers: number;
  readonly starterCards: number;
  readonly baseCards: number;
  readonly eventCards: number;
  readonly rewardCards: number;
  readonly rivalryCards: number;
  readonly calendarEventCards: number;
  readonly calendarEventCounts: Readonly<Record<EventId, number>>;
  readonly eventCoverageByTeam: Readonly<Record<string, number>>;
  readonly baseOverallAverage: Readonly<Record<League, number>>;
  readonly slotCounts: Readonly<Record<League, Readonly<Record<HockeyPosition, number>>>>;
  readonly starterAverageRange: readonly [number, number];
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function validateGameCatalog(
  catalog: ContentCatalog,
  metadata: unknown,
  starterLineups: readonly Lineup[] = [],
): CatalogValidationReport {
  const parsed = catalogSchema.safeParse({ metadata, ...catalog });
  if (!parsed.success) {
    throw new Error(`Catalog schema validation failed:\n${parsed.error.message}`);
  }

  const playerById = new Map(parsed.data.players.map((player) => [player.id, player]));
  const cardById = new Map(parsed.data.cards.map((card) => [card.id, card]));
  const activePlayers = parsed.data.players.filter((player) => player.active);
  const legacyPlayers = parsed.data.players.filter((player) => !player.active);
  const starterCards = parsed.data.cards.filter((card) => card.cardType === 'starter');
  const baseCards = parsed.data.cards.filter((card) => card.cardType === 'base');
  const eventCards = parsed.data.cards.filter((card) => card.cardType === 'event');
  const rewardCards = parsed.data.cards.filter((card) => card.cardType === 'reward');
  const rivalryCards = rewardCards.filter((card) => card.setId === 'rivalry-series-2026');

  const baseByPlayer = new Map(baseCards.map((card) => [card.playerId, card]));
  const starterFloorExceptionIds = new Set<string>();
  for (const starter of starterCards) {
    const base = baseByPlayer.get(starter.playerId);
    if (!base || starter.overall > base.overall
      || (starter.overall === base.overall
        && (base.overall !== 68 || !STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.has(starter.playerId)))) {
      throw new Error(`${starter.id} must be lower-rated than Base except at the shared 68 launch floor`);
    }
    const baseAttributes = base.attributes as unknown as Record<string, number>;
    const starterAttributes = starter.attributes as unknown as Record<string, number>;
    const deltas = Object.keys(starterAttributes).map((key) => starterAttributes[key] - baseAttributes[key]);
    if (deltas.some((delta) => delta > 0) || !deltas.some((delta) => delta < 0)) {
      throw new Error(`${starter.id} must have a strictly weaker, never-higher attribute profile than Base`);
    }
    if (starter.overall === base.overall) starterFloorExceptionIds.add(starter.playerId);
  }
  if (starterFloorExceptionIds.size !== STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.size
    || [...starterFloorExceptionIds].some((id) => !STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.has(id))) {
    throw new Error(
      `Expected the exact reviewed six-player 68-OVR Starter/Base floor exception set; received ${[...starterFloorExceptionIds].sort().join(', ')}`,
    );
  }

  for (const league of ['NHL', 'PWHL'] as const) {
    if (!parsed.data.teams.some((team) => team.league === league)) {
      throw new Error(`The catalog must contain the active ${league} team universe`);
    }
  }
  if (parsed.data.teams.some((team) => team.id.startsWith('pwhl-pwhl-'))) {
    throw new Error('PWHL stable team IDs cannot repeat the league prefix');
  }
  const expectedStarterCardIds = new Set(parsed.data.starterSquads.flatMap((squad) => squad.cards));
  if (parsed.data.starterSquads.length !== parsed.data.teams.length
    || expectedStarterCardIds.size !== starterCards.length
    || starterCards.some((card) => !expectedStarterCardIds.has(card.id))) {
    throw new Error(
      'Every active team must have exactly one StarterSquad and every Starter card must belong to one of those squads',
    );
  }
  if (activePlayers.length !== baseCards.length
    || baseByPlayer.size !== activePlayers.length
    || activePlayers.some((player) => !baseByPlayer.has(player.id))
    || baseCards.some((card) => !playerById.get(card.playerId)?.active)) {
    throw new Error('Every active identity must have exactly one Base card and inactive identities cannot have Base cards');
  }
  if (legacyPlayers.length !== 2
    || legacyPlayers.some((player) => player.sourceMetadata.sourceRosterStatus !== 'legacy-retained')) {
    throw new Error('Expected exactly two inactive, explicitly legacy-retained identities');
  }
  for (const id of LEGACY_REQUIRED_CARD_IDS) {
    const card = cardById.get(id);
    if (!card || card.cardType !== 'reward' || card.marketAvailability !== 'reward-only'
      || card.price !== 0 || !card.isPermanent) {
      throw new Error(`Legacy card ${id} must remain addressable but permanently excluded from markets`);
    }
  }
  if (rewardCards.length !== 15 || rivalryCards.length !== 10) {
    throw new Error(`Expected 10 launch Rivalry rewards plus 5 other retained cards; received ${rivalryCards.length}/${rewardCards.length}`);
  }

  const slotCounts = {
    NHL: Object.fromEntries(SLOTS.map((slot) => [slot, 0])),
    PWHL: Object.fromEntries(SLOTS.map((slot) => [slot, 0])),
  } as Record<League, Record<HockeyPosition, number>>;
  const officialSourceKeys = new Set<string>();
  for (const player of activePlayers) {
    slotCounts[player.league][player.primaryPosition] += 1;
    if (!player.imageReference?.startsWith('placeholder:')) {
      throw new Error(`Player identity ${player.id} uses an unapproved image reference`);
    }
    if (player.sourceMetadata.sourceRosterStatus === 'rights'
      && (!player.sourceMetadata.requiresManualReview
        || !player.sourceMetadata.manualReviewReasons.some((reason) => reason.includes('not an active-roster claim')))) {
      throw new Error(`${player.id} draft rights must be explicitly distinguished from an active roster claim`);
    }
    if (player.sourceMetadata.sourceRosterStatus === 'roster-candidate'
      && (!player.sourceMetadata.requiresManualReview
        || !player.sourceMetadata.manualReviewReasons.some((reason) => reason.includes('preseason roster endpoint')))) {
      throw new Error(`${player.id} roster candidate must explain the official-source fallback`);
    }
    for (const sourceId of player.sourceMetadata.sourceIds) {
      const key = `${player.league}:${sourceId}`;
      if (officialSourceKeys.has(key)) throw new Error(`Duplicate official player source: ${key}`);
      officialSourceKeys.add(key);
    }
  }

  const baseOverallAverage = {} as Record<League, number>;
  for (const league of ['NHL', 'PWHL'] as const) {
    const leagueActivePlayers = activePlayers.filter((player) => player.league === league);
    if (leagueActivePlayers.length === 0) throw new Error(`${league} must have active identities`);
    const values = baseCards
      .filter((card) => playerById.get(card.playerId)?.league === league)
      .map((card) => card.overall);
    baseOverallAverage[league] = average(values);
  }
  if (Math.abs(baseOverallAverage.NHL - baseOverallAverage.PWHL) > 1) {
    throw new Error('League-normalized Base averages differ by more than one OVR');
  }

  for (const team of parsed.data.teams) {
    const teamPlayers = activePlayers.filter((player) => player.currentTeamId === team.id);
    const teamBase = baseCards.filter((card) => card.teamId === team.id);
    if (teamPlayers.length < 16 || teamPlayers.length > 20 || teamBase.length !== teamPlayers.length) {
      throw new Error(`${team.id} must have 16-20 active identities with one Base card per identity`);
    }
    const squad = parsed.data.starterSquads.find((candidate) => candidate.teamId === team.id);
    if (!squad) throw new Error(`${team.id} is missing its StarterSquad`);
    const starterPlayerIds = new Set(squad.cards.map((id) => cardById.get(id)?.playerId));
    const squadCardIds = new Set(squad.cards);
    const lineupCardIds = new Set(Object.values(squad.lineup));
    if (squadCardIds.size !== lineupCardIds.size
      || [...squadCardIds].some((cardId) => !lineupCardIds.has(cardId))) {
      throw new Error(`${team.id} Starter cards and lineup must contain exactly the same IDs`);
    }
    const sorted = [...teamBase].sort((left, right) => right.overall - left.overall || left.playerId.localeCompare(right.playerId));
    const cutoff = sorted[2]?.overall;
    const protectedIds = sorted.filter((card) => card.overall >= (cutoff ?? 100)).map((card) => card.playerId);
    if (cutoff === undefined || protectedIds.some((id) => starterPlayerIds.has(id))) {
      throw new Error(`${team.id} StarterSquad contains a protected top-Base identity`);
    }
    if (starterPlayerIds.has('nhl-connor-mcdavid')) {
      throw new Error('Connor McDavid cannot be granted in Edmonton onboarding');
    }
    const starterRatings = squad.cards.map((id) => cardById.get(id)?.overall ?? 0);
    if (average(starterRatings) !== 72 || squad.averageOverall !== 72) {
      throw new Error(`${team.id} Starter average must be exactly 72`);
    }
    const hasFloorException = squad.cards.some((id) => {
      const card = cardById.get(id);
      return card !== undefined && STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.has(card.playerId);
    });
    if (hasFloorException && (!squad.validationMetadata.requiresManualReview
      || !squad.validationMetadata.manualReviewReasons.some((reason) => reason.includes('reviewed 68-OVR floor exception')))) {
      throw new Error(`${team.id} must carry the reviewed 68-OVR floor exception audit reason`);
    }
  }

  const calendarEventCounts = {} as Record<EventId, number>;
  if (EVENT_CALENDAR.length !== 10 || new Set(EVENT_CALENDAR.map(({ id }) => id)).size !== 10) {
    throw new Error('The recurring Event Calendar must contain ten unique events');
  }
  for (const eventId of EVENT_IDS) {
    const setCards = eventCards.filter((card) => card.setId === eventId);
    calendarEventCounts[eventId] = setCards.length;
    if (setCards.length < 6) throw new Error(`${eventId} requires at least six launch cards`);
  }
  for (const card of eventCards) {
    const base = baseCards.find((candidate) => candidate.playerId === card.playerId);
    if (!base || base.role !== card.role || card.id !== `${card.playerId}-${card.setId}`) {
      throw new Error(`${card.id} violates stable event/base identity contracts`);
    }
    if (!(card.setId === 'signature-series'
      && card.visualMetadata.treatment === 'approved-local-asset')) {
      const baseAttributes = base.attributes as unknown as Record<string, number>;
      const eventAttributes = card.attributes as unknown as Record<string, number>;
      const deltas = Object.keys(eventAttributes).map((key) => eventAttributes[key] - baseAttributes[key]);
      if (!deltas.some((delta) => delta > 0) || !deltas.some((delta) => delta < 0)) {
        throw new Error(`${card.id} must include both an Event strength and tradeoff`);
      }
    }
    const comparableBasePrice = Math.max(...baseCards
      .filter((candidate) => candidate.overall <= Math.min(86, card.overall))
      .map((candidate) => candidate.price));
    if (card.price <= comparableBasePrice) {
      throw new Error(`${card.id} must cost more than a comparable Base card`);
    }
  }
  const eventCoverageByTeam = Object.fromEntries(parsed.data.teams.map((team) => {
    const count = eventCards.filter((card) => card.teamId === team.id).length;
    if (count < 1) throw new Error(`${team.id} requires at least one launch Event card`);
    return [team.id, count];
  }));

  const secretBearingUrls = [
    ...parsed.data.teams.map((team) => team.sourceMetadata.sourceUrl),
    ...parsed.data.players.flatMap((player) => player.sourceMetadata.sourceUrls),
  ].filter((url) => /[?&]key=/i.test(url));
  if (secretBearingUrls.length > 0) throw new Error('Persisted source URLs must not include transient feed keys');

  if (starterLineups.length > 0) {
    if (starterLineups.length !== parsed.data.starterSquads.length) {
      throw new Error('Expected one lineup projection for every StarterSquad');
    }
    for (const lineup of starterLineups) {
      for (const [slot, cardId] of Object.entries(lineup.slots)) {
        const card = cardById.get(cardId);
        const player = card ? playerById.get(card.playerId) : undefined;
        if (!card || card.cardType !== 'starter' || !player?.eligiblePositions.includes(slot as never)) {
          throw new Error(`${lineup.id} has an invalid ${slot} Starter projection`);
        }
      }
    }
  }

  const starterAverages = parsed.data.starterSquads.map((squad) => squad.averageOverall);
  return {
    teams: parsed.data.teams.length,
    players: parsed.data.players.length,
    activePlayers: activePlayers.length,
    legacyPlayers: legacyPlayers.length,
    starterCards: starterCards.length,
    baseCards: baseCards.length,
    eventCards: eventCards.length,
    rewardCards: rewardCards.length,
    rivalryCards: rivalryCards.length,
    calendarEventCards: eventCards.length,
    calendarEventCounts,
    eventCoverageByTeam,
    baseOverallAverage,
    slotCounts,
    starterAverageRange: [Math.min(...starterAverages), Math.max(...starterAverages)],
  };
}
