/* Unit + integration test runner. Tests execute inside workerd via
 * @cloudflare/vitest-plugin with real D1/R2 bindings from the test wrangler
 * config — the same binding paths prod uses (getDb() reads cloudflare:workers
 * env, which the plugin populates). E2E tests are separate:
 * playwright.config.ts against a wrangler preview. */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(root, ".") },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./tests/wrangler.test.jsonc" },
    }),
  ],
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
