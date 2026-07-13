import { expect, test } from "@playwright/test";

import { installSupabaseMock } from "./supabaseMock";

test.describe("production PWA", () => {
  test.skip(process.env.E2E_PRODUCTION !== "1", "Runs against the production preview only.");

  test("ships an installable manifest and registers its service worker", async ({ page, request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json() as {
      name?: string;
      display?: string;
      start_url?: string;
      icons?: Array<{ src?: string; purpose?: string }>;
    };
    expect(manifest.name).toBe("Rink Rivals");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);

    await installSupabaseMock(page, { authenticated: true, onboardingCompleted: true });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /own the ice/i })).toBeVisible();
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.scope;
    });
    expect(scope).toMatch(/\/$/);
  });
});
