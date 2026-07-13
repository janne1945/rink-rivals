import { SupabaseAccountRepository } from "./AccountRepository";
import { SupabaseAuthService } from "./AuthService";
import { getSupabaseClient } from "./client";

export type {
  AccountCard,
  AccountLineup,
  AccountMarketEvent,
  AccountMarketOffer,
  AccountMarketState,
  AccountProfile,
  AccountObjectiveProgress,
  AccountRivalryRoadProgress,
  AccountRepository,
  ClaimRivalryRewardInput,
  ClaimRivalryRewardResult,
  LineupMutationResult,
  PlayMatchRoundInput,
  PlayMatchRoundResult,
  PurchaseCardInput,
  PurchaseCardResult,
  SaveLineupInput,
  SettleMatchInput,
  SettleMatchResult,
  StartMatchInput,
  StartMatchResult,
} from "./AccountRepository";
export { SupabaseAccountRepository } from "./AccountRepository";
export type {
  AuthCredentials,
  AuthService,
  AuthStateListener,
  RegistrationCredentials,
} from "./AuthService";
export { SupabaseAuthService } from "./AuthService";
export type { Database } from "./database.types";
export { validateClientEnvironment } from "./environment";
export type { ClientEnvironment, ClientEnvironmentResult, ValidClientEnvironment } from "./environment";

export function createAccountRepository(): SupabaseAccountRepository {
  return new SupabaseAccountRepository(getSupabaseClient());
}

export function createAuthService(): SupabaseAuthService {
  return new SupabaseAuthService(getSupabaseClient());
}
