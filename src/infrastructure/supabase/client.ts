import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { validateClientEnvironment } from "./environment";

let browserClient: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const result = validateClientEnvironment(import.meta.env);
  if (!result.valid) throw new Error(result.message);
  const { url, publishableKey } = result.configuration;

  browserClient = createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}
