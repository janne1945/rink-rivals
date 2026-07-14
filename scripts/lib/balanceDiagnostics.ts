import type { CardCatalog, CardVersion, HockeyPosition, League } from '../../src/domain/cards/types';
import { MATCH_REWARDS } from '../../src/domain/battle/rewards';
import {
  AI_OPPONENTS,
  calculateAiOpponentOverall,
  selectAiOpponent,
  validateAiOpponentDefinitions,
  type AiOpponentDefinition,
} from '../../src/domain/battle/opponents';
import {
  AUTHORITATIVE_AI_SELECTION_POLICY,
  AUTHORITATIVE_MATCH_POLICY_VERSION,
  AUTHORITATIVE_MATCH_SITUATIONS,
  selectAuthoritativeOpponentCard,
} from '../../src/domain/battle/authoritativePolicy';
import { calculateCategoryValue } from '../../src/domain/battle/engine';
import type { AiDifficulty, RoundWinner } from '../../src/domain/battle/types';
import { randomIndex } from '../../src/domain/battle/rng';
import { resolveLineup } from '../../src/domain/lineups/validation';
import type { GameMode, Lineup, LineupSlot, ResolvedLineup, ResolvedLineupCard } from '../../src/domain/lineups/types';
import { calculateCollectionScore } from '../../src/domain/progression/collectionScore';
import { AI_TIER_THRESHOLDS } from '../../src/domain/progression/unlocks';
import { analyzeRewardLoops, type RewardLoopAnalysis } from './rewardLoopDiagnostics';

const DIFFICULTIES = ['rookie', 'pro', 'elite'] as const;
const MODES = ['nhl-circuit', 'pwhl-circuit', 'open-ice'] as const;
export const AI_LINEUP_PROFILES = ['average-starter', 'weak-base', 'good-base', 'strong-base-event'] as const;
export type AiLineupProfile = (typeof AI_LINEUP_PROFILES)[number];
const STARTER_CREDITS = 1_000;
const MATCHES_PER_DAY = 5;
const MATCHES_PER_WEEK = MATCHES_PER_DAY * 7;
const DAILY_OBJECTIVE_CREDITS = 75 + 100 + 100;
const WEEKLY_OBJECTIVE_CREDITS = 350;
const RIVALRY_ROAD_CREDITS = 150 + 150;

export interface LeagueBalanceReport {
  readonly seedPrefix: string;
  readonly pairedSeeds: number;
  readonly matches: number;
  readonly wins: Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>;
  readonly winRates: Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>;
  readonly roundWins: Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>;
  readonly situationResults: Readonly<Record<string, Readonly<Record<'NHL' | 'PWHL' | 'tie', number>>>>;
  readonly averageBaseOverall: Readonly<Record<'NHL' | 'PWHL', number>>;
  readonly baseOverallRange: Readonly<Record<'NHL' | 'PWHL', readonly [number, number]>>;
  readonly leagueWinRateGap: number;
}

export interface AiTierBalanceResult {
  readonly mode: GameMode;
  readonly difficulty: AiDifficulty;
  readonly profile: AiLineupProfile;
  readonly opponentId: string;
  readonly opponentOverall: number;
  readonly averagePlayerOverall: number;
  readonly matches: number;
  readonly wins: Readonly<Record<RoundWinner, number>>;
  readonly winRates: Readonly<Record<RoundWinner, number>>;
}

export interface AiBalanceReport {
  readonly simulationPolicy: Readonly<{
    version: typeof AUTHORITATIVE_MATCH_POLICY_VERSION;
    fidelity: 'behavioral-mirror';
    situationIds: readonly string[];
    playerSelection: 'strongest-eligible';
    opponentSelection: typeof AUTHORITATIVE_AI_SELECTION_POLICY;
    comparisonRule: 'visible-category-then-overall-then-seed';
    note: string;
  }>;
  readonly matchesPerTier: number;
  readonly seedPrefix: string;
  /** Compatibility view used by economy projections: good Base versus every tier. */
  readonly tiers: Readonly<Record<GameMode, Readonly<Record<AiDifficulty, AiTierBalanceResult>>>>;
  readonly scenarios: Readonly<Record<GameMode, Readonly<Record<AiLineupProfile, Readonly<Record<AiDifficulty, AiTierBalanceResult>>>>>>;
  readonly monotonicByMode: Readonly<Record<GameMode, boolean>>;
  readonly progressionOrderedByMode: Readonly<Record<GameMode, boolean>>;
  readonly totalMatches: number;
}

export interface PriceStatistics {
  readonly minimum: number;
  readonly maximum: number;
  readonly average: number;
  readonly median: number;
  readonly lowerQuartile: number;
  readonly upperQuartile: number;
}

export interface PurchasePacingTarget {
  readonly targetCredits: number;
  readonly fromZeroMatchOnly: number;
  readonly afterStarterMatchOnly: number;
  readonly afterStarterWithObjectives: number;
}

export interface UnlockEstimate {
  readonly threshold: AiDifficulty;
  readonly targetScore: number;
  readonly additionalUniqueCards: number;
  readonly creditsRequired: number;
  readonly rookieMatchesWithObjectives: number;
}

export interface EconomyBalanceReport {
  readonly assumptions: Readonly<{
    starterCredits: number;
    matchesPerDay: number;
    matchesPerWeek: number;
    dailyObjectivesCompleted: true;
    weeklyObjectiveCompleted: true;
    rivalryRoadCreditsExcludedFromSustainableRate: true;
  }>;
  readonly prices: Readonly<{
    base: PriceStatistics;
    strongBase: PriceStatistics;
    event: PriceStatistics;
    typicalBase: number;
    typicalStrongBase: number;
    typicalEvent: number;
    typicalSpotlight: number;
  }>;
  readonly averageCreditsPerMatch: Readonly<Record<AiDifficulty, Readonly<{
    matchOnly: number;
    recurringObjectives: number;
    withRecurringObjectives: number;
  }>>>;
  readonly objectiveEffect: Readonly<{
    dailyCredits: number;
    weeklyCredits: number;
    rivalryRoadOneTimeCredits: number;
    dailyAmortizedPerMatch: number;
    weeklyAmortizedPerMatch: number;
  }>;
  readonly purchasePacing: Readonly<Record<AiDifficulty, Readonly<{
    typicalBase: PurchasePacingTarget;
    strongBase: PurchasePacingTarget;
    event: PurchasePacingTarget;
    spotlight: PurchasePacingTarget;
  }>>>;
  readonly progression: readonly Readonly<{
    mode: GameMode;
    starterCollectionScore: number;
    unlocks: readonly UnlockEstimate[];
  }>[];
  readonly outliers: readonly string[];
  readonly loopChecks: Readonly<{
    rewardOrderValid: boolean;
    pricesExceedSingleMatchRewards: boolean;
    eventPricesExceedComparableBase: boolean;
    priceCurveMonotonic: boolean;
  } & RewardLoopAnalysis>;
}

