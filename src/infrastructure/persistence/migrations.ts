import { z } from "zod";

import {
  createDefaultProgressionSaveState,
  createDefaultSaveGame,
  saveGameV1Schema,
  saveGameV2Schema,
} from "./saveSchema";
import type {
  ObjectiveProgress,
  ProgressionState,
} from "../../domain/progression/types";
import type { SaveGameV1, SaveGameV2 } from "./saveSchema";
import {
  AI_TIER_THRESHOLDS,
  getUnlockedAiTierIds,
} from "../../domain/progression/unlocks";
import { GAME_MODES } from "../../domain/lineups/types";

const MIGRATED_ACQUIRED_AT = "1970-01-01T00:00:00.000Z";

const saveGameV0Schema = z.object({
  version: z.literal(0),
  credits: z.number().int().nonnegative(),
  ownedCardIds: z.array(z.string().min(1)),
  completedMatches: z.number().int().nonnegative().optional(),
  processedPurchaseIds: z.array(z.string().min(1)).optional(),
  processedRewardIds: z.array(z.string().min(1)).optional(),
}).passthrough();

export type SaveLoadStatus =
  | "valid"
  | "migrated"
  | "default_missing"
  | "default_corrupt"
  | "default_unknown_version";

export interface SaveLoadResult {
  save: SaveGameV2;
  status: SaveLoadStatus;
}

function createLegacyDefaultSaveGame(): SaveGameV1 {
  const current = createDefaultSaveGame();
  return saveGameV1Schema.parse({
    version: 1,
    credits: current.credits,
    collection: current.collection,
    lineups: current.lineups,
    activeLineupIds: current.activeLineupIds,
    collectionScore: current.collectionScore,
    completedMatches: current.completedMatches,
    unlockedAiTierIds: current.unlockedAiTierIds,
    completedObjectiveIds: [],
    eventProgress: {},
    shopState: current.shopState,
    purchaseHistory: current.purchaseHistory,
    processedPurchaseIds: current.processedPurchaseIds,
    rewardHistory: current.rewardHistory,
    processedRewardIds: current.processedRewardIds,
    settings: current.settings,
  });
}

/** First legacy hop, intentionally kept separate so the full v0 -> v1 -> v2 chain is testable. */
export function migrateSaveGameV0ToV1(
  raw: z.infer<typeof saveGameV0Schema>,
): SaveGameV1 {
  const save = createLegacyDefaultSaveGame();
  save.credits = raw.credits;
  save.completedMatches = raw.completedMatches ?? 0;
  save.processedPurchaseIds = [...new Set(raw.processedPurchaseIds ?? [])];
  save.processedRewardIds = [...new Set(raw.processedRewardIds ?? [])];

  for (const cardId of raw.ownedCardIds) {
    const current = save.collection[cardId];
    save.collection[cardId] = current
      ? { ...current, quantity: current.quantity + 1 }
      : { cardId, quantity: 1, acquiredAt: MIGRATED_ACQUIRED_AT };
  }

  return saveGameV1Schema.parse(save);
}

/** Losslessly carries every v1 field into the current v2 representation. */
export function migrateSaveGameV1ToV2(raw: SaveGameV1): SaveGameV2 {
  const progression = createDefaultProgressionSaveState();
  const completedObjectiveIds = new Set(raw.completedObjectiveIds);
  const migrateObjective = (objective: ObjectiveProgress): ObjectiveProgress => {
    const storedCurrent = raw.eventProgress[objective.objectiveId] ?? 0;
    const completed = completedObjectiveIds.has(objective.objectiveId);
    const current = completed
      ? objective.target
      : Math.min(objective.target, storedCurrent);
    return {
      ...objective,
      current,
      completed,
      ...(completed
        ? {
            completedAt: MIGRATED_ACQUIRED_AT,
            rewardId: `legacy-v1:${objective.objectiveId}`,
          }
        : {}),
    };
  };
  const migratedWeeklyObjective = migrateObjective(progression.weekly.objective);
  const migratedProgression: ProgressionState = {
    ...progression,
    daily: {
      ...progression.daily,
      objectives: progression.daily.objectives.map(migrateObjective),
    },
    weekly: {
      ...progression.weekly,
      objective: migratedWeeklyObjective,
      completedModes: migratedWeeklyObjective.completed ? [...GAME_MODES] : [],
    },
  };
  const unlockedAiTierIds = getUnlockedAiTierIds(raw.collectionScore, AI_TIER_THRESHOLDS);
  const preferredAiDifficulty = unlockedAiTierIds.includes("pro")
    ? "pro"
    : "rookie";

  return saveGameV2Schema.parse({
    version: 2,
    credits: raw.credits,
    collection: raw.collection,
    lineups: raw.lineups,
    activeLineupIds: raw.activeLineupIds,
    collectionScore: raw.collectionScore,
    completedMatches: raw.completedMatches,
    unlockedAiTierIds,
    preferredAiDifficulty,
    progression: migratedProgression,
    shopState: raw.shopState,
    purchaseHistory: raw.purchaseHistory,
    processedPurchaseIds: raw.processedPurchaseIds,
    rewardHistory: raw.rewardHistory,
    processedRewardIds: raw.processedRewardIds,
    settings: raw.settings,
  });
}

/** Validates, migrates, or safely replaces any raw persistence payload. */
export function parseOrCreateSaveGame(raw: unknown): SaveLoadResult {
  if (raw === undefined || raw === null) {
    return { save: createDefaultSaveGame(), status: "default_missing" };
  }

  const v2 = saveGameV2Schema.safeParse(raw);
  if (v2.success) {
    return { save: v2.data, status: "valid" };
  }

  const v1 = saveGameV1Schema.safeParse(raw);
  if (v1.success) {
    return { save: migrateSaveGameV1ToV2(v1.data), status: "migrated" };
  }

  const v0 = saveGameV0Schema.safeParse(raw);
  if (v0.success) {
    const migratedV1 = migrateSaveGameV0ToV1(v0.data);
    return { save: migrateSaveGameV1ToV2(migratedV1), status: "migrated" };
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    typeof raw.version === "number" &&
    raw.version !== 0 &&
    raw.version !== 1 &&
    raw.version !== 2
  ) {
    return {
      save: createDefaultSaveGame(),
      status: "default_unknown_version",
    };
  }

  return { save: createDefaultSaveGame(), status: "default_corrupt" };
}
