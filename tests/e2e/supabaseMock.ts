import type { Page, Route } from "@playwright/test";

const projectRef = "zsyoxpirfxajkruqeqam";
const userId = "11111111-1111-4111-8111-111111111111";

const starterCards = [
  ["LW", "nhl-brady-tkachuk-base"],
  ["C", "nhl-connor-mcdavid-base"],
  ["RW", "nhl-mikko-rantanen-base"],
  ["LD", "nhl-rasmus-dahlin-base"],
  ["RD", "nhl-evan-bouchard-base"],
  ["G", "nhl-igor-shesterkin-base"],
] as const;

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const accessToken = `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({ sub: userId, role: "authenticated", email: "alex@example.com", exp: 4_102_444_800 })}.test-signature`;

const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "alex@example.com",
  email_confirmed_at: "2026-07-13T00:00:00.000Z",
  phone: "",
  confirmed_at: "2026-07-13T00:00:00.000Z",
  last_sign_in_at: "2026-07-13T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: "Alex" },
  identities: [],
  created_at: "2026-07-13T00:00:00.000Z",
  updated_at: "2026-07-13T00:00:00.000Z",
  is_anonymous: false,
};

const session = {
  access_token: accessToken,
  refresh_token: "test-refresh-token",
  expires_in: 2_000_000_000,
  expires_at: 4_102_444_800,
  token_type: "bearer",
  user,
};

export interface SupabaseMockOptions {
  readonly authenticated?: boolean;
  readonly onboardingCompleted?: boolean;
  readonly duplicateClaim?: boolean;
  readonly loginError?: boolean;
  readonly profileError?: boolean;
  readonly settlementError?: boolean;
  readonly state?: SupabaseMockState;
}

export interface SupabaseMockState {
  onboardingCompleted: boolean;
  credits: number;
  completedMatches: number;
  settlements: Map<string, { matchId: string; rewardCredits: number }>;
  objectives: Array<Record<string, unknown>>;
  rivalryRoad: { user_id: string; current_step_index: number; completed_step_ids: string[]; status: string; selected_card_id: null; updated_at: string };
}

export function createSupabaseMockState(onboardingCompleted = true): SupabaseMockState {
  return {
    onboardingCompleted,
    credits: onboardingCompleted ? 1000 : 0,
    completedMatches: 0,
    settlements: new Map(),
    objectives: [],
    rivalryRoad: { user_id: userId, current_step_index: 0, completed_step_ids: [], status: "in-progress", selected_card_id: null, updated_at: "2026-07-13T00:00:00.000Z" },
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
    headers: { "access-control-allow-origin": "*" },
  });
}

