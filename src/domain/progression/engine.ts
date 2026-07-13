import { GAME_MODES } from '../lineups/types';
import {
  createDailyProgress,
  createWeeklyProgress,
  getDailyObjectiveDefinitions,
  WEEKLY_OBJECTIVE,
} from './objectives';
import { getLocalDayKey, getLocalWeekKey } from './periods';
import {
  matchesRivalryRoadStep,
  RIVALRY_REWARD_CARDS,
  RIVALRY_ROAD_STEPS,
} from './rivalryRoad';
import {
  RIVALRY_REWARD_CARD_IDS,
  type CreditProgressionReward,
  type ObjectiveDefinition,
  type ObjectiveEvent,
  type ObjectiveProgress,
  type ProgressionApplicationResult,
  type ProgressionReward,
  type ProgressionState,
  type ProgressionView,
  type RivalryCardChoiceResult,
  type RivalryRewardCardId,
} from './types';

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Progression events require a valid date.');
  }
}

function assertValidEvent(event: ObjectiveEvent): void {
  if (event.id.trim().length === 0 || event.matchId.trim().length === 0) {
    throw new TypeError('Progression events require non-empty event and match ids.');
  }
  if (!GAME_MODES.includes(event.mode)) {
    throw new TypeError(`Invalid progression event mode: ${event.mode}.`);
  }
  if (!['win', 'draw', 'loss'].includes(event.outcome)) {
    throw new TypeError(`Invalid progression event outcome: ${event.outcome}.`);
  }
  if (!['rookie', 'pro', 'elite'].includes(event.difficulty)) {
    throw new TypeError(`Invalid progression event difficulty: ${event.difficulty}.`);
  }
}

export function createInitialProgressionState(
  now = new Date(),
): ProgressionState {
  assertValidDate(now);
  return {
    daily: createDailyProgress(now),
    weekly: createWeeklyProgress(now),
    rivalryRoad: {
      status: 'in-progress',
      currentStepIndex: 0,
      completedStepIds: [],
    },
    processedEventIds: [],
    processedMatchIds: [],
    rewardHistory: [],
  };
}

export function refreshProgressionPeriods(
  state: ProgressionState,
  now = new Date(),
): ProgressionState {
  assertValidDate(now);
  const daily =
    state.daily.periodKey === getLocalDayKey(now)
      ? state.daily
      : createDailyProgress(now);
  const weekly =
    state.weekly.periodKey === getLocalWeekKey(now)
      ? state.weekly
      : createWeeklyProgress(now);

  if (daily === state.daily && weekly === state.weekly) return state;
  return { ...state, daily, weekly };
}

function rewardExists(state: ProgressionState, rewardId: string): boolean {
  return state.rewardHistory.some((reward) => reward.id === rewardId);
}

function completeObjective(
  state: ProgressionState,
  progress: ObjectiveProgress,
  definition: ObjectiveDefinition,
  event: ObjectiveEvent,
  now: Date,
  nextCurrent: number,
): {
  progress: ObjectiveProgress;
  reward?: CreditProgressionReward;
} {
  const current = Math.min(definition.target, nextCurrent);
  if (progress.completed || current < definition.target) {
    return { progress: { ...progress, current } };
  }

  const rewardId = `${definition.id}:${progress.periodKey}`;
  const reward: CreditProgressionReward = {
    id: rewardId,
    type: 'credits',
    sourceId: definition.id,
    eventId: event.id,
    grantedAt: now.toISOString(),
    credits: definition.reward.credits,
  };
  return {
    progress: {
      ...progress,
      current,
      completed: true,
      completedAt: now.toISOString(),
      rewardId,
    },
    reward: rewardExists(state, rewardId) ? undefined : reward,
  };
}

