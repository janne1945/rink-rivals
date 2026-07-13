import { resolveCard, type CardCatalog } from "../domain/cards";
import {
  getProgressionView,
  RIVALRY_REWARD_CARD_IDS,
  RIVALRY_ROAD_STEPS,
  type ObjectiveView,
  type ProgressionState,
} from "../domain/progression";
import type {
  GoalsSummaryViewModel,
  ObjectiveViewModel,
  RivalryRewardChoiceViewModel,
  RivalryRoadStepViewModel,
} from "../features/objectives/viewModels";

const MODE_LABELS = {
  "nhl-circuit": "NHL Circuit",
  "pwhl-circuit": "PWHL Circuit",
  "open-ice": "Open Ice",
} as const;

function objectiveModel(view: ObjectiveView): ObjectiveViewModel {
  const spotlight = view.definition.spotlightMode;
  return {
    id: `${view.progress.periodKey}:${view.definition.id}`,
    title: spotlight ? `${MODE_LABELS[spotlight]} spotlight` : view.definition.title,
    description: spotlight ? `Complete one ${MODE_LABELS[spotlight]} match.` : view.definition.description,
    progress: view.progress.current,
    target: view.progress.target,
    rewardCredits: view.definition.reward.credits,
    completed: view.progress.completed,
  };
}

function rivalryModels(view: ReturnType<typeof getProgressionView>): RivalryRoadStepViewModel[] {
  return RIVALRY_ROAD_STEPS.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    rewardLabel: step.reward.type === "credits" ? `+${step.reward.credits} Credits` : "Choose one 94 OVR Featured card",
    status: view.rivalryRoad.completedStepIds.includes(step.id)
      ? "completed"
      : view.rivalryRoad.currentStep?.id === step.id
        ? "active"
        : "locked",
  }));
}

function rewardChoiceModel(
  view: ReturnType<typeof getProgressionView>,
  catalog: CardCatalog,
  isSubmitting: boolean,
  errorMessage?: string,
): RivalryRewardChoiceViewModel | undefined {
  if (view.rivalryRoad.status === "in-progress") return undefined;
  const cards = RIVALRY_REWARD_CARD_IDS.flatMap((cardId) => {
    const resolved = resolveCard(catalog, cardId);
    return resolved ? [resolved] : [];
  });
  return {
    cards,
    claimedCardId: view.rivalryRoad.selectedCardId,
    isSubmitting,
    errorMessage,
  };
}

export interface ProgressionScreenModels {
  readonly normalizedState: ProgressionState;
  readonly dailyObjectives: readonly ObjectiveViewModel[];
  readonly weeklyObjective: ObjectiveViewModel;
  readonly rivalrySteps: readonly RivalryRoadStepViewModel[];
  readonly goalsSummary: GoalsSummaryViewModel;
  readonly rewardChoice?: RivalryRewardChoiceViewModel;
  readonly dailyPeriodLabel: string;
  readonly weeklyPeriodLabel: string;
}

export function buildProgressionScreenModels(
  state: ProgressionState,
  catalog: CardCatalog,
  now: Date,
  options: { readonly isSubmitting?: boolean; readonly errorMessage?: string } = {},
): ProgressionScreenModels {
  const view = getProgressionView(state, now);
  const dailyObjectives = view.daily.map(objectiveModel);
  const weeklyObjective = objectiveModel(view.weekly);
  const rivalrySteps = rivalryModels(view);
  const nextRivalryStep = view.rivalryRoad.status === "choice-pending"
    ? {
        id: "rivalry-card-choice",
        title: "Choose your featured star",
        description: "Select one Rivalry Series reward.",
        rewardLabel: "94 OVR Featured card",
        status: "active" as const,
      }
    : rivalrySteps.find((step) => step.status === "active");

  return {
    normalizedState: view.normalizedState,
    dailyObjectives,
    weeklyObjective,
    rivalrySteps,
    goalsSummary: { dailyObjectives, weeklyObjective, nextRivalryStep },
    rewardChoice: rewardChoiceModel(view, catalog, Boolean(options.isSubmitting), options.errorMessage),
    dailyPeriodLabel: `Local day · ${view.normalizedState.daily.periodKey}`,
    weeklyPeriodLabel: `Week of ${view.normalizedState.weekly.periodKey}`,
  };
}
