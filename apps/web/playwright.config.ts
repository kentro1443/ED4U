import { defineConfig } from "@playwright/test";

/**
 * E2E runs on a dedicated port. Port 3000 is a common default and was found
 * occupied by an unrelated legacy application, which made Playwright silently
 * test the wrong product; 3010 is the developer's own ED4U dev server. 3020 is
 * reserved for tests so a run never depends on, or disturbs, either.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3020);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: BASE_URL },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `npx next dev --port ${PORT}`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        // Development-only bypass, documented in .env.example. It lets E2E sign
        // in with the deterministic seed password without mutating it, so the
        // demo credentials in README stay valid after a test run.
        env: { DEMO_SKIP_PASSWORD_CHANGE: "true" },
      },
});