export interface ContentCoverageReport {
  readonly starterOverall: Readonly<{
    byTeam: Readonly<Record<string, number>>;
    average: number;
    minimum: number;
    maximum: number;
  }>;
  readonly overallDistribution: Readonly<{
    base: Readonly<Record<string, number>>;
    event: Readonly<Record<string, number>>;
  }>;
  readonly cardsByTeam: Readonly<Record<string, Readonly<Record<'starter' | 'base' | 'event' | 'reward' | 'total', number>>>>;
  readonly cardsByPrimaryPosition: Readonly<Record<HockeyPosition, number>>;
  readonly pricesByRatingBand: Readonly<Record<string, PriceStatistics>>;
  readonly coverage: Readonly<{
    teams: number;
    teamsWithStarter: number;
    teamsWithBase: number;
    teamsWithEvent: number;
    leagues: Readonly<Record<League, Readonly<{ players: number; baseCards: number; eventCards: number }>>>;
    events: Readonly<Record<string, Readonly<{ cards: number; teams: number }>>>;
  }>;
  readonly warnings: readonly string[];
}

export interface BalanceReport extends LeagueBalanceReport {
  readonly reportVersion: 'content-foundation-balance-v3';
  readonly ai: AiBalanceReport;
  readonly economy: EconomyBalanceReport;
  readonly content: ContentCoverageReport;
  readonly issues: readonly string[];
}

