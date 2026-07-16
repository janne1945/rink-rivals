import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { gameCatalog } from "./gameCatalogFixture";
import { createSupabaseMockState, installSupabaseMock } from "./supabaseMock";

const reviewDirectory = resolve("docs/ui-redesign/screenshots");
const baseCard = gameCatalog.cards.find((card) => card.cardType === "base" && card.marketAvailability === "base-market")!;

async function warmVisibleCardImages(page: Parameters<typeof installSupabaseMock>[0]): Promise<void> {
  const images = page.getByLabel("Market offers").locator("img[data-card-image]");
  for (let index = 0; index < await images.count(); index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
  }
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("[aria-label='Market offers'] img[data-card-image]")]
    .every((image) => image.complete));
  await page.evaluate(() => window.scrollTo({ top: 0 }));
}

test.describe("Market visual review", () => {
  test.skip(process.env.CAPTURE_MARKET_REVIEW !== "1", "Set CAPTURE_MARKET_REVIEW=1 to refresh documentation screenshots.");

  test("captures the required responsive and offer states", async ({ page }) => {
    test.setTimeout(90_000);
    mkdirSync(reviewDirectory, { recursive: true });

    const state = createSupabaseMockState(true);
    state.credits = 23_450;
    state.cards.set(baseCard.id, { quantity: 1, acquiredAt: "2026-07-14T10:00:00.000Z" });
    await installSupabaseMock(page, { authenticated: true, state });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/market");
    await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible();
    await warmVisibleCardImages(page);
    await page.screenshot({ path: resolve(reviewDirectory, "market-1920x1080.png"), fullPage: true });
    await page.locator("section").filter({ has: page.getByRole("heading", { name: "Market", exact: true }) }).first().screenshot({ path: resolve(reviewDirectory, "market-hero-featured.png") });
    await page.getByRole("heading", { name: "Explore the Market" }).locator("xpath=ancestor::section[1]").screenshot({ path: resolve(reviewDirectory, "market-filters.png") });
    await page.getByLabel("Market offers").screenshot({ path: resolve(reviewDirectory, "market-card-grid.png") });

    const ownedOffer = page.getByLabel("Market offers").locator(":scope > article").filter({ hasText: "Owned ×1" });
    await expect(ownedOffer).toHaveCount(1);
    await ownedOffer.screenshot({ path: resolve(reviewDirectory, "market-card-owned.png") });

    await page.getByLabel("League").selectOption("NHL");
    await page.getByLabel("Position").selectOption("LW");
    await page.getByLabel("Sort offers").selectOption("overall-desc");
    await page.screenshot({ path: resolve(reviewDirectory, "market-active-filters.png"), fullPage: true });

    await page.getByLabel("Search market").fill("no-player-can-match-this-query");
    await expect(page.getByRole("heading", { name: "No Releases Found" })).toBeVisible();
    await page.screenshot({ path: resolve(reviewDirectory, "market-empty-state.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible();
    await warmVisibleCardImages(page);
    await page.screenshot({ path: resolve(reviewDirectory, "market-1440x900.png"), fullPage: true });

    await page.setViewportSize({ width: 820, height: 1180 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible();
    await warmVisibleCardImages(page);
    await page.screenshot({ path: resolve(reviewDirectory, "market-tablet.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible();
    await warmVisibleCardImages(page);
    await page.screenshot({ path: resolve(reviewDirectory, "market-mobile.png"), fullPage: true });

    state.credits = 0;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Market", exact: true })).toBeVisible();
    const unavailableOffer = page.getByLabel("Market offers").locator(":scope > article").filter({ has: page.getByRole("button", { name: /requires .* additional/i }) }).first();
    await expect(unavailableOffer).toBeVisible();
    await unavailableOffer.screenshot({ path: resolve(reviewDirectory, "market-insufficient-rp.png") });
  });
});
