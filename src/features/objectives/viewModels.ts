import type { ResolvedCard } from "../../domain/cards";

export interface ObjectiveViewModel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly progress: number;
  readonly target: number;
  readonly rewardCredits: number;
  readonly completed: boolean;
}

export type RivalryStepStatus = "locked" | "active" | "completed";

export interface RivalryRoadStepViewModel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rewardLabel: string;
  readonly status: RivalryStepStatus;
}

export interface RivalryRewardChoiceViewModel {
  readonly cards: readonly ResolvedCard[];
  readonly claimedCardId?: string;
  readonly isSubmitting?: boolean;
  readonly errorMessage?: string;
}

export interface GoalsSummaryViewModel {
  readonly dailyObjectives: readonly ObjectiveViewModel[];
  readonly weeklyObjective: ObjectiveViewModel;
  readonly nextRivalryStep?: RivalryRoadStepViewModel;
}
