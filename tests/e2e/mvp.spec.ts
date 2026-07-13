import { expect, test } from "@playwright/test";

test.describe("Rink Rivals MVP", () => {
  test("loads the club and navigates every primary area without browser errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /own the ice/i })).toBeVisible();
    await expect(page.getByLabel(/credits/i)).toContainText("1,200");

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
    await expect(page.getByText(/Credits added to your club/)).toBeVisible();
    const finalCredits = await page.getByLabel(/credits/i).innerText();
    expect(finalCredits).not.toContain("1,200");
    await page.getByRole("button", { name: "Return to club" }).click();
    await expect(page).toHaveURL("/");
    await page.reload();
    await expect(page.getByLabel(/credits/i)).toContainText(finalCredits.trim());
    await expect(page.getByText("1 matches completed")).toBeVisible();
  });

  test("never overflows the tested viewport", async ({ page }) => {
    await page.goto("/collection");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("edits a valid lineup and restores it after reload", async ({ page }) => {
    await page.goto("/lineups");
    await page.getByRole("button", { name: "Edit six" }).first().click();
    await page.getByRole("button", { name: /Kirill Kaprizov, 93 overall/i }).click();
    await page.getByRole("button", { name: "Save lineup" }).click();
    await expect(page.getByText("Lineup saved to this device.")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Edit six" }).first().click();
    await expect(page.getByRole("tab", { name: /LW Kirill Kaprizov/i })).toBeVisible();
  });
});
