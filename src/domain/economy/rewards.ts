import type {
  EconomyState,
  MatchReward,
  MatchRewardRecord,
} from "./types";

export type MatchRewardResult<T extends EconomyState> =
  | {
      ok: true;
      status: "granted" | "already_processed";
      state: T;
      record: MatchRewardRecord;
    }
  | {
      ok: false;
      reason: "invalid_reward" | "reward_conflict";
      state: T;
    };

function matchesReward(
  record: MatchRewardRecord,
  reward: MatchReward,
): boolean {
  return (
    record.rewardId === reward.rewardId &&
    record.matchId === reward.matchId &&
    record.credits === reward.credits
  );
}

/** Grants a match reward exactly once for both its reward id and match id. */
export function grantMatchReward<T extends EconomyState>(
  state: T,
  reward: MatchReward,
  grantedAt = new Date().toISOString(),
): MatchRewardResult<T> {
  if (
    reward.rewardId.trim().length === 0 ||
    reward.matchId.trim().length === 0 ||
    !Number.isSafeInteger(reward.credits) ||
    reward.credits < 0
  ) {
    return { ok: false, reason: "invalid_reward", state };
  }

  const existing = state.rewardHistory.find(
    (record) =>
      record.rewardId === reward.rewardId || record.matchId === reward.matchId,
  );
  if (existing) {
    if (!matchesReward(existing, reward)) {
      return { ok: false, reason: "reward_conflict", state };
    }

    return {
      ok: true,
      status: "already_processed",
      state,
      record: existing,
    };
  }

  if (state.processedRewardIds.includes(reward.rewardId)) {
    return { ok: false, reason: "reward_conflict", state };
  }

  if (
    !Number.isSafeInteger(state.credits) ||
    state.credits < 0 ||
    !Number.isSafeInteger(state.credits + reward.credits) ||
    !Number.isSafeInteger(state.completedMatches) ||
    state.completedMatches < 0 ||
    !Number.isSafeInteger(state.completedMatches + 1)
  ) {
    return { ok: false, reason: "invalid_reward", state };
  }

  const record: MatchRewardRecord = { ...reward, grantedAt };
  const nextState = {
    ...state,
    credits: state.credits + reward.credits,
    completedMatches: state.completedMatches + 1,
    rewardHistory: [...state.rewardHistory, record],
    processedRewardIds: [...state.processedRewardIds, reward.rewardId],
  } as T;

  return { ok: true, status: "granted", state: nextState, record };
}
