/* E2E global setup: just build the worker (the D1 migrate+seed+boot sequence
 * lives in tests/e2e/server.mjs — the webServer wrapper — because Playwright
 * runs globalSetup and webServer concurrently). */
import { execSync } from "node:child_process";

const root = process.cwd();

export default async function globalSetup() {
  // Windows: orphaned workerd processes from earlier runs hold locks on dist/.
  if (process.platform === "win32" && !process.env.CI) {
    try {
      execSync("taskkill /F /IM workerd.exe", { stdio: "ignore", shell: true });
    } catch {
      // none running — fine
    }
  }
  if (process.env.E2E_BUILD === "1") {
    console.log("[e2e-setup] building worker…");
    execSync("pnpm exec vinext build", { stdio: "inherit", cwd: root, shell: true });
  }
}
