import { z } from "zod";

import { GAME_MODES, LINEUP_SLOTS } from "../../domain/lineups/types";
import {
  OBJECTIVE_IDS,
  RIVALRY_REWARD_CARD_IDS,
  RIVALRY_ROAD_STEP_IDS,
  type ProgressionState,
} from "../../domain/progression/types";
import { createInitialProgressionState } from "../../domain/progression/engine";
import {
  AI_TIER_THRESHOLDS,
  getUnlockedAiTierIds,
} from "../../domain/progression/unlocks";

export const LEGACY_SAVE_GAME_VERSION = 1 as const;
export const SAVE_GAME_VERSION = 2 as const;
export const DEFAULT_STARTING_CREDITS = 1_200;

const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const nonEmptyString = z.string().min(1);
const isoDateTime = z.string().datetime({ offset: true });

export const ownedCardSchema = z.object({
  cardId: nonEmptyString,
  quantity: positiveInteger,
  acquiredAt: isoDateTime,
}).strict();

export const purchaseRecordSchema = z.object({
  requestId: nonEmptyString,
  offerId: nonEmptyString,
  cardId: nonEmptyString,
  price: nonNegativeInteger,
  source: z.enum(["base_market", "event_shop"]),
  purchasedAt: isoDateTime,
}).strict();

export const matchRewardRecordSchema = z.object({
  rewardId: nonEmptyString,
  matchId: nonEmptyString,
  credits: nonNegativeInteger,
  grantedAt: isoDateTime,
}).strict();

export const gameModeSchema = z.enum(GAME_MODES);
export const lineupSlotSchema = z.enum(LINEUP_SLOTS);

const lineupSlotsSchema = z.object({
  LW: nonEmptyString,
  C: nonEmptyString,
  RW: nonEmptyString,
  LD: nonEmptyString,
  RD: nonEmptyString,
  G: nonEmptyString,
}).strict();

export const savedLineupSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  mode: gameModeSchema,
  slots: lineupSlotsSchema,
}).strict();

const activeLineupIdsSchema = z.object({
  "nhl-circuit": nonEmptyString.nullable(),
  "pwhl-circuit": nonEmptyString.nullable(),
  "open-ice": nonEmptyString.nullable(),
}).strict();

const settingsSchema = z.object({
  soundEnabled: z.boolean(),
  reducedMotion: z.boolean(),
}).strict();

const shopStateSchema = z.object({
  lastEventRotationKey: z.string().nullable(),
}).strict();

const saveGameCommonShape = {
  credits: nonNegativeInteger,
  collection: z.record(z.string(), ownedCardSchema),
  lineups: z.record(z.string(), savedLineupSchema),
  activeLineupIds: activeLineupIdsSchema,
  collectionScore: nonNegativeInteger,
  completedMatches: nonNegativeInteger,
  unlockedAiTierIds: z.array(nonEmptyString),
  shopState: shopStateSchema,
  purchaseHistory: z.array(purchaseRecordSchema),
  processedPurchaseIds: z.array(nonEmptyString),
  rewardHistory: z.array(matchRewardRecordSchema),
  processedRewardIds: z.array(nonEmptyString),
  settings: settingsSchema,
};

const saveGameV1BaseSchema = z.object({
  version: z.literal(LEGACY_SAVE_GAME_VERSION),
  ...saveGameCommonShape,
  completedObjectiveIds: z.array(nonEmptyString),
  eventProgress: z.record(z.string(), nonNegativeInteger),
}).strict();

