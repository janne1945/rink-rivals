// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ogHandler from "./challenge-og";
import pageHandler from "./challenge-page";

const publicChallenge = {
  status: "active",
  slug: "0123456789abcdef0123456789abcdef",
  creator_label: "Morgan <script>alert(1)</script>",
  mode: "nhl-circuit",
  difficulty: "rookie",
  challenge_strength: 82,
};

function mockChallengeLookup() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(publicChallenge), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.example");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_function_test");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Vercel challenge functions", () => {
  it("renders crawler metadata and a safe sign-in handoff without leaking markup", async () => {
    mockChallengeLookup();
    const response = await pageHandler(new Request(`https://rink.example/api/challenge-page?slug=${publicChallenge.slug}`));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(`/accept/${publicChallenge.slug}`);
    expect(html).toContain(`/api/challenge-og?slug=${publicChallenge.slug}`);
    expect(html).toContain("Morgan &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("card_id");
  });

  it("renders the neutral social card as a real 1200 by 630 PNG response", async () => {
    mockChallengeLookup();
    const response = await ogHandler(new Request(`https://rink.example/api/challenge-og?slug=${publicChallenge.slug}`));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect([...bytes.slice(1, 4)]).toEqual([80, 78, 71]);
  });
});
