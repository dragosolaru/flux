import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Escape hatch for sandboxes/CI images that ship a Chromium build which does
// not match the one @playwright/test would download. Set it to an absolute
// path and every project launches that binary instead. Unset in normal CI, so
// the managed browser is used.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "en",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // Only the a11y/layout specs care about a narrow viewport; running the
      // whole suite twice would just double CI time for no extra signal.
      testMatch: /public-pages\.spec\.ts/,
    },
  ],
  // Start the app unless a base URL is provided externally (e.g. preview deploy).
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
