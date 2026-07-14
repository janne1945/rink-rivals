import type {
  CardType,
  GoalieAttributes,
  HockeyPosition,
  League,
  PlayerRole,
  SkaterAttributes,
} from '../../src/domain/cards/types';

export interface PerformanceStat {
  readonly league: League;
  readonly sourcePlayerId: string;
  readonly role: PlayerRole;
  readonly gamesPlayed: number;
  readonly goals: number;
  readonly assists: number;
  readonly points: number;
  readonly plusMinus: number;
  readonly shots: number;
  readonly blocks: number;
  readonly hits: number;
  readonly gameWinningGoals: number;
  readonly averageTimeOnIceSeconds: number;
  readonly faceoffPercentage: number;
  readonly savePercentage: number;
  readonly goalsAgainstAverage: number;
  readonly shutouts: number;
  readonly wins: number;
  readonly sourceUrl: string;
}

export interface RatingCandidate {
  readonly id: string;
  readonly league: League;
  readonly role: PlayerRole;
  readonly position: HockeyPosition;
  readonly archetype: string;
  readonly sourceRosterStatus: 'active-roster' | 'roster-candidate' | 'rights';
  readonly stat?: PerformanceStat;
}

export interface RatingOverride {
  readonly playerId: string;
  /** Rating produced by the current model when the override was approved. */
  readonly sourceGeneratedOverall: number;
  readonly baseOverall?: number;
  readonly reason: string;
}

export type CardAttributes = SkaterAttributes | GoalieAttributes;

const EVENT_SKATER_PROFILE: Readonly<Record<string, Readonly<{
  strength: keyof SkaterAttributes;
  support: keyof SkaterAttributes;
  tradeoff: keyof SkaterAttributes;
}>>> = {
  'frozen-frights': { strength: 'physicality', support: 'defense', tradeoff: 'speed' },
  'signature-series': { strength: 'hockeyIq', support: 'passing', tradeoff: 'physicality' },
  'winter-holidays': { strength: 'passing', support: 'puckControl', tradeoff: 'physicality' },
  'winter-classic': { strength: 'clutch', support: 'physicality', tradeoff: 'puckControl' },
  'international-ice': { strength: 'speed', support: 'passing', tradeoff: 'physicality' },
  'rising-stars': { strength: 'puckControl', support: 'speed', tradeoff: 'defense' },
  'playoff-heroes': { strength: 'clutch', support: 'defense', tradeoff: 'speed' },
  'franchise-icons': { strength: 'hockeyIq', support: 'passing', tradeoff: 'speed' },
  'record-breakers': { strength: 'shooting', support: 'speed', tradeoff: 'defense' },
  'clutch-performers': { strength: 'clutch', support: 'shooting', tradeoff: 'physicality' },
};

