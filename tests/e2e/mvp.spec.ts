import { expect, test } from "@playwright/test";
import { installSupabaseMock } from "./supabaseMock";

async function seedRivalryChoicePending(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const openRequest = indexedDB.open("rink-rivals");
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction("saves", "readwrite");
        const store = transaction.objectStore("saves");
        const getRequest = store.get("primary");
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const record = getRequest.result;
          record.payload.progression.rivalryRoad = {
            status: "choice-pending",
            currentStepIndex: 3,
            completedStepIds: [
              "nhl-circuit-complete",
              "pwhl-circuit-complete",
              "open-ice-pro-win",
            ],
          };
          store.put(record);
        };
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      };
    });
  });
}

async function readPrimarySave(page: import("@playwright/test").Page) {
  return page.evaluate(async () => new Promise<Record<string, unknown>>((resolve, reject) => {
    const openRequest = indexedDB.open("rink-rivals");
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction("saves", "readonly");
      const getRequest = transaction.objectStore("saves").get("primary");
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => resolve(getRequest.result.payload);
      transaction.oncomplete = () => database.close();
    };
  }));
}

test.describe("Rink Rivals MVP", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true });
  });
  test("loads the club and navigates every primary area without browser errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /own the ice/i })).toBeVisible();
    await expect(page.getByLabel(/credits/i)).toContainText("1,000");

    for (const [label, heading] of [
      ["Cards", "Collection"],
      ["Lineup", "Lineups"],
      ["Play", "Faceoff"],
      ["Market", "Player Market"],
      ["Home", /own the ice/i],
    ] as const) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test("completes a deterministic five-round match, grants once, and persists after reload", async ({ page }) => {
    await page.goto("/play");
    await page.getByRole("button", { name: "Start match" }).click();

    for (let round = 1; round <= 5; round += 1) {
      await expect(page.getByText(`Round ${round} of 5`)).toBeVisible();
      const availableCard = page.getByRole("region", { name: "Player hand" }).locator("button[aria-label*='overall']:not([disabled])").first();
      await expect(availableCard).toBeEnabled();
      await availableCard.click();
      await expect(page.getByText("Both locked in")).toBeVisible();
      await page.getByRole("button", { name: "Reveal shift" }).click();
    }

    await expect(page.getByText("Final horn")).toBeVisible();
    await expect(page.getByText(/Match settled on the server/)).toBeVisible();
    const finalCredits = await page.getByLabel(/credits/i).innerText();
    expect(finalCredits).not.toContain("1,000");
    await page.getByRole("button", { name: "Return to club" }).click();
    await expect(page).toHaveURL("/");
    await page.reload();
    await expect(page.getByLabel(/credits/i)).toContainText(finalCredits.trim());
    await expect(page.getByText("1 matches completed")).toBeVisible();
    await page.getByRole("button", { name: "View all goals" }).click();
    await expect(page.getByRole("progressbar", { name: /Circuit tour: 1 of 5/i })).toBeVisible();
    const dropGoal = page.locator("article").filter({
      has: page.getByRole("heading", { name: "Drop the puck", exact: true }),
    });
    await expect(dropGoal.getByText("Completed", { exact: true })).toBeVisible();
    await expect(dropGoal.getByText("Claimed", { exact: true })).toBeVisible();
  });

  test("keeps the completed match retryable when server settlement fails", async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true, settlementError: true });
    await page.goto("/play");
    await page.getByRole("button", { name: "Start match" }).click();
    for (let round = 1; round <= 5; round += 1) {
      await page.getByRole("region", { name: "Player hand" }).locator("button[aria-label*='overall']:not([disabled])").first().click();
      await page.getByRole("button", { name: "Reveal shift" }).click();
    }
    await expect(page.getByText("Match settlement temporarily unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry settlement" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Return to club" })).toBeDisabled();
  });

  test("opens the Goals hub with three dailies, the weekly tour, and Rivalry Road", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "View all goals" }).click();

    await expect(page).toHaveURL(/\/objectives$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("heading", { name: "Goals hub" })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="daily-goals-heading"] article')).toHaveCount(3);
    await expect(page.getByRole("progressbar", { name: /Circuit tour: 0 of 5/i })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="rivalry-road-heading"] li')).toHaveCount(3);
  });

  test("persists an unlocked difficulty and keeps Elite locked", async ({ page }) => {
    await page.goto("/play");
    const rookie = page.getByRole("button", { name: /Rookie Unlocked/i });
    const elite = page.getByRole("button", { name: /Elite Locked/i });

    await expect(page.getByText(/Collection score:/)).toBeVisible();
    await expect(elite).toHaveAttribute("aria-disabled", "true");
    await expect(elite).toContainText(/more Collection Score/);
    await rookie.focus();
    await page.keyboard.press("Enter");
    await expect(rookie).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => {
      const saved = await readPrimarySave(page) as { preferredAiDifficulty?: string };
      return saved.preferredAiDifficulty;
    }).toBe("rookie");
    await page.reload();
    await expect(page.getByRole("button", { name: /Rookie Unlocked/i })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Win +120 · Draw +90 · Loss +60 Credits")).toBeVisible();
  });

  test("ignores legacy local Rivalry Road progress and never writes its reward locally", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /own the ice/i })).toBeVisible();
    await seedRivalryChoicePending(page);
    await page.goto("/objectives");

    await expect(page.getByRole("button", { name: /Choose Kirill Kaprizov as your Rivalry Road reward/i })).toHaveCount(0);
    await expect(page.getByText("NHL Circuit debut")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: /Choose Kirill Kaprizov as your Rivalry Road reward/i })).toHaveCount(0);

    const saved = await readPrimarySave(page) as {
      collection: Record<string, { quantity: number }>;
      progression: {
        rivalryRoad: { selectedCardId?: string };
        rewardHistory: Array<{ type: string; cardId?: string }>;
      };
    };
    expect(saved.progression.rivalryRoad.selectedCardId).toBeUndefined();
    expect(saved.collection["nhl-kirill-kaprizov-rivalry-2026"]).toBeUndefined();
    expect(saved.collection["pwhl-kendall-coyne-schofield-rivalry-2026"]).toBeUndefined();
    expect(saved.progression.rewardHistory.filter((reward) => reward.type === "card")).toHaveLength(0);
  });

  test("strips legacy account and progression data from a V1 device save", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /own the ice/i })).toBeVisible();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("rink-rivals");
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("saves", "readwrite");
          const store = transaction.objectStore("saves");
          const getRequest = store.get("primary");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            const record = getRequest.result;
            const legacy = structuredClone(record.payload);
            delete legacy.preferredAiDifficulty;
            delete legacy.progression;
            legacy.version = 1;
            legacy.credits = 777;
            legacy.completedMatches = 4;
            legacy.collection = { "legacy-card": { cardId: "legacy-card", quantity: 1, acquiredAt: "2026-07-01T10:00:00.000Z" } };
            legacy.completedObjectiveIds = [];
            legacy.eventProgress = {};
            legacy.purchaseHistory = [{
              requestId: "legacy-purchase-1",
              offerId: "base-market:legacy-card",
              cardId: "legacy-card",
              price: 125,
              source: "base_market",
              purchasedAt: "2026-07-01T10:00:00.000Z",
            }];
            legacy.processedPurchaseIds = ["legacy-purchase-1"];
            store.put({ key: "primary", payload: legacy });
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      });
    });

    await page.reload();
    await expect(page.getByLabel(/credits/i)).toContainText("1,000");
    await expect(page.getByText("Make your debut")).toBeVisible();
    const migrated = await readPrimarySave(page) as {
      version: number;
      credits: number;
      completedMatches: number;
      collection: Record<string, { quantity: number }>;
      lineups: Record<string, unknown>;
      processedPurchaseIds: string[];
    };
    expect(migrated.version).toBe(2);
    expect(migrated.credits).toBe(0);
    expect(migrated.completedMatches).toBe(0);
    expect(migrated.collection).toEqual({});
    expect(migrated.lineups).toEqual({});
    expect(migrated.processedPurchaseIds).toEqual([]);
  });

  test("honors reduced motion without horizontal overflow", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/objectives");
    await expect(page.getByRole("heading", { name: "Goals hub" })).toBeVisible();
    expect(await page.evaluate(() => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      return document.getAnimations().every((animation) => {
        const duration = animation.effect?.getComputedTiming().duration;
        return typeof duration === "number" && duration <= 1;
      });
    })).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("never overflows the tested viewport", async ({ page }) => {
    await page.goto("/collection");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("loads the active Supabase lineup and restores it after reload", async ({ page }) => {
    await page.goto("/lineups");
    await expect(page.getByRole("heading", { name: "Edmonton Oilers Starter" })).toBeVisible();
    await page.getByRole("button", { name: "Edit six" }).first().click();
    await expect(page.getByRole("tab", { name: /C Connor McDavid/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /RD Evan Bouchard/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Edmonton Oilers Starter" })).toBeVisible();
    await page.getByRole("button", { name: "Edit six" }).first().click();
    await expect(page.getByRole("tab", { name: /C Connor McDavid/i })).toBeVisible();
  });
});
