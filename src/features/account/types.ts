import type {
  AccountCard,
  AccountLineup,
  AccountMarketState,
  AccountProfile,
  AccountObjectiveProgress,
  AccountRivalryRoadProgress,
} from "../../infrastructure/supabase";

export interface AccountSnapshot {
  readonly profile: AccountProfile;
  readonly cards: readonly AccountCard[];
  readonly lineups: readonly AccountLineup[];
  readonly objectives: readonly AccountObjectiveProgress[];
  readonly rivalryRoad: AccountRivalryRoadProgress;
  readonly market: AccountMarketState;
}
