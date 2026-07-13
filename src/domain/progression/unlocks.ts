export interface AiTierThreshold {
  id: string;
  minimumCollectionScore: number;
}

export function getUnlockedAiTierIds(
  collectionScore: number,
  thresholds: readonly AiTierThreshold[],
): string[] {
  if (!Number.isFinite(collectionScore) || collectionScore < 0) {
    throw new RangeError("Collection Score must be a finite non-negative number.");
  }

  const tierIds = new Set<string>();
  for (const threshold of thresholds) {
    if (tierIds.has(threshold.id)) {
      throw new TypeError(`Duplicate AI tier id: ${threshold.id}.`);
    }
    tierIds.add(threshold.id);
  }

  return thresholds
    .filter((threshold) => {
      if (
        threshold.id.trim().length === 0 ||
        !Number.isFinite(threshold.minimumCollectionScore) ||
        threshold.minimumCollectionScore < 0
      ) {
        throw new TypeError("AI tier thresholds must be valid.");
      }
      return collectionScore >= threshold.minimumCollectionScore;
    })
    .sort(
      (left, right) =>
        left.minimumCollectionScore - right.minimumCollectionScore ||
        left.id.localeCompare(right.id),
    )
    .map((threshold) => threshold.id);
}
