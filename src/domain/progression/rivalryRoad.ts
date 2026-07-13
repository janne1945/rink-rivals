import type { ObjectiveEvent, RivalryRoadStepDefinition } from './types';
import { RIVALRY_REWARD_CARD_IDS } from './types';

export const RIVALRY_ROAD_STEPS: readonly RivalryRoadStepDefinition[] = [
  {
    id: 'nhl-circuit-complete',
    title: 'NHL Circuit debut',
    description: 'Complete an NHL Circuit match.',
    reward: { type: 'credits', credits: 150 },
  },
  {
    id: 'pwhl-circuit-complete',
    title: 'PWHL Circuit debut',
    description: 'Complete a PWHL Circuit match.',
    reward: { type: 'credits', credits: 150 },
  },
  {
    id: 'open-ice-pro-win',
    title: 'Open Ice statement',
    description: 'Win an Open Ice match on Pro or Elite.',
    reward: { type: 'card-choice', cardIds: RIVALRY_REWARD_CARD_IDS },
  },
];

export const RIVALRY_REWARD_CARDS = [
  {
    cardId: 'nhl-kirill-kaprizov-rivalry-2026',
    playerName: 'Kirill Kaprizov',
    league: 'NHL',
    position: 'LW',
    overall: 94,
    setName: 'Rivalry Series',
  },
  {
    cardId: 'pwhl-kendall-coyne-schofield-rivalry-2026',
    playerName: 'Kendall Coyne Schofield',
    league: 'PWHL',
    position: 'LW',
    overall: 94,
    setName: 'Rivalry Series',
  },
] as const;

export function matchesRivalryRoadStep(
  stepIndex: number,
  event: ObjectiveEvent,
): boolean {
  if (stepIndex === 0) return event.mode === 'nhl-circuit';
  if (stepIndex === 1) return event.mode === 'pwhl-circuit';
  if (stepIndex === 2) {
    return (
      event.mode === 'open-ice' &&
      event.outcome === 'win' &&
      (event.difficulty === 'pro' || event.difficulty === 'elite')
    );
  }
  return false;
}