function validateCommonSave(
  save: z.infer<typeof saveGameV1BaseSchema>,
  context: z.RefinementCtx,
): void {
  for (const [cardId, ownedCard] of Object.entries(save.collection)) {
    if (cardId !== ownedCard.cardId) {
      context.addIssue({
        code: "custom",
        path: ["collection", cardId, "cardId"],
        message: "Collection keys must match owned card ids.",
      });
    }
  }

  const lineupIds = new Set<string>();
  for (const [lineupId, lineup] of Object.entries(save.lineups)) {
    if (lineupId !== lineup.id || lineupIds.has(lineup.id)) {
      context.addIssue({
        code: "custom",
        path: ["lineups", lineupId],
        message: "Lineup keys must match unique lineup ids.",
      });
    }
    lineupIds.add(lineup.id);
  }

  for (const mode of GAME_MODES) {
    const activeId = save.activeLineupIds[mode];
    if (activeId === null) continue;
    const lineup = save.lineups[activeId];
    if (!lineup || lineup.mode !== mode) {
      context.addIssue({
        code: "custom",
        path: ["activeLineupIds", mode],
        message: "Active lineup ids must reference a lineup for the same mode.",
      });
    }
  }

  const uniquePurchaseIds = new Set(save.processedPurchaseIds);
  if (uniquePurchaseIds.size !== save.processedPurchaseIds.length) {
    context.addIssue({
      code: "custom",
      path: ["processedPurchaseIds"],
      message: "Processed purchase ids must be unique.",
    });
  }

  const purchaseHistoryIds = new Set<string>();
  for (const record of save.purchaseHistory) {
    if (
      purchaseHistoryIds.has(record.requestId) ||
      !uniquePurchaseIds.has(record.requestId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["purchaseHistory"],
        message: "Purchase history ids must be unique and marked as processed.",
      });
      break;
    }
    purchaseHistoryIds.add(record.requestId);
  }

  const uniqueRewardIds = new Set(save.processedRewardIds);
  if (uniqueRewardIds.size !== save.processedRewardIds.length) {
    context.addIssue({
      code: "custom",
      path: ["processedRewardIds"],
      message: "Processed reward ids must be unique.",
    });
  }

  const rewardHistoryIds = new Set<string>();
  const rewardedMatchIds = new Set<string>();
  for (const record of save.rewardHistory) {
    if (
      rewardHistoryIds.has(record.rewardId) ||
      rewardedMatchIds.has(record.matchId) ||
      !uniqueRewardIds.has(record.rewardId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["rewardHistory"],
        message: "Reward and match ids must be unique and rewards marked as processed.",
      });
      break;
    }
    rewardHistoryIds.add(record.rewardId);
    rewardedMatchIds.add(record.matchId);
  }
}

/** Legacy schema retained solely so existing local saves can be validated and migrated. */
export const saveGameV1Schema = saveGameV1BaseSchema.superRefine(validateCommonSave);
export type SaveGameV1 = z.infer<typeof saveGameV1Schema>;

export const aiDifficultySchema = z.enum(["rookie", "pro", "elite"]);
export type AiDifficulty = z.infer<typeof aiDifficultySchema>;

const objectiveIdSchema = z.enum(OBJECTIVE_IDS);
const rivalryRoadStepIdSchema = z.enum(RIVALRY_ROAD_STEP_IDS);
const rivalryRewardCardIdSchema = z.enum(RIVALRY_REWARD_CARD_IDS);
const progressionRewardSourceIdSchema = z.enum([
  ...OBJECTIVE_IDS,
  ...RIVALRY_ROAD_STEP_IDS,
  "rivalry-road-card-choice",
]);
const DAILY_OBJECTIVE_IDS = [
  "daily-match-complete",
  "daily-match-win",
  "daily-spotlight",
] as const;

export const objectiveProgressSchema = z.object({
  objectiveId: objectiveIdSchema,
  periodKey: nonEmptyString,
  current: nonNegativeInteger,
  target: positiveInteger,
  completed: z.boolean(),
  completedAt: isoDateTime.optional(),
  rewardId: nonEmptyString.optional(),
}).strict().superRefine((progress, context) => {
  if (progress.current > progress.target) {
    context.addIssue({
      code: "custom",
      path: ["current"],
      message: "Objective progress cannot exceed its target.",
    });
  }
  if (progress.completed && progress.current !== progress.target) {
    context.addIssue({
      code: "custom",
      path: ["completed"],
      message: "Completed objectives must be at their target.",
    });
  }
  if (
    (progress.completed && !(progress.completedAt && progress.rewardId)) ||
    (!progress.completed && Boolean(progress.completedAt || progress.rewardId))
  ) {
    context.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "Completed objectives require completion and reward metadata.",
    });
  }
});

