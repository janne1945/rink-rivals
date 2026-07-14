import type { ResolvedLineupCard } from '../lineups/types';
import { calculateCategoryValue } from './engine';
import { randomIndex } from './rng';
import type { AiDifficulty, BattleSituation } from './types';

/**
 * Versioned mirror of the match-ticket situations issued by the server.
 * Keeping this public lets diagnostics exercise the production round shape
 * without making the local battle engine depend on a network transport.
 */
export const AUTHORITATIVE_MATCH_POLICY_VERSION = 'quartett-v2' as const;

export const AUTHORITATIVE_MATCH_SITUATIONS: readonly BattleSituation[] = [
  {
    id: 'skater-speed', name: 'Speed', description: 'Higher Speed wins this round.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW'],
    attribute: 'speed',
  },
  {
    id: 'skater-shooting', name: 'Shooting', description: 'Higher Shooting wins this round.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW'],
    attribute: 'shooting',
  },
  {
    id: 'skater-defense', name: 'Defense', description: 'Higher Defense wins this round.',
    role: 'skater',
    eligibleSlots: ['LD', 'RD'],
    attribute: 'defense',
  },
  {
    id: 'skater-clutch', name: 'Clutch', description: 'Higher Clutch wins this round.',
    role: 'skater',
    eligibleSlots: ['LW', 'C', 'RW', 'LD', 'RD'],
    attribute: 'clutch',
  },
  {
    id: 'goalie-reflexes', name: 'Reflexes', description: 'Higher Reflexes wins this round.',
    role: 'goalie',
    eligibleSlots: ['G'],
    attribute: 'reflexes',
  },
];

export const AUTHORITATIVE_AI_SELECTION_POLICY: Readonly<Record<AiDifficulty, string>> = {
  rookie: 'weakest-eligible',
  pro: 'seeded-eligible',
  elite: 'strongest-eligible',
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
    .map((candidate) => ({ candidate, score: calculateCategoryValue(candidate.card, situation) }))
    .sort((left, right) => left.score - right.score || left.candidate.card.id.localeCompare(right.candidate.card.id));

  if (difficulty === 'elite') return scored[scored.length - 1].candidate;
  if (difficulty === 'rookie') {
    const rookiePool = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
    return rookiePool[randomIndex(`${seed}:${situation.id}:rookie-choice`, rookiePool.length)].candidate;
  }
  const proPool = scored.slice(Math.floor(scored.length / 2));
  return proPool[randomIndex(`${seed}:${situation.id}:pro-choice`, proPool.length)].candidate;
}