function applyDailyObjectives(
  state: ProgressionState,
  event: ObjectiveEvent,
  now: Date,
): { daily: ProgressionState['daily']; rewards: ProgressionReward[] } {
  const definitions = getDailyObjectiveDefinitions(now);
  const definitionsById = new Map(definitions.map((item) => [item.id, item]));
  const rewards: ProgressionReward[] = [];
  const objectives = state.daily.objectives.map((progress) => {
    const definition = definitionsById.get(progress.objectiveId);
    if (!definition) return progress;
    const matches =
      definition.id === 'daily-match-complete' ||
      (definition.id === 'daily-match-win' && event.outcome === 'win') ||
      (definition.id === 'daily-spotlight' && event.mode === definition.spotlightMode);
    if (!matches) return progress;

    const result = completeObjective(
      state,
      progress,
      definition,
      event,
      now,
      progress.current + 1,
    );
    if (result.reward) rewards.push(result.reward);
    return result.progress;
  });

  return { daily: { ...state.daily, objectives }, rewards };
}

function applyWeeklyObjective(
  state: ProgressionState,
  event: ObjectiveEvent,
  now: Date,
): { weekly: ProgressionState['weekly']; rewards: ProgressionReward[] } {
  const completedModes = state.weekly.completedModes.includes(event.mode)
    ? state.weekly.completedModes
    : [...state.weekly.completedModes, event.mode];
  const current = Math.min(
    WEEKLY_OBJECTIVE.target,
    state.weekly.objective.current + 1,
  );
  const hasEveryMode = GAME_MODES.every((mode) => completedModes.includes(mode));
  if (!hasEveryMode) {
    return {
      weekly: {
        ...state.weekly,
        completedModes,
        objective: { ...state.weekly.objective, current },
      },
      rewards: [],
    };
  }

  const result = completeObjective(
    state,
    state.weekly.objective,
    WEEKLY_OBJECTIVE,
    event,
    now,
    current,
  );
  return {
    weekly: { ...state.weekly, completedModes, objective: result.progress },
    rewards: result.reward ? [result.reward] : [],
  };
}

function applyRivalryRoad(
  state: ProgressionState,
  event: ObjectiveEvent,
  now: Date,
): {
  rivalryRoad: ProgressionState['rivalryRoad'];
  rewards: ProgressionReward[];
} {
  const road = state.rivalryRoad;
  if (
    road.status !== 'in-progress' ||
    !matchesRivalryRoadStep(road.currentStepIndex, event)
  ) {
    return { rivalryRoad: road, rewards: [] };
  }

  const step = RIVALRY_ROAD_STEPS[road.currentStepIndex];
  if (!step) return { rivalryRoad: road, rewards: [] };
  const nextStepIndex = (road.currentStepIndex + 1) as 1 | 2 | 3;
  const nextRoad = {
    ...road,
    status: nextStepIndex === 3 ? ('choice-pending' as const) : road.status,
    currentStepIndex: nextStepIndex,
    completedStepIds: [...road.completedStepIds, step.id],
  };
  const rewardId = `rivalry-road:${step.id}`;
  if (rewardExists(state, rewardId)) return { rivalryRoad: nextRoad, rewards: [] };

  const reward: ProgressionReward =
    step.reward.type === 'credits'
      ? {
          id: rewardId,
          type: 'credits',
          sourceId: step.id,
          eventId: event.id,
          grantedAt: now.toISOString(),
          credits: step.reward.credits,
        }
      : {
          id: rewardId,
          type: 'card-choice',
          sourceId: step.id,
          eventId: event.id,
          grantedAt: now.toISOString(),
          cardIds: [...step.reward.cardIds],
        };
  return { rivalryRoad: nextRoad, rewards: [reward] };
}

