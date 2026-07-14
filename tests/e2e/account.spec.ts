import { expect, test, type Page } from "@playwright/test";

import { gameCatalog } from "./gameCatalogFixture";
import { createSupabaseMockState, installSupabaseMock } from "./supabaseMock";

const lineupSlots = ["LW", "C", "RW", "LD", "RD", "G"] as const;
const edmontonTeam = gameCatalog.teams.find((team) => team.name === "Edmonton Oilers")!;
const torontoTeam = gameCatalog.teams.find((team) => team.name === "Toronto Sceptres")!;
const edmontonStarter = gameCatalog.starterSquads.find((starter) => starter.teamId === edmontonTeam.id)!;
const torontoStarter = gameCatalog.starterSquads.find((starter) => starter.teamId === torontoTeam.id)!;
const cardsById = new Map(gameCatalog.cards.map((card) => [card.id, card]));
const playersById = new Map(gameCatalog.players.map((player) => [player.id, player]));
const edmontonStarterPlayers = lineupSlots.map((slot) => {
  const card = cardsById.get(edmontonStarter.lineup[slot])!;
  return playersById.get(card.playerId)!;
});
const edmontonStarterLeftWing = cardsById.get(edmontonStarter.lineup.LW)!;
const baseUpgradeCard = gameCatalog.cards
  .filter((card) => {
    const player = playersById.get(card.playerId);
    return card.cardType === "base"
      && card.marketAvailability === "base-market"
      && card.overall > edmontonStarterLeftWing.overall
      && card.price > 0
      && player?.league === "NHL"
      && player.eligiblePositions.some((position) => position === "LW");
  })
  .sort((left, right) => left.price - right.price || right.overall - left.overall)[0]!;
const baseUpgradePlayer = playersById.get(baseUpgradeCard.playerId)!;
const baseUpgradeAccessibleName = new RegExp(`${baseUpgradePlayer.name}, ${baseUpgradeCard.overall} overall`, "i");
const baseUpgradeBuyName = `Buy ${baseUpgradePlayer.name} for ${baseUpgradeCard.price.toLocaleString("en-US")} Credits`;
const torontoSampleCard = cardsById.get(torontoStarter.lineup.LW)!;
const torontoSamplePlayer = playersById.get(torontoSampleCard.playerId)!;
const secondaryPositionPlayer = gameCatalog.players.find((player) =>
  player.active && player.eligiblePositions.some((position) => position !== player.primaryPosition))!;
const secondaryPosition = secondaryPositionPlayer.eligiblePositions.find(
  (position) => position !== secondaryPositionPlayer.primaryPosition,
)!;
const secondaryPositionCard = gameCatalog.cards.find((card) =>
  card.playerId === secondaryPositionPlayer.id && card.cardType === "base")!;
const kaprizovRewardCard = cardsById.get("nhl-kirill-kaprizov-rivalry-2026")!;

async function chooseStarterTeam(page: Page, league: "NHL" | "PWHL", teamName: string): Promise<void> {
  await page.getByRole("group", { name: "Choose a league" }).getByRole("button", { name: league, exact: true }).click();
  await page.getByLabel(`Search ${league} teams`).fill(teamName);
  await page.getByRole("list", { name: `${league} teams` }).getByRole("button", { name: new RegExp(teamName, "i") }).click();
}

async function loginToOnboarding(page: Page): Promise<void> {
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Choose your club" })).toBeVisible();
}

