import { expect, test } from "@playwright/test";

import { installSupabaseMock } from "./supabaseMock";

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
