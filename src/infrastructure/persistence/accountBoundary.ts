import type { GameSaveRepository } from "./GameSaveRepository";
import type { SaveGameV2 } from "./saveSchema";

export function withoutAccountData(save: SaveGameV2): SaveGameV2 {
  return {
    ...save,
    credits: 0,
    collection: {},
    lineups: {},
    activeLineupIds: {
      "nhl-circuit": null,
      "pwhl-circuit": null,
      "open-ice": null,
    },
    collectionScore: 0,
    unlockedAiTierIds: ["rookie"],
    preferredAiDifficulty: "rookie",
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
