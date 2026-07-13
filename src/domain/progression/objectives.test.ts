import { describe, expect, it } from 'vitest';

import {
  AI_TIER_THRESHOLDS,
  applyProgressionEvent,
  chooseRivalryRoadCard,
  createInitialProgressionState,
  getDailyObjectiveDefinitions,
  getDailySpotlightMode,
  getLocalDayKey,
  getLocalDayOrdinal,
  getLocalWeekKey,
  getProgressionView,
  refreshProgressionPeriods,
  RIVALRY_REWARD_CARDS,
  RIVALRY_REWARD_CARD_IDS,
  type MatchOutcome,
  type ObjectiveEvent,
  type ProgressionState,
} from '.';
import type { AiDifficulty } from '../battle/types';
import type { GameMode } from '../lineups/types';

const sundayBeforeDst = new Date(2026, 2, 29, 1, 30);
const mondayAfterDst = new Date(2026, 2, 30, 1, 30);

function event(
  id: string,
  mode: GameMode,
  outcome: MatchOutcome = 'loss',
  difficulty: AiDifficulty = 'rookie',
): ObjectiveEvent {
  return {
    id,
    type: 'match-completed',
    matchId: `match-${id}`,
    mode,
    outcome,
    difficulty,
  };
}

function apply(
  state: ProgressionState,
  nextEvent: ObjectiveEvent,
  now = new Date(2026, 6, 13, 12),
): ProgressionState {
  return applyProgressionEvent(state, nextEvent, now).state;
}

function unlockCardChoice(now = new Date(2026, 6, 13, 12)): ProgressionState {
  let state = createInitialProgressionState(now);
  state = apply(state, event('nhl', 'nhl-circuit'), now);
  state = apply(state, event('pwhl', 'pwhl-circuit'), now);
  state = apply(state, event('open', 'open-ice', 'win', 'pro'), now);
  return state;
}

