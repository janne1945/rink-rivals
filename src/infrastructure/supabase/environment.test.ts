import { describe, expect, it } from "vitest";

import { validateClientEnvironment } from "./environment";

describe("client environment", () => {
  it("accepts an HTTPS Supabase URL and publishable key", () => {
    expect(validateClientEnvironment({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    })).toEqual({
      valid: true,
      configuration: {
        url: "https://example.supabase.co",
        publishableKey: "sb_publishable_example",
      },
    });
  });

  it("returns a visible-safe message when configuration is missing", () => {
    expect(validateClientEnvironment({})).toEqual({
      valid: false,
      message: "Rink Rivals could not start because the server configuration is missing.",
    });
  });

  it("rejects a service-role credential", () => {
    expect(validateClientEnvironment({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "unsafe-service_role-key",
    })).toMatchObject({ valid: false });
  });

  it("allows a local HTTP Supabase stack but rejects an insecure remote URL", () => {
    expect(validateClientEnvironment({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    })).toMatchObject({ valid: true });
    expect(validateClientEnvironment({
      VITE_SUPABASE_URL: "http://example.com",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    })).toMatchObject({ valid: false });
  });
});
