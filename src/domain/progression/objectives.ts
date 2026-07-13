import { GAME_MODES, type GameMode } from '../lineups/types';
import { getUtcDayKey, getUtcDayOrdinal, getUtcWeekKey } from './periods';
import type {
  ObjectiveDefinition,
  ObjectivePeriodProgress,
  ObjectiveProgress,
  WeeklyObjectivePeriodProgress,
} from './types';

const DAILY_MATCH_COMPLETE: ObjectiveDefinition = {
  id: 'daily-match-complete',
  cadence: 'daily',
  title: 'Drop the puck',
  description: 'Complete one match.',
  target: 1,
  reward: { type: 'credits', credits: 75 },
};

const DAILY_MATCH_WIN: ObjectiveDefinition = {
  id: 'daily-match-win',
  cadence: 'daily',
  title: 'Earn the win',
  description: 'Win one match.',
  target: 1,
  reward: { type: 'credits', credits: 100 },
};

export const WEEKLY_OBJECTIVE: ObjectiveDefinition = {
  id: 'weekly-circuit-tour',
  cadence: 'weekly',
  title: 'Circuit tour',
  description: 'Complete five matches, including one in every mode.',
  target: 5,
  reward: { type: 'credits', credits: 350 },
};

export function getDailySpotlightMode(date: Date): GameMode {
  return GAME_MODES[getUtcDayOrdinal(date) % GAME_MODES.length];
}

export function getDailyObjectiveDefinitions(
  date: Date,
): readonly ObjectiveDefinition[] {
  const spotlightMode = getDailySpotlightMode(date);
  const spotlight: ObjectiveDefinition = {
    id: 'daily-spotlight',
    cadence: 'daily',
    title: 'Daily spotlight',
    description: `Complete one ${spotlightMode} match.`,
    target: 1,
    reward: { type: 'credits', credits: 100 },
    spotlightMode,
  };

  return [DAILY_MATCH_COMPLETE, DAILY_MATCH_WIN, spotlight];
}

function createObjectiveProgress(
  definition: ObjectiveDefinition,
  periodKey: string,
): ObjectiveProgress {
  return {
    objectiveId: definition.id,
    periodKey,
    current: 0,
    target: definition.target,
    completed: false,
  };
}

export function createDailyProgress(date: Date): ObjectivePeriodProgress {
  const periodKey = getUtcDayKey(date);
  return {
    periodKey,
    objectives: getDailyObjectiveDefinitions(date).map((definition) =>
      createObjectiveProgress(definition, periodKey),
    ),
  };
}

export function createWeeklyProgress(date: Date): WeeklyObjectivePeriodProgress {
  const periodKey = getUtcWeekKey(date);
  return {
    periodKey,
    objective: createObjectiveProgress(WEEKLY_OBJECTIVE, periodKey),
    completedModes: [],
  };
}