describe('local progression periods', () => {
  it('creates local calendar keys across month and year boundaries', () => {
    expect(getLocalDayKey(new Date(2026, 6, 31, 23, 59))).toBe('2026-07-31');
    expect(getLocalDayKey(new Date(2026, 7, 1, 0, 1))).toBe('2026-08-01');
    expect(getLocalDayKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(getLocalDayKey(new Date(2027, 0, 1, 0, 1))).toBe('2027-01-01');
  });

  it('uses Monday as the local week boundary, including across years', () => {
    expect(getLocalWeekKey(new Date(2026, 6, 13, 0, 1))).toBe('2026-07-13');
    expect(getLocalWeekKey(new Date(2026, 6, 19, 23, 59))).toBe('2026-07-13');
    expect(getLocalWeekKey(new Date(2026, 6, 20, 0, 1))).toBe('2026-07-20');
    expect(getLocalWeekKey(new Date(2027, 0, 1, 12))).toBe('2026-12-28');
    expect(getLocalWeekKey(new Date(2027, 0, 4, 12))).toBe('2027-01-04');
  });

  it('keeps calendar ordinals and week keys stable near a DST transition', () => {
    expect(getLocalDayOrdinal(mondayAfterDst) - getLocalDayOrdinal(sundayBeforeDst)).toBe(1);
    expect(getLocalWeekKey(sundayBeforeDst)).toBe('2026-03-23');
    expect(getLocalWeekKey(mondayAfterDst)).toBe('2026-03-30');
  });
});

describe('objective definitions and progression', () => {
  it('rotates the daily spotlight deterministically through all modes', () => {
    const dates = [0, 1, 2, 3].map(
      (offset) => new Date(2026, 6, 13 + offset, 12),
    );
    const modes = dates.map(getDailySpotlightMode);

    expect(new Set(modes.slice(0, 3)).size).toBe(3);
    expect(modes[3]).toBe(modes[0]);
    expect(getDailyObjectiveDefinitions(dates[0])).toMatchObject([
      { id: 'daily-match-complete', reward: { credits: 75 } },
      { id: 'daily-match-win', reward: { credits: 100 } },
      {
        id: 'daily-spotlight',
        spotlightMode: modes[0],
        reward: { credits: 100 },
      },
    ]);
  });

  it('applies matching daily objectives and emits each reward exactly once', () => {
    const now = new Date(2026, 6, 13, 12);
    const spotlightMode = getDailySpotlightMode(now);
    const initial = createInitialProgressionState(now);
    const first = applyProgressionEvent(
      initial,
      event('daily-1', spotlightMode, 'win'),
      now,
    );
    const repeated = applyProgressionEvent(
      first.state,
      event('daily-1', spotlightMode, 'win'),
      now,
    );

    expect(first.state.daily.objectives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ objectiveId: 'daily-match-complete', completed: true }),
        expect.objectContaining({ objectiveId: 'daily-match-win', completed: true }),
        expect.objectContaining({ objectiveId: 'daily-spotlight', completed: true }),
      ]),
    );
    expect(
      first.grantedRewards
        .filter((reward) => reward.type === 'credits')
        .filter((reward) => reward.sourceId.startsWith('daily'))
        .reduce((sum, reward) => sum + reward.credits, 0),
    ).toBe(275);
    expect(repeated.status).toBe('already-processed');
    expect(repeated.grantedRewards).toEqual([]);
    expect(repeated.state).toEqual(first.state);

    const sameMatchWithNewEventId = applyProgressionEvent(
      first.state,
      { ...event('daily-2', spotlightMode, 'win'), matchId: 'match-daily-1' },
      now,
    );
    expect(sameMatchWithNewEventId.status).toBe('already-processed');
    expect(sameMatchWithNewEventId.state).toEqual(first.state);
  });

  it('requires five weekly matches and at least one in every mode', () => {
    const now = new Date(2026, 6, 13, 12);
    let state = createInitialProgressionState(now);
    for (let index = 0; index < 5; index += 1) {
      state = apply(state, event(`nhl-${index}`, 'nhl-circuit'), now);
    }

    expect(state.weekly.objective).toMatchObject({ current: 5, completed: false });
    state = apply(state, event('pwhl-weekly', 'pwhl-circuit'), now);
    expect(state.weekly.objective.completed).toBe(false);
    const completion = applyProgressionEvent(
      state,
      event('open-weekly', 'open-ice'),
      now,
    );

    expect(completion.state.weekly).toMatchObject({
      objective: { current: 5, completed: true },
      completedModes: ['nhl-circuit', 'pwhl-circuit', 'open-ice'],
    });
    expect(completion.grantedRewards).toContainEqual(
      expect.objectContaining({
        type: 'credits',
        sourceId: 'weekly-circuit-tour',
        credits: 350,
      }),
    );
  });

  it('resets expired periods while preserving permanent ledgers and road state', () => {
    const sunday = new Date(2026, 6, 19, 23, 30);
    const monday = new Date(2026, 6, 20, 0, 30);
    const progressed = apply(
      createInitialProgressionState(sunday),
      event('period', 'nhl-circuit'),
      sunday,
    );
    const refreshed = refreshProgressionPeriods(progressed, monday);

    expect(refreshed.daily.periodKey).toBe('2026-07-20');
    expect(refreshed.daily.objectives.every((item) => item.current === 0)).toBe(true);
    expect(refreshed.weekly.periodKey).toBe('2026-07-20');
    expect(refreshed.weekly.objective.current).toBe(0);
    expect(refreshed.processedEventIds).toEqual(['period']);
    expect(refreshed.processedMatchIds).toEqual(['match-period']);
    expect(refreshed.rewardHistory.length).toBeGreaterThan(0);
    expect(refreshed.rivalryRoad.completedStepIds).toEqual(['nhl-circuit-complete']);
  });
});

