import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
      // E2E (`pnpm test:e2e`) runs the dev server against an ISOLATED miniflare
      // state dir so tests never touch the real local dev database.
      ...(process.env.SNAP_E2E ? { persistState: { path: "tests/e2e/.state" } } : {}),
    }),
  ],
});
