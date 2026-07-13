import type { ResolvedLineupCard } from '../lineups/types';
import { calculateBaseScore } from './engine';
import { randomIndex } from './rng';
import type { AiDifficulty, BattleSituation } from './types';

/**
 * Versioned mirror of the match-ticket situations issued by the server.
 * Keeping this public lets diagnostics exercise the production round shape
 * without making the local battle engine depend on a network transport.
 */
export const AUTHORITATIVE_MATCH_POLICY_VERSION = 'server-authority-v1' as const;

export const AUTHORITATIVE_MATCH_SITUATIONS: readonly BattleSituation[] = [
  {
    id: 'transition-rush',
    name: 'Transition Rush',
    description: 'Attack with pace and finish off the rush.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW'],
    weights: { speed: 0.3, shooting: 0.3, puckControl: 0.2, hockeyIq: 0.1, clutch: 0.1 },
  },
  {
    id: 'cycle-pressure',
    name: 'Cycle Pressure',
    description: 'Hold possession and create through sustained pressure.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW'],
    weights: { passing: 0.25, puckControl: 0.3, physicality: 0.15, hockeyIq: 0.2, clutch: 0.1 },
  },
  {
    id: 'blue-line-command',
    name: 'Blue Line Command',
    description: 'Control the point with a complete defender.',
    role: 'skater',
    eligibleSlots: ['LD', 'RD'],
    weights: { defense: 0.3, passing: 0.2, shooting: 0.15, physicality: 0.15, hockeyIq: 0.2 },
  },
  {
    id: 'late-game-shift',
    name: 'Late Game Shift',
    description: 'Make the decisive play under late-game pressure.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW', 'LD', 'RD'],
    weights: { clutch: 0.3, hockeyIq: 0.25, speed: 0.15, puckControl: 0.15, defense: 0.15 },
  },
  {
    id: 'crease-under-fire',
    name: 'Crease Under Fire',
    description: 'Own the crease during a final barrage.',
    role: 'goalie',
    eligibleSlots: ['G'],
    weights: { reflexes: 0.2, positioning: 0.2, glove: 0.1, blocker: 0.1, reboundControl: 0.15, consistency: 0.15, clutch: 0.1 },
  },
];

export const AUTHORITATIVE_AI_SELECTION_POLICY: Readonly<Record<AiDifficulty, string>> = {
  rookie: 'weakest-eligible',
  pro: 'seeded-eligible',
  elite: 'strongest-eligible',
};

export const AUTHORITATIVE_SCORE_VARIANCE: Readonly<{
  player: number;
  opponent: Readonly<Record<AiDifficulty, number>>;
}> = {
  player: 2.5,
  opponent: { rookie: 3, pro: 2.5, elite: 2 },
};

/** Mirrors the server's weakest/seeded/strongest eligible-card tier policy. */
export function selectAuthoritativeOpponentCard(
  candidates: readonly ResolvedLineupCard[],
  situation: BattleSituation,
  difficulty: AiDifficulty,
  seed: string | number,
): ResolvedLineupCard {
  if (candidates.length === 0) {
    throw new Error(`No authoritative opponent card is eligible for ${situation.id}.`);
  }

  const scored = [...candidates]
    .map((candidate) => ({ candidate, score: calculateBaseScore(candidate.card, situation) }))
    .sort((left, right) => left.score - right.score || left.candidate.card.id.localeCompare(right.candidate.card.id));

  if (difficulty === 'rookie') return scored[0].candidate;
  if (difficulty === 'elite') return scored[scored.length - 1].candidate;
  return scored[randomIndex(`${seed}:${situation.id}:pro-choice`, scored.length)].candidate;
}
