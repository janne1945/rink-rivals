export interface ClientEnvironment {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface ValidClientEnvironment {
  readonly url: string;
  readonly publishableKey: string;
}

export type ClientEnvironmentResult =
  | { readonly valid: true; readonly configuration: ValidClientEnvironment }
  | { readonly valid: false; readonly message: string };

function jwtRole(value: string): string | undefined {
  const [, payload] = value.split(".");
  if (!payload) return undefined;
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = globalThis.atob?.(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    if (!decoded) return undefined;
    const claims = JSON.parse(decoded) as { readonly role?: unknown };
    return typeof claims.role === "string" ? claims.role : undefined;
  } catch {
    return undefined;
  }
}

export function validateClientEnvironment(environment: ClientEnvironment): ClientEnvironmentResult {
  const url = environment.VITE_SUPABASE_URL?.trim();
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    return {
      valid: false,
      message: "Rink Rivals could not start because the server configuration is missing.",
    };
  }

  try {
    const parsed = new URL(url);
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:")) {
      throw new Error("invalid Supabase URL");
    }
  } catch {
    return {
      valid: false,
      message: "Rink Rivals could not start because the server URL is invalid.",
    };
  }

  if (publishableKey.toLowerCase().includes("service_role") || jwtRole(publishableKey) === "service_role") {
    return {
      valid: false,
      message: "Rink Rivals blocked an unsafe browser credential. Configure a publishable key instead.",
    };
  }

  return { valid: true, configuration: { url, publishableKey } };
}
