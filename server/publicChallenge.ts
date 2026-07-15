export interface PublicChallengePayload {
  readonly status: "active" | "expired" | "revoked" | "missing";
  readonly slug?: string;
  readonly creator_label?: string;
  readonly mode?: string;
  readonly difficulty?: string;
  readonly challenge_strength?: number;
}

export async function fetchPublicChallenge(slug: string): Promise<PublicChallengePayload> {
  if (!/^[0-9a-f]{32}$/i.test(slug)) return { status: "missing" };
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("Public challenge service is not configured.");
  const response = await fetch(`${url}/rest/v1/rpc/get_public_rivalry_challenge`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_slug: slug.toLowerCase() }),
  });
  if (!response.ok) throw new Error(`Public challenge lookup failed (${response.status}).`);
  return await response.json() as PublicChallengePayload;
}

export function modeLabel(mode?: string): string {
  return mode === "nhl-circuit" ? "NHL Circuit" : mode === "pwhl-circuit" ? "PWHL Circuit" : mode === "open-ice" ? "Open Ice" : "Five-round matchup";
}
