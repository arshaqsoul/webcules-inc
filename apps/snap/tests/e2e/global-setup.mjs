/* E2E global setup: just build the worker (the D1 migrate+seed+boot sequence
 * lives in tests/e2e/server.mjs — the webServer wrapper — because Playwright
 * runs globalSetup and webServer concurrently). */
import { execSync } from "node:child_process";

const root = process.cwd();

export default async function globalSetup() {
  // No `taskkill workerd` here: Playwright boots the webServer BEFORE
  // globalSetup, so killing workerd now shot the live preview (requests hung).
  // Orphan cleanup lives at the top of tests/e2e/server.mjs.
  if (process.env.E2E_BUILD === "1") {
    console.log("[e2e-setup] building worker…");
    execSync("pnpm exec vinext build", { stdio: "inherit", cwd: root, shell: true });
  }
}
