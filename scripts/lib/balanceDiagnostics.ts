import type { CardCatalog, CardVersion, League } from '../../src/domain/cards/types';
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
  AUTHORITATIVE_SCORE_VARIANCE,
  selectAuthoritativeOpponentCard,
} from '../../src/domain/battle/authoritativePolicy';
import {
  calculateBaseScore,
  createBattle,
  getEligibleCards,
  revealRound,
  selectCard,
} from '../../src/domain/battle/engine';
import type { AiDifficulty, BattleSide, BattleState, RoundWinner } from '../../src/domain/battle/types';
import { randomBetween, randomIndex } from '../../src/domain/battle/rng';
import { resolveLineup } from '../../src/domain/lineups/validation';
import type { GameMode, Lineup, LineupSlot, ResolvedLineup, ResolvedLineupCard } from '../../src/domain/lineups/types';
import { calculateCollectionScore } from '../../src/domain/progression/collectionScore';
import { AI_TIER_THRESHOLDS } from '../../src/domain/progression/unlocks';
import { EVENT_IDS } from '../../src/domain/shop/eventCalendar';
import { analyzeRewardLoops, type RewardLoopAnalysis } from './rewardLoopDiagnostics';

const DIFFICULTIES = ['rookie', 'pro', 'elite'] as const;
const MODES = ['nhl-circuit', 'pwhl-circuit', 'open-ice'] as const;
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
  readonly opponentId: string;
  readonly opponentOverall: number;
  readonly referenceLineupId: string;
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
    scoreVariance: typeof AUTHORITATIVE_SCORE_VARIANCE;
    note: string;
  }>;
  readonly matchesPerTier: number;
  readonly seedPrefix: string;
  readonly tiers: Readonly<Record<GameMode, Readonly<Record<AiDifficulty, AiTierBalanceResult>>>>;
  readonly monotonicByMode: Readonly<Record<GameMode, boolean>>;
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
  } & RewardLoopAnalysis>;
}

