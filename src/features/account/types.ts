import type {
  AccountCard,
  AccountLineup,
  AccountProfile,
} from "../../infrastructure/supabase";

export interface AccountSnapshot {
  readonly profile: AccountProfile;
  readonly cards: readonly AccountCard[];
  readonly activeLineup: AccountLineup | null;
}
