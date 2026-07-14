import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import signatureAssetSources from '../data/content/signature-asset-sources.json';
import { parseCatalog } from '../src/data/catalogSchema';
import { STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET } from '../src/data/starterFloorExceptions';
import { createCardImageReference } from '../src/domain/cards/assets';
import type {
  CardTier,
  CardVersion,
  GoalieAttributes,
  HockeyPosition,
  League,
  PlayerIdentity,
  SkaterAttributes,
  SourceMetadata,
  StarterSquad,
  Team,
} from '../src/domain/cards/types';
import {
  buildAttributes,
  applyStarterAttributeProfile,
  applyEventAttributeProfile,
  calculateBaseOveralls,
  eventOverall,
  performanceScore,
  priceForCard,
  rewardOverall,
  stableHash,
  starterOverall,
  type PerformanceStat,
  type RatingCandidate,
  type RatingOverride,
} from './lib/ratingModel';
import { createStableIdResolver, type StableIdResolver } from './lib/stableIdRegistry';

const SNAPSHOT_PATH = resolve('data/content/official-content-snapshot.json');
const OVERRIDES_PATH = resolve('data/content/rating-overrides.json');
const POSITION_EVIDENCE_PATH = resolve('data/content/position-evidence.json');
const STABLE_ID_REGISTRY_PATH = resolve('data/content/stable-id-registry.json');
const OUTPUT_PATH = resolve('src/data/generated/gameCatalog.json');
const EVENT_FROM = '2026-01-01T00:00:00.000Z';
const EVENT_TO = '9999-12-31T23:59:59.999Z';
const LINEUP_SLOTS = ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const;

interface SnapshotTeam {
  league: League;
  sourceTeamId: string;
  name: string;
  abbreviation: string;
  rosterSeason: string;
  sourceUrl: string;
  stableId?: string;
}

interface SnapshotRosterPlayer {
  league: League;
  sourcePlayerId: string;
  sourceTeamId: string;
  teamName: string;
  teamAbbreviation: string;
  name: string;
  officialPosition: string;
  shootsCatches: string | null;
  birthDate: string | null;
  birthCountry: string | null;
  nationality: string | null;
  sourceRosterStatus: 'active-roster';
  sourceUrl: string;
}

interface SnapshotDraftRight {
  league: 'PWHL';
  draftYear: 2026;
  overallPick: number;
  sourceTeamName: string;
  name: string;
  officialName: string;
  officialPosition: 'F' | 'D' | 'G';
  previousTeam: string;
  nationality: string;
  sourceRosterStatus: 'rights';
  requiresManualReview: true;
  sourceUrl: string;
}

interface SnapshotRosterCandidate {
  league: 'NHL';
  sourcePlayerId: string;
  sourceTeamId: string;
  teamName: string;
  teamAbbreviation: string;
  name: string;
  officialPosition: 'G';
  shootsCatches: string | null;
  nationality: null;
  sourceRosterStatus: 'roster-candidate';
  requiresManualReview: true;
  sourceUrls: readonly string[];
}

interface SnapshotLegacyPlayer {
  league: 'PWHL';
  sourcePlayerId: string;
  sourceTeamId: string;
  teamName: string;
  name: string;
  officialPosition: 'F' | 'D';
  nationality: null;
  sourceRosterStatus: 'legacy-retained';
  requiresManualReview: true;
  sourceUrl: string;
}

interface OfficialSnapshot {
  metadata: {
    snapshotDate: string;
    nhlRosterSeason: string;
    nhlStatsSeason: string;
    pwhlRosterSeason: string;
    pwhlStatsSeason: string;
  };
  teams: SnapshotTeam[];
  rosterPlayers: SnapshotRosterPlayer[];
  rosterCandidates: SnapshotRosterCandidate[];
  stats: PerformanceStat[];
  draftRights: SnapshotDraftRight[];
  legacyPlayers: SnapshotLegacyPlayer[];
}

interface SourceCandidate {
  league: League;
  sourcePlayerId: string;
  team: SnapshotTeam;
  name: string;
  officialPosition: string;
  shootsCatches: string | null;
  nationality: string | null;
  sourceRosterStatus: 'active-roster' | 'roster-candidate' | 'rights';
  sourceUrl: string;
  stat?: PerformanceStat;
  draftPick?: number;
  primaryPosition?: HockeyPosition;
  positionSource?: SourceMetadata['positionSource'];
  positionEvidence?: PositionEvidence[];
  archetype?: string;
  id?: string;
}

interface PositionEvidence {
  league: League;
  sourcePlayerId: string;
  eligiblePosition: HockeyPosition;
  sourceUrl: string;
  reviewedAt: string;
  evidence: string;
}

interface EventSeed {
  eventId: string;
  playerId: string;
}

const LEGACY_PLAYER_NAMES = new Set([
  'Kirill Kaprizov', 'Artemi Panarin', 'Brady Tkachuk', 'Connor McDavid',
  'Nathan MacKinnon', 'Auston Matthews', 'Nikita Kucherov', 'David Pastrnak',
  'Mikko Rantanen', 'Quinn Hughes', 'Rasmus Dahlin', 'Josh Morrissey', 'Cale Makar',
  'Adam Fox', 'Evan Bouchard', 'Connor Hellebuyck', 'Igor Shesterkin',
  'Andrei Vasilevskiy', 'Sarah Nurse', 'Kendall Coyne Schofield', 'Emma Maltais',
  'Marie-Philip Poulin', 'Taylor Heise', 'Alex Carpenter', 'Hilary Knight',
  'Natalie Spooner', 'Daryl Watts', 'Megan Keller', 'Ella Shelton', 'Claire Thompson',
  'Erin Ambrose', 'Renata Fast', 'Sophie Jaques', 'Aerin Frankel',
  'Ann-Renée Desbiens', 'Kristen Campbell',
].map(normalizeName));

