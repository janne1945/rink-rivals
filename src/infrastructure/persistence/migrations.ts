import { z } from "zod";

import {
  createDefaultSaveGame,
  saveGameV1Schema,
} from "./saveSchema";
import type { SaveGameV1 } from "./saveSchema";

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
  save: SaveGameV1;
  status: SaveLoadStatus;
}

function migrateV0(raw: z.infer<typeof saveGameV0Schema>): SaveGameV1 {
  const save = createDefaultSaveGame();
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

/** Validates, migrates, or safely replaces any raw persistence payload. */
export function parseOrCreateSaveGame(raw: unknown): SaveLoadResult {
  if (raw === undefined || raw === null) {
    return { save: createDefaultSaveGame(), status: "default_missing" };
  }

  const v1 = saveGameV1Schema.safeParse(raw);
  if (v1.success) {
    return { save: v1.data, status: "valid" };
  }

  const v0 = saveGameV0Schema.safeParse(raw);
  if (v0.success) {
    return { save: migrateV0(v0.data), status: "migrated" };
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    typeof raw.version === "number" &&
    raw.version !== 0 &&
    raw.version !== 1
  ) {
    return {
      save: createDefaultSaveGame(),
      status: "default_unknown_version",
    };
  }

  return { save: createDefaultSaveGame(), status: "default_corrupt" };
}

