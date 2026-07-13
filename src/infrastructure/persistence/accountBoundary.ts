import type { GameSaveRepository } from "./GameSaveRepository";
import type { SaveGameV2 } from "./saveSchema";
import { createInitialProgressionState } from "../../domain/progression";
import { AI_TIER_THRESHOLDS, getUnlockedAiTierIds } from "../../domain/progression";

export function withoutAccountData(save: SaveGameV2): SaveGameV2 {
  // These two values only satisfy the legacy V2 schema invariant. They represent
  // no cloud collection data; the app derives real unlocks from the account snapshot.
  const localDifficultyScore = AI_TIER_THRESHOLDS.find(({ id }) => id === save.preferredAiDifficulty)?.minimumCollectionScore ?? 0;
  return {
    ...save,
    credits: 0,
    completedMatches: 0,
    rewardHistory: [],
    processedRewardIds: [],
    progression: createInitialProgressionState(),
    collection: {},
    lineups: {},
    activeLineupIds: {
      "nhl-circuit": null,
      "pwhl-circuit": null,
      "open-ice": null,
    },
    collectionScore: localDifficultyScore,
    unlockedAiTierIds: getUnlockedAiTierIds(localDifficultyScore, AI_TIER_THRESHOLDS),
    preferredAiDifficulty: save.preferredAiDifficulty,
    purchaseHistory: [],
    processedPurchaseIds: [],
  };
}

export async function updateLocalState(
  repository: GameSaveRepository,
  updater: (current: SaveGameV2) => SaveGameV2,
): Promise<SaveGameV2> {
  return repository.update((current) => withoutAccountData(updater(withoutAccountData(current))));
}