const LEGACY_EVENT_SEEDS: readonly EventSeed[] = [
  ...eventSeeds('frozen-frights', ['nhl-brady-tkachuk', 'nhl-rasmus-dahlin', 'nhl-igor-shesterkin', 'pwhl-emma-maltais', 'pwhl-renata-fast', 'pwhl-kristen-campbell']),
  ...eventSeeds('signature-series', ['nhl-connor-mcdavid', 'nhl-david-pastrnak', 'nhl-cale-makar', 'pwhl-marie-philip-poulin', 'pwhl-hilary-knight', 'pwhl-erin-ambrose']),
  ...eventSeeds('winter-holidays', ['nhl-artemi-panarin', 'nhl-josh-morrissey', 'nhl-andrei-vasilevskiy', 'pwhl-sarah-nurse', 'pwhl-ella-shelton', 'pwhl-aerin-frankel']),
  ...eventSeeds('winter-classic', ['nhl-nathan-mackinnon', 'nhl-mikko-rantanen', 'nhl-evan-bouchard', 'pwhl-taylor-heise', 'pwhl-natalie-spooner', 'pwhl-sophie-jaques']),
  ...eventSeeds('international-ice', ['nhl-kirill-kaprizov', 'nhl-nikita-kucherov', 'nhl-quinn-hughes', 'pwhl-kendall-coyne-schofield', 'pwhl-alex-carpenter', 'pwhl-claire-thompson']),
  ...eventSeeds('rising-stars', ['nhl-auston-matthews', 'nhl-josh-morrissey', 'nhl-evan-bouchard', 'pwhl-taylor-heise', 'pwhl-daryl-watts', 'pwhl-ella-shelton']),
  ...eventSeeds('playoff-heroes', ['nhl-connor-mcdavid', 'nhl-mikko-rantanen', 'nhl-connor-hellebuyck', 'pwhl-marie-philip-poulin', 'pwhl-hilary-knight', 'pwhl-ann-renee-desbiens']),
  ...eventSeeds('franchise-icons', ['nhl-artemi-panarin', 'nhl-auston-matthews', 'nhl-adam-fox', 'pwhl-sarah-nurse', 'pwhl-alex-carpenter', 'pwhl-megan-keller']),
  ...eventSeeds('record-breakers', ['nhl-nikita-kucherov', 'nhl-david-pastrnak', 'nhl-connor-hellebuyck', 'pwhl-natalie-spooner', 'pwhl-kendall-coyne-schofield', 'pwhl-aerin-frankel']),
  ...eventSeeds('clutch-performers', ['nhl-kirill-kaprizov', 'nhl-nathan-mackinnon', 'nhl-cale-makar', 'pwhl-marie-philip-poulin', 'pwhl-erin-ambrose', 'pwhl-ann-renee-desbiens']),
];

const EVENT_IDS = [
  'frozen-frights', 'signature-series', 'winter-holidays', 'winter-classic',
  'international-ice', 'rising-stars', 'playoff-heroes', 'franchise-icons',
  'record-breakers', 'clutch-performers',
] as const;

const LEGACY_REWARD_IDS = [
  'nhl-connor-mcdavid', 'nhl-quinn-hughes', 'nhl-david-pastrnak',
  'nhl-connor-hellebuyck', 'nhl-kirill-kaprizov', 'pwhl-marie-philip-poulin',
  'pwhl-hilary-knight', 'pwhl-megan-keller', 'pwhl-ann-renee-desbiens',
  'pwhl-kendall-coyne-schofield',
] as const;

const APPROVED_SIGNATURE_ASSET_PLAYER_IDS = new Set(signatureAssetSources.sources
  .filter(({ status }) => status === 'integrated')
  .map(({ playerId }) => playerId));

