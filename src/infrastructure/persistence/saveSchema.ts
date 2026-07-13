import { z } from "zod";

import { GAME_MODES, LINEUP_SLOTS } from "../../domain/lineups/types";

export const SAVE_GAME_VERSION = 1 as const;
export const DEFAULT_STARTING_CREDITS = 1_200;

const nonNegativeInteger = z.number().int().nonnegative();
const nonEmptyString = z.string().min(1);
const isoDateTime = z.string().datetime({ offset: true });

export const ownedCardSchema = z.object({
  cardId: nonEmptyString,
  quantity: z.number().int().positive(),
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

export const saveGameV1Schema = z.object({
  version: z.literal(SAVE_GAME_VERSION),
  credits: nonNegativeInteger,
  collection: z.record(z.string(), ownedCardSchema),
  lineups: z.record(z.string(), savedLineupSchema),
  activeLineupIds: activeLineupIdsSchema,
  collectionScore: nonNegativeInteger,
  completedMatches: nonNegativeInteger,
  unlockedAiTierIds: z.array(nonEmptyString),
  completedObjectiveIds: z.array(nonEmptyString),
  eventProgress: z.record(z.string(), nonNegativeInteger),
  shopState: shopStateSchema,
  purchaseHistory: z.array(purchaseRecordSchema),
  processedPurchaseIds: z.array(nonEmptyString),
  rewardHistory: z.array(matchRewardRecordSchema),
  processedRewardIds: z.array(nonEmptyString),
  settings: settingsSchema,
}).strict().superRefine((save, context) => {
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
});

export type SaveGameV1 = z.infer<typeof saveGameV1Schema>;

export function createDefaultSaveGame(): SaveGameV1 {
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
    completedObjectiveIds: [],
    eventProgress: {},
    shopState: { lastEventRotationKey: null },
    purchaseHistory: [],
    processedPurchaseIds: [],
    rewardHistory: [],
    processedRewardIds: [],
    settings: { soundEnabled: true, reducedMotion: false },
  };
}