const EVENT_GOALIE_PROFILE: Readonly<Record<string, Readonly<{
  strength: keyof GoalieAttributes;
  support: keyof GoalieAttributes;
  tradeoff: keyof GoalieAttributes;
}>>> = {
  'frozen-frights': { strength: 'positioning', support: 'consistency', tradeoff: 'puckHandling' },
  'signature-series': { strength: 'consistency', support: 'positioning', tradeoff: 'puckHandling' },
  'winter-holidays': { strength: 'puckHandling', support: 'reboundControl', tradeoff: 'positioning' },
  'winter-classic': { strength: 'clutch', support: 'consistency', tradeoff: 'puckHandling' },
  'international-ice': { strength: 'puckHandling', support: 'reflexes', tradeoff: 'consistency' },
  'rising-stars': { strength: 'reflexes', support: 'glove', tradeoff: 'positioning' },
  'playoff-heroes': { strength: 'clutch', support: 'positioning', tradeoff: 'puckHandling' },
  'franchise-icons': { strength: 'consistency', support: 'positioning', tradeoff: 'reflexes' },
  'record-breakers': { strength: 'reflexes', support: 'glove', tradeoff: 'reboundControl' },
  'clutch-performers': { strength: 'clutch', support: 'positioning', tradeoff: 'puckHandling' },
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

/** FNV-1a keeps tie-breaking reproducible without introducing a runtime RNG. */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Produces a role-specific performance signal. The value is used only for
 * relative ranking inside one league and role, never as a cross-league claim.
 */
export function performanceScore(candidate: RatingCandidate): number {
  const stat = candidate.stat;
  if (!stat || stat.gamesPlayed <= 0) {
    return -10 + (stableHash(candidate.id) % 1_000) / 1_000_000;
  }

  const games = stat.gamesPlayed;
  const reliability = Math.min(1, games / (candidate.league === 'NHL' ? 50 : 20));
  if (candidate.role === 'goalie') {
    const saveQuality = clamp((stat.savePercentage - 0.86) * 1_000, 0, 90) / 90;
    const goalsAgainstQuality = clamp((4.5 - stat.goalsAgainstAverage) * 20, 0, 60) / 60;
    return reliability * (
      saveQuality * 0.52
      + goalsAgainstQuality * 0.23
      + safeRate(stat.wins, games) * 0.17
      + safeRate(stat.shutouts, games) * 0.08
    ) + (stableHash(candidate.id) % 1_000) / 1_000_000;
  }

  const pointsPerGame = safeRate(stat.points, games);
  const goalsPerGame = safeRate(stat.goals, games);
  const shotsPerGame = safeRate(stat.shots, games);
  const timeOnIce = Math.min(1, stat.averageTimeOnIceSeconds / 1_300);
  const twoWay = Math.max(-0.2, Math.min(0.25, safeRate(stat.plusMinus, games) / 4));
  // The NHL summary endpoint used by the snapshot does not expose blocks/hits.
  // Do not treat the imported zero placeholders as evidence of no defensive play.
  const defensiveVolume = candidate.league === 'PWHL'
    ? Math.min(0.25, safeRate(stat.blocks + stat.hits, games) / 8)
    : 0;
  return reliability * (
    pointsPerGame * 0.43
    + goalsPerGame * 0.19
    + shotsPerGame * 0.035
    + timeOnIce * 0.14
    + twoWay * 0.08
    + defensiveVolume * 0.08
    + safeRate(stat.gameWinningGoals, games) * 0.04
  ) + (stableHash(candidate.id) % 1_000) / 1_000_000;
}

/**
 * Maps candidates to the launch Base band. NHL and PWHL are normalized in
 * separate role pools, so neither league receives a structural rating penalty.
 */
export function calculateBaseOveralls(
  candidates: readonly RatingCandidate[],
  overrides: readonly RatingOverride[] = [],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const overrideById = new Map(overrides.map((override) => [override.playerId, override]));
  if (overrideById.size !== overrides.length) throw new Error('Duplicate player rating override.');
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  for (const override of overrides) {
    if (!candidateIds.has(override.playerId)) {
      throw new Error(`Rating override references unknown player ${override.playerId}.`);
    }
  }

  for (const league of ['NHL', 'PWHL'] as const) {
    for (const role of ['skater', 'goalie'] as const) {
      const pool = candidates
        .filter((candidate) => candidate.league === league && candidate.role === role)
        .map((candidate) => ({ candidate, score: performanceScore(candidate) }))
        .sort((left, right) => left.score - right.score || left.candidate.id.localeCompare(right.candidate.id));
      const denominator = Math.max(1, pool.length - 1);
      pool.forEach(({ candidate }, index) => {
        const percentile = index / denominator;
        let overall = 68 + Math.round(percentile * 18);
        if (candidate.sourceRosterStatus === 'rights' || !candidate.stat) {
          overall = Math.min(overall, 72 + (stableHash(candidate.id) % 2));
        }
        const override = overrideById.get(candidate.id);
        if (override) {
          if (override.sourceGeneratedOverall !== overall) {
            throw new Error(
              `Stale rating override for ${candidate.id}: expected generated ${override.sourceGeneratedOverall}, received ${overall}.`,
            );
          }
          if (override.baseOverall !== undefined) overall = override.baseOverall;
        }
        result.set(candidate.id, clamp(overall, 68, 86));
      });
    }
  }

  return result;
}

const SKATER_KEYS = [
  'speed', 'shooting', 'passing', 'puckControl', 'defense', 'physicality', 'hockeyIq', 'clutch',
] as const satisfies readonly (keyof SkaterAttributes)[];
const GOALIE_KEYS = [
  'reflexes', 'positioning', 'glove', 'blocker', 'reboundControl', 'puckHandling', 'consistency', 'clutch',
] as const satisfies readonly (keyof GoalieAttributes)[];

const SKATER_POSITION_OFFSETS: Readonly<Record<Exclude<HockeyPosition, 'G'>, readonly number[]>> = {
  LW: [3, 3, 0, 2, -3, 0, 0, 1],
  C: [1, 1, 3, 2, 0, -2, 2, 1],
  RW: [2, 4, 0, 2, -3, 0, 0, 1],
  LD: [0, -3, 2, 1, 4, 2, 2, 0],
  RD: [0, -2, 2, 1, 3, 3, 2, 0],
};

const SKATER_ARCHETYPE_OFFSETS: Readonly<Record<string, readonly number[]>> = {
  sniper: [1, 5, -2, 2, -2, -1, 0, 1],
  playmaker: [2, -2, 5, 3, -2, -3, 2, 0],
  'power-forward': [-1, 3, -2, 0, 0, 5, -2, 1],
  'two-way-forward': [0, 0, 1, 0, 3, 1, 2, 1],
  'mobile-defense': [3, -2, 3, 2, 1, -2, 2, 0],
  'offensive-defense': [1, 2, 4, 3, 0, -3, 2, 0],
  'defensive-defense': [-2, -3, 0, -1, 5, 4, 2, 0],
};

const GOALIE_ARCHETYPE_OFFSETS: Readonly<Record<string, readonly number[]>> = {
  'reflex-goalie': [5, -2, 3, 2, -1, 0, -2, 1],
  'positional-goalie': [-1, 5, 0, 1, 3, -2, 2, 0],
  'hybrid-goalie': [2, 1, 1, 2, 1, 1, 0, 0],
};

function variation(id: string, index: number): number {
  return ((stableHash(`${id}:${index}`) % 5) - 2);
}

export function buildAttributes(
  candidate: RatingCandidate,
  overall: number,
  variantKey = 'base',
): CardAttributes {
  if (candidate.role === 'goalie') {
    const offsets = [3, 2, 2, 1, 0, -3, 1, 2];
    const archetypeOffsets = GOALIE_ARCHETYPE_OFFSETS[candidate.archetype]
      ?? GOALIE_ARCHETYPE_OFFSETS['hybrid-goalie'];
    return Object.fromEntries(GOALIE_KEYS.map((key, index) => [
      key,
      clamp(
        overall + (offsets[index] ?? 0) + (archetypeOffsets?.[index] ?? 0)
          + variation(`${candidate.id}:${variantKey}`, index),
        40,
        99,
      ),
    ])) as unknown as GoalieAttributes;
  }

  const offsets = SKATER_POSITION_OFFSETS[candidate.position as Exclude<HockeyPosition, 'G'>];
  const archetypeOffsets = SKATER_ARCHETYPE_OFFSETS[candidate.archetype]
    ?? SKATER_ARCHETYPE_OFFSETS['two-way-forward'];
  return Object.fromEntries(SKATER_KEYS.map((key, index) => [
    key,
    clamp(
      overall + (offsets[index] ?? 0) + (archetypeOffsets?.[index] ?? 0)
        + variation(`${candidate.id}:${variantKey}`, index),
      40,
      99,
    ),
  ])) as unknown as SkaterAttributes;
}

/**
 * Applies the Event Calendar's headline/support/tradeoff identity relative to
 * the player's Base version. This deliberately prevents blanket upgrades.
 */
export function applyEventAttributeProfile(
  base: CardAttributes,
  generated: CardAttributes,
  eventId: string,
  role: PlayerRole,
): CardAttributes {
  if (role === 'goalie') {
    const profile = EVENT_GOALIE_PROFILE[eventId];
    if (!profile) throw new Error(`Missing goalie attribute profile for event ${eventId}.`);
    const baseGoalie = base as GoalieAttributes;
    const result = { ...(generated as GoalieAttributes) } as Record<keyof GoalieAttributes, number>;
    result[profile.strength] = clamp(Math.max(result[profile.strength], baseGoalie[profile.strength] + 4), 40, 99);
    result[profile.support] = clamp(Math.max(result[profile.support], baseGoalie[profile.support] + 2), 40, 99);
    result[profile.tradeoff] = clamp(Math.min(result[profile.tradeoff], baseGoalie[profile.tradeoff] - 2), 40, 99);
    return result as GoalieAttributes;
  }
  const profile = EVENT_SKATER_PROFILE[eventId];
  if (!profile) throw new Error(`Missing skater attribute profile for event ${eventId}.`);
  const baseSkater = base as SkaterAttributes;
  const result = { ...(generated as SkaterAttributes) } as Record<keyof SkaterAttributes, number>;
  result[profile.strength] = clamp(Math.max(result[profile.strength], baseSkater[profile.strength] + 4), 40, 99);
  result[profile.support] = clamp(Math.max(result[profile.support], baseSkater[profile.support] + 2), 40, 99);
  result[profile.tradeoff] = clamp(Math.min(result[profile.tradeoff], baseSkater[profile.tradeoff] - 2), 40, 99);
  return result as SkaterAttributes;
}

/**
 * Starter editions never exceed a Base attribute and always retain at least
 * one strictly weaker attribute. This preserves a real upgrade path for the
 * unavoidable 68-OVR launch-floor case as well as ordinary lower-OVR cards.
 */
export function applyStarterAttributeProfile(
  base: CardAttributes,
  generated: CardAttributes,
): CardAttributes {
  const baseAttributes = base as unknown as Record<string, number>;
  const result = Object.fromEntries(Object.entries(generated).map(([key, value]) => [
    key,
    Math.min(value, baseAttributes[key] ?? value),
  ])) as Record<string, number>;
  if (!Object.keys(result).some((key) => result[key] < baseAttributes[key])) {
    const key = Object.keys(result)[0];
    if (key) result[key] = Math.max(40, baseAttributes[key] - 1);
  }
  return result as unknown as CardAttributes;
}

export function priceForCard(cardType: CardType, overall: number): number {
  if (cardType === 'starter' || cardType === 'reward') return 0;
  if (cardType === 'event') return 6_500 + (overall - 84) * 1_500;
  if (overall <= 72) return 300 + (overall - 68) * 75;
  if (overall <= 76) return 750 + (overall - 73) * 150;
  if (overall <= 80) return 1_500 + (overall - 77) * 300;
  if (overall <= 83) return 3_000 + (overall - 81) * 650;
  return 5_500 + (overall - 84) * 1_250;
}

export function starterOverall(baseOverall: number, salt: string): number {
  if (baseOverall < 68) {
    throw new RangeError('A Starter version requires a valid launch Base overall of at least 68.');
  }
  const generated = 68 + Math.round((baseOverall - 68) * 0.3) + (stableHash(salt) % 2);
  const maximum = baseOverall === 68 ? 68 : Math.min(76, baseOverall - 1);
  return clamp(generated, 68, maximum);
}

export function eventOverall(baseOverall: number, salt: string): number {
  return clamp(Math.max(84, baseOverall + 3 + (stableHash(salt) % 2)), 84, 90);
}

export function rewardOverall(baseOverall: number, salt: string): number {
  return clamp(Math.max(86, baseOverall + 3 + (stableHash(salt) % 2)), 86, 90);
}
