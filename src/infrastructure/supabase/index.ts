import { SupabaseAccountRepository } from "./AccountRepository";
import { getSupabaseClient } from "./client";

export type {
  AccountCard,
  AccountLineup,
  AccountProfile,
} from "./AccountRepository";
export { SupabaseAccountRepository } from "./AccountRepository";
export type { Database } from "./database.types";

export function createAccountRepository(): SupabaseAccountRepository {
  return new SupabaseAccountRepository(getSupabaseClient());
}