export interface BalanceReport extends LeagueBalanceReport {
  readonly reportVersion: 'mvp-balance-v2';
  readonly ai: AiBalanceReport;
  readonly economy: EconomyBalanceReport;
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
  const slots = Object.fromEntries(
    (['LW', 'C', 'RW', 'LD', 'RD', 'G'] as const).map((slot) => {
      const candidates = catalog.cards
        .filter((card) => {
          const player = players.get(card.playerId);
          return card.cardType === 'base' && player?.league === league && player.eligiblePositions.includes(slot as never);
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      if (candidates.length === 0) throw new Error(`No ${league} base card can fill ${slot}`);
      return [slot, candidates[randomIndex(`${seed}:${league}:${slot}`, candidates.length)].id];
    }),
  ) as Record<LineupSlot, string>;
  return openIce({ ...template, slots }, `${seed}-${league.toLowerCase()}`);
}

function chooseGreedyCard(state: BattleState, side: BattleSide): string {
  const situation = state.situations[state.roundIndex];
  const eligible = getEligibleCards(state, side);
  if (eligible.length === 0) throw new Error(`No eligible ${side} card in round ${state.roundIndex + 1}`);
  return [...eligible].sort((left, right) => {
    const scoreDelta = calculateBaseScore(right.card, situation) - calculateBaseScore(left.card, situation);
    return scoreDelta || left.card.id.localeCompare(right.card.id);
  })[0].card.id;
}

function playGreedyMatch(seed: string, catalog: CardCatalog, playerLineup: Lineup, opponentLineup: Lineup): BattleState {
  let state = createBattle({ seed, mode: 'open-ice', catalog, playerLineup, opponentLineup });
  while (state.phase !== 'complete') {
    state = selectCard(state, 'player', chooseGreedyCard(state, 'player'));
    state = selectCard(state, 'opponent', chooseGreedyCard(state, 'opponent'));
    state = revealRound(state);
  }
  return state;
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
    calculateBaseScore(right.card, situation) - calculateBaseScore(left.card, situation)
      || left.card.id.localeCompare(right.card.id))[0];
  if (!selected) throw new Error(`No player card is eligible for ${situation.id}.`);
  return selected;
}

/**
 * Behavioral mirror of the SQL match policy: the same fixed situations,
 * eligibility, tier card choice, no card reuse, and variance ranges. The PRNG
 * is TypeScript-seeded rather than PostgreSQL hashtextextended, so reports are
 * distribution-equivalent instead of byte-identical to a particular DB run.
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

    const playerScore = calculateBaseScore(playerCard.card, situation) + randomBetween(
      `${seed}:round:${roundIndex}:player:${playerCard.card.id}`,
      -AUTHORITATIVE_SCORE_VARIANCE.player,
      AUTHORITATIVE_SCORE_VARIANCE.player,
    );
    const opponentVariance = AUTHORITATIVE_SCORE_VARIANCE.opponent[difficulty];
    const opponentScore = calculateBaseScore(opponentCard.card, situation) + randomBetween(
      `${seed}:round:${roundIndex}:opponent:${opponentCard.card.id}`,
      -opponentVariance,
      opponentVariance,
    );
    if (playerScore > opponentScore) playerRoundWins += 1;
    else if (opponentScore > playerScore) opponentRoundWins += 1;
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
      [playGreedyMatch(`${pairSeed}:match`, catalog, openNhl, openPwhl), 'NHL'],
      [playGreedyMatch(`${pairSeed}:match`, catalog, openPwhl, openNhl), 'PWHL'],
    ] as const;
    for (const [match, playerLeague] of paired) {
      wins[leagueWinner(match.winner ?? 'tie', playerLeague)] += 1;
      for (const result of match.results) {
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

function referenceLineup(mode: GameMode, opponents: readonly AiOpponentDefinition[]): Lineup {
  const pro = opponents.find((candidate) => candidate.mode === mode && candidate.difficulty === 'pro');
  if (!pro) throw new Error(`Missing Pro reference lineup for ${mode}`);
  return { ...pro.lineup, id: `balance-reference:${mode}`, name: `${mode} reference` };
}

export function runAiOpponentDiagnostics(
  catalog: CardCatalog,
  matchesPerTier = 2_000,
  seedPrefix = 'rink-rivals-balance-v2',
  opponents: readonly AiOpponentDefinition[] = AI_OPPONENTS,
): AiBalanceReport {
  if (!Number.isSafeInteger(matchesPerTier) || matchesPerTier <= 0) throw new Error('matchesPerTier must be a positive integer');
  validateAiOpponentDefinitions(catalog, opponents);
  const tiers = {} as Record<GameMode, Record<AiDifficulty, AiTierBalanceResult>>;
  const monotonicByMode = {} as Record<GameMode, boolean>;
  const resolvedOpponentCache = new Map<string, ResolvedLineup>();
  for (const mode of MODES) {
    const playerLineup = referenceLineup(mode, opponents);
    const resolvedPlayerLineup = resolveLineup(playerLineup, catalog);
    tiers[mode] = {} as Record<AiDifficulty, AiTierBalanceResult>;
    for (const difficulty of DIFFICULTIES) {
      const wins = { player: 0, tie: 0, opponent: 0 };
      let selectedOpponent: AiOpponentDefinition | undefined;
      for (let index = 0; index < matchesPerTier; index += 1) {
        const seed = `${seedPrefix}:ai:${mode}:${difficulty}:${index}`;
        selectedOpponent = selectAiOpponent(mode, difficulty, seed, opponents);
        let resolvedOpponentLineup = resolvedOpponentCache.get(selectedOpponent.id);
        if (!resolvedOpponentLineup) {
          resolvedOpponentLineup = resolveLineup(selectedOpponent.lineup, catalog);
          resolvedOpponentCache.set(selectedOpponent.id, resolvedOpponentLineup);
        }
        wins[playAuthoritativeAiMatch(seed, difficulty, resolvedPlayerLineup, resolvedOpponentLineup)] += 1;
      }
      if (!selectedOpponent) throw new Error(`No simulation completed for ${mode} ${difficulty}`);
      tiers[mode][difficulty] = {
        mode,
        difficulty,
        opponentId: selectedOpponent.id,
        opponentOverall: rounded(calculateAiOpponentOverall(selectedOpponent, catalog), 2),
        referenceLineupId: playerLineup.id,
        matches: matchesPerTier,
        wins,
        winRates: {
          player: rounded(wins.player / matchesPerTier),
          tie: rounded(wins.tie / matchesPerTier),
          opponent: rounded(wins.opponent / matchesPerTier),
        },
      };
    }
    const rates = DIFFICULTIES.map((difficulty) => tiers[mode][difficulty].winRates.player);
    monotonicByMode[mode] = rates[0] > rates[1] && rates[1] > rates[2];
  }
  return {
    simulationPolicy: {
      version: AUTHORITATIVE_MATCH_POLICY_VERSION,
      fidelity: 'behavioral-mirror',
      situationIds: AUTHORITATIVE_MATCH_SITUATIONS.map(({ id }) => id),
      playerSelection: 'strongest-eligible',
      opponentSelection: AUTHORITATIVE_AI_SELECTION_POLICY,
      scoreVariance: AUTHORITATIVE_SCORE_VARIANCE,
      note: 'Mirrors server policy; deterministic TypeScript PRNG replaces PostgreSQL hashtextextended.',
    },
    matchesPerTier,
    seedPrefix,
    tiers,
    monotonicByMode,
    totalMatches: matchesPerTier * MODES.length * DIFFICULTIES.length,
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
  const values = MODES.map((mode) => {
    const rates = ai.tiers[mode][difficulty].winRates;
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
  const missingBase = catalog.cards
    .filter((card) => card.cardType === 'base' && !acquired.includes(card.id))
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
): string[] {
  const issues: string[] = [];
  if (!rewardOrderValid) issues.push('Match reward ordering is invalid.');
  if (base.minimum < base.median * 0.5 || base.maximum > base.median * 2) issues.push('Base-card price outlier exceeds the allowed median band.');
  if (event.minimum < event.median * 0.65 || event.maximum > event.median * 1.5) issues.push('Event-card price outlier exceeds the allowed median band.');
  if (event.median <= base.median) issues.push('Typical Event card must cost more than a typical Base card.');
  return issues;
}

export function runEconomyDiagnostics(
  catalog: CardCatalog,
  lineups: readonly Lineup[],
  ai: AiBalanceReport,
): EconomyBalanceReport {
  const baseCards = catalog.cards.filter((card) => card.cardType === 'base');
  const strongBaseCards = baseCards.filter((card) => card.overall >= 95);
  const eventCards = catalog.cards.filter((card) => EVENT_IDS.includes(card.setId as (typeof EVENT_IDS)[number]));
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
    outliers: economyIssues(base, event, rewardOrderValid),
    loopChecks: {
      rewardOrderValid,
      pricesExceedSingleMatchRewards: base.minimum > maxSingleReward && event.minimum > maxSingleReward,
      ...rewardLoops,
    },
  };
}

function collectIssues(league: LeagueBalanceReport, ai: AiBalanceReport, economy: EconomyBalanceReport): string[] {
  const issues = [...economy.outliers];
  if (league.leagueWinRateGap > 0.05) issues.push('Paired league win-rate gap exceeds five percentage points.');
  for (const mode of MODES) {
    if (!ai.monotonicByMode[mode]) issues.push(`${mode} player win rate must fall from Rookie to Pro to Elite.`);
    const rookie = ai.tiers[mode].rookie.winRates.player;
    const pro = ai.tiers[mode].pro.winRates.player;
    const elite = ai.tiers[mode].elite.winRates.player;
    if (rookie < 0.55 || rookie > 0.98) issues.push(`${mode} Rookie reference win rate ${rookie} is outside 55%-98%.`);
    if (pro < 0.25 || pro > 0.75) issues.push(`${mode} Pro reference win rate ${pro} is outside 25%-75%.`);
    if (elite < 0.05 || elite > 0.45) issues.push(`${mode} Elite reference win rate ${elite} is outside 5%-45%.`);
  }
  if (!economy.loopChecks.rewardOrderValid) issues.push('Match reward ordering is invalid.');
  if (!economy.loopChecks.pricesExceedSingleMatchRewards) issues.push('A single match reward can buy the cheapest market card.');
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
  const ai = runAiOpponentDiagnostics(catalog, pairedSeeds, seedPrefix);
  const economy = runEconomyDiagnostics(catalog, lineups, ai);
  return { ...league, reportVersion: 'mvp-balance-v2', ai, economy, issues: collectIssues(league, ai, economy) };
}

export function assertBalanceReport(report: BalanceReport): void {
  if (report.issues.length > 0) throw new Error(`Balance diagnostics failed:\n${report.issues.join('\n')}`);
}
