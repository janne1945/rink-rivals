import type { GoalieAttributes, SkaterAttributes } from '../cards/types';
import { LINEUP_SLOTS } from '../lineups/types';
import { shuffleSeeded } from './rng';
import {
  BATTLE_ROUND_COUNT,
  BattleRuleError,
  type BattleSituation,
} from './types';

const SKATER_SLOTS = LINEUP_SLOTS.filter((slot) => slot !== 'G');

export const DEFAULT_SITUATION_DECK: readonly BattleSituation[] = [
  {
    id: 'breakaway',
    name: 'Breakaway',
    description: 'Create separation and finish one-on-one.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    weights: { speed: 0.25, shooting: 0.35, puckControl: 0.25, clutch: 0.15 },
  },
  {
    id: 'defensive-zone',
    name: 'Defensive Zone',
    description: 'Read the play and shut down a dangerous shift.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    weights: { defense: 0.4, hockeyIq: 0.25, physicality: 0.2, speed: 0.15 },
  },
  {
    id: 'power-play',
    name: 'Power Play',
    description: 'Move the puck and create a high-quality chance.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    weights: { passing: 0.3, puckControl: 0.25, shooting: 0.25, hockeyIq: 0.2 },
  },
  {
    id: 'forecheck-battle',
    name: 'Forecheck Battle',
    description: 'Win possession below the goal line.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    weights: { physicality: 0.35, speed: 0.2, puckControl: 0.2, hockeyIq: 0.25 },
  },
  {
    id: 'clutch-shift',
    name: 'Clutch Shift',
    description: 'Deliver when the game is on the line.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    weights: { clutch: 0.4, hockeyIq: 0.25, shooting: 0.2, defense: 0.15 },
  },
  {
    id: 'overtime',
    name: 'Overtime',
    description: 'Turn open ice into the deciding play.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    weights: { clutch: 0.3, speed: 0.25, puckControl: 0.25, hockeyIq: 0.2 },
  },
  {
    id: 'goalie-showdown',
    name: 'Goalie Showdown',
    description: 'Make the save that changes the match.',
    role: 'goalie',
    eligibleSlots: ['G'],
    weights: { reflexes: 0.25, positioning: 0.25, consistency: 0.2, clutch: 0.3 },
  },
];

function weightSum(situation: BattleSituation): number {
  return Object.values(situation.weights).reduce((sum, weight) => sum + (weight ?? 0), 0);
}

function hasKnownWeightKeys(situation: BattleSituation): boolean {
  const skaterKeys = new Set<keyof SkaterAttributes>([
    'speed',
    'shooting',
    'passing',
    'puckControl',
    'defense',
    'physicality',
    'hockeyIq',
    'clutch',
  ]);
  const goalieKeys = new Set<keyof GoalieAttributes>([
    'reflexes',
    'positioning',
    'glove',
    'blocker',
    'reboundControl',
    'puckHandling',
    'consistency',
    'clutch',
  ]);
  const allowed = new Set<string>(situation.role === 'skater' ? skaterKeys : goalieKeys);
  return Object.keys(situation.weights).every((key) => allowed.has(key));
}

export function validateSituationDeck(deck: readonly BattleSituation[]): void {
  const ids = new Set<string>();
  let goalieSituations = 0;
  let skaterSituations = 0;

  for (const situation of deck) {
    if (ids.has(situation.id)) {
      throw new BattleRuleError(
        'invalid-situation-deck',
        `Situation ID ${situation.id} is duplicated.`,
      );
    }
    ids.add(situation.id);

    const slotsAreValid =
      situation.eligibleSlots.length > 0 &&
      situation.eligibleSlots.every((slot) =>
        situation.role === 'goalie' ? slot === 'G' : slot !== 'G',
      );
    const weightsAreValid =
      hasKnownWeightKeys(situation) &&
      Object.values(situation.weights).every(
        (weight) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0,
      ) &&
      Math.abs(weightSum(situation) - 1) < 0.000_001;

    if (!slotsAreValid || !weightsAreValid) {
      throw new BattleRuleError(
        'invalid-situation-deck',
        `Situation ${situation.id} has invalid slots or attribute weights.`,
      );
    }

    if (situation.role === 'goalie') {
      goalieSituations += 1;
    } else {
      skaterSituations += 1;
    }
  }

  if (goalieSituations < 1 || skaterSituations < BATTLE_ROUND_COUNT - 1) {
    throw new BattleRuleError(
      'invalid-situation-deck',
      `A battle deck requires at least one goalie and ${BATTLE_ROUND_COUNT - 1} skater situations.`,
    );
  }
}

export function selectBattleSituations(
  deck: readonly BattleSituation[],
  seed: string | number,
): readonly BattleSituation[] {
  validateSituationDeck(deck);

  const goalies = deck.filter((situation) => situation.role === 'goalie');
  const skaters = deck.filter((situation) => situation.role === 'skater');
  const goalie = shuffleSeeded(goalies, `${seed}:goalie`)[0];
  const selectedSkaters = shuffleSeeded(skaters, `${seed}:skaters`).slice(
    0,
    BATTLE_ROUND_COUNT - 1,
  );

  return shuffleSeeded([goalie, ...selectedSkaters], `${seed}:round-order`);
}
