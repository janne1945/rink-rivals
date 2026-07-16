import { expect, test } from "@playwright/test";

import { createSupabaseMockState, installSupabaseMock, seedRivalryChallenge } from "./supabaseMock";

test.describe("Golden Ghost Rivalry journey", () => {
  test("moves from a safe public invite through a reward-free authoritative match and into the creator inbox", async ({ page, context }) => {
    test.slow();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const state = createSupabaseMockState();
    const source = seedRivalryChallenge(state);
    const creditsBefore = state.credits;
    const matchesBefore = state.completedMatches;
    await installSupabaseMock(page, { authenticated: true, state });

    await page.goto(`/challenge/${source.slug}`);
    await expect(page.getByRole("heading", { name: /Morgan left a team on the ice/i })).toBeVisible();
    await expect(page.getByText("Ghost OVR")).toBeVisible();
    await expect(page.getByText("82", { exact: true })).toBeVisible();
    for (const cardId of Object.values(source.playerSlots)) {
      await expect(page.locator(`[data-card-image='${cardId}']`)).toHaveCount(0);
      await expect(page.getByText(cardId, { exact: true })).toHaveCount(0);
    }
    await page.getByRole("link", { name: "Sign in to face the ghost" }).click();
    await expect(page).toHaveURL(new RegExp(`/accept/${source.slug}$`));
    await expect(page.getByRole("heading", { name: "Face Morgan's five" })).toBeVisible();
    await expect(page.getByText(/No Credits, cards, goals, or progression/i)).toBeVisible();
    await page.getByRole("button", { name: "Accept and enter the arena" }).click();
    await expect(page).toHaveURL(/\/match$/);
    await expect(page.locator("[data-player-hand] button:not([disabled])").first()).toBeVisible();
    const acceptedTicket = [...state.matchTickets.values()].find((ticket) => state.ghostAttemptSlugs.has(ticket.clientMatchId));
    expect(acceptedTicket?.opponentSlots).toEqual(acceptedTicket?.playerSlots);
    expect(acceptedTicket?.opponentSlots).not.toEqual(source.playerSlots);

    for (let round = 0; round < 5; round += 1) {
      const card = page.locator("[data-player-hand] button:not([disabled])").first();
      await card.click();
      await expect(page.getByLabel("Rival card concealed")).toBeVisible();
      await page.getByRole("button", { name: "Reveal cards" }).click();
      await expect(page.getByRole("region", { name: `Round ${round + 1} result` })).toBeVisible();
      await expect(page.locator(`[data-card-image='${source.ghostSelections[round].cardId}']`)).toBeVisible();
      await page.getByRole("button", { name: round === 4 ? "Final horn" : "Continue" }).click();
    }

    await expect(page.getByText(/No Credits, cards, goals, or progression were awarded/i)).toBeVisible();
    expect(state.credits).toBe(creditsBefore);
    expect(state.completedMatches).toBe(matchesBefore);
    expect(state.ghostSettlements.size).toBe(1);
    await expect(page.getByRole("button", { name: "Create Ghost Rivalry" })).toHaveCount(0);
    await page.goto("/ghost");
    await expect(page.getByRole("heading", { name: "Live Ghost Challenge" })).toBeVisible();
    await expect(page.getByText(/Both choices stay hidden until both players lock/i)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(browserErrors).toEqual([]);
  });

  test("abandons a Ghost attempt through Exit match and accepts the challenge again", async ({ page }) => {
    const state = createSupabaseMockState();
    const source = seedRivalryChallenge(state);
    await installSupabaseMock(page, { authenticated: true, state });
    await page.goto(`/accept/${source.slug}`);
    await page.getByRole("button", { name: "Accept and enter the arena" }).click();
    await expect(page).toHaveURL(/\/match$/);
    const firstAttempt = [...state.matchTickets.values()].find((ticket) => state.ghostAttemptSlugs.has(ticket.clientMatchId))!;
    await page.getByRole("button", { name: "Exit match" }).click();
    await page.getByRole("button", { name: "Abandon match" }).click();
    await expect(page).toHaveURL(/\/play$/);
    expect(firstAttempt.status).toBe("abandoned");
    await page.goto(`/accept/${source.slug}`);
    await page.getByRole("button", { name: "Accept and enter the arena" }).click();
    await expect(page).toHaveURL(/\/match$/);
    expect([...state.matchTickets.values()].filter((ticket) => ticket.status === "open")).toHaveLength(1);
  });

  test("retries a lost acceptance response with the same server attempt", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "One retry contract check is sufficient.");
    const state = createSupabaseMockState();
    const source = seedRivalryChallenge(state);
    await installSupabaseMock(page, { authenticated: true, rivalryStartResponseLossOnce: true, state });

    await page.goto(`/accept/${source.slug}`);
    const accept = page.getByRole("button", { name: "Accept and enter the arena" });
    await accept.click();
    await expect(accept).toBeEnabled();
    expect(state.matchTickets.size).toBe(1);
    const firstAttemptId = [...state.matchTickets.keys()][0];

    await accept.click();
    await expect(page).toHaveURL(/\/match$/);
    expect(state.matchTickets.size).toBe(1);
    expect([...state.matchTickets.keys()][0]).toBe(firstAttemptId);
  });
});