function rounded(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function openIce(lineup: Lineup, suffix: string): Lineup {
  return { ...lineup, id: `${lineup.id}-${suffix}`, mode: 'open-ice' };
}

function seededLeagueLineup(
  catalog: CardCatalog,
  league: League,
  template: Lineup,
  seed: string,
): Lineup {
  const players = new Map(catalog.players.map((player) => [player.id, player]));
  const usedCardIds = new Set<string>();
  const usedPlayerIds = new Set<string>();
  const slots = {} as Record<LineupSlot, string>;
  for (const slot of ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const) {
    const eligible = catalog.cards
      .filter((card) => {
        const player = players.get(card.playerId);
        return card.cardType === 'base'
          && player?.league === league
          && player.eligiblePositions.includes(slot as never)
          && !usedCardIds.has(card.id)
          && !usedPlayerIds.has(card.playerId);
      });
    // Compare like-for-like positional pools. Broad PWHL F/D eligibility and
    // reviewed NHL secondaries remain valid in gameplay, but must not make a
    // player count repeatedly in every parity-sampling pool.
    const primary = eligible.filter((card) => players.get(card.playerId)?.primaryPosition === slot);
    const candidates = (primary.length > 0 ? primary : eligible)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (candidates.length === 0) throw new Error(`No unused ${league} base card can fill ${slot}`);
    const selected = candidates[randomIndex(`${seed}:${league}:${slot}`, candidates.length)];
    slots[slot] = selected.id;
    usedCardIds.add(selected.id);
    usedPlayerIds.add(selected.playerId);
  }
  return openIce({ ...template, slots }, `${seed}-${league.toLowerCase()}`);
}

function playAuthoritativeLeagueMatch(
  seed: string,
  catalog: CardCatalog,
  playerLineup: Lineup,
  opponentLineup: Lineup,
): {
  winner: RoundWinner;
  rounds: readonly { winner: RoundWinner; situation: (typeof AUTHORITATIVE_MATCH_SITUATIONS)[number] }[];
} {
  const player = resolveLineup(playerLineup, catalog);
  const opponent = resolveLineup(opponentLineup, catalog);
  const usedPlayerCardIds = new Set<string>();
  const usedOpponentCardIds = new Set<string>();
  let playerRoundWins = 0;
  let opponentRoundWins = 0;
  const rounds = AUTHORITATIVE_MATCH_SITUATIONS.map((situation, roundIndex) => {
    const playerCard = strongestEligibleCard(
      eligibleResolvedCards(player, situation, usedPlayerCardIds),
      situation,
    );
    const opponentCard = strongestEligibleCard(
      eligibleResolvedCards(opponent, situation, usedOpponentCardIds),
      situation,
    );
    usedPlayerCardIds.add(playerCard.card.id);
    usedOpponentCardIds.add(opponentCard.card.id);
    const playerScore = calculateCategoryValue(playerCard.card, situation);
    const opponentScore = calculateCategoryValue(opponentCard.card, situation);
    const winner: RoundWinner = playerScore !== opponentScore
      ? playerScore > opponentScore ? 'player' : 'opponent'
      : playerCard.card.overall !== opponentCard.card.overall
        ? playerCard.card.overall > opponentCard.card.overall ? 'player' : 'opponent'
        : randomIndex(`${seed}:round:${roundIndex}:tie`, 2) === 0 ? 'player' : 'opponent';
    if (winner === 'player') playerRoundWins += 1;
    else if (winner === 'opponent') opponentRoundWins += 1;
    return { winner, situation };
  });
  const winner: RoundWinner = playerRoundWins === opponentRoundWins
    ? 'tie'
    : playerRoundWins > opponentRoundWins ? 'player' : 'opponent';
  return { winner, rounds };
}

function eligibleResolvedCards(
  lineup: ResolvedLineup,
  situation: (typeof AUTHORITATIVE_MATCH_SITUATIONS)[number],
  usedCardIds: ReadonlySet<string>,
): readonly ResolvedLineupCard[] {
  return lineup.cards.filter(({ slot, card }) =>
    situation.eligibleSlots.includes(slot) && card.role === situation.role && !usedCardIds.has(card.id));
}

function strongestEligibleCard(
  cards: readonly ResolvedLineupCard[],
  situation: (typeof AUTHORITATIVE_MATCH_SITUATIONS)[number],
): ResolvedLineupCard {
  const selected = [...cards].sort((left, right) =>
    calculateCategoryValue(right.card, situation) - calculateCategoryValue(left.card, situation)
      || left.card.id.localeCompare(right.card.id))[0];
  if (!selected) throw new Error(`No player card is eligible for ${situation.id}.`);
  return selected;
}

/**
 * Behavioral mirror of the SQL match policy: the same fixed situations,
 * eligibility, tier card choice, no card reuse, and transparent tie rules.
 */
function playAuthoritativeAiMatch(
  seed: string,
  difficulty: AiDifficulty,
  playerLineup: ResolvedLineup,
  opponentLineup: ResolvedLineup,
): RoundWinner {
  const usedPlayerCardIds = new Set<string>();
  const usedOpponentCardIds = new Set<string>();
  let playerRoundWins = 0;
  let opponentRoundWins = 0;

  AUTHORITATIVE_MATCH_SITUATIONS.forEach((situation, roundIndex) => {
    const playerCard = strongestEligibleCard(
      eligibleResolvedCards(playerLineup, situation, usedPlayerCardIds),
      situation,
    );
    const opponentCard = selectAuthoritativeOpponentCard(
      eligibleResolvedCards(opponentLineup, situation, usedOpponentCardIds),
      situation,
      difficulty,
      `${seed}:${roundIndex}`,
    );
    usedPlayerCardIds.add(playerCard.card.id);
    usedOpponentCardIds.add(opponentCard.card.id);

    const playerScore = calculateCategoryValue(playerCard.card, situation);
    const opponentScore = calculateCategoryValue(opponentCard.card, situation);
    const playerWins = playerScore !== opponentScore
      ? playerScore > opponentScore
      : playerCard.card.overall !== opponentCard.card.overall
        ? playerCard.card.overall > opponentCard.card.overall
        : randomIndex(`${seed}:round:${roundIndex}:tie`, 2) === 0;
    if (playerWins) playerRoundWins += 1;
    else opponentRoundWins += 1;
  });

  if (playerRoundWins === opponentRoundWins) return 'tie';
  return playerRoundWins > opponentRoundWins ? 'player' : 'opponent';
}

function leagueWinner(winner: RoundWinner, playerLeague: 'NHL' | 'PWHL'): 'NHL' | 'PWHL' | 'tie' {
  if (winner === 'tie') return 'tie';
  return winner === 'player' ? playerLeague : playerLeague === 'NHL' ? 'PWHL' : 'NHL';
}

export function runLeagueBalanceDiagnostics(
  catalog: CardCatalog,
  lineups: readonly Lineup[],
  pairedSeeds = 2_000,
  seedPrefix = 'rink-rivals-balance-v2',
): LeagueBalanceReport {
  if (!Number.isSafeInteger(pairedSeeds) || pairedSeeds <= 0) throw new Error('pairedSeeds must be a positive integer');
  const nhlLineup = lineups.find((lineup) => lineup.mode === 'nhl-circuit');
  const pwhlLineup = lineups.find((lineup) => lineup.mode === 'pwhl-circuit');
  if (!nhlLineup || !pwhlLineup) throw new Error('Balance diagnostics require NHL and PWHL starter lineups');

  const wins = { NHL: 0, PWHL: 0, tie: 0 };
  const roundWins = { NHL: 0, PWHL: 0, tie: 0 };
  const situationResults: Record<string, Record<'NHL' | 'PWHL' | 'tie', number>> = {};
  for (let index = 0; index < pairedSeeds; index += 1) {
    const pairSeed = `${seedPrefix}:league:${index}`;
    const openNhl = seededLeagueLineup(catalog, 'NHL', nhlLineup, pairSeed);
    const openPwhl = seededLeagueLineup(catalog, 'PWHL', pwhlLineup, pairSeed);
    const paired = [
      [playAuthoritativeLeagueMatch(`${pairSeed}:match:0`, catalog, openNhl, openPwhl), 'NHL'],
      [playAuthoritativeLeagueMatch(`${pairSeed}:match:1`, catalog, openPwhl, openNhl), 'PWHL'],
    ] as const;
    for (const [match, playerLeague] of paired) {
      wins[leagueWinner(match.winner, playerLeague)] += 1;
      for (const result of match.rounds) {
        const winningLeague = leagueWinner(result.winner, playerLeague);
        roundWins[winningLeague] += 1;
        const situation = (situationResults[result.situation.id] ??= { NHL: 0, PWHL: 0, tie: 0 });
        situation[winningLeague] += 1;
      }
    }
  }

  const baseCards = catalog.cards.filter((card) => card.cardType === 'base');
  const playerById = new Map(catalog.players.map((player) => [player.id, player]));
  const averageBaseOverall = {} as Record<'NHL' | 'PWHL', number>;
  const baseOverallRange = {} as Record<'NHL' | 'PWHL', readonly [number, number]>;
  for (const league of ['NHL', 'PWHL'] as const) {
    const values = baseCards.filter((card) => playerById.get(card.playerId)?.league === league).map((card) => card.overall);
    averageBaseOverall[league] = values.reduce((sum, value) => sum + value, 0) / values.length;
    baseOverallRange[league] = [Math.min(...values), Math.max(...values)];
  }
  const matches = pairedSeeds * 2;
  const winRates = { NHL: wins.NHL / matches, PWHL: wins.PWHL / matches, tie: wins.tie / matches };
  return {
    seedPrefix, pairedSeeds, matches, wins, winRates, roundWins, situationResults,
    averageBaseOverall, baseOverallRange,
    leagueWinRateGap: Math.abs(winRates.NHL - winRates.PWHL),
  };
}

const OPEN_ICE_LEAGUE_BY_SLOT: Readonly<Record<LineupSlot, League>> = {
  LW: 'PWHL', C: 'NHL', RW: 'PWHL', LD: 'NHL', RD: 'PWHL', G: 'NHL',
};

function requiredLeague(mode: GameMode, slot: LineupSlot): League | undefined {
  if (mode === 'nhl-circuit') return 'NHL';
  if (mode === 'pwhl-circuit') return 'PWHL';
  return OPEN_ICE_LEAGUE_BY_SLOT[slot];
}

function calculateLineupOverall(lineup: Lineup, catalog: CardCatalog): number {
  const cards = new Map(catalog.cards.map((card) => [card.id, card]));
  const values = Object.values(lineup.slots).map((cardId) => cards.get(cardId)?.overall);
  if (values.some((value) => value === undefined)) throw new Error(`Lineup ${lineup.id} references a missing card.`);
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length;
}

function starterScenarioLineup(
  mode: GameMode,
  seed: string,
  starterLineups: readonly Lineup[],
): Lineup | undefined {
  const nhl = starterLineups.filter((lineup) => lineup.mode === 'nhl-circuit');
  const pwhl = starterLineups.filter((lineup) => lineup.mode === 'pwhl-circuit');
  if (mode !== 'open-ice') {
    const pool = mode === 'nhl-circuit' ? nhl : pwhl;
    if (pool.length === 0) return undefined;
    return pool[randomIndex(`${seed}:${mode}:starter-team`, pool.length)];
  }
  if (nhl.length === 0 || pwhl.length === 0) return undefined;
  const selectedNhl = nhl[randomIndex(`${seed}:open-starter:nhl`, nhl.length)];
  const selectedPwhl = pwhl[randomIndex(`${seed}:open-starter:pwhl`, pwhl.length)];
  const slots = Object.fromEntries((['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const).map((slot) => [
    slot,
    OPEN_ICE_LEAGUE_BY_SLOT[slot] === 'NHL' ? selectedNhl.slots[slot] : selectedPwhl.slots[slot],
  ])) as Record<LineupSlot, string>;
  return { id: `balance:average-starter:open:${seed}`, name: 'Average mixed Starter', mode, slots };
}

const PROFILE_TARGET_OVR: Readonly<Record<AiLineupProfile, number>> = {
  'average-starter': 72,
  'weak-base': 74,
  'good-base': 79,
  'strong-base-event': 88,
};

function generatedScenarioLineup(
  catalog: CardCatalog,
  mode: GameMode,
  profile: AiLineupProfile,
  seed: string,
): Lineup {
  const players = new Map(catalog.players.map((player) => [player.id, player]));
  const usedCardIds = new Set<string>();
  const usedPlayerIds = new Set<string>();
  const target = PROFILE_TARGET_OVR[profile];
  const slots = {} as Record<LineupSlot, string>;
  for (const slot of ['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const) {
    const league = requiredLeague(mode, slot);
    const candidates = catalog.cards.filter((card) => {
      const player = players.get(card.playerId);
      const allowedType = profile === 'average-starter'
        ? card.cardType === 'starter'
        : profile === 'strong-base-event'
          ? card.cardType === 'base' || card.cardType === 'event'
          : card.cardType === 'base';
      return allowedType
        && player?.active === true
        && player.league === league
        && player.eligiblePositions.includes(slot as never)
        && !usedCardIds.has(card.id)
        && !usedPlayerIds.has(card.playerId);
    });
    if (candidates.length === 0) throw new Error(`No unused ${profile} card can fill ${mode} ${slot}.`);
    const preferredType = profile === 'strong-base-event' && candidates.some(({ cardType }) => cardType === 'event')
      ? 'event'
      : undefined;
    const ranked = candidates
      .filter((card) => preferredType === undefined || card.cardType === preferredType)
      .sort((left, right) =>
        Math.abs(left.overall - target) - Math.abs(right.overall - target)
          || left.id.localeCompare(right.id));
    const closestDistance = Math.abs(ranked[0].overall - target);
    const pool = ranked
      .filter((card) => Math.abs(card.overall - target) <= closestDistance + 1)
      .sort((left, right) => left.id.localeCompare(right.id));
    const selected = pool[randomIndex(`${seed}:${profile}:${mode}:${slot}`, pool.length)];
    slots[slot] = selected.id;
    usedCardIds.add(selected.id);
    usedPlayerIds.add(selected.playerId);
  }
  return { id: `balance:${profile}:${mode}:${seed}`, name: `${profile} ${mode}`, mode, slots };
}

function scenarioLineup(
  catalog: CardCatalog,
  mode: GameMode,
  profile: AiLineupProfile,
  seed: string,
  starterLineups: readonly Lineup[],
): Lineup {
  if (profile === 'average-starter') {
    const starter = starterScenarioLineup(mode, seed, starterLineups);
    if (starter) return starter;
  }
  return generatedScenarioLineup(catalog, mode, profile, seed);
}

export function runAiOpponentDiagnostics(
  catalog: CardCatalog,
  matchesPerTier = 2_000,
  seedPrefix = 'rink-rivals-balance-v2',
  opponents: readonly AiOpponentDefinition[] = AI_OPPONENTS,
  starterLineups: readonly Lineup[] = [],
): AiBalanceReport {
  if (!Number.isSafeInteger(matchesPerTier) || matchesPerTier <= 0) throw new Error('matchesPerTier must be a positive integer');
  validateAiOpponentDefinitions(catalog, opponents);
  const tiers = {} as Record<GameMode, Record<AiDifficulty, AiTierBalanceResult>>;
  const scenarios = {} as Record<GameMode, Record<AiLineupProfile, Record<AiDifficulty, AiTierBalanceResult>>>;
  const monotonicByMode = {} as Record<GameMode, boolean>;
  const progressionOrderedByMode = {} as Record<GameMode, boolean>;
  const playerLineupCache = new Map<string, Lineup>();
  const playerOverallCache = new Map<string, number>();
  const resolvedPlayerCache = new Map<string, ResolvedLineup>();
  const resolvedOpponentCache = new Map<string, ResolvedLineup>();
  const lineupVariantCount = Math.max(
    1,
    starterLineups.length,
    new Set(catalog.cards.map((card) => card.teamId)).size,
  );
  for (const mode of MODES) {
    scenarios[mode] = {} as Record<AiLineupProfile, Record<AiDifficulty, AiTierBalanceResult>>;
    for (const profile of AI_LINEUP_PROFILES) {
      scenarios[mode][profile] = {} as Record<AiDifficulty, AiTierBalanceResult>;
      for (const difficulty of DIFFICULTIES) {
        const wins = { player: 0, tie: 0, opponent: 0 };
        let selectedOpponent: AiOpponentDefinition | undefined;
        let playerOverallTotal = 0;
        for (let index = 0; index < matchesPerTier; index += 1) {
          const seed = `${seedPrefix}:ai:${mode}:${profile}:${difficulty}:${index}`;
          const variantSeed = `${seedPrefix}:variant:${mode}:${profile}:${index % lineupVariantCount}`;
          const playerLineupKey = `${mode}:${profile}:${variantSeed}`;
          let playerLineup = playerLineupCache.get(playerLineupKey);
          if (!playerLineup) {
            playerLineup = scenarioLineup(catalog, mode, profile, variantSeed, starterLineups);
            playerLineupCache.set(playerLineupKey, playerLineup);
          }
          let resolvedPlayerLineup = resolvedPlayerCache.get(playerLineup.id);
          if (!resolvedPlayerLineup) {
            resolvedPlayerLineup = resolveLineup(playerLineup, catalog);
            resolvedPlayerCache.set(playerLineup.id, resolvedPlayerLineup);
          }
          let playerOverall = playerOverallCache.get(playerLineup.id);
          if (playerOverall === undefined) {
            playerOverall = calculateLineupOverall(playerLineup, catalog);
            playerOverallCache.set(playerLineup.id, playerOverall);
          }
          playerOverallTotal += playerOverall;
          selectedOpponent = selectAiOpponent(mode, difficulty, seed, opponents);
          let resolvedOpponentLineup = resolvedOpponentCache.get(selectedOpponent.id);
          if (!resolvedOpponentLineup) {
            resolvedOpponentLineup = resolveLineup(selectedOpponent.lineup, catalog);
            resolvedOpponentCache.set(selectedOpponent.id, resolvedOpponentLineup);
          }
          wins[playAuthoritativeAiMatch(seed, difficulty, resolvedPlayerLineup, resolvedOpponentLineup)] += 1;
        }
        if (!selectedOpponent) throw new Error(`No simulation completed for ${mode} ${profile} ${difficulty}`);
        scenarios[mode][profile][difficulty] = {
          mode,
          difficulty,
          profile,
          opponentId: selectedOpponent.id,
          opponentOverall: rounded(calculateAiOpponentOverall(selectedOpponent, catalog), 2),
          averagePlayerOverall: rounded(playerOverallTotal / matchesPerTier, 2),
          matches: matchesPerTier,
          wins,
          winRates: {
            player: rounded(wins.player / matchesPerTier),
            tie: rounded(wins.tie / matchesPerTier),
            opponent: rounded(wins.opponent / matchesPerTier),
          },
        };
      }
    }
    tiers[mode] = scenarios[mode]['good-base'];
    monotonicByMode[mode] = AI_LINEUP_PROFILES.every((profile) => {
      const rates = DIFFICULTIES.map((difficulty) => scenarios[mode][profile][difficulty].winRates.player);
      return rates[0] >= rates[1] && rates[1] >= rates[2] && rates[0] > rates[2];
    });
    progressionOrderedByMode[mode] = DIFFICULTIES.every((difficulty) => {
      const rates = AI_LINEUP_PROFILES.map((profile) => scenarios[mode][profile][difficulty].winRates.player);
      return rates.every((rate, index) => index === 0 || rate >= rates[index - 1]);
    });
  }
  return {
    simulationPolicy: {
      version: AUTHORITATIVE_MATCH_POLICY_VERSION,
      fidelity: 'behavioral-mirror',
      situationIds: AUTHORITATIVE_MATCH_SITUATIONS.map(({ id }) => id),
      playerSelection: 'strongest-eligible',
      opponentSelection: AUTHORITATIVE_AI_SELECTION_POLICY,
      comparisonRule: 'visible-category-then-overall-then-seed',
      note: 'Mirrors the server visible-value comparison and deterministic tie-break policy.',
    },
    matchesPerTier,
    seedPrefix,
    tiers,
    scenarios,
    monotonicByMode,
    progressionOrderedByMode,
    totalMatches: matchesPerTier * MODES.length * DIFFICULTIES.length * AI_LINEUP_PROFILES.length,
  };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) throw new Error('Price statistics require at least one value');
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return rounded(value, 2);
}

function priceStatistics(cards: readonly CardVersion[]): PriceStatistics {
  const values = cards.map(({ price }) => price);
  if (values.length === 0) throw new Error('Price statistics require cards');
  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: rounded(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
    median: percentile(values, 0.5),
    lowerQuartile: percentile(values, 0.25),
    upperQuartile: percentile(values, 0.75),
  };
}

function matchesToAfford(target: number, startingCredits: number, creditsPerMatch: number): number {
  if (creditsPerMatch <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil((target - startingCredits) / creditsPerMatch));
}

function pacingTarget(targetCredits: number, matchOnly: number, withObjectives: number): PurchasePacingTarget {
  return {
    targetCredits,
    fromZeroMatchOnly: matchesToAfford(targetCredits, 0, matchOnly),
    afterStarterMatchOnly: matchesToAfford(targetCredits, STARTER_CREDITS, matchOnly),
    afterStarterWithObjectives: matchesToAfford(targetCredits, STARTER_CREDITS, withObjectives),
  };
}

function expectedMatchCredits(ai: AiBalanceReport, difficulty: AiDifficulty): number {
  const profile: AiLineupProfile = difficulty === 'rookie'
    ? 'average-starter'
    : difficulty === 'pro'
      ? 'good-base'
      : 'strong-base-event';
  const values = MODES.map((mode) => {
    const rates = ai.scenarios[mode][profile][difficulty].winRates;
    const rewards = MATCH_REWARDS[difficulty];
    return rates.player * rewards.player + rates.tie * rewards.tie + rates.opponent * rewards.opponent;
  });
  return rounded(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function collectionFor(ids: readonly string[]): Record<string, { cardId: string; quantity: number; acquiredAt: string }> {
  return Object.fromEntries(ids.map((cardId) => [cardId, { cardId, quantity: 1, acquiredAt: '2026-01-01T00:00:00.000Z' }]));
}

function progressionEstimate(
  catalog: CardCatalog,
  lineup: Lineup,
  rookieCreditsWithObjectives: number,
): { mode: GameMode; starterCollectionScore: number; unlocks: UnlockEstimate[] } {
  const starterIds = Object.values(lineup.slots);
  const acquired = [...starterIds];
  const playerById = new Map(catalog.players.map((player) => [player.id, player]));
  const circuitLeague = lineup.mode === 'nhl-circuit' ? 'NHL' : lineup.mode === 'pwhl-circuit' ? 'PWHL' : undefined;
  const missingBase = catalog.cards
    .filter((card) => card.cardType === 'base'
      && !acquired.includes(card.id)
      && (circuitLeague === undefined || playerById.get(card.playerId)?.league === circuitLeague))
    .sort((left, right) => left.price - right.price || left.id.localeCompare(right.id));
  const starterCollectionScore = calculateCollectionScore(collectionFor(acquired), catalog.cards).score;
  let creditsRequired = 0;
  const unlocks = AI_TIER_THRESHOLDS.map((threshold) => {
    while (calculateCollectionScore(collectionFor(acquired), catalog.cards).score < threshold.minimumCollectionScore) {
      const next = missingBase.shift();
      if (!next) break;
      acquired.push(next.id);
      creditsRequired += next.price;
    }
    return {
      threshold: threshold.id,
      targetScore: threshold.minimumCollectionScore,
      additionalUniqueCards: acquired.length - starterIds.length,
      creditsRequired,
      rookieMatchesWithObjectives: matchesToAfford(creditsRequired, STARTER_CREDITS, rookieCreditsWithObjectives),
    };
  });
  return { mode: lineup.mode, starterCollectionScore, unlocks };
}

function economyIssues(
  base: PriceStatistics,
  event: PriceStatistics,
  rewardOrderValid: boolean,
  eventPricesExceedComparableBase: boolean,
  priceCurveMonotonic: boolean,
): string[] {
  const issues: string[] = [];
  if (!rewardOrderValid) issues.push('Match reward ordering is invalid.');
  if (!priceCurveMonotonic) issues.push('Base/Event prices must rise monotonically with Overall.');
  if (!eventPricesExceedComparableBase) issues.push('Every Event card must cost more than a comparable Base card.');
  if (event.median <= base.median) issues.push('Typical Event card must cost more than a typical Base card.');
  return issues;
}

function priceCurveMonotonic(cards: readonly CardVersion[]): boolean {
  const byOverall = new Map<number, number[]>();
  for (const card of cards) {
    const prices = byOverall.get(card.overall) ?? [];
    prices.push(card.price);
    byOverall.set(card.overall, prices);
  }
  const medians = [...byOverall.entries()]
    .map(([overall, prices]) => ({ overall, median: percentile(prices, 0.5) }))
    .sort((left, right) => left.overall - right.overall);
  return medians.every((entry, index) => index === 0 || entry.median > medians[index - 1].median);
}

function eventsExceedComparableBase(
  baseCards: readonly CardVersion[],
  eventCards: readonly CardVersion[],
): boolean {
  const baseOveralls = [...new Set(baseCards.map(({ overall }) => overall))].sort((left, right) => left - right);
  return eventCards.every((eventCard) => {
    const comparisonOverall = [...baseOveralls].reverse().find((overall) => overall <= eventCard.overall);
    if (comparisonOverall === undefined) return false;
    const comparisonPrice = Math.max(...baseCards
      .filter(({ overall }) => overall === comparisonOverall)
      .map(({ price }) => price));
    return eventCard.price > comparisonPrice;
  });
}

export function runEconomyDiagnostics(
  catalog: CardCatalog,
  lineups: readonly Lineup[],
  ai: AiBalanceReport,
): EconomyBalanceReport {
  const baseCards = catalog.cards.filter((card) => card.cardType === 'base');
  const strongBaseCards = baseCards.filter((card) => card.overall >= 84);
  const eventCards = catalog.cards.filter((card) => card.cardType === 'event');
  const base = priceStatistics(baseCards);
  const strongBase = priceStatistics(strongBaseCards);
  const event = priceStatistics(eventCards);
  const recurringObjectives = DAILY_OBJECTIVE_CREDITS / MATCHES_PER_DAY + WEEKLY_OBJECTIVE_CREDITS / MATCHES_PER_WEEK;
  const averageCreditsPerMatch = {} as Record<AiDifficulty, { matchOnly: number; recurringObjectives: number; withRecurringObjectives: number }>;
  for (const difficulty of DIFFICULTIES) {
    const matchOnly = expectedMatchCredits(ai, difficulty);
    averageCreditsPerMatch[difficulty] = {
      matchOnly,
      recurringObjectives: rounded(recurringObjectives, 2),
      withRecurringObjectives: rounded(matchOnly + recurringObjectives, 2),
    };
  }
  const typicalBase = base.median;
  const typicalStrongBase = strongBase.median;
  const typicalEvent = event.median;
  const typicalSpotlight = Math.round(typicalEvent * 0.85);
  const purchasePacing = {} as EconomyBalanceReport['purchasePacing'] as Record<AiDifficulty, {
    typicalBase: PurchasePacingTarget; strongBase: PurchasePacingTarget; event: PurchasePacingTarget; spotlight: PurchasePacingTarget;
  }>;
  for (const difficulty of DIFFICULTIES) {
    const credits = averageCreditsPerMatch[difficulty];
    purchasePacing[difficulty] = {
      typicalBase: pacingTarget(typicalBase, credits.matchOnly, credits.withRecurringObjectives),
      strongBase: pacingTarget(typicalStrongBase, credits.matchOnly, credits.withRecurringObjectives),
      event: pacingTarget(typicalEvent, credits.matchOnly, credits.withRecurringObjectives),
      spotlight: pacingTarget(typicalSpotlight, credits.matchOnly, credits.withRecurringObjectives),
    };
  }
  const rewardOrderValid = DIFFICULTIES.every((difficulty) => {
    const rewards = MATCH_REWARDS[difficulty];
    return rewards.player > rewards.tie && rewards.tie > rewards.opponent && rewards.opponent >= 0;
  }) && MATCH_REWARDS.rookie.player < MATCH_REWARDS.pro.player && MATCH_REWARDS.pro.player < MATCH_REWARDS.elite.player;
  const maxSingleReward = Math.max(...DIFFICULTIES.flatMap((difficulty) => Object.values(MATCH_REWARDS[difficulty])));
  const eventPricesExceedComparableBase = eventsExceedComparableBase(baseCards, eventCards);
  const monotonicPriceCurve = priceCurveMonotonic(baseCards) && priceCurveMonotonic(eventCards);
  const rewardLoops = analyzeRewardLoops();
  return {
    assumptions: {
      starterCredits: STARTER_CREDITS,
      matchesPerDay: MATCHES_PER_DAY,
      matchesPerWeek: MATCHES_PER_WEEK,
      dailyObjectivesCompleted: true,
      weeklyObjectiveCompleted: true,
      rivalryRoadCreditsExcludedFromSustainableRate: true,
    },
    prices: { base, strongBase, event, typicalBase, typicalStrongBase, typicalEvent, typicalSpotlight },
    averageCreditsPerMatch,
    objectiveEffect: {
      dailyCredits: DAILY_OBJECTIVE_CREDITS,
      weeklyCredits: WEEKLY_OBJECTIVE_CREDITS,
      rivalryRoadOneTimeCredits: RIVALRY_ROAD_CREDITS,
      dailyAmortizedPerMatch: DAILY_OBJECTIVE_CREDITS / MATCHES_PER_DAY,
      weeklyAmortizedPerMatch: WEEKLY_OBJECTIVE_CREDITS / MATCHES_PER_WEEK,
    },
    purchasePacing,
    progression: lineups.map((lineup) => progressionEstimate(catalog, lineup, averageCreditsPerMatch.rookie.withRecurringObjectives)),
    outliers: economyIssues(base, event, rewardOrderValid, eventPricesExceedComparableBase, monotonicPriceCurve),
    loopChecks: {
      rewardOrderValid,
      pricesExceedSingleMatchRewards: base.minimum > maxSingleReward && event.minimum > maxSingleReward,
      eventPricesExceedComparableBase,
      priceCurveMonotonic: monotonicPriceCurve,
      ...rewardLoops,
    },
  };
}

function overallDistribution(cards: readonly CardVersion[]): Record<string, number> {
  return Object.fromEntries([...new Set(cards.map(({ overall }) => overall))]
    .sort((left, right) => left - right)
    .map((overall) => [String(overall), cards.filter((card) => card.overall === overall).length]));
}

export function runContentCoverageDiagnostics(catalog: CardCatalog): ContentCoverageReport {
  const playersById = new Map(catalog.players.map((player) => [player.id, player]));
  const teamIds = [...new Set([
    ...catalog.players.map(({ currentTeamId }) => currentTeamId),
    ...catalog.cards.map(({ teamId }) => teamId),
  ])].sort();
  const starterCards = catalog.cards.filter(({ cardType }) => cardType === 'starter');
  const baseCards = catalog.cards.filter(({ cardType }) => cardType === 'base');
  const eventCards = catalog.cards.filter(({ cardType }) => cardType === 'event');
  const byTeam = Object.fromEntries(teamIds.map((teamId) => {
    const cards = starterCards.filter((card) => card.teamId === teamId);
    return [teamId, rounded(cards.reduce((sum, card) => sum + card.overall, 0) / cards.length, 2)];
  }));
  const cardsByTeam = Object.fromEntries(teamIds.map((teamId) => {
    const cards = catalog.cards.filter((card) => card.teamId === teamId);
    return [teamId, {
      starter: cards.filter(({ cardType }) => cardType === 'starter').length,
      base: cards.filter(({ cardType }) => cardType === 'base').length,
      event: cards.filter(({ cardType }) => cardType === 'event').length,
      reward: cards.filter(({ cardType }) => cardType === 'reward').length,
      total: cards.length,
    }];
  })) as Record<string, Record<'starter' | 'base' | 'event' | 'reward' | 'total', number>>;
  const cardsByPrimaryPosition = Object.fromEntries((['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const).map((position) => [
    position,
    catalog.cards.filter((card) => playersById.get(card.playerId)?.primaryPosition === position).length,
  ])) as Record<HockeyPosition, number>;
  const priceBands: readonly [string, readonly CardVersion[]][] = [
    ['base-68-72', baseCards.filter(({ overall }) => overall >= 68 && overall <= 72)],
    ['base-73-76', baseCards.filter(({ overall }) => overall >= 73 && overall <= 76)],
    ['base-77-80', baseCards.filter(({ overall }) => overall >= 77 && overall <= 80)],
    ['base-81-83', baseCards.filter(({ overall }) => overall >= 81 && overall <= 83)],
    ['base-84-86', baseCards.filter(({ overall }) => overall >= 84 && overall <= 86)],
    ['event-84-90', eventCards],
  ];
  const pricesByRatingBand = Object.fromEntries(priceBands
    .filter(([, cards]) => cards.length > 0)
    .map(([id, cards]) => [id, priceStatistics(cards)]));
  const leagues = Object.fromEntries((['NHL', 'PWHL'] as const).map((league) => {
    const playerIds = new Set(catalog.players.filter((player) => player.league === league).map(({ id }) => id));
    return [league, {
      players: playerIds.size,
      baseCards: baseCards.filter((card) => playerIds.has(card.playerId)).length,
      eventCards: eventCards.filter((card) => playerIds.has(card.playerId)).length,
    }];
  })) as Record<League, { players: number; baseCards: number; eventCards: number }>;
  const eventSetIds = [...new Set(eventCards.map(({ setId }) => setId))].sort();
  const events = Object.fromEntries(eventSetIds.map((setId) => {
    const cards = eventCards.filter((card) => card.setId === setId);
    return [setId, { cards: cards.length, teams: new Set(cards.map(({ teamId }) => teamId)).size }];
  }));
  const teamsWithStarter = teamIds.filter((teamId) => cardsByTeam[teamId].starter === 6).length;
  const teamsWithBase = teamIds.filter((teamId) => cardsByTeam[teamId].base >= 18).length;
  const teamsWithEvent = teamIds.filter((teamId) => cardsByTeam[teamId].event >= 1).length;
  const warnings: string[] = [];
  for (const teamId of teamIds) {
    if (cardsByTeam[teamId].starter !== 6) warnings.push(`${teamId} must have exactly six Starter cards.`);
    if (cardsByTeam[teamId].base !== 18) warnings.push(`${teamId} must have exactly 18 Base cards.`);
    if (cardsByTeam[teamId].event < 1) warnings.push(`${teamId} must have at least one Event card.`);
    if (byTeam[teamId] < 71 || byTeam[teamId] > 73) warnings.push(`${teamId} Starter average ${byTeam[teamId]} is outside 71-73.`);
  }
  if (baseCards.some(({ overall }) => overall < 68 || overall > 86)) warnings.push('Base cards must remain in the 68-86 range.');
  if (eventCards.some((card) => {
    const isArtworkSignature = card.setId === 'signature-series'
      && card.visualMetadata.treatment === 'approved-local-asset';
    return isArtworkSignature
      ? card.overall < 92 || card.overall > 96
      : card.overall < 84 || card.overall > 90;
  })) warnings.push('Event cards must remain in their approved generic or Signature artwork OVR range.');
  for (const [position, count] of Object.entries(cardsByPrimaryPosition)) {
    if (count === 0) warnings.push(`No cards cover primary position ${position}.`);
  }
  const starterOveralls = starterCards.map(({ overall }) => overall);
  return {
    starterOverall: {
      byTeam,
      average: rounded(Object.values(byTeam).reduce((sum, value) => sum + value, 0) / teamIds.length, 2),
      minimum: Math.min(...starterOveralls),
      maximum: Math.max(...starterOveralls),
    },
    overallDistribution: { base: overallDistribution(baseCards), event: overallDistribution(eventCards) },
    cardsByTeam,
    cardsByPrimaryPosition,
    pricesByRatingBand,
    coverage: { teams: teamIds.length, teamsWithStarter, teamsWithBase, teamsWithEvent, leagues, events },
    warnings,
  };
}

function collectIssues(
  league: LeagueBalanceReport,
  ai: AiBalanceReport,
  economy: EconomyBalanceReport,
  content: ContentCoverageReport,
): string[] {
  const issues = [...economy.outliers, ...content.warnings];
  if (league.leagueWinRateGap > 0.15) issues.push('Paired league win-rate gap exceeds fifteen percentage points.');
  for (const mode of MODES) {
    if (!ai.monotonicByMode[mode]) issues.push(`${mode} player win rate must fall from Rookie to Pro to Elite.`);
    if (!ai.progressionOrderedByMode[mode]) issues.push(`${mode} player win rates must rise with lineup progression.`);
    const starterRookie = ai.scenarios[mode]['average-starter'].rookie.winRates.player;
    const starterPro = ai.scenarios[mode]['average-starter'].pro.winRates.player;
    const goodBasePro = ai.scenarios[mode]['good-base'].pro.winRates.player;
    const strongElite = ai.scenarios[mode]['strong-base-event'].elite.winRates.player;
    if (starterRookie < 0.30 || starterRookie > 0.95) {
      issues.push(`${mode} Starter-vs-Rookie win rate ${starterRookie} is outside the Quartett 30%-95% guardrail.`);
    }
    if (starterPro > 0.40 || starterPro > starterRookie - 0.10) {
      issues.push(`${mode} Starter-vs-Pro win rate ${starterPro} is not clearly below Rookie.`);
    }
    if (goodBasePro < 0.05 || goodBasePro > 0.95) {
      issues.push(`${mode} good-Base-vs-Pro win rate ${goodBasePro} is outside the Quartett 5%-95% guardrail.`);
    }
    if (strongElite < 0.10 || strongElite > 0.95) {
      issues.push(`${mode} strong-Base/Event-vs-Elite win rate ${strongElite} is outside the Quartett 10%-95% guardrail.`);
    }
  }
  if (!economy.loopChecks.rewardOrderValid) issues.push('Match reward ordering is invalid.');
  if (!economy.loopChecks.pricesExceedSingleMatchRewards) issues.push('A single match reward can buy the cheapest market card.');
  if (!economy.loopChecks.eventPricesExceedComparableBase) issues.push('Event prices do not exceed comparable Base prices.');
  if (!economy.loopChecks.priceCurveMonotonic) issues.push('Market price curves are not monotonic.');
  if (!economy.loopChecks.objectivesArePeriodBounded) issues.push('Objective rewards are not provably bounded by UTC period receipts.');
  if (!economy.loopChecks.settlementReplayRewardStable) issues.push('Replaying one match settlement can grant rewards more than once.');
  if (!economy.loopChecks.openTicketCannotBeRerolled) issues.push('An open match ticket can be replaced or resumed without its stored rounds.');
  if (!economy.loopChecks.rivalryRewardsAreFinite) issues.push('Rivalry Road rewards are not provably finite and single-claim.');
  if (!economy.loopChecks.positiveLossRewardsRequireAuthoritativeMatches) {
    issues.push('Positive loss rewards are not protected by immutable server rounds and a single open ticket.');
  }
  if (!economy.loopChecks.utcPeriodCutoverUsesPostLockTime) issues.push('Objective periods use a timestamp captured before the account lock.');
  if (economy.loopChecks.repeatableUnboundedObjectiveRewardFound) issues.push('A repeatable or unbounded reward-loop risk was detected.');
  return issues;
}

export function runBalanceDiagnostics(
  catalog: CardCatalog,
  lineups: readonly Lineup[],
  pairedSeeds = 2_000,
  seedPrefix = 'rink-rivals-balance-v2',
): BalanceReport {
  const league = runLeagueBalanceDiagnostics(catalog, lineups, pairedSeeds, seedPrefix);
  const ai = runAiOpponentDiagnostics(catalog, pairedSeeds, seedPrefix, AI_OPPONENTS, lineups);
  const economy = runEconomyDiagnostics(catalog, lineups, ai);
  const content = runContentCoverageDiagnostics(catalog);
  return {
    ...league,
    reportVersion: 'content-foundation-balance-v3',
    ai,
    economy,
    content,
    issues: collectIssues(league, ai, economy, content),
  };
}

export function assertBalanceReport(report: BalanceReport): void {
  if (report.issues.length > 0) throw new Error(`Balance diagnostics failed:\n${report.issues.join('\n')}`);
}