function eventSeeds(eventId: string, playerIds: readonly string[]): EventSeed[] {
  return playerIds.map((playerId) => ({ eventId, playerId }));
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slug(value: string): string {
  return normalizeName(value).replace(/\s+/g, '-');
}

function teamStableId(team: Pick<SnapshotTeam, 'name' | 'stableId'>): string {
  if (!team.stableId) throw new Error(`Team ${team.name} has no reviewed stable ID.`);
  return team.stableId;
}

const NATIONALITY_TO_ISO3: Readonly<Record<string, string>> = {
  American: 'USA', Austrian: 'AUT', CAN: 'CAN', Canadian: 'CAN', CZE: 'CZE',
  Czech: 'CZE', DEN: 'DNK', FIN: 'FIN', Finnish: 'FIN', German: 'DEU',
  Italian: 'ITA', RUS: 'RUS', Russian: 'RUS', SUI: 'CHE', SWE: 'SWE',
  Swedish: 'SWE', Swiss: 'CHE', USA: 'USA',
};

function normalizeNationality(value: string | null): string | null {
  if (!value) return null;
  if (/^[A-Z]{3}$/.test(value)) return value === 'DEN' ? 'DNK' : value === 'SUI' ? 'CHE' : value;
  return NATIONALITY_TO_ISO3[value] ?? null;
}

function roleBucket(position: string): 'F' | 'D' | 'G' {
  const normalized = position.toUpperCase();
  if (normalized === 'G') return 'G';
  if (['D', 'LD', 'RD'].includes(normalized)) return 'D';
  return 'F';
}

function initialPosition(candidate: SourceCandidate): HockeyPosition {
  const position = candidate.officialPosition.toUpperCase();
  if (position === 'G') return 'G';
  if (position === 'C') return 'C';
  if (position === 'L' || position === 'LW') return 'LW';
  if (position === 'R' || position === 'RW') return 'RW';
  if (position === 'RD') return 'RD';
  return 'LD';
}

function deriveArchetype(candidate: SourceCandidate, position: HockeyPosition): string {
  const stat = candidate.stat;
  if (position === 'G') {
    const choice = stableHash(candidate.name) % 3;
    return choice === 0 ? 'reflex-goalie' : choice === 1 ? 'positional-goalie' : 'hybrid-goalie';
  }
  if (position === 'LD' || position === 'RD') {
    const pointsPerGame = stat && stat.gamesPlayed > 0 ? stat.points / stat.gamesPlayed : 0;
    const defensiveVolume = stat && stat.gamesPlayed > 0 ? (stat.blocks + stat.hits) / stat.gamesPlayed : 0;
    if (pointsPerGame >= 0.55) return 'offensive-defense';
    if (defensiveVolume >= 1.5) return 'defensive-defense';
    return 'mobile-defense';
  }
  const goals = stat?.goals ?? 0;
  const assists = stat?.assists ?? 0;
  const hitsPerGame = stat && stat.gamesPlayed > 0 ? stat.hits / stat.gamesPlayed : 0;
  if (hitsPerGame >= 1.2) return 'power-forward';
  if (goals > assists * 0.72) return 'sniper';
  if (assists > goals * 1.6) return 'playmaker';
  return 'two-way-forward';
}

function ratingCandidate(candidate: SourceCandidate): RatingCandidate {
  return {
    id: candidate.id ?? `${candidate.league.toLowerCase()}-${slug(candidate.name)}`,
    league: candidate.league,
    role: roleBucket(candidate.officialPosition) === 'G' ? 'goalie' : 'skater',
    position: candidate.primaryPosition ?? initialPosition(candidate),
    archetype: candidate.archetype ?? deriveArchetype(candidate, candidate.primaryPosition ?? initialPosition(candidate)),
    sourceRosterStatus: candidate.sourceRosterStatus,
    stat: candidate.stat,
  };
}

function rankCandidates(left: SourceCandidate, right: SourceCandidate): number {
  const legacyDifference = Number(LEGACY_PLAYER_NAMES.has(normalizeName(right.name)))
    - Number(LEGACY_PLAYER_NAMES.has(normalizeName(left.name)));
  if (legacyDifference !== 0) return legacyDifference;
  const rosterDifference = Number(right.sourceRosterStatus === 'active-roster')
    - Number(left.sourceRosterStatus === 'active-roster');
  if (rosterDifference !== 0) return rosterDifference;
  const performanceDifference = performanceScore(ratingCandidate(right)) - performanceScore(ratingCandidate(left));
  return performanceDifference || left.name.localeCompare(right.name);
}

function selectTeamCandidates(all: readonly SourceCandidate[], team: SnapshotTeam): SourceCandidate[] {
  const teamCandidates = all.filter((candidate) =>
    candidate.league === team.league && candidate.team.sourceTeamId === team.sourceTeamId);
  const buckets = {
    F: teamCandidates.filter((candidate) => roleBucket(candidate.officialPosition) === 'F').sort(rankCandidates),
    D: teamCandidates.filter((candidate) => roleBucket(candidate.officialPosition) === 'D').sort(rankCandidates),
    G: teamCandidates.filter((candidate) => roleBucket(candidate.officialPosition) === 'G').sort(rankCandidates),
  };
  const selectedForwards: SourceCandidate[] = [];
  if (team.league === 'NHL') {
    for (const positions of [['L', 'LW'], ['C'], ['R', 'RW']] as const) {
      const required = buckets.F
        .filter((candidate) => positions.includes(candidate.officialPosition.toUpperCase() as never))
        .slice(0, 2);
      for (const candidate of required) if (!selectedForwards.includes(candidate)) selectedForwards.push(candidate);
    }
  }
  selectedForwards.push(...buckets.F.filter((candidate) => !selectedForwards.includes(candidate)).slice(0, 10 - selectedForwards.length));
  const selected = [
    ...selectedForwards,
    ...buckets.D.slice(0, 6),
    ...buckets.G.slice(0, 2),
  ];
  if (selected.length < 18) {
    const selectedKeys = new Set(selected.map((candidate) => `${candidate.sourceRosterStatus}:${candidate.sourcePlayerId}`));
    const remaining = teamCandidates
      .filter((candidate) => !selectedKeys.has(`${candidate.sourceRosterStatus}:${candidate.sourcePlayerId}`))
      .sort(rankCandidates);
    selected.push(...remaining.slice(0, 18 - selected.length));
  }
  if (selected.length !== 18) {
    throw new Error(`${team.name} has ${selected.length} selectable official candidates; 18 are required.`);
  }
  return selected;
}

function eligibleGameplayPositions(candidate: SourceCandidate): HockeyPosition[] {
  const official = candidate.officialPosition.toUpperCase();
  const officialPositions: HockeyPosition[] = official === 'G' ? ['G']
    : official === 'F' ? ['LW', 'C', 'RW']
      : official === 'D' ? ['LD', 'RD']
        : official === 'L' || official === 'LW' ? ['LW']
          : official === 'R' || official === 'RW' ? ['RW']
            : official === 'C' ? ['C']
              : official === 'LD' ? ['LD']
                : official === 'RD' ? ['RD']
                  : [];
  return [...new Set([
    ...officialPositions,
    ...(candidate.positionEvidence ?? []).map(({ eligiblePosition }) => eligiblePosition),
  ])];
}

function assignGameplayPositions(candidates: SourceCandidate[], team: SnapshotTeam): void {
  const counts: Record<HockeyPosition, number> = { LW: 0, C: 0, RW: 0, LD: 0, RD: 0, G: 0 };
  const generic: SourceCandidate[] = [];
  for (const candidate of candidates) {
    const official = candidate.officialPosition.toUpperCase();
    const exact = official === 'G' ? 'G'
      : official === 'C' ? 'C'
        : official === 'L' || official === 'LW' ? 'LW'
          : official === 'R' || official === 'RW' ? 'RW'
            : official === 'LD' ? 'LD'
              : official === 'RD' ? 'RD'
                : undefined;
    if (exact) {
      candidate.primaryPosition = exact;
      candidate.positionSource = 'official-exact';
      counts[exact] += 1;
    } else {
      generic.push(candidate);
    }
  }

  for (const candidate of generic.sort((left, right) => left.name.localeCompare(right.name))) {
    const bucket = roleBucket(candidate.officialPosition);
    if (bucket === 'F') {
      const choices: Array<'LW' | 'C' | 'RW'> = ['LW', 'C', 'RW'];
      choices
        .sort((left, right) => counts[left] - counts[right] || stableHash(`${team.name}:${candidate.name}:${left}`) - stableHash(`${team.name}:${candidate.name}:${right}`));
      candidate.primaryPosition = choices[0] as 'LW' | 'C' | 'RW';
      candidate.positionSource = 'derived-from-generic-official-position';
    } else if (bucket === 'D') {
      const handedPreference = candidate.shootsCatches?.toUpperCase() === 'R' ? 'RD' : 'LD';
      const other = handedPreference === 'RD' ? 'LD' : 'RD';
      candidate.primaryPosition = counts[handedPreference] <= counts[other] ? handedPreference : other;
      candidate.positionSource = candidate.shootsCatches
        ? 'derived-from-official-position-and-handedness'
        : 'derived-from-generic-official-position';
    } else {
      candidate.primaryPosition = 'G';
      candidate.positionSource = 'official-exact';
    }
    counts[candidate.primaryPosition as HockeyPosition] += 1;
  }

  for (const slot of LINEUP_SLOTS) {
    if (!candidates.some((candidate) => eligibleGameplayPositions(candidate).includes(slot))) {
      throw new Error(`${team.name} cannot supply the required ${slot} gameplay slot from reviewed position evidence.`);
    }
  }
  for (const candidate of candidates) {
    candidate.archetype = deriveArchetype(candidate, candidate.primaryPosition as HockeyPosition);
  }
}

function sourceMetadata(candidate: SourceCandidate, snapshot: OfficialSnapshot): SourceMetadata {
  const derived = candidate.positionSource !== 'official-exact';
  const rights = candidate.sourceRosterStatus === 'rights';
  const rosterCandidate = candidate.sourceRosterStatus === 'roster-candidate';
  const positionEvidence = candidate.positionEvidence ?? [];
  const reasons = [
    ...(rights ? ['Official 2026 draft right; this is not an active-roster claim.'] : []),
    ...(rosterCandidate ? ['Official NHL search and roster-planning sources identify this active team depth candidate; the preseason roster endpoint is incomplete and requires manual review.'] : []),
    ...(derived ? [`Gameplay slot ${candidate.primaryPosition} is a deterministic projection from official position ${candidate.officialPosition}.`] : []),
    ...positionEvidence.map(({ eligiblePosition, evidence }) =>
      `Reviewed secondary eligibility ${eligiblePosition}: ${evidence}`),
    ...(candidate.nationality && !normalizeNationality(candidate.nationality)
      ? [`Official nationality value "${candidate.nationality}" is not a single ISO-3 code and is left unset.`]
      : []),
  ];
  return {
    provider: candidate.league === 'NHL' ? rosterCandidate ? 'nhl-official' : 'nhl-api'
      : rights ? 'pwhl-draft' : 'pwhl-hockeytech',
    sourceIds: [candidate.sourcePlayerId],
    sourceUrls: [...new Set([
      ...candidate.sourceUrl.split(' | ').map((url) => url.trim()),
      ...positionEvidence.map(({ sourceUrl }) => sourceUrl),
    ])],
    snapshotDate: snapshot.metadata.snapshotDate,
    rosterSeason: candidate.league === 'NHL'
      ? snapshot.metadata.nhlRosterSeason : snapshot.metadata.pwhlRosterSeason,
    statsSeason: candidate.stat
      ? candidate.league === 'NHL' ? snapshot.metadata.nhlStatsSeason : snapshot.metadata.pwhlStatsSeason
      : null,
    sourceRosterStatus: candidate.sourceRosterStatus,
    positionSource: candidate.positionSource as SourceMetadata['positionSource'],
    requiresManualReview: rights || rosterCandidate || derived || positionEvidence.length > 0
      || Boolean(candidate.nationality && !normalizeNationality(candidate.nationality)),
    manualReviewReasons: reasons,
  };
}

function teamColor(team: SnapshotTeam, offset: number): string {
  const value = (stableHash(`${team.league}:${team.name}:${offset}`) & 0xffffff).toString(16).padStart(6, '0');
  return `#${value}`;
}

function createTeams(snapshot: OfficialSnapshot): Team[] {
  return snapshot.teams.map((source): Team => ({
    id: teamStableId(source),
    name: source.name,
    abbreviation: source.abbreviation,
    league: source.league,
    active: true,
    visualMetadata: {
      treatment: 'neutral-unlicensed',
      primaryColor: teamColor(source, 1),
      secondaryColor: teamColor(source, 2),
      abbreviation: source.abbreviation,
    },
    sourceMetadata: {
      provider: source.league === 'NHL' ? 'nhl-api' : 'pwhl-hockeytech',
      sourceId: source.sourceTeamId,
      sourceUrl: source.sourceUrl,
      snapshotDate: snapshot.metadata.snapshotDate,
      rosterSeason: source.rosterSeason,
    },
  }));
}

function createPlayers(candidates: readonly SourceCandidate[], snapshot: OfficialSnapshot): PlayerIdentity[] {
  return candidates.map((candidate): PlayerIdentity => {
    const common = {
      id: candidate.id as string,
      name: candidate.name,
      league: candidate.league,
      currentTeamId: teamStableId(candidate.team),
      team: candidate.team.name,
      nationality: normalizeNationality(candidate.nationality),
      archetype: candidate.archetype as string,
      handedness: candidate.shootsCatches?.toUpperCase() === 'L' ? 'left' as const
        : candidate.shootsCatches?.toUpperCase() === 'R' ? 'right' as const : 'unknown' as const,
      active: true as const,
      imageReference: `placeholder:player/${candidate.id}`,
      sourceMetadata: sourceMetadata(candidate, snapshot),
    };
    const position = candidate.primaryPosition as HockeyPosition;
    const officialPosition = candidate.officialPosition.toUpperCase();
    const eligiblePositions = eligibleGameplayPositions(candidate);
    return position === 'G'
      ? { ...common, role: 'goalie', primaryPosition: 'G', eligiblePositions: ['G'] }
      : { ...common, role: 'skater', primaryPosition: position, eligiblePositions } as PlayerIdentity;
  });
}

function baseCard(candidate: SourceCandidate, overall: number): CardVersion {
  const rating = ratingCandidate(candidate);
  const common = {
    id: `${candidate.id}-base`, playerId: candidate.id as string,
    teamId: teamStableId(candidate.team),
    setId: 'base-2026', cardType: 'base' as const, cardTier: 'standard' as const,
    overall, abilities: [candidate.archetype as string], price: priceForCard('base', overall),
    marketAvailability: 'base-market' as const, isPermanent: true,
    imageReference: createCardImageReference(candidate.id as string, 'base', `${candidate.id}-base`),
    visualMetadata: { treatment: 'neutral-placeholder' as const, accent: '#5e7180', frame: 'standard' as const },
  };
  return rating.role === 'goalie'
    ? { ...common, role: 'goalie', attributes: buildAttributes(rating, overall) as GoalieAttributes }
    : { ...common, role: 'skater', attributes: buildAttributes(rating, overall) as SkaterAttributes };
}

function chooseStarterExclusions(teamPlayers: readonly PlayerIdentity[], baseByPlayer: ReadonlyMap<string, CardVersion>): string[] {
  const sorted = [...teamPlayers].sort((left, right) =>
    (baseByPlayer.get(right.id)?.overall ?? 0) - (baseByPlayer.get(left.id)?.overall ?? 0)
      || left.id.localeCompare(right.id));
  const cutoff = baseByPlayer.get(sorted[2]?.id ?? '')?.overall;
  if (cutoff === undefined) throw new Error(`Could not identify Starter superstar cutoff for ${teamPlayers[0]?.team}.`);
  return sorted.filter((player) => (baseByPlayer.get(player.id)?.overall ?? 0) >= cutoff).map((player) => player.id);
}

interface StarterSelection {
  readonly slot: HockeyPosition;
  readonly player: PlayerIdentity;
  readonly base: CardVersion;
  readonly maximumOverall: number;
  overall: number;
}

const STARTER_TARGET_TOTAL = 72 * LINEUP_SLOTS.length;

/**
 * Finds the first deterministic, low-power lineup whose six Base versions have
 * enough headroom for an exact 72 Starter average while remaining stronger
 * than their Starter versions, except for the reviewed 68-OVR floor set whose
 * attribute profiles stay weaker. Base ratings are never changed.
 */
function selectStarterPlayers(
  team: Team,
  teamPlayers: readonly PlayerIdentity[],
  excluded: ReadonlySet<string>,
  baseByPlayer: ReadonlyMap<string, CardVersion>,
): StarterSelection[] {
  const candidatesBySlot = new Map(LINEUP_SLOTS.map((slot) => [slot, teamPlayers
    .filter((player) => {
      const base = baseByPlayer.get(player.id);
      return player.eligiblePositions.includes(slot as never)
        && !excluded.has(player.id)
        && base !== undefined
        && (base.overall > 68 || STARTER_OVR_FLOOR_EXCEPTION_PLAYER_ID_SET.has(player.id));
    })
    .sort((left, right) => Number((baseByPlayer.get(left.id)?.overall ?? 99) === 68)
      - Number((baseByPlayer.get(right.id)?.overall ?? 99) === 68)
      || (baseByPlayer.get(left.id)?.overall ?? 99) - (baseByPlayer.get(right.id)?.overall ?? 99)
      || left.id.localeCompare(right.id))]));

  const selected: StarterSelection[] = [];
  const usedPlayerIds = new Set<string>();
  const search = (slotIndex: number, maximumTotal: number): boolean => {
    if (slotIndex === LINEUP_SLOTS.length) return maximumTotal >= STARTER_TARGET_TOTAL;
    const slot = LINEUP_SLOTS[slotIndex];
    const candidates = candidatesBySlot.get(slot) ?? [];
    for (const player of candidates) {
      if (usedPlayerIds.has(player.id)) continue;
      const base = baseByPlayer.get(player.id) as CardVersion;
      const maximumOverall = base.overall === 68 ? 68 : Math.min(76, base.overall - 1);
      usedPlayerIds.add(player.id);
      selected.push({
        slot,
        player,
        base,
        maximumOverall,
        overall: starterOverall(base.overall, `${team.id}:${slot}`),
      });
      if (search(slotIndex + 1, maximumTotal + maximumOverall)) return true;
      selected.pop();
      usedPlayerIds.delete(player.id);
    }
    return false;
  };

  if (!search(0, 0)) {
    throw new Error(
      `${team.name} cannot supply a six-slot Starter lineup averaging exactly 72 within the reviewed Base-strength contract.`,
    );
  }
  return selected;
}

function normalizeStarterRatings(team: Team, selections: StarterSelection[]): void {
  let total = selections.reduce((sum, selection) => sum + selection.overall, 0);
  let cursor = 0;
  while (total !== STARTER_TARGET_TOTAL) {
    const selection = selections[cursor % selections.length];
    if (total < STARTER_TARGET_TOTAL && selection.overall < selection.maximumOverall) {
      selection.overall += 1;
      total += 1;
    } else if (total > STARTER_TARGET_TOTAL && selection.overall > 68) {
      selection.overall -= 1;
      total -= 1;
    }
    cursor += 1;
    if (cursor > 1_000) {
      throw new Error(`Could not normalize ${team.name} Starter average without reaching its Base ratings.`);
    }
  }
}

function createStarterContent(
  teams: readonly Team[],
  players: readonly PlayerIdentity[],
  candidatesById: ReadonlyMap<string, SourceCandidate>,
  baseCards: readonly CardVersion[],
): { cards: CardVersion[]; squads: StarterSquad[] } {
  const baseByPlayer = new Map(baseCards.map((card) => [card.playerId, card]));
  const cards: CardVersion[] = [];
  const squads: StarterSquad[] = [];
  for (const team of teams) {
    const teamPlayers = players.filter((player) => player.currentTeamId === team.id);
    const exclusions = chooseStarterExclusions(teamPlayers, baseByPlayer);
    const excluded = new Set([...exclusions, 'nhl-connor-mcdavid']);
    const selections = selectStarterPlayers(team, teamPlayers, excluded, baseByPlayer);
    normalizeStarterRatings(team, selections);
    const lineup = {} as Record<HockeyPosition, string>;
    for (const selection of selections) {
      const candidate = candidatesById.get(selection.player.id) as SourceCandidate;
      const rating = ratingCandidate(candidate);
      const common = {
        id: `${selection.player.id}-starter`, playerId: selection.player.id, teamId: team.id,
        setId: 'starter-2026', cardType: 'starter' as const, cardTier: 'starter' as const,
        overall: selection.overall, abilities: ['development path'], price: 0,
        marketAvailability: 'unavailable' as const, isPermanent: true,
        imageReference: createCardImageReference(
          selection.player.id,
          'starter',
          `${selection.player.id}-starter`,
        ),
        visualMetadata: { treatment: 'neutral-placeholder' as const, accent: '#7f8c8d', frame: 'starter' as const },
      };
      const card = rating.role === 'goalie'
        ? {
          ...common,
          role: 'goalie' as const,
          attributes: applyStarterAttributeProfile(
            selection.base.attributes,
            buildAttributes(rating, selection.overall, 'starter'),
          ) as GoalieAttributes,
        }
        : {
          ...common,
          role: 'skater' as const,
          attributes: applyStarterAttributeProfile(
            selection.base.attributes,
            buildAttributes(rating, selection.overall, 'starter'),
          ) as SkaterAttributes,
        };
      cards.push(card);
      lineup[selection.slot] = card.id;
    }
    const selectedPlayers = selections.map(({ player }) => player);
    const floorReasons = selections
      .filter((selection) => selection.overall === selection.base.overall)
      .map((selection) =>
        `${selection.player.name} is a reviewed 68-OVR floor exception: valid-position team depth and protected-star exclusions leave no lower-OVR identity; every Starter attribute remains at or below Base and at least one is lower.`);
    const reasons = [
      ...selectedPlayers.flatMap((player) => player.sourceMetadata.manualReviewReasons),
      ...floorReasons,
    ];
    squads.push({
      teamId: team.id,
      cards: LINEUP_SLOTS.map((slot) => lineup[slot]),
      lineup,
      averageOverall: 72,
      validationMetadata: {
        excludedTopBasePlayerIds: exclusions,
        sourceRosterStatuses: [...new Set(selectedPlayers.map((player) => player.sourceMetadata.sourceRosterStatus))],
        requiresManualReview: reasons.length > 0,
        manualReviewReasons: [...new Set(reasons)],
      },
    });
  }
  return { cards, squads };
}

function eventTier(eventId: string): CardTier {
  if (eventId === 'signature-series') return 'signature';
  if (['playoff-heroes', 'franchise-icons', 'record-breakers'].includes(eventId)) return 'elite';
  return 'featured';
}

function createEventCard(
  eventId: string,
  player: PlayerIdentity,
  base: CardVersion,
  candidate: SourceCandidate,
): CardVersion {
  const tier = eventTier(eventId);
  const overall = eventOverall(base.overall, `${eventId}:${player.id}`);
  const approvedAsset = eventId === 'signature-series'
    && APPROVED_SIGNATURE_ASSET_PLAYER_IDS.has(player.id);
  const common = {
    id: `${player.id}-${eventId}`, playerId: player.id, teamId: base.teamId, setId: eventId,
    cardType: 'event' as const, cardTier: tier, overall,
    abilities: [`${eventId.replace(/-/g, ' ')} specialist`], price: priceForCard('event', overall),
    marketAvailability: 'event-shop' as const, availableFrom: EVENT_FROM, availableTo: EVENT_TO,
    isPermanent: false,
    imageReference: createCardImageReference(player.id, 'event', `${player.id}-${eventId}`),
    visualMetadata: {
      treatment: approvedAsset ? 'approved-local-asset' as const : 'neutral-placeholder' as const,
      accent: tier === 'signature' ? '#d4af37' : tier === 'elite' ? '#7d5fff' : '#3ba3ec',
      frame: tier,
    },
  };
  const rating = ratingCandidate(candidate);
  const attributes = applyEventAttributeProfile(
    base.attributes,
    buildAttributes(rating, overall, eventId),
    eventId,
    rating.role,
  );
  return rating.role === 'goalie'
    ? { ...common, role: 'goalie', attributes: attributes as GoalieAttributes }
    : { ...common, role: 'skater', attributes: attributes as SkaterAttributes };
}

function createEventCards(
  teams: readonly Team[],
  players: readonly PlayerIdentity[],
  candidatesById: ReadonlyMap<string, SourceCandidate>,
  baseCards: readonly CardVersion[],
): CardVersion[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const baseByPlayer = new Map(baseCards.map((card) => [card.playerId, card]));
  const seeds = LEGACY_EVENT_SEEDS.filter((seed) => playerById.has(seed.playerId));
  const existing = new Set(seeds.map((seed) => `${seed.eventId}:${seed.playerId}`));
  const coverage = new Map(teams.map((team) => [team.id, 0]));
  for (const seed of seeds) {
    const base = baseByPlayer.get(seed.playerId);
    if (base) coverage.set(base.teamId, (coverage.get(base.teamId) ?? 0) + 1);
  }
  for (const [teamIndex, team] of teams.entries()) {
    const ranked = baseCards.filter((card) => card.teamId === team.id)
      .sort((left, right) => right.overall - left.overall || left.id.localeCompare(right.id));
    let attempt = 0;
    while ((coverage.get(team.id) ?? 0) < 2) {
      const eventId = EVENT_IDS[(teamIndex + (coverage.get(team.id) ?? 0) + attempt) % EVENT_IDS.length];
      const base = ranked[attempt % ranked.length];
      const key = `${eventId}:${base.playerId}`;
      attempt += 1;
      if (existing.has(key)) continue;
      seeds.push({ eventId, playerId: base.playerId });
      existing.add(key);
      coverage.set(team.id, (coverage.get(team.id) ?? 0) + 1);
      if (attempt > ranked.length * EVENT_IDS.length) throw new Error(`Could not create Event coverage for ${team.name}.`);
    }
  }
  return seeds.map((seed) => {
    const player = playerById.get(seed.playerId) as PlayerIdentity;
    return createEventCard(
      seed.eventId,
      player,
      baseByPlayer.get(seed.playerId) as CardVersion,
      candidatesById.get(seed.playerId) as SourceCandidate,
    );
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function createLegacyRetainedContent(
  snapshot: OfficialSnapshot,
  stableIds: StableIdResolver,
): { players: PlayerIdentity[]; cards: CardVersion[] } {
  const specs = new Map<string, Readonly<{
    position: 'LW' | 'LD'; archetype: string;
    cards: readonly { idSuffix: string; setId: string; overall: number; tier: 'featured' | 'elite' }[];
  }>>([
    ['Kendall Coyne Schofield', {
      position: 'LW', archetype: 'two-way-forward',
      cards: [
        { idSuffix: 'base', setId: 'legacy-retained', overall: 86, tier: 'featured' },
        { idSuffix: 'international-ice', setId: 'legacy-retained', overall: 88, tier: 'featured' },
        { idSuffix: 'record-breakers', setId: 'legacy-retained', overall: 89, tier: 'elite' },
        { idSuffix: 'rivalry-2026', setId: 'rivalry-series-2026', overall: 90, tier: 'elite' },
      ],
    }],
    ['Claire Thompson', {
      position: 'LD', archetype: 'mobile-defense',
      cards: [
        { idSuffix: 'base', setId: 'legacy-retained', overall: 84, tier: 'featured' },
        { idSuffix: 'international-ice', setId: 'legacy-retained', overall: 87, tier: 'featured' },
      ],
    }],
  ]);
  const players: PlayerIdentity[] = [];
  const cards: CardVersion[] = [];
  for (const source of snapshot.legacyPlayers) {
    const spec = specs.get(source.name);
    const team = snapshot.teams.find((candidate) =>
      candidate.league === 'PWHL' && candidate.sourceTeamId === source.sourceTeamId);
    if (!spec || !team) throw new Error(`Unknown legacy-retained identity ${source.name}.`);
    const playerId = stableIds.resolvePlayer(source.league, source.sourcePlayerId, source.name);
    const player: PlayerIdentity = {
      id: playerId, name: source.name, league: 'PWHL', currentTeamId: teamStableId(team),
      team: source.teamName, nationality: null, archetype: spec.archetype,
      handedness: 'unknown', active: false, imageReference: `placeholder:player/${playerId}`,
      role: 'skater', primaryPosition: spec.position, eligiblePositions: [spec.position],
      sourceMetadata: {
        provider: 'legacy-catalog', sourceIds: [source.sourcePlayerId], sourceUrls: [source.sourceUrl],
        snapshotDate: snapshot.metadata.snapshotDate, rosterSeason: 'not-on-2026-27-roster',
        statsSeason: snapshot.metadata.pwhlStatsSeason, sourceRosterStatus: 'legacy-retained',
        positionSource: 'derived-from-generic-official-position', requiresManualReview: true,
        manualReviewReasons: [
          'Retained only to preserve existing collection, reward, and lineup references.',
          `Not present in the official ${snapshot.metadata.pwhlRosterSeason} roster snapshot.`,
          `Gameplay slot ${spec.position} is projected from official historical position ${source.officialPosition}.`,
        ],
      },
    };
    players.push(player);
    const candidate: RatingCandidate = {
      id: playerId, league: 'PWHL', role: 'skater', position: spec.position,
      archetype: spec.archetype, sourceRosterStatus: 'active-roster',
      stat: snapshot.stats.find((stat) => stat.league === 'PWHL' && stat.sourcePlayerId === source.sourcePlayerId),
    };
    for (const cardSpec of spec.cards) {
      cards.push({
        id: `${playerId}-${cardSpec.idSuffix}`, playerId, teamId: teamStableId(team),
        setId: cardSpec.setId, cardType: 'reward', cardTier: cardSpec.tier,
        role: 'skater', overall: cardSpec.overall,
        attributes: buildAttributes(candidate, cardSpec.overall, `legacy:${cardSpec.idSuffix}`) as SkaterAttributes,
        abilities: ['legacy retained'], price: 0, marketAvailability: 'reward-only',
        isPermanent: true,
        imageReference: createCardImageReference(
          playerId,
          'reward',
          `${playerId}-${cardSpec.idSuffix}`,
        ),
        visualMetadata: { treatment: 'neutral-placeholder', accent: '#777777', frame: cardSpec.tier },
      });
    }
  }
  if (players.length !== 2 || cards.length !== 6) {
    throw new Error(`Expected 2 legacy identities and 6 retained cards, received ${players.length}/${cards.length}.`);
  }
  return { players, cards };
}

function createRewardCards(
  players: readonly PlayerIdentity[],
  candidatesById: ReadonlyMap<string, SourceCandidate>,
  baseCards: readonly CardVersion[],
): CardVersion[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const baseByPlayer = new Map(baseCards.map((card) => [card.playerId, card]));
  const selectedIds = LEGACY_REWARD_IDS.filter((id) => playerById.has(id));
  for (const league of ['NHL', 'PWHL'] as const) {
    const target = league === 'NHL' ? 5 : 4;
    const current = () => selectedIds.filter((id) => playerById.get(id)?.league === league).length;
    const replacements = baseCards
      .filter((card) => playerById.get(card.playerId)?.league === league && !selectedIds.includes(card.playerId as never))
      .sort((left, right) => right.overall - left.overall || left.id.localeCompare(right.id));
    for (const replacement of replacements) {
      if (current() >= target) break;
      selectedIds.push(replacement.playerId as typeof selectedIds[number]);
    }
  }
  if (selectedIds.length !== 9) throw new Error(`Expected nine active launch reward identities plus one retained legacy reward, received ${selectedIds.length}.`);
  return selectedIds.map((playerId): CardVersion => {
    const player = playerById.get(playerId) as PlayerIdentity;
    const base = baseByPlayer.get(playerId) as CardVersion;
    const candidate = candidatesById.get(playerId) as SourceCandidate;
    const overall = rewardOverall(base.overall, playerId);
    const tier: CardTier = overall >= 89 ? 'elite' : 'featured';
    const common = {
      id: `${playerId}-rivalry-2026`, playerId, teamId: base.teamId,
      setId: 'rivalry-series-2026', cardType: 'reward' as const, cardTier: tier,
      overall, abilities: ['rivalry reward'], price: 0,
      marketAvailability: 'reward-only' as const, isPermanent: true,
      imageReference: createCardImageReference(playerId, 'reward', `${playerId}-rivalry-2026`),
      visualMetadata: { treatment: 'neutral-placeholder' as const, accent: '#d14747', frame: tier },
    };
    const rating = ratingCandidate(candidate);
    return rating.role === 'goalie'
      ? { ...common, role: 'goalie', attributes: buildAttributes(rating, overall, 'reward') as GoalieAttributes }
      : { ...common, role: 'skater', attributes: buildAttributes(rating, overall, 'reward') as SkaterAttributes };
  });
}

function parseOverrides(input: unknown): RatingOverride[] {
  if (!Array.isArray(input)) throw new TypeError('rating-overrides.json must contain an array.');
  return input.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Invalid rating override at index ${index}.`);
    const override = value as Record<string, unknown>;
    if (typeof override.playerId !== 'string'
      || !Number.isInteger(override.sourceGeneratedOverall)
      || Number(override.sourceGeneratedOverall) < 68 || Number(override.sourceGeneratedOverall) > 86
      || (override.baseOverall !== undefined && (!Number.isInteger(override.baseOverall)
        || Number(override.baseOverall) < 68 || Number(override.baseOverall) > 86))
      || typeof override.reason !== 'string' || override.reason.trim().length < 12) {
      throw new TypeError(`Invalid rating override contract at index ${index}.`);
    }
    return override as unknown as RatingOverride;
  });
}

function parsePositionEvidence(input: unknown, snapshotDate: string): PositionEvidence[] {
  if (!Array.isArray(input)) throw new TypeError('position-evidence.json must contain an array.');
  const seen = new Set<string>();
  return input.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`Invalid position evidence at index ${index}.`);
    }
    const row = value as Record<string, unknown>;
    const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl : '';
    let host = '';
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== 'https:') throw new Error('not HTTPS');
      host = url.hostname;
    } catch {
      throw new TypeError(`Position evidence ${index} must use an official HTTPS source URL.`);
    }
    const officialHost = host === 'nhl.com' || host.endsWith('.nhl.com')
      || host === 'thepwhl.com' || host.endsWith('.thepwhl.com');
    if ((row.league !== 'NHL' && row.league !== 'PWHL')
      || typeof row.sourcePlayerId !== 'string' || row.sourcePlayerId.trim().length === 0
      || !['LW', 'C', 'RW', 'LD', 'RD'].includes(String(row.eligiblePosition))
      || typeof row.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.reviewedAt)
      || row.reviewedAt < snapshotDate
      || typeof row.evidence !== 'string' || row.evidence.trim().length < 24
      || !officialHost) {
      throw new TypeError(`Invalid or stale position evidence at index ${index}.`);
    }
    const parsed = row as unknown as PositionEvidence;
    const key = `${parsed.league}:${parsed.sourcePlayerId}:${parsed.eligiblePosition}`;
    if (seen.has(key)) throw new Error(`Duplicate position evidence: ${key}`);
    seen.add(key);
    return parsed;
  });
}

async function buildCatalog(): Promise<ReturnType<typeof parseCatalog>> {
  const [snapshotSource, overridesSource, positionEvidenceSource, stableIdRegistrySource] = await Promise.all([
    readFile(SNAPSHOT_PATH, 'utf8'),
    readFile(OVERRIDES_PATH, 'utf8'),
    readFile(POSITION_EVIDENCE_PATH, 'utf8'),
    readFile(STABLE_ID_REGISTRY_PATH, 'utf8'),
  ]);
  const snapshot = JSON.parse(snapshotSource) as OfficialSnapshot;
  const overrides = parseOverrides(JSON.parse(overridesSource) as unknown);
  const stableIds = createStableIdResolver(JSON.parse(stableIdRegistrySource) as unknown);
  const generatedAt = `${snapshot.metadata.snapshotDate}T00:00:00.000Z`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.metadata.snapshotDate)
    || Number.isNaN(Date.parse(generatedAt))
    || new Date(generatedAt).toISOString() !== generatedAt) {
    throw new Error('The official content snapshot must declare a valid ISO calendar date.');
  }
  if (stableIds.registry.metadata.reviewedAt < snapshot.metadata.snapshotDate) {
    throw new Error('The stable ID registry must be reviewed on or after the official content snapshot date.');
  }
  const positionEvidence = parsePositionEvidence(
    JSON.parse(positionEvidenceSource) as unknown,
    snapshot.metadata.snapshotDate,
  );
  for (const league of ['NHL', 'PWHL'] as const) {
    if (!snapshot.teams.some((team) => team.league === league)) {
      throw new Error(`The approved content snapshot contains no active ${league} teams.`);
    }
  }
  const sourceTeamKeys = snapshot.teams.map((team) => `${team.league}:${team.sourceTeamId}`);
  if (new Set(sourceTeamKeys).size !== sourceTeamKeys.length) {
    throw new Error('The approved content snapshot contains duplicate league/team source IDs.');
  }
  for (const team of snapshot.teams) {
    team.stableId = stableIds.resolveTeam(team.league, team.sourceTeamId, team.name);
  }
  const sourceTeamByKey = new Map(snapshot.teams.map((team) => [`${team.league}:${team.sourceTeamId}`, team]));
  const statsByKey = new Map(snapshot.stats.map((stat) => [`${stat.league}:${stat.sourcePlayerId}`, stat]));
  const allCandidates: SourceCandidate[] = snapshot.rosterPlayers.map((player) => ({
    ...player,
    team: sourceTeamByKey.get(`${player.league}:${player.sourceTeamId}`) as SnapshotTeam,
    stat: statsByKey.get(`${player.league}:${player.sourcePlayerId}`),
  }));
  for (const candidate of snapshot.rosterCandidates) {
    const team = sourceTeamByKey.get(`${candidate.league}:${candidate.sourceTeamId}`);
    if (!team) throw new Error(`Unknown official roster-candidate team ${candidate.sourceTeamId}.`);
    allCandidates.push({
      league: 'NHL', sourcePlayerId: candidate.sourcePlayerId, team,
      name: candidate.name, officialPosition: candidate.officialPosition,
      shootsCatches: candidate.shootsCatches, nationality: candidate.nationality,
      sourceRosterStatus: candidate.sourceRosterStatus,
      sourceUrl: candidate.sourceUrls.join(' | '),
      stat: statsByKey.get(`NHL:${candidate.sourcePlayerId}`),
    });
  }
  for (const right of snapshot.draftRights) {
    const team = snapshot.teams.find((candidate) => candidate.league === 'PWHL' && candidate.name === right.sourceTeamName);
    if (!team) throw new Error(`Unknown official PWHL draft team ${right.sourceTeamName}.`);
    allCandidates.push({
      league: 'PWHL', sourcePlayerId: `draft-2026-${right.overallPick}`, team,
      name: right.name, officialPosition: right.officialPosition, shootsCatches: null,
      nationality: right.nationality, sourceRosterStatus: 'rights', sourceUrl: right.sourceUrl,
      draftPick: right.overallPick,
    });
  }
  for (const evidence of positionEvidence) {
    const matches = allCandidates.filter((candidate) =>
      candidate.league === evidence.league && candidate.sourcePlayerId === evidence.sourcePlayerId);
    if (matches.length !== 1 || roleBucket(matches[0].officialPosition) === 'G') {
      throw new Error(
        `Position evidence ${evidence.league}:${evidence.sourcePlayerId}:${evidence.eligiblePosition} must match exactly one skater candidate.`,
      );
    }
    matches[0].positionEvidence = [...(matches[0].positionEvidence ?? []), evidence];
  }
  const sourceKeys = allCandidates.map((candidate) => `${candidate.league}:${candidate.sourcePlayerId}`);
  const duplicateSourceKeys = sourceKeys.filter((key, index) => sourceKeys.indexOf(key) !== index);
  if (duplicateSourceKeys.length > 0) {
    throw new Error(`Duplicate official league/player sources: ${[...new Set(duplicateSourceKeys)].join(', ')}`);
  }

  const selected = snapshot.teams.flatMap((team) => {
    const teamCandidates = selectTeamCandidates(allCandidates, team);
    assignGameplayPositions(teamCandidates, team);
    return teamCandidates;
  });
  const selectedSourceKeys = new Set(selected.map((candidate) => `${candidate.league}:${candidate.sourcePlayerId}`));
  for (const evidence of positionEvidence) {
    if (!selectedSourceKeys.has(`${evidence.league}:${evidence.sourcePlayerId}`)) {
      throw new Error(
        `Reviewed position evidence ${evidence.league}:${evidence.sourcePlayerId}:${evidence.eligiblePosition} is not used by the launch Base selection.`,
      );
    }
  }
  for (const candidate of selected) {
    candidate.id = stableIds.resolvePlayer(
      candidate.league,
      candidate.sourcePlayerId,
      candidate.name,
    );
  }
  const duplicateIds = selected.map((candidate) => candidate.id as string)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) throw new Error(`Player ID collision: ${[...new Set(duplicateIds)].join(', ')}`);

  const teams = createTeams(snapshot);
  const players = createPlayers(selected, snapshot);
  const candidatesById = new Map(selected.map((candidate) => [candidate.id as string, candidate]));
  const overallByPlayer = new Map(calculateBaseOveralls(selected.map(ratingCandidate), overrides));
  const baseCards = selected.map((candidate) => baseCard(candidate, overallByPlayer.get(candidate.id as string) as number));
  const starter = createStarterContent(teams, players, candidatesById, baseCards);
  const eventCards = createEventCards(teams, players, candidatesById, baseCards);
  const rewardCards = createRewardCards(players, candidatesById, baseCards);
  const legacy = createLegacyRetainedContent(snapshot, stableIds);

  return parseCatalog({
    metadata: {
      catalogId: 'rink-rivals-content-foundation-2026',
      generatedAt,
      snapshotDate: snapshot.metadata.snapshotDate,
      sourceWindow: [
        `NHL stats ${snapshot.metadata.nhlStatsSeason} / rosters ${snapshot.metadata.nhlRosterSeason}`,
        `PWHL stats ${snapshot.metadata.pwhlStatsSeason} / rosters ${snapshot.metadata.pwhlRosterSeason}`,
        ...[...new Set(snapshot.draftRights.map(({ draftYear }) => `PWHL draft rights ${draftYear}`))],
      ],
      disclaimer: 'Unofficial fan prototype generated from official-source snapshots. Ratings and derived positions require manual approval; no team logos or unapproved player imagery are included.',
      requiresManualApproval: true,
    },
    teams,
    players: [...players, ...legacy.players],
    cards: [...baseCards, ...starter.cards, ...eventCards, ...rewardCards, ...legacy.cards],
    starterSquads: starter.squads,
  });
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const catalog = await buildCatalog();
  const generated = `${JSON.stringify(catalog, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const current = await readFile(OUTPUT_PATH, 'utf8').catch(() => '');
    if (current !== generated) throw new Error('Generated catalog is stale. Run pnpm catalog:generate.');
    console.log(`Generated catalog is current: ${OUTPUT_PATH}`);
    return;
  }
  await atomicWrite(OUTPUT_PATH, generated);
  const byType = Object.fromEntries(['starter', 'base', 'event', 'reward'].map((type) => [
    type, catalog.cards.filter((card) => card.cardType === type).length,
  ]));
  console.log(`Generated ${catalog.teams.length} teams, ${catalog.players.length} players, and ${catalog.cards.length} cards at ${OUTPUT_PATH}.`);
  console.log(JSON.stringify(byType));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