describe('Rivalry Road', () => {
  it('only advances the current step and never counts earlier matches retroactively', () => {
    const now = new Date(2026, 6, 13, 12);
    let state = createInitialProgressionState(now);
    state = apply(state, event('early-pwhl', 'pwhl-circuit'), now);
    expect(state.rivalryRoad.currentStepIndex).toBe(0);
    state = apply(state, event('nhl-step', 'nhl-circuit'), now);
    expect(state.rivalryRoad.currentStepIndex).toBe(1);
    expect(state.rivalryRoad.completedStepIds).toEqual(['nhl-circuit-complete']);
    expect(
      state.rewardHistory.filter(
        (reward) => reward.sourceId === 'nhl-circuit-complete',
      ),
    ).toHaveLength(1);

    state = apply(state, event('other-nhl', 'nhl-circuit'), now);
    expect(state.rivalryRoad.currentStepIndex).toBe(1);
    state = apply(state, event('pwhl-step', 'pwhl-circuit'), now);
    state = apply(state, event('rookie-open', 'open-ice', 'win', 'rookie'), now);
    state = apply(state, event('pro-loss', 'open-ice', 'loss', 'pro'), now);
    expect(state.rivalryRoad.currentStepIndex).toBe(2);

    const completed = applyProgressionEvent(
      state,
      event('pro-win', 'open-ice', 'win', 'pro'),
      now,
    );
    expect(completed.state.rivalryRoad).toMatchObject({
      status: 'choice-pending',
      currentStepIndex: 3,
      completedStepIds: [
        'nhl-circuit-complete',
        'pwhl-circuit-complete',
        'open-ice-pro-win',
      ],
    });
    expect(completed.grantedRewards).toContainEqual(
      expect.objectContaining({
        type: 'card-choice',
        cardIds: RIVALRY_REWARD_CARD_IDS,
      }),
    );
  });

  it('allows exactly one of the two fixed equal-value cards', () => {
    const now = new Date(2026, 6, 13, 12);
    const pending = unlockCardChoice(now);
    const invalid = chooseRivalryRoadCard(pending, 'not-a-card', 'invalid', now);
    const selected = chooseRivalryRoadCard(
      pending,
      RIVALRY_REWARD_CARD_IDS[0],
      'choice-1',
      now,
    );
    const repeated = chooseRivalryRoadCard(
      selected.state,
      RIVALRY_REWARD_CARD_IDS[0],
      'choice-1',
      now,
    );
    const alternative = chooseRivalryRoadCard(
      selected.state,
      RIVALRY_REWARD_CARD_IDS[1],
      'choice-2',
      now,
    );

    expect(invalid.status).toBe('invalid-card');
    expect(selected.status).toBe('applied');
    expect(selected.state.rivalryRoad).toMatchObject({
      status: 'complete',
      selectedCardId: RIVALRY_REWARD_CARD_IDS[0],
    });
    expect(selected.grantedRewards).toEqual([
      expect.objectContaining({ type: 'card', cardId: RIVALRY_REWARD_CARD_IDS[0] }),
    ]);
    expect(repeated.status).toBe('already-processed');
    expect(repeated.grantedRewards).toEqual([]);
    expect(alternative.status).toBe('not-ready');
    expect(
      selected.state.rewardHistory.filter((reward) => reward.type === 'card'),
    ).toHaveLength(1);
    expect(RIVALRY_REWARD_CARDS).toEqual([
      expect.objectContaining({ playerName: 'Kirill Kaprizov', overall: 94, position: 'LW' }),
      expect.objectContaining({
        playerName: 'Kendall Coyne Schofield',
        overall: 94,
        position: 'LW',
      }),
    ]);
  });
});

describe('progression view and balance constants', () => {
  it('normalizes expired objectives for display without losing saved history', () => {
    const firstDay = new Date(2026, 6, 13, 12);
    const nextDay = new Date(2026, 6, 14, 12);
    const state = apply(
      createInitialProgressionState(firstDay),
      event('view', 'nhl-circuit'),
      firstDay,
    );
    const view = getProgressionView(state, nextDay);

    expect(view.daily).toHaveLength(3);
    expect(view.daily.every(({ progress }) => progress.current === 0)).toBe(true);
    expect(view.normalizedState.rewardHistory).toEqual(state.rewardHistory);
    expect(view.rivalryRoad.currentStep?.id).toBe('pwhl-circuit-complete');
  });

  it('publishes the approved AI tier thresholds', () => {
    expect(AI_TIER_THRESHOLDS).toEqual([
      { id: 'rookie', minimumCollectionScore: 0 },
      { id: 'pro', minimumCollectionScore: 1_500 },
      { id: 'elite', minimumCollectionScore: 3_500 },
    ]);
  });
});
