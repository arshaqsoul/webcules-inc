/* E2E: real browser against a real workerd preview (build + wrangler dev),
 * with an ISOLATED local D1 (tests/e2e/.state — never the dev database).
 * GALLERY_OTP_MODE=off for link-only gallery opens; Turnstile is absent
 * locally (no secret). Unit/integration tests run separately via vitest. */
import { defineConfig } from "@playwright/test";

const PORT = 3000;
// Match better-auth's trustedOrigins (localhost:3000) exactly.
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e/specs",
  timeout: 120_000, // dev-mode first-compile is slow; warmup covers most of it
  retries: 0,
  workers: 1,
  use: {
    baseURL: BASE,
    screenshot: "only-on-failure",
  },
  expect: {
    timeout: 10_000,
  },
  webServer: {
    // Wrapper serializes: reset isolated D1 → migrations → seed → wrangler dev.
    command: "node tests/e2e/server.mjs",
    url: `${BASE}/login`,
    env: { SNAP_E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  globalSetup: "./tests/e2e/global-setup.mjs",
  outputDir: "./tests/e2e/.artifacts",
});
