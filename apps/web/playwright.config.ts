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
  /**
   * One worker, deliberately.
   *
   * Every spec drives the same demo accounts (HS000002 and AD000001 appear in
   * six files) against a single shared database, so parallel files race on the
   * same rows: a room request one spec cancels is a room request another spec
   * is asserting on. Running against the production server made the suite fast
   * enough for that race to surface as failures that move between runs.
   *
   * The alternative — per-spec fixture isolation — is the better long-term
   * answer, but it is a data-model change, not a config change. Until then a
   * serial run is the honest gate: the suite takes ~2 minutes and its result
   * means something.
   */
  workers: 1,
  use: { baseURL: BASE_URL },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        /**
         * E2E runs against the production server, not `next dev`.
         *
         * `next dev` compiles each route on first request, so a suite running
         * several workers in parallel pays cold-compile cost concurrently and
         * unrelated specs time out as the app grows — failures that move
         * between runs and say nothing about the code. `next start` also means
         * the suite exercises the bundle that actually ships.
         *
         * `verify` builds immediately before this step, so the build here is a
         * fast no-op rebuild in that flow while keeping a standalone
         * `npm run test:e2e` self-sufficient.
         */
        command: `npx next build && npx next start --port ${PORT}`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: false,
        timeout: 300_000,
        // Development-only bypass, documented in .env.example. It lets E2E sign
        // in with the deterministic seed password without mutating it, so the
        // demo credentials in README stay valid after a test run.
        env: { DEMO_SKIP_PASSWORD_CHANGE: "true" },
      },
});