const objectivePeriodProgressSchema = z.object({
  periodKey: nonEmptyString,
  objectives: z.array(objectiveProgressSchema),
}).strict().superRefine((period, context) => {
  const objectiveIds = new Set<string>();
  for (const [index, objective] of period.objectives.entries()) {
    if (objective.periodKey !== period.periodKey) {
      context.addIssue({
        code: "custom",
        path: ["objectives", index, "periodKey"],
        message: "Objective period keys must match their containing period.",
      });
    }
    if (objectiveIds.has(objective.objectiveId)) {
      context.addIssue({
        code: "custom",
        path: ["objectives", index, "objectiveId"],
        message: "Objective ids must be unique within a period.",
      });
    }
    objectiveIds.add(objective.objectiveId);
    if (objective.target !== 1) {
      context.addIssue({
        code: "custom",
        path: ["objectives", index, "target"],
        message: "Daily objectives must keep their configured target of one match.",
      });
    }
  }
  if (
    period.objectives.length !== DAILY_OBJECTIVE_IDS.length ||
    DAILY_OBJECTIVE_IDS.some((objectiveId) => !objectiveIds.has(objectiveId))
  ) {
    context.addIssue({
      code: "custom",
      path: ["objectives"],
      message: "Daily progress must contain each configured daily objective exactly once.",
    });
  }
});

const weeklyObjectivePeriodProgressSchema = z.object({
  periodKey: nonEmptyString,
  objective: objectiveProgressSchema,
  completedModes: z.array(gameModeSchema),
}).strict().superRefine((period, context) => {
  if (period.objective.periodKey !== period.periodKey) {
    context.addIssue({
      code: "custom",
      path: ["objective", "periodKey"],
      message: "The weekly objective period key must match its containing period.",
    });
  }
  if (period.objective.objectiveId !== "weekly-circuit-tour") {
    context.addIssue({
      code: "custom",
      path: ["objective", "objectiveId"],
      message: "The weekly period must contain the weekly circuit objective.",
    });
  }
  if (period.objective.target !== 5) {
    context.addIssue({
      code: "custom",
      path: ["objective", "target"],
      message: "The weekly circuit objective must keep its configured target of five matches.",
    });
  }
  if (new Set(period.completedModes).size !== period.completedModes.length) {
    context.addIssue({
      code: "custom",
      path: ["completedModes"],
      message: "Completed weekly modes must be unique.",
    });
  }
  const hasEveryMode = GAME_MODES.every((mode) => period.completedModes.includes(mode));
  const shouldBeCompleted = period.objective.current === 5 && hasEveryMode;
  if (period.objective.completed !== shouldBeCompleted) {
    context.addIssue({
      code: "custom",
      path: ["objective", "completed"],
      message: "Weekly completion requires five matches and one completion in every mode.",
    });
  }
});

export const progressionRewardRecordSchema = z.discriminatedUnion("type", [
  z.object({
    id: nonEmptyString,
    sourceId: progressionRewardSourceIdSchema,
    eventId: nonEmptyString,
    type: z.literal("credits"),
    credits: positiveInteger,
    grantedAt: isoDateTime,
  }).strict(),
  z.object({
    id: nonEmptyString,
    sourceId: progressionRewardSourceIdSchema,
    eventId: nonEmptyString,
    type: z.literal("card-choice"),
    cardIds: z.array(rivalryRewardCardIdSchema).min(1),
    grantedAt: isoDateTime,
  }).strict(),
  z.object({
    id: nonEmptyString,
    sourceId: progressionRewardSourceIdSchema,
    eventId: nonEmptyString,
    type: z.literal("card"),
    cardId: rivalryRewardCardIdSchema,
    grantedAt: isoDateTime,
  }).strict(),
]);
export type ProgressionRewardRecord = z.infer<typeof progressionRewardRecordSchema>;

export const rivalryRoadStateSchema = z.object({
  status: z.enum(["in-progress", "choice-pending", "complete"]),
  currentStepIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  completedStepIds: z.array(rivalryRoadStepIdSchema),
  selectedCardId: rivalryRewardCardIdSchema.optional(),
}).strict().superRefine((state, context) => {
  if (new Set(state.completedStepIds).size !== state.completedStepIds.length) {
    context.addIssue({
      code: "custom",
      path: ["completedStepIds"],
      message: "Completed Rivalry Road step ids must be unique.",
    });
  }
  const expectedSteps = RIVALRY_ROAD_STEP_IDS.slice(0, state.currentStepIndex);
  if (
    state.completedStepIds.length !== expectedSteps.length ||
    state.completedStepIds.some((stepId, index) => stepId !== expectedSteps[index])
  ) {
    context.addIssue({
      code: "custom",
      path: ["completedStepIds"],
      message: "Rivalry Road steps must be completed once and in order.",
    });
  }
  const validStatus =
    (state.status === "in-progress" && state.currentStepIndex < 3 && !state.selectedCardId) ||
    (state.status === "choice-pending" && state.currentStepIndex === 3 && !state.selectedCardId) ||
    (state.status === "complete" && state.currentStepIndex === 3 && Boolean(state.selectedCardId));
  if (!validStatus) {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: "Rivalry Road status, step, and selected reward must agree.",
    });
  }
});
export type RivalryRoadState = z.infer<typeof rivalryRoadStateSchema>;

