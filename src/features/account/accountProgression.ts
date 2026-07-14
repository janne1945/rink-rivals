import {
  createInitialProgressionState,
  getUtcDayKey,
  getUtcWeekKey,
  RIVALRY_REWARD_CARD_IDS,
  RIVALRY_ROAD_STEP_IDS,
  type ProgressionState,
  type RivalryRewardCardId,
  type RivalryRoadStatus,
  type RivalryRoadStepId,
} from "../../domain/progression";
import type { AccountSnapshot } from "./types";

export function progressionFromAccount(account: AccountSnapshot, now: Date): ProgressionState {
  const initial = createInitialProgressionState(now);
  const dayKey = getUtcDayKey(now);
  const weekKey = getUtcWeekKey(now);
  const rows = account.objectives;
  const daily = initial.daily.objectives.map((progress) => {
    const row = rows.find((item) => item.periodKey === dayKey && item.objectiveId === progress.objectiveId);
    return row ? { ...progress, periodKey: dayKey, current: row.current, completed: Boolean(row.completedAt), completedAt: row.completedAt ?? undefined } : { ...progress, periodKey: dayKey };
  });
  const weeklyRow = rows.find((item) => item.periodKey === weekKey && item.objectiveId === "weekly-circuit-tour");
  const validStepIds = account.rivalryRoad.completedStepIds.filter(
    (id): id is RivalryRoadStepId => RIVALRY_ROAD_STEP_IDS.includes(id as RivalryRoadStepId),
  );
  const selectedCardId = RIVALRY_REWARD_CARD_IDS.includes(account.rivalryRoad.selectedCardId as RivalryRewardCardId)
    ? account.rivalryRoad.selectedCardId as RivalryRewardCardId
    : undefined;
  const currentStepIndex = Math.min(3, Math.max(0, account.rivalryRoad.currentStepIndex)) as 0 | 1 | 2 | 3;
  const status = account.rivalryRoad.status as RivalryRoadStatus;

  return {
    ...initial,
    daily: { periodKey: dayKey, objectives: daily },
    weekly: weeklyRow ? {
      periodKey: weekKey,
      objective: {
        ...initial.weekly.objective, periodKey: weekKey,
        current: weeklyRow.current,
        completed: Boolean(weeklyRow.completedAt),
        completedAt: weeklyRow.completedAt ?? undefined,
      },
      completedModes: weeklyRow.completedModes.filter((mode): mode is "nhl-circuit" | "pwhl-circuit" | "open-ice" =>
        ["nhl-circuit", "pwhl-circuit", "open-ice"].includes(mode)),
    } : { ...initial.weekly, periodKey: weekKey, objective: { ...initial.weekly.objective, periodKey: weekKey } },
    rivalryRoad: { status, currentStepIndex, completedStepIds: validStepIds, selectedCardId },
  };
}