async function completeFiveRoundMatch(page: Page) {
  for (let round = 1; round <= 5; round += 1) {
    await expect(page.getByText(`Round ${round} of 5`)).toBeVisible();
    await page.getByRole("region", { name: "Player hand" }).locator("button[aria-label*='overall']:not([disabled])").first().click();
    const revealShift = page.getByRole("button", { name: "Reveal shift" });
    await expect(revealShift).toBeEnabled();
    await revealShift.click();
    await expect(round === 5
      ? page.getByText("Final horn")
      : page.getByText(`Round ${round + 1} of 5`)).toBeVisible({ timeout: 10_000 });
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
    const sharedSlots = [...sharedState.lineups.values()][0]!.slots;
    const sharedStarterCards = [sharedSlots.LW, sharedSlots.C, sharedSlots.LD, sharedSlots.RW, sharedSlots.G];
    await firstPage.evaluate(async (cards) => {
      const rpc = async (name: string, body: Record<string, unknown>) => {
        const response = await fetch(`https://zsyoxpirfxajkruqeqam.supabase.co/rest/v1/rpc/${name}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(JSON.stringify(await response.json()));
        return response.json();
      };
      await rpc("start_match", { client_match_id: "shared-match", mode: "nhl-circuit", difficulty: "rookie" });
      for (let roundIndex = 0; roundIndex < cards.length; roundIndex += 1) {
        await rpc("play_match_round", {
          client_match_id: "shared-match",
          round_index: roundIndex,
          player_card_id: cards[roundIndex],
          client_request_id: `shared-round-${roundIndex}`,
        });
      }
    }, sharedStarterCards);
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

  test("logs in, previews an NHL starter, claims its team id, and opens the collection", async ({ page }) => {
    await installSupabaseMock(page, { onboardingCompleted: false });
    await page.goto("/collection");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await loginToOnboarding(page);
    await chooseStarterTeam(page, "NHL", edmontonTeam.name);
    await expect(page.getByRole("article", { name: `${edmontonTeam.name} starter preview` }).getByRole("list", { name: "Six starter slots" }).getByRole("listitem")).toHaveCount(6);
    await expect(page.getByText("Starter cards are entry editions")).toBeVisible();
    await page.getByRole("button", { name: "Choose Edmonton Oilers" }).click();
    await expect(page.getByRole("heading", { name: "Collection" })).toBeVisible();
    await expect(page.getByLabel(/credits/i)).toContainText("1,000");
    await expect(page.locator("article")).toHaveCount(6);
  });

  test("claims a PWHL starter and restores the selected club after relogin", async ({ page }) => {
    const state = await installSupabaseMock(page, { onboardingCompleted: false });
    await page.goto("/");
    await loginToOnboarding(page);
    await chooseStarterTeam(page, "PWHL", torontoTeam.name);
    await expect(page.getByRole("article", { name: `${torontoTeam.name} starter preview` }).getByRole("listitem")).toHaveCount(6);
    await page.getByRole("button", { name: `Choose ${torontoTeam.name}` }).click();

    expect(state.selectedTeamId).toBe(torontoTeam.id);
    expect(state.cards.size).toBe(6);
    expect([...state.lineups.values()][0]?.mode).toBe("pwhl-circuit");
    await expect(page.getByRole("heading", { name: "Own the ice", exact: false })).toBeVisible();

    await page.getByRole("button", { name: /Sign out/i }).click();
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("link", { name: "Lineup", exact: true }).click();
    await expect(page.getByRole("heading", { name: `${torontoTeam.name} Starter` })).toBeVisible();
  });

  test("retries a lost starter response idempotently with the same team selection", async ({ page }) => {
    const state = await installSupabaseMock(page, { authenticated: true, onboardingCompleted: false, claimResponseLossOnce: true });
    await page.goto("/");
    await chooseStarterTeam(page, "NHL", edmontonTeam.name);
    const claim = page.getByRole("button", { name: `Choose ${edmontonTeam.name}` });
    await claim.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(claim).toBeEnabled();
    await claim.click();

    await expect(page.getByRole("heading", { name: "Own the ice", exact: false })).toBeVisible();
    expect(state.starterClaimCallCount).toBe(2);
    expect(state.selectedTeamId).toBe(edmontonTeam.id);
    expect(state.cards.size).toBe(6);
    expect(state.lineups.size).toBe(1);
    expect(state.credits).toBe(1000);
  });

  test("completes the central account, market, collection, lineup, match, goals, and relogin path", async ({ page }) => {
    test.setTimeout(90_000);
    const state = await installSupabaseMock(page, { onboardingCompleted: false });
    await page.goto("/");
    await loginToOnboarding(page);
    await chooseStarterTeam(page, "NHL", edmontonTeam.name);
    await page.getByRole("button", { name: "Choose Edmonton Oilers" }).click();

    await page.getByRole("link", { name: "Cards", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(6);

    await page.getByRole("link", { name: "Lineup", exact: true }).click();
    const nhlSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "NHL Circuit", exact: true }) });
    await nhlSection.getByRole("button", { name: "New lineup" }).click();
    await page.getByLabel("Lineup name").fill("Championship Six");
    for (const player of edmontonStarterPlayers) {
      await page.getByRole("button", { name: new RegExp(player.name) }).click();
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
    await page.getByLabel("Search market").fill(baseUpgradePlayer.name);
    await page.getByRole("button", { name: baseUpgradeBuyName }).click();
    await expect(page.getByRole("status")).toContainText("Card added to your collection");

    await page.getByRole("link", { name: "Cards", exact: true }).click();
    await page.getByLabel("Search collection").fill(baseUpgradePlayer.name);
    await expect(page.getByRole("article", { name: baseUpgradeAccessibleName })).toBeVisible();

    await page.getByRole("link", { name: "Lineup", exact: true }).click();
    await page.locator("article").filter({ has: page.getByRole("heading", { name: "Championship Six" }) }).getByRole("button", { name: "Edit six" }).click();
    await page.getByRole("tab", { name: new RegExp(`LW ${edmontonStarterPlayers[0].name}`, "i") }).click();
    await page.getByRole("button", { name: baseUpgradeAccessibleName }).click();
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
    await page.getByLabel("Search collection").fill(baseUpgradePlayer.name);
    await expect(page.getByRole("article", { name: baseUpgradeAccessibleName })).toBeVisible();
    await page.getByRole("link", { name: "Lineup", exact: true }).click();
    const persistedLineup = page.locator("article").filter({ has: page.getByRole("heading", { name: "Championship Six" }) });
    await expect(persistedLineup.getByRole("button", { name: "Active", exact: true })).toBeDisabled();
    await persistedLineup.getByRole("button", { name: "Edit six" }).click();
    await expect(page.getByRole("tab", { name: new RegExp(`LW ${baseUpgradePlayer.name}`, "i") })).toBeVisible();
    expect(state.completedMatches).toBe(1);
    expect(state.cards.get(baseUpgradeCard.id)?.quantity).toBe(1);
  });

  test("prevents a double purchase submit before React can disable the button", async ({ page }) => {
    const state = createSupabaseMockState(true);
    state.credits = baseUpgradeCard.price;
    await installSupabaseMock(page, { authenticated: true, purchaseDelayMs: 200, state });
    await page.goto("/market");
    await page.getByLabel("Search market").fill(baseUpgradePlayer.name);
    const purchase = page.getByRole("button", { name: baseUpgradeBuyName });
    await purchase.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("status")).toContainText("Card added to your collection");
    expect(state.purchaseCallCount).toBe(1);
    expect(state.credits).toBe(0);
    expect(state.cards.get(baseUpgradeCard.id)?.quantity).toBe(1);
  });

  test("shows a purchase server error without charging or losing retryability", async ({ page }) => {
    const state = createSupabaseMockState(true);
    state.credits = baseUpgradeCard.price;
    await installSupabaseMock(page, { authenticated: true, purchaseError: true, state });
    await page.goto("/market");
    await page.getByLabel("Search market").fill(baseUpgradePlayer.name);
    const purchase = page.getByRole("button", { name: baseUpgradeBuyName });
    await purchase.click();
    await expect(page.getByRole("alert")).toContainText("Purchase service temporarily unavailable");
    await expect(purchase).toBeEnabled();
    expect(state.credits).toBe(baseUpgradeCard.price);
    expect(state.cards.has(baseUpgradeCard.id)).toBe(false);
  });

  test("disables an unaffordable purchase without calling the server", async ({ page }) => {
    const state = createSupabaseMockState(true);
    state.credits = Math.max(0, baseUpgradeCard.price - 1);
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto("/market");
    await page.getByLabel("Search market").fill(baseUpgradePlayer.name);
    const purchase = page.getByRole("button", { name: baseUpgradeBuyName });
    await expect(purchase).toBeDisabled();
    await expect(purchase).toHaveText("Not enough Credits");
    expect(state.purchaseCallCount).toBe(0);
  });

  test("shows six event offers and removes them when their server window expires", async ({ page }) => {
    const state = createSupabaseMockState(true);
    state.eventOfferEndsAt = "2026-07-14T12:00:06.000Z";
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto("/market");
    await page.getByRole("button", { name: "Event Shop", pressed: false }).click();
    await expect(page.getByRole("heading", { name: "Franchise Icons" })).toBeVisible();
    state.eventOfferEndsAt = "2026-07-14T11:59:59.000Z";
    const eventOffers = page.getByRole("button", { name: /^Buy .+ for .+ Credits$/ });
    await expect(eventOffers).toHaveCount(6);
    await page.getByLabel("League").selectOption("NHL");
    const nhlOfferCount = await eventOffers.count();
    expect(nhlOfferCount).toBeGreaterThan(0);
    expect(nhlOfferCount).toBeLessThan(6);
    await page.getByLabel("League").selectOption("PWHL");
    const pwhlOfferCount = await eventOffers.count();
    expect(pwhlOfferCount).toBeGreaterThan(0);
    expect(nhlOfferCount + pwhlOfferCount).toBe(6);
    await expect(page.getByRole("heading", { name: "Franchise Icons" })).toBeVisible({ timeout: 9_000 });
    await expect(eventOffers).toHaveCount(0, { timeout: 9_000 });
  });

  test("filters the full catalog by league, team, position, card type, set, overall, price, and ownership", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true });
    await page.goto("/collection");

    await page.getByLabel("Ownership").selectOption("unowned");
    await page.getByLabel("League").selectOption("PWHL");
    await page.getByLabel("Team").selectOption(torontoTeam.id);
    await page.getByLabel("Position").selectOption(torontoSamplePlayer.primaryPosition);
    await page.getByLabel("Card type").selectOption("starter");
    await page.getByRole("combobox", { name: "Set", exact: true }).selectOption(torontoSampleCard.setId);
    await page.getByLabel("Minimum overall").fill(String(torontoSampleCard.overall));
    await page.getByLabel("Maximum overall").fill(String(torontoSampleCard.overall));
    await page.getByLabel("Minimum price").fill(String(torontoSampleCard.price));
    await page.getByLabel("Maximum price").fill(String(torontoSampleCard.price));

    await expect(page.getByRole("article", {
      name: new RegExp(`${torontoSamplePlayer.name}, ${torontoSampleCard.overall} overall, Starter card.*${torontoTeam.name}.*Not owned.*Unavailable`, "i"),
    })).toBeVisible();
  });

  test("includes cards eligible at a secondary position in collection filters", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true });
    await page.goto("/collection");
    await page.getByLabel("Ownership").selectOption("unowned");
    await page.getByLabel("Search collection").fill(secondaryPositionPlayer.name);
    await page.getByLabel("Position").selectOption(secondaryPosition);

    await expect(page.getByRole("article", {
      name: new RegExp(`${secondaryPositionPlayer.name}, ${secondaryPositionCard.overall} overall, Base card`, "i"),
    })).toBeVisible();
  });

  test("never exposes Starter cards as Base Market offers", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true });
    await page.goto("/market");
    await expect(page.getByRole("heading", { name: "Base Market" })).toBeVisible();
    await expect(page.getByRole("article", { name: /Starter card/i })).toHaveCount(0);
    await expect(page.getByLabel("Card type").locator('option[value="starter"]')).toHaveCount(0);
  });

  test("bounds initial collection and market DOM size", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true });
    await page.goto("/collection");
    await expect(page.getByLabel("Collection results").getByRole("article")).toHaveCount(6);

    await page.goto("/market");
    const renderedOffers = page.getByLabel("Market offers").locator(":scope > article");
    await expect(renderedOffers).toHaveCount(48);
    const showMore = page.getByRole("button", { name: "Show more offers" });
    await expect(showMore).toBeVisible();
    expect(await renderedOffers.count()).toBeLessThan(gameCatalog.cards.length);
    await showMore.click();
    await expect(renderedOffers).toHaveCount(96);
  });

  test("keeps onboarding controls at least 44 pixels on every configured viewport", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: false });
    await page.goto("/");
    const undersized = await page.locator("button, input, select").evaluateAll((elements) => elements
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName, width: rect.width, height: rect.height };
      })
      .filter(({ width, height }) => width < 44 || height < 44));
    expect(undersized).toEqual([]);

    const leagueGroup = page.getByRole("group", { name: "Choose a league" });
    await leagueGroup.getByRole("button", { name: "NHL", exact: true }).focus();
    await page.keyboard.press("Tab");
    const pwhlButton = leagueGroup.getByRole("button", { name: "PWHL", exact: true });
    await expect(pwhlButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(pwhlButton).toHaveAttribute("aria-pressed", "true");
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
    await expect(page.getByRole("article", { name: new RegExp(`Kirill Kaprizov, ${kaprizovRewardCard.overall} overall`, "i") })).toBeVisible();
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
    await chooseStarterTeam(page, "NHL", edmontonTeam.name);
    await page.getByRole("button", { name: `Choose ${edmontonTeam.name}` }).click();
    await expect(page.getByRole("alert")).toContainText("Starter team has already been claimed");
    await expect(page.getByRole("button", { name: `Choose ${edmontonTeam.name}` })).toBeEnabled();
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