export function applyProgressionEvent(
  state: ProgressionState,
  event: ObjectiveEvent,
  now = new Date(),
): ProgressionApplicationResult {
  assertValidDate(now);
  assertValidEvent(event);
  const currentState = refreshProgressionPeriods(state, now);
  if (
    currentState.processedEventIds.includes(event.id) ||
    currentState.processedMatchIds.includes(event.matchId)
  ) {
    return {
      status: 'already-processed',
      state: currentState,
      grantedRewards: [],
    };
  }

  const dailyResult = applyDailyObjectives(currentState, event, now);
  const afterDaily = { ...currentState, daily: dailyResult.daily };
  const weeklyResult = applyWeeklyObjective(afterDaily, event, now);
  const afterWeekly = { ...afterDaily, weekly: weeklyResult.weekly };
  const rivalryResult = applyRivalryRoad(afterWeekly, event, now);
  const grantedRewards = [
    ...dailyResult.rewards,
    ...weeklyResult.rewards,
    ...rivalryResult.rewards,
  ];

  return {
    status: 'applied',
    state: {
      ...afterWeekly,
      rivalryRoad: rivalryResult.rivalryRoad,
      processedEventIds: [...afterWeekly.processedEventIds, event.id],
      processedMatchIds: [...afterWeekly.processedMatchIds, event.matchId],
      rewardHistory: [...afterWeekly.rewardHistory, ...grantedRewards],
    },
    grantedRewards,
  };
}

function isRivalryRewardCardId(cardId: string): cardId is RivalryRewardCardId {
  return RIVALRY_REWARD_CARD_IDS.some((candidate) => candidate === cardId);
}

export function chooseRivalryRoadCard(
  state: ProgressionState,
  cardId: string,
  eventId: string,
  now = new Date(),
): RivalryCardChoiceResult {
  assertValidDate(now);
  if (eventId.trim().length === 0) {
    throw new TypeError('Rivalry Road choices require a non-empty event id.');
  }
  if (state.processedEventIds.includes(eventId)) {
    return {
      status: 'already-processed',
      state,
      grantedRewards: [],
    };
  }
  if (!isRivalryRewardCardId(cardId)) {
    return { status: 'invalid-card', state, grantedRewards: [] };
  }
  if (state.rivalryRoad.status !== 'choice-pending') {
    return { status: 'not-ready', state, grantedRewards: [] };
  }

  const reward: ProgressionReward = {
    id: `rivalry-road-card:${cardId}`,
    type: 'card',
    sourceId: 'rivalry-road-card-choice',
    eventId,
    grantedAt: now.toISOString(),
    cardId,
  };
  const rewardIsNew = !rewardExists(state, reward.id);
  return {
    status: 'applied',
    state: {
      ...state,
      rivalryRoad: {
        ...state.rivalryRoad,
        status: 'complete',
        selectedCardId: cardId,
      },
      processedEventIds: [...state.processedEventIds, eventId],
      rewardHistory: rewardIsNew
        ? [...state.rewardHistory, reward]
        : state.rewardHistory,
    },
    grantedRewards: rewardIsNew ? [reward] : [],
  };
}

export function getProgressionView(
  state: ProgressionState,
  now = new Date(),
): ProgressionView {
  const normalizedState = refreshProgressionPeriods(state, now);
  const dailyDefinitions = getDailyObjectiveDefinitions(now);
  const dailyProgressById = new Map(
    normalizedState.daily.objectives.map((progress) => [progress.objectiveId, progress]),
  );
  const daily = dailyDefinitions.flatMap((definition) => {
    const progress = dailyProgressById.get(definition.id);
    return progress ? [{ definition, progress }] : [];
  });
  const completedModes = normalizedState.weekly.completedModes;
  const missingModes = GAME_MODES.filter((mode) => !completedModes.includes(mode));
  const currentStep =
    normalizedState.rivalryRoad.status === 'in-progress'
      ? RIVALRY_ROAD_STEPS[normalizedState.rivalryRoad.currentStepIndex]
      : undefined;

  return {
    normalizedState,
    daily,
    weekly: {
      definition: WEEKLY_OBJECTIVE,
      progress: normalizedState.weekly.objective,
      completedModes,
      missingModes,
    },
    rivalryRoad: {
      status: normalizedState.rivalryRoad.status,
      currentStep,
      completedStepIds: normalizedState.rivalryRoad.completedStepIds,
      selectedCardId: normalizedState.rivalryRoad.selectedCardId,
      cardChoices: RIVALRY_REWARD_CARDS,
    },
  };
}
