import type { AiDifficulty } from '../battle/types';
import type { GameMode } from '../lineups/types';

export const OBJECTIVE_IDS = [
  'daily-match-complete',
  'daily-match-win',
  'daily-spotlight',
  'weekly-circuit-tour',
] as const;

export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];
export type ObjectiveCadence = 'daily' | 'weekly';
export type MatchOutcome = 'win' | 'draw' | 'loss';

export interface ObjectiveDefinition {
  readonly id: ObjectiveId;
  readonly cadence: ObjectiveCadence;
  readonly title: string;
  readonly description: string;
  readonly target: number;
  readonly reward: Readonly<{
    type: 'credits';
    credits: number;
  }>;
  readonly spotlightMode?: GameMode;
}

export interface ObjectiveProgress {
  readonly objectiveId: ObjectiveId;
  readonly periodKey: string;
  readonly current: number;
  readonly target: number;
  readonly completed: boolean;
  readonly completedAt?: string;
  readonly rewardId?: string;
}

export interface ObjectivePeriodProgress {
  readonly periodKey: string;
  readonly objectives: ObjectiveProgress[];
}

export interface WeeklyObjectivePeriodProgress {
  readonly periodKey: string;
  readonly objective: ObjectiveProgress;
  readonly completedModes: GameMode[];
}

export interface ObjectiveEvent {
  readonly id: string;
  readonly type: 'match-completed';
  readonly matchId: string;
  readonly mode: GameMode;
  readonly outcome: MatchOutcome;
  readonly difficulty: AiDifficulty;
}

export const RIVALRY_ROAD_STEP_IDS = [
  'nhl-circuit-complete',
  'pwhl-circuit-complete',
  'open-ice-pro-win',
] as const;

export type RivalryRoadStepId = (typeof RIVALRY_ROAD_STEP_IDS)[number];
export type RivalryRoadStatus = 'in-progress' | 'choice-pending' | 'complete';

export const RIVALRY_REWARD_CARD_IDS = [
  'nhl-kirill-kaprizov-rivalry-2026',
  'pwhl-kendall-coyne-schofield-rivalry-2026',
] as const;

export type RivalryRewardCardId = (typeof RIVALRY_REWARD_CARD_IDS)[number];

export interface RivalryRoadProgress {
  readonly status: RivalryRoadStatus;
  readonly currentStepIndex: 0 | 1 | 2 | 3;
  readonly completedStepIds: RivalryRoadStepId[];
  readonly selectedCardId?: RivalryRewardCardId;
}

interface ProgressionRewardBase {
  readonly id: string;
  readonly sourceId: ObjectiveId | RivalryRoadStepId | 'rivalry-road-card-choice';
  readonly eventId: string;
  readonly grantedAt: string;
}

export interface CreditProgressionReward extends ProgressionRewardBase {
  readonly type: 'credits';
  readonly credits: number;
}

export interface CardChoiceProgressionReward extends ProgressionRewardBase {
  readonly type: 'card-choice';
  readonly cardIds: RivalryRewardCardId[];
}

export interface CardProgressionReward extends ProgressionRewardBase {
  readonly type: 'card';
  readonly cardId: RivalryRewardCardId;
}

export type ProgressionReward =
  | CreditProgressionReward
  | CardChoiceProgressionReward
  | CardProgressionReward;

export interface ProgressionState {
  readonly daily: ObjectivePeriodProgress;
  readonly weekly: WeeklyObjectivePeriodProgress;
  readonly rivalryRoad: RivalryRoadProgress;
  readonly processedEventIds: string[];
  readonly processedMatchIds: string[];
  readonly rewardHistory: ProgressionReward[];
}

export type ProgressionApplicationStatus = 'applied' | 'already-processed';

export interface ProgressionApplicationResult {
  readonly status: ProgressionApplicationStatus;
  readonly state: ProgressionState;
  readonly grantedRewards: readonly ProgressionReward[];
}

export type RivalryCardChoiceStatus =
  | 'applied'
  | 'already-processed'
  | 'not-ready'
  | 'invalid-card';

export interface RivalryCardChoiceResult {
  readonly status: RivalryCardChoiceStatus;
  readonly state: ProgressionState;
  readonly grantedRewards: readonly ProgressionReward[];
}

export interface RivalryRoadStepDefinition {
  readonly id: RivalryRoadStepId;
  readonly title: string;
  readonly description: string;
  readonly reward:
    | Readonly<{ type: 'credits'; credits: number }>
    | Readonly<{ type: 'card-choice'; cardIds: readonly RivalryRewardCardId[] }>;
}

export interface RivalryRewardCardDefinition {
  readonly cardId: RivalryRewardCardId;
  readonly playerName: string;
  readonly league: 'NHL' | 'PWHL';
  readonly position: 'LW';
  readonly overall: 94;
  readonly setName: 'Rivalry Series';
}

export interface ObjectiveView {
  readonly definition: ObjectiveDefinition;
  readonly progress: ObjectiveProgress;
}

export interface ProgressionView {
  readonly normalizedState: ProgressionState;
  readonly daily: readonly ObjectiveView[];
  readonly weekly: ObjectiveView & {
    readonly completedModes: readonly GameMode[];
    readonly missingModes: readonly GameMode[];
  };
  readonly rivalryRoad: {
    readonly status: RivalryRoadStatus;
    readonly currentStep?: RivalryRoadStepDefinition;
    readonly completedStepIds: readonly RivalryRoadStepId[];
    readonly selectedCardId?: RivalryRewardCardId;
    readonly cardChoices: readonly RivalryRewardCardDefinition[];
  };
}
