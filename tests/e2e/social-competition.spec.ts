import { expect, test, type Page } from "@playwright/test";

import { createSupabaseMockState, installSupabaseMock } from "./supabaseMock";

async function expectNoViewportOverflow(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

const browserErrors = new WeakMap<Page, string[]>();

test.describe("Social Competition system", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true });
  });

  test.afterEach(async ({ page }) => {
    expect(browserErrors.get(page) ?? []).toEqual([]);
  });

  test("presents Faceoff, Rivalry Arena, and Live Ghost as three separate modes", async ({ page }) => {
    await page.goto("/play");
    await expect(page.getByRole("heading", { name: "Play", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Faceoff", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rivalry Arena", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ghost Challenge", exact: true })).toBeVisible();
    await expect(page.getByText(/No ranking or divisions/i)).toBeVisible();
    await expect(page.getByText(/Pure rivalry, zero rewards/i)).toBeVisible();
    await expectNoViewportOverflow(page);
  });

  test("creates a private Live room with a short code and an explicit reward-free contract", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/ghost");
    await expect(page.getByRole("heading", { name: "Live Ghost Challenge" })).toBeVisible();
    await expect(page.getByText("Exactly 2 players")).toBeVisible();
    await expect(page.getByText("No matchmaking")).toBeVisible();
    await expect(page.getByText("No rewards")).toBeVisible();
    await page.getByRole("button", { name: "Create private room" }).click();
    await expect(page.getByRole("heading", { name: "Waiting for your rival" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy room code RANK26/i })).toBeVisible();
    await expect(page.getByText("Open slot")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ready up" })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Waiting for your rival" })).toBeVisible();
    await expect(page.getByText("RANK26", { exact: true })).toBeVisible();
    await expectNoViewportOverflow(page);
  });

  test("plays all five simultaneous-lock rounds, hides the early choice, and resumes after reload", async ({ page }) => {
    test.setTimeout(60_000);
    const state = createSupabaseMockState();
    const startingCredits = state.credits;
    const startingSeasonXp = state.seasonXp;
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto("/ghost");
    await page.getByLabel("Six-character code").fill("RANK26");
    await page.getByRole("button", { name: "Join Live match" }).click();
    await expect(page.getByRole("heading", { name: "Both clubs are here" })).toBeVisible();
    await page.getByRole("button", { name: "Ready up" }).click();
    await expect(page.getByRole("heading", { name: "Round 1 of 5" })).toBeVisible();

    for (let round = 0; round < 5; round += 1) {
      const availableCards = page.locator("[data-live-hand] button:not([disabled])");
      await expect(availableCards.first()).toBeVisible();
      await availableCards.last().click();
      await page.getByRole("button", { name: "Lock this card" }).click();
      await expect(page.getByRole("heading", { name: "Selection sealed" })).toBeVisible();
      await expect(page.getByText("Your card cannot be changed. Waiting for your rival…")).toBeVisible();
      await expect(page.getByText("Last reveal")).toHaveCount(round === 0 ? 0 : 1);
      await page.reload();
      if (round < 4) {
        await expect(page.getByRole("heading", { name: `Round ${round + 2} of 5` })).toBeVisible();
        await expect(page.getByLabel(`Round ${round + 1} result`)).toBeVisible();
      }
    }

    await expect(page.getByText("Final horn · private match")).toBeVisible();
    await expect(page.getByText("No Credits, Season XP, cards, or objectives were awarded.")).toBeVisible();
    await expect(page.locator("ol").getByRole("listitem")).toHaveCount(5);
    expect(state.credits).toBe(startingCredits);
    expect(state.seasonXp).toBe(startingSeasonXp);
    await expectNoViewportOverflow(page);
  });

  test("shows all 30 guaranteed Season rewards and claims an unlocked tier once", async ({ page }) => {
    const state = createSupabaseMockState();
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto("/season");
    await expect(page.getByRole("heading", { name: "Season Zero: First Shift" })).toBeVisible();
    await expect(page.getByText("No paid track")).toBeVisible();
    await expect(page.getByText("No premium currency")).toBeVisible();
    await expect(page.getByText("No random rewards")).toBeVisible();
    await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(30);
    await expect(page.getByText("NHL Seasonal Star")).toBeVisible();
    await expect(page.getByText("PWHL Seasonal Star")).toBeVisible();
    await page.getByRole("button", { name: "Claim reward" }).first().click();
    await expect(page.getByRole("status")).toContainText("Tier 1 secured");
    expect(state.seasonClaims.get(1)).toBeTruthy();
    await expectNoViewportOverflow(page);
  });

  test("abandons Rivalry Arena through the confirmed exit and immediately starts a fresh Arena", async ({ page }) => {
    const state = createSupabaseMockState();
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true, state });
    await page.goto("/play");
    await page.getByRole("button", { name: "Enter Arena" }).click();
    await expect(page).toHaveURL(/\/match$/);
    await expect(page.getByText("Morgan's Six", { exact: true })).toBeVisible();
    await expect(page.locator("[data-player-hand] button:not([disabled])").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Ghost Rivalry" })).toHaveCount(0);
    const originalTicket = [...state.matchTickets.values()][0]!;
    await page.getByRole("button", { name: "Exit match" }).click();
    await expect(page.getByRole("dialog", { name: "Abandon match?" })).toBeVisible();
    await page.getByRole("button", { name: "Continue match" }).click();
    await expect(page).toHaveURL(/\/match$/);
    await page.getByRole("button", { name: "Exit match" }).click();
    await page.getByRole("button", { name: "Abandon match" }).click();
    await expect(page).toHaveURL(/\/play$/);
    expect(originalTicket.status).toBe("abandoned");
    await page.getByRole("button", { name: "Enter Arena" }).click();
    await expect(page).toHaveURL(/\/match$/);
    expect([...state.matchTickets.values()].filter((ticket) => ticket.status === "open")).toHaveLength(1);
    await expectNoViewportOverflow(page);
  });

  test("confirms browser Back before abandoning an active Arena", async ({ page }) => {
    const state = createSupabaseMockState();
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true, state });
    await page.goto("/play");
    await page.getByRole("button", { name: "Enter Arena" }).click();
    await expect(page).toHaveURL(/\/match$/);
    const ticket = [...state.matchTickets.values()][0]!;
    page.once("dialog", (dialog) => dialog.accept());
    await page.goBack();
    await expect(page).toHaveURL(/\/play$/);
    await expect.poll(() => ticket.status).toBe("abandoned");
  });

  test("keeps a failed Arena abandonment retryable", async ({ page }) => {
    const state = createSupabaseMockState();
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true, abandonErrorOnce: true, state });
    await page.goto("/play");
    await page.getByRole("button", { name: "Enter Arena" }).click();
    const ticket = [...state.matchTickets.values()][0]!;
    await page.getByRole("button", { name: "Exit match" }).click();
    await page.getByRole("button", { name: "Abandon match" }).click();
    await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
    expect(ticket.status).toBe("open");
    await page.getByRole("button", { name: "Abandon match" }).click();
    await expect(page).toHaveURL(/\/play$/);
    expect(ticket.status).toBe("abandoned");
    expect(browserErrors.get(page)).toEqual([expect.stringContaining("503 (Service Unavailable)")]);
    browserErrors.set(page, []);
  });

  test("keeps Live and Season keyboard accessible with motion disabled", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ghost");
    const codeInput = page.getByLabel("Six-character code");
    await codeInput.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Your lineup").last()).toBeFocused();
    await expect(page.locator("[data-live-screen]")).toHaveCSS("animation-name", "none");
    await expectNoViewportOverflow(page);

    await page.goto("/season");
    await expect(page.locator("[data-season-screen]")).toHaveCSS("animation-name", "none");
    await page.getByRole("button", { name: "Claim reward" }).first().focus();
    await expect(page.getByRole("button", { name: "Claim reward" }).first()).toBeFocused();
    await expectNoViewportOverflow(page);
  });
});
