import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the deterministic broker + fixture market data so they
 * are reproducible offline. Mobile viewport project mirrors the responsive
 * requirements in docs/design/RESPONSIVE_BEHAVIOR.md.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      BROKER_PROVIDER: "deterministic",
      MARKET_DATA_PROVIDER: "fixture",
    },
  },
});