export const progressionSaveStateSchema = z.object({
  daily: objectivePeriodProgressSchema,
  weekly: weeklyObjectivePeriodProgressSchema,
  rivalryRoad: rivalryRoadStateSchema,
  processedEventIds: z.array(nonEmptyString),
  processedMatchIds: z.array(nonEmptyString),
  rewardHistory: z.array(progressionRewardRecordSchema),
}).strict().superRefine((progression, context) => {
  if (new Set(progression.processedEventIds).size !== progression.processedEventIds.length) {
    context.addIssue({
      code: "custom",
      path: ["processedEventIds"],
      message: "Processed progression event ids must be unique.",
    });
  }
  if (new Set(progression.processedMatchIds).size !== progression.processedMatchIds.length) {
    context.addIssue({
      code: "custom",
      path: ["processedMatchIds"],
      message: "Processed progression match ids must be unique.",
    });
  }

  const historyRewardIds = new Set<string>();
  for (const reward of progression.rewardHistory) {
    if (historyRewardIds.has(reward.id)) {
      context.addIssue({
        code: "custom",
        path: ["rewardHistory"],
        message: "Progression reward ids must be unique.",
      });
      break;
    }
    historyRewardIds.add(reward.id);
  }
});
export type ProgressionSaveState = ProgressionState;

// Fails at compile time if the persisted representation drifts from the pure domain state.
const _progressionSchemaTypeCheck: z.ZodType<ProgressionState> = progressionSaveStateSchema;
void _progressionSchemaTypeCheck;

const saveGameV2BaseSchema = z.object({
  version: z.literal(SAVE_GAME_VERSION),
  ...saveGameCommonShape,
  preferredAiDifficulty: aiDifficultySchema,
  progression: progressionSaveStateSchema,
}).strict();

export const saveGameV2Schema = saveGameV2BaseSchema.superRefine((save, context) => {
  // The shared invariants are version-independent. These two legacy-only fields are
  // not read by the validator, so a narrow structural view is sufficient here.
  validateCommonSave(
    {
      ...save,
      version: LEGACY_SAVE_GAME_VERSION,
      completedObjectiveIds: [],
      eventProgress: {},
    },
    context,
  );
  if (!save.unlockedAiTierIds.includes(save.preferredAiDifficulty)) {
    context.addIssue({
      code: "custom",
      path: ["preferredAiDifficulty"],
      message: "The preferred AI difficulty must be unlocked.",
    });
  }
  const expectedAiTierIds = getUnlockedAiTierIds(save.collectionScore, AI_TIER_THRESHOLDS);
  if (
    save.unlockedAiTierIds.length !== expectedAiTierIds.length ||
    save.unlockedAiTierIds.some((tierId, index) => tierId !== expectedAiTierIds[index])
  ) {
    context.addIssue({
      code: "custom",
      path: ["unlockedAiTierIds"],
      message: "Unlocked AI tiers must match the Collection Score thresholds.",
    });
  }
});

/** Current save type and schema aliases used by all repository consumers. */
export type SaveGameV2 = z.infer<typeof saveGameV2Schema>;
export type SaveGame = SaveGameV2;
export const saveGameSchema = saveGameV2Schema;

export function createDefaultProgressionSaveState(): ProgressionSaveState {
  return createInitialProgressionState();
}

export function createDefaultSaveGame(): SaveGameV2 {
  return {
    version: SAVE_GAME_VERSION,
    credits: DEFAULT_STARTING_CREDITS,
    collection: {},
    lineups: {},
    activeLineupIds: {
      "nhl-circuit": null,
      "pwhl-circuit": null,
      "open-ice": null,
    },
    collectionScore: 0,
    completedMatches: 0,
    unlockedAiTierIds: ["rookie"],
    preferredAiDifficulty: "rookie",
    progression: createDefaultProgressionSaveState(),
    shopState: { lastEventRotationKey: null },
    purchaseHistory: [],
    processedPurchaseIds: [],
    rewardHistory: [],
    processedRewardIds: [],
    settings: { soundEnabled: true, reducedMotion: false },
  };
}
