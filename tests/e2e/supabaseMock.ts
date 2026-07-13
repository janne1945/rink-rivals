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
  let onboardingCompleted = options.onboardingCompleted ?? true;
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
      await json(route, {
        id: userId,
        display_name: "Alex",
        favorite_team_id: onboardingCompleted ? "edmonton-oilers" : null,
        credits: onboardingCompleted ? 1000 : 0,
        onboarding_completed: onboardingCompleted,
        starter_claimed_at: onboardingCompleted ? "2026-07-13T00:00:00.000Z" : null,
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
    if (url.pathname === "/rest/v1/rpc/claim_starter_team") {
      if (options.duplicateClaim) {
        await json(route, { code: "P0001", message: "Starter team has already been claimed.", details: null, hint: null }, 400);
      } else {
        onboardingCompleted = true;
        await json(route, "33333333-3333-4333-8333-333333333333");
      }
      return;
    }
    await json(route, { message: `Unhandled Supabase mock request: ${request.method()} ${url.pathname}` }, 500);
  });
}
