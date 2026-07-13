import { defineConfig, devices } from "@playwright/test";

const productionPreview = process.env.E2E_PRODUCTION === "1";
const port = productionPreview ? 4173 : 5173;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: productionPreview
      ? "pnpm preview --host 127.0.0.1"
      : "pnpm dev --host 127.0.0.1",
    port,
    reuseExistingServer: !process.env.CI,
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