export async function installSupabaseMock(page: Page, options: SupabaseMockOptions = {}) {
  const state = options.state ?? createSupabaseMockState(options.onboardingCompleted ?? true);
  if (options.authenticated) {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: `sb-${projectRef}-auth-token`,
      value: JSON.stringify(session),
    });
  }

  await page.route(`https://${projectRef}.supabase.co/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/v1/token") {
      if (options.loginError) {
        await json(route, { code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
        return;
      }
      await json(route, session);
      return;
    }
    if (url.pathname === "/auth/v1/signup") {
      await json(route, user);
      return;
    }
    if (url.pathname === "/auth/v1/logout") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await json(route, user);
      return;
    }
    if (url.pathname === "/rest/v1/profiles") {
      if (options.profileError) {
        await json(route, { code: "XX000", message: "Profile service unavailable", details: null, hint: null }, 503);
        return;
      }
      await json(route, {
        id: userId,
        display_name: "Alex",
        favorite_team_id: state.onboardingCompleted ? "edmonton-oilers" : null,
        credits: state.credits,
        completed_matches: state.completedMatches,
        onboarding_completed: state.onboardingCompleted,
        starter_claimed_at: state.onboardingCompleted ? "2026-07-13T00:00:00.000Z" : null,
        created_at: "2026-07-13T00:00:00.000Z",
        updated_at: "2026-07-13T00:00:00.000Z",
      });
      return;
    }
    if (url.pathname === "/rest/v1/user_cards") {
      await json(route, starterCards.map(([, cardId]) => ({ user_id: userId, card_id: cardId, quantity: 1, acquired_at: "2026-07-13T00:00:00.000Z" })));
      return;
    }
    if (url.pathname === "/rest/v1/lineups") {
      await json(route, { id: "33333333-3333-4333-8333-333333333333", user_id: userId, name: "Edmonton Oilers Starter", mode: "nhl-circuit", is_active: true, created_at: "2026-07-13T00:00:00.000Z", updated_at: "2026-07-13T00:00:00.000Z" });
      return;
    }
    if (url.pathname === "/rest/v1/lineup_slots") {
      await json(route, starterCards.map(([slot, cardId]) => ({ lineup_id: "33333333-3333-4333-8333-333333333333", user_id: userId, slot, card_id: cardId })));
      return;
    }
    if (url.pathname === "/rest/v1/objective_progress") {
      await json(route, state.objectives);
      return;
    }
    if (url.pathname === "/rest/v1/rivalry_road_progress") {
      await json(route, state.completedMatches > 0 ? state.rivalryRoad : null);
      return;
    }
    if (url.pathname === "/rest/v1/rpc/claim_starter_team") {
      if (options.duplicateClaim) {
        await json(route, { code: "P0001", message: "Starter team has already been claimed.", details: null, hint: null }, 400);
      } else {
        state.onboardingCompleted = true;
        state.credits = 1000;
        await json(route, "33333333-3333-4333-8333-333333333333");
      }
      return;
    }
    if (url.pathname === "/rest/v1/rpc/settle_match") {
      if (options.settlementError) {
        await json(route, { code: "40001", message: "Match settlement temporarily unavailable", details: null, hint: null }, 503);
        return;
      }
      const body = request.postDataJSON() as { client_match_id: string; match_mode: string; match_difficulty: string; match_outcome: string };
      const previous = state.settlements.get(body.client_match_id);
      if (previous) {
        await json(route, { status: "already-settled", match_id: previous.matchId, reward_credits: previous.rewardCredits, credits: state.credits, completed_matches: state.completedMatches });
        return;
      }
      const baseRewards = { rookie: { win: 120, draw: 90, loss: 60 }, pro: { win: 180, draw: 120, loss: 80 }, elite: { win: 260, draw: 160, loss: 100 } } as const;
      const base = baseRewards[body.match_difficulty as keyof typeof baseRewards][body.match_outcome as "win" | "draw" | "loss"];
      const rewardCredits = base + 75 + (body.match_outcome === "win" ? 100 : 0) + (body.match_mode === "nhl-circuit" ? 150 : 0);
      state.completedMatches += 1;
      state.credits += rewardCredits;
      const now = "2026-07-13T12:00:00.000Z";
      state.objectives = [
        { user_id: userId, objective_id: "daily-match-complete", period_key: "2026-07-13", current: 1, target: 1, completed_modes: [], completed_at: now, reward_credits: 75, updated_at: now },
        ...(body.match_outcome === "win" ? [{ user_id: userId, objective_id: "daily-match-win", period_key: "2026-07-13", current: 1, target: 1, completed_modes: [], completed_at: now, reward_credits: 100, updated_at: now }] : []),
        { user_id: userId, objective_id: "weekly-circuit-tour", period_key: "2026-07-13", current: 1, target: 5, completed_modes: [body.match_mode], completed_at: null, reward_credits: 350, updated_at: now },
      ];
      if (body.match_mode === "nhl-circuit") state.rivalryRoad = { ...state.rivalryRoad, current_step_index: 1, completed_step_ids: ["nhl-circuit-complete"], updated_at: now };
      const matchId = `settled-${body.client_match_id}`;
      state.settlements.set(body.client_match_id, { matchId, rewardCredits });
      await json(route, { status: "settled", match_id: matchId, reward_credits: rewardCredits, credits: state.credits, completed_matches: state.completedMatches });
      return;
    }
    await json(route, { message: `Unhandled Supabase mock request: ${request.method()} ${url.pathname}` }, 500);
  });
}
