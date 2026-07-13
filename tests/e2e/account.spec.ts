import { expect, test, type Page } from "@playwright/test";

import { createSupabaseMockState, installSupabaseMock } from "./supabaseMock";

async function completeFiveRoundMatch(page: Page) {
  for (let round = 1; round <= 5; round += 1) {
    await expect(page.getByText(`Round ${round} of 5`)).toBeVisible();
    await page.getByRole("region", { name: "Player hand" }).locator("button[aria-label*='overall']:not([disabled])").first().click();
    await page.getByRole("button", { name: "Reveal shift" }).click();
  }
  await expect(page.getByText("Final horn")).toBeVisible();
  await expect(page.getByText(/Match settled on the server/)).toBeVisible();
}

test.describe("Supabase account flow", () => {
  test("loads the same Supabase account in two independent sessions", async ({ browser }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await installSupabaseMock(firstPage, { authenticated: true, onboardingCompleted: true });
    await installSupabaseMock(secondPage, { authenticated: true, onboardingCompleted: true });
    await Promise.all([firstPage.goto("/collection"), secondPage.goto("/lineups")]);
    await expect(firstPage.getByLabel(/credits/i)).toContainText("1,000");
    await expect(firstPage.locator("article")).toHaveCount(6);
    await expect(secondPage.getByRole("heading", { name: "Edmonton Oilers Starter" })).toBeVisible();
    await Promise.all([firstPage.reload(), secondPage.reload()]);
    await expect(firstPage.getByLabel(/credits/i)).toContainText("1,000");
    await expect(secondPage.getByRole("heading", { name: "Edmonton Oilers Starter" })).toBeVisible();
    await firstContext.close();
    await secondContext.close();
  });

  test("settles the same match only once across two independent sessions", async ({ browser }) => {
    const sharedState = createSupabaseMockState(true);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await installSupabaseMock(firstPage, { authenticated: true, state: sharedState });
    await installSupabaseMock(secondPage, { authenticated: true, state: sharedState });
    await Promise.all([firstPage.goto("/"), secondPage.goto("/")]);
    await firstPage.evaluate(async () => {
      const rpc = async (name: string, body: Record<string, unknown>) => {
        const response = await fetch(`https://zsyoxpirfxajkruqeqam.supabase.co/rest/v1/rpc/${name}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(JSON.stringify(await response.json()));
        return response.json();
      };
      await rpc("start_match", { client_match_id: "shared-match", mode: "nhl-circuit", difficulty: "rookie" });
      const cards = [
        "nhl-brady-tkachuk-base",
        "nhl-connor-mcdavid-base",
        "nhl-rasmus-dahlin-base",
        "nhl-mikko-rantanen-base",
        "nhl-igor-shesterkin-base",
      ];
      for (let roundIndex = 0; roundIndex < cards.length; roundIndex += 1) {
        await rpc("play_match_round", {
          client_match_id: "shared-match",
          round_index: roundIndex,
          player_card_id: cards[roundIndex],
          client_request_id: `shared-round-${roundIndex}`,
        });
      }
    });
    const settle = (page: typeof firstPage) => page.evaluate(async () => {
      const response = await fetch("https://zsyoxpirfxajkruqeqam.supabase.co/rest/v1/rpc/settle_match", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_match_id: "shared-match" }),
      });
      return response.json() as Promise<{ status: string }>;
    });
    const results = await Promise.all([settle(firstPage), settle(secondPage)]);
    expect(results.map((result) => result.status).sort()).toEqual(["already-settled", "settled"]);
    expect(sharedState.completedMatches).toBe(1);
    expect(sharedState.credits).toBe(1000 + sharedState.settlements.get("shared-match")!.rewardCredits);
    await Promise.all([firstPage.reload(), secondPage.reload()]);
    await expect(firstPage.getByLabel(/credits/i)).toContainText(sharedState.credits.toLocaleString("en-US"));
    await expect(secondPage.getByText("1 matches completed")).toBeVisible();
    await firstContext.close();
    await secondContext.close();
  });

  test("registers with email and password and shows confirmation guidance", async ({ page }) => {
    await installSupabaseMock(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "Register" }).click();
    await page.getByLabel("Display name").fill("Alex");
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");
  });

  test("logs in, claims Edmonton, reloads cloud data, and opens the main menu", async ({ page }) => {
    await installSupabaseMock(page, { onboardingCompleted: false });
    await page.goto("/collection");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Choose your first six" })).toBeVisible();
    await expect(page.getByText("Connor McDavid")).toBeVisible();
    await expect(page.getByText("Evan Bouchard")).toBeVisible();
    await page.getByRole("button", { name: "Choose Edmonton Oilers" }).click();
    await expect(page.getByRole("heading", { name: "Collection" })).toBeVisible();
    await expect(page.getByLabel(/credits/i)).toContainText("1,000");
    await expect(page.locator("article")).toHaveCount(6);
  });

  test("completes the central account, market, collection, lineup, match, goals, and relogin path", async ({ page }) => {
    const state = await installSupabaseMock(page, { onboardingCompleted: false });
    await page.goto("/");
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Choose Edmonton Oilers" }).click();

    await page.getByRole("link", { name: "Cards", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(6);

    await page.getByRole("link", { name: "Lineup", exact: true }).click();
    const nhlSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "NHL Circuit", exact: true }) });
    await nhlSection.getByRole("button", { name: "New lineup" }).click();
    await page.getByLabel("Lineup name").fill("Championship Six");
    for (const player of ["Brady Tkachuk", "Connor McDavid", "Mikko Rantanen", "Rasmus Dahlin", "Evan Bouchard", "Igor Shesterkin"]) {
      await page.getByRole("button", { name: new RegExp(player) }).click();
    }
    await page.getByRole("button", { name: "Save lineup" }).click();
    await expect(page.getByRole("status")).toContainText("saved securely");
    const championshipLineup = page.locator("article").filter({ has: page.getByRole("heading", { name: "Championship Six" }) });
    await championshipLineup.getByRole("button", { name: "Set active" }).click();
    await expect(page.getByRole("status")).toContainText("is now active");

    await page.getByRole("link", { name: "Play", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Championship Six" })).toBeVisible();
    await page.getByRole("button", { name: "Start match" }).click();
    await completeFiveRoundMatch(page);
    await page.getByRole("button", { name: "Return to club" }).click();

    await page.getByRole("link", { name: "Market", exact: true }).click();
    await page.getByLabel("Search market").fill("Artemi Panarin");
    await page.getByRole("button", { name: "Buy Artemi Panarin for 950 Credits" }).click();
    await expect(page.getByRole("status")).toContainText("Card added to your collection");

    await page.getByRole("link", { name: "Cards", exact: true }).click();
    await page.getByLabel("Search collection").fill("Artemi Panarin");
    await expect(page.getByRole("article", { name: /Artemi Panarin, 92 overall/i })).toBeVisible();

    await page.getByRole("link", { name: "Lineup", exact: true }).click();
    await page.locator("article").filter({ has: page.getByRole("heading", { name: "Championship Six" }) }).getByRole("button", { name: "Edit six" }).click();
    await page.getByRole("tab", { name: /LW Brady Tkachuk/i }).click();
    await page.getByRole("button", { name: /Artemi Panarin, 92 overall/i }).click();
    await page.getByRole("button", { name: "Save lineup" }).click();
    await expect(page.getByRole("status")).toContainText("saved securely");

    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "View all goals" }).click();
    await expect(page.getByRole("progressbar", { name: /Circuit tour: 1 of 5/i })).toBeVisible();

    await page.getByRole("button", { name: /Sign out/i }).click();
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("link", { name: "Cards", exact: true }).click();
    await page.getByLabel("Search collection").fill("Artemi Panarin");
    await expect(page.getByRole("article", { name: /Artemi Panarin, 92 overall/i })).toBeVisible();
    await page.getByRole("link", { name: "Lineup", exact: true }).click();
    const persistedLineup = page.locator("article").filter({ has: page.getByRole("heading", { name: "Championship Six" }) });
    await expect(persistedLineup.getByRole("button", { name: "Active", exact: true })).toBeDisabled();
    await persistedLineup.getByRole("button", { name: "Edit six" }).click();
    await expect(page.getByRole("tab", { name: /LW Artemi Panarin/i })).toBeVisible();
    expect(state.completedMatches).toBe(1);
    expect(state.cards.get("nhl-artemi-panarin-base")?.quantity).toBe(1);
  });

  test("prevents a double purchase submit before React can disable the button", async ({ page }) => {
    const state = await installSupabaseMock(page, { authenticated: true, purchaseDelayMs: 200 });
    await page.goto("/market");
    await page.getByLabel("Search market").fill("Artemi Panarin");
    const purchase = page.getByRole("button", { name: "Buy Artemi Panarin for 950 Credits" });
    await purchase.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("status")).toContainText("Card added to your collection");
    expect(state.purchaseCallCount).toBe(1);
    expect(state.credits).toBe(50);
    expect(state.cards.get("nhl-artemi-panarin-base")?.quantity).toBe(1);
  });

  test("shows a purchase server error without charging or losing retryability", async ({ page }) => {
    const state = await installSupabaseMock(page, { authenticated: true, purchaseError: true });
    await page.goto("/market");
    await page.getByLabel("Search market").fill("Artemi Panarin");
    const purchase = page.getByRole("button", { name: "Buy Artemi Panarin for 950 Credits" });
    await purchase.click();
    await expect(page.getByRole("alert")).toContainText("Purchase service temporarily unavailable");
    await expect(purchase).toBeEnabled();
    expect(state.credits).toBe(1000);
    expect(state.cards.has("nhl-artemi-panarin-base")).toBe(false);
  });

  test("disables an unaffordable purchase without calling the server", async ({ page }) => {
    const state = createSupabaseMockState(true);
    state.credits = 100;
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto("/market");
    await page.getByLabel("Search market").fill("Artemi Panarin");
    const purchase = page.getByRole("button", { name: "Buy Artemi Panarin for 950 Credits" });
    await expect(purchase).toBeDisabled();
    await expect(purchase).toHaveText("Not enough Credits");
    expect(state.purchaseCallCount).toBe(0);
  });

  test("shows the six-card active event and refreshes automatically when it expires", async ({ page }) => {
    const state = createSupabaseMockState(true);
    state.eventEndsAt = "2026-07-13T12:00:03.000Z";
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto("/market");
    await page.getByRole("tab", { name: "Event Shop" }).click();
    await expect(page.getByRole("heading", { name: "Franchise Icons" })).toBeVisible();
    state.eventEndsAt = "2026-07-13T11:59:59.000Z";
    const eventOffers = page.getByRole("button", { name: /^Buy .+ for .+ Credits$/ });
    await expect(eventOffers).toHaveCount(6);
    await page.getByRole("button", { name: "NHL", exact: true }).click();
    await expect(eventOffers).toHaveCount(3);
    await page.getByRole("button", { name: "PWHL", exact: true }).click();
    await expect(eventOffers).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "No active event" })).toBeVisible({ timeout: 6_000 });
    await expect(eventOffers).toHaveCount(0);
  });

  test("rejects an incomplete new lineup before calling the server", async ({ page }) => {
    const state = await installSupabaseMock(page, { authenticated: true });
    await page.goto("/lineups");
    const pwhl = page.locator("section").filter({ has: page.getByRole("heading", { name: "PWHL Circuit", exact: true }) });
    await pwhl.getByRole("button", { name: "New lineup" }).click();
    await page.getByRole("button", { name: "Save lineup" }).click();
    await expect(page.getByRole("alert")).toContainText("LW requires a card");
    expect(state.lineupSaveCallCount).toBe(0);
  });

  test("retries a lost round response with the same request id and applies it once", async ({ page }) => {
    const state = await installSupabaseMock(page, { authenticated: true, roundResponseLossOnce: true });
    await page.goto("/play");
    await page.getByRole("button", { name: "Start match" }).click();
    await page.getByRole("region", { name: "Player hand" }).locator("button[aria-label*='overall']:not([disabled])").first().click();
    await page.getByRole("button", { name: "Reveal shift" }).click();
    await expect(page.getByRole("button", { name: "Retry reveal" })).toBeEnabled();
    const ticket = [...state.matchTickets.values()][0];
    expect(ticket.rounds.size).toBe(1);
    expect(ticket.roundRequests.size).toBe(1);
    await page.getByRole("button", { name: "Retry reveal" }).click();
    await expect(page.getByText("Round 2 of 5")).toBeVisible();
    expect(state.playRoundCallCount).toBe(2);
    expect(ticket.rounds.size).toBe(1);
    expect(ticket.roundRequests.size).toBe(1);
  });

  test("resumes round two with the original ticket, seed, lineup snapshot, and round history after reload", async ({ page }) => {
    const state = await installSupabaseMock(page, { authenticated: true });
    await page.goto("/play");
    await page.getByRole("button", { name: "Start match" }).click();
    const ticket = [...state.matchTickets.values()][0];
    expect(ticket).toBeDefined();
    const originalClientMatchId = ticket.clientMatchId;
    const originalSeed = ticket.seed;

    await page.getByRole("region", { name: "Player hand" }).locator("button[aria-label*='overall']:not([disabled])").first().click();
    await page.getByRole("button", { name: "Reveal shift" }).click();
    await expect(page.getByText("Round 2 of 5")).toBeVisible();
    const firstRound = ticket.rounds.get(0);
    expect(firstRound).toBeDefined();

    const accountLineup = state.lineups.get(ticket.playerLineupId)!;
    const replacementBySlot = {
      LW: "nhl-artemi-panarin-base",
      C: "nhl-auston-matthews-base",
      RW: "nhl-nikita-kucherov-base",
      LD: "nhl-quinn-hughes-base",
      RD: "nhl-adam-fox-base",
      G: "nhl-connor-hellebuyck-base",
    } as const;
    accountLineup.slots[firstRound!.playerSlot] = replacementBySlot[firstRound!.playerSlot];

    await page.reload();
    await expect(page).toHaveURL(/\/play$/);
    await page.getByRole("button", { name: "Start match" }).click();
    await expect(page.getByText("Round 2 of 5")).toBeVisible();

    expect(state.matchTickets.size).toBe(1);
    const resumed = [...state.matchTickets.values()][0];
    expect(resumed.clientMatchId).toBe(originalClientMatchId);
    expect(resumed.seed).toBe(originalSeed);
    expect(resumed.rounds.size).toBe(1);
    expect(state.startMatchCallCount).toBe(2);
  });

  test("persists a Rivalry Road reward choice and owned card across reload", async ({ page }) => {
    const state = createSupabaseMockState(true);
    state.completedMatches = 3;
    state.rivalryRoad = {
      ...state.rivalryRoad,
      current_step_index: 3,
      completed_step_ids: ["nhl-circuit-complete", "pwhl-circuit-complete", "open-ice-pro-win"],
      status: "choice-pending",
      selected_card_id: null,
    };
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto("/objectives");

    const chooseKaprizov = page.getByRole("button", { name: "Choose Kirill Kaprizov as your Rivalry Road reward" });
    await chooseKaprizov.click();
    await expect(page.getByRole("status")).toContainText("Featured star added to your collection");
    expect(state.rivalryRoad.status).toBe("complete");
    expect(state.rivalryRoad.selected_card_id).toBe("nhl-kirill-kaprizov-rivalry-2026");
    expect(state.cards.get("nhl-kirill-kaprizov-rivalry-2026")?.quantity).toBe(1);

    await page.reload();
    await expect(chooseKaprizov).toBeDisabled();
    await expect(chooseKaprizov).toHaveText("Added to collection");
    await page.getByRole("link", { name: "Cards", exact: true }).click();
    await page.getByLabel("Search collection").fill("Kirill Kaprizov");
    await expect(page.getByRole("article", { name: /Kirill Kaprizov, 94 overall/i })).toBeVisible();
  });

  test("restores a stored session and supports logout", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /own the ice/i })).toBeVisible();
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("keeps onboarding open when a duplicate claim is rejected", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: false, duplicateClaim: true });
    await page.goto("/");
    await page.getByRole("button", { name: "Choose Edmonton Oilers" }).click();
    await expect(page.getByRole("alert")).toContainText("Starter team has already been claimed");
    await expect(page.getByRole("button", { name: "Choose Edmonton Oilers" })).toBeEnabled();
  });

  test("shows authentication failures", async ({ page }) => {
    await installSupabaseMock(page, { loginError: true });
    await page.goto("/");
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid login credentials");

  });
});
