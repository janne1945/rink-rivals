import type {
  AccountCard,
  AccountLineup,
  AccountProfile,
  AccountObjectiveProgress,
  AccountRivalryRoadProgress,
} from "../../infrastructure/supabase";

export interface AccountSnapshot {
  readonly profile: AccountProfile;
  readonly cards: readonly AccountCard[];
  readonly activeLineup: AccountLineup | null;
  readonly objectives: readonly AccountObjectiveProgress[];
  readonly rivalryRoad: AccountRivalryRoadProgress;
}
