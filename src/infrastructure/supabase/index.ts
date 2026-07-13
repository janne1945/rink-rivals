import { SupabaseAccountRepository } from "./AccountRepository";
import { SupabaseAuthService } from "./AuthService";
import { getSupabaseClient } from "./client";

export type {
  AccountCard,
  AccountLineup,
  AccountProfile,
  AccountObjectiveProgress,
  AccountRivalryRoadProgress,
  AccountRepository,
  SettleMatchInput,
  SettleMatchResult,
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

export function createAccountRepository(): SupabaseAccountRepository {
  return new SupabaseAccountRepository(getSupabaseClient());
}

export function createAuthService(): SupabaseAuthService {
  return new SupabaseAuthService(getSupabaseClient());
}
