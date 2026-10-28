import { defineConfig, devices } from "@playwright/test";

// Smoke tests only. Every engine call is stubbed in the browser, so a run costs nothing.
// Local mode keeps PostHog off, so test runs never reach analytics.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3200", channel: "chrome", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npx next build && npx next start -p 3200", // production build: no dev reloads mid-test
    url: "http://localhost:3200/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { LOCAL_RUN_LOG: "1", NEXT_PUBLIC_LOCAL_RUN_LOG: "1" },
  },
});
