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
    id: 'skater-speed',
    name: 'Speed',
    description: 'Higher Speed wins this round.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW'],
    attribute: 'speed',
  },
  {
    id: 'skater-shooting',
    name: 'Shooting',
    description: 'Higher Shooting wins this round.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW'],
    attribute: 'shooting',
  },
  {
    id: 'skater-playmaking',
    name: 'Playmaking',
    description: 'Higher Passing wins this round.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    attribute: 'passing',
  },
  {
    id: 'skater-defense',
    name: 'Defense',
    description: 'Higher Defense wins this round.',
    role: 'skater',
    eligibleSlots: ['LD', 'RD'],
    attribute: 'defense',
  },
  {
    id: 'skater-clutch',
    name: 'Clutch',
    description: 'Higher Clutch wins this round.',
    role: 'skater',
    eligibleSlots: SKATER_SLOTS,
    attribute: 'clutch',
  },
  {
    id: 'goalie-positioning',
    name: 'Positioning',
    description: 'Higher Positioning wins this round.',
    role: 'goalie',
    eligibleSlots: ['G'],
    attribute: 'positioning',
  },
  {
    id: 'goalie-reflexes',
    name: 'Reflexes',
    description: 'Higher Reflexes wins this round.',
    role: 'goalie',
    eligibleSlots: ['G'],
    attribute: 'reflexes',
  },
  {
    id: 'goalie-rebound-control',
    name: 'Rebound Control',
    description: 'Higher Rebound Control wins this round.',
    role: 'goalie',
    eligibleSlots: ['G'],
    attribute: 'reboundControl',
  },
  {
    id: 'goalie-puck-handling',
    name: 'Puck Handling',
    description: 'Higher Puck Handling wins this round.',
    role: 'goalie',
    eligibleSlots: ['G'],
    attribute: 'puckHandling',
  },
  {
    id: 'goalie-clutch',
    name: 'Clutch',
    description: 'Higher Clutch wins this round.',
    role: 'goalie',
    eligibleSlots: ['G'],
    attribute: 'clutch',
  },
];

function hasKnownAttribute(situation: BattleSituation): boolean {
  const skaterKeys = new Set([
    'speed',
    'shooting',
    'passing',
    'puckControl',
    'defense',
    'physicality',
    'hockeyIq',
    'clutch',
  ]);
  const goalieKeys = new Set([
    'reflexes',
    'positioning',
    'glove',
    'blocker',
    'reboundControl',
    'puckHandling',
    'consistency',
    'clutch',
  ]);
  const allowed: ReadonlySet<string> = situation.role === 'skater' ? skaterKeys : goalieKeys;
  return allowed.has(situation.attribute);
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
    const categoryIsValid = hasKnownAttribute(situation);

    if (!slotsAreValid || !categoryIsValid) {
      throw new BattleRuleError(
        'invalid-situation-deck',
        `Category ${situation.id} has invalid slots or a missing visible attribute.`,
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

export function validateSituationSequence(sequence: readonly BattleSituation[]): void {
  if (sequence.length !== BATTLE_ROUND_COUNT) {
    throw new BattleRuleError(
      'invalid-situation-deck',
      `A situation sequence requires exactly ${BATTLE_ROUND_COUNT} ordered rounds.`,
    );
  }
  validateSituationDeck(sequence);
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
