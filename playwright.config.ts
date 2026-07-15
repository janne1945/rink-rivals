import { defineConfig, devices } from "@playwright/test";

const productionPreview = process.env.E2E_PRODUCTION === "1";
const port = productionPreview ? 4173 : 5173;
const browserTestEnvironment = {
  VITE_SUPABASE_URL: "https://zsyoxpirfxajkruqeqam.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_playwright_mock",
  VITE_MATCH_MOTION_PRESET: "fastBroadcast",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CAPTURE_MATCH_V2 === "1" ? "on" : "off",
  },
  webServer: {
    command: productionPreview
      ? "pnpm preview --host 127.0.0.1"
      : "pnpm dev --host 127.0.0.1",
    port,
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, ...browserTestEnvironment },
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    {
      name: "mobile-landscape",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
      },
    },
    { name: "tablet", use: { ...devices["iPad Mini"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
