/* Store setup wizard E2E (WEBC-121, audit F2+F9) — the /dashboard/store
 * first-run surface guides an empty store through the four setup steps
 * (price list with a product → open → attach → test-buy preview), and the
 * Setup Guide deep link (?setup=1) lands on it. Runs logged in through the
 * REAL RSC pipeline against the seeded PRO studio (no price lists — the
 * wizard's exactly-its-audience state). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

const WIZARD_STEPS = ["Create your first price list", "Open your store", "Attach it to a gallery", "See it as your client"];

async function loginAsOwner(page: Page) {
  for (let i = 0; ; i++) {
    try {
      await page.goto("/login", { waitUntil: "load", timeout: 15_000 });
      break;
    } catch {
      if (i >= 3) throw new Error("login page never loaded");
      await page.waitForTimeout(5_000);
    }
  }
  await page.fill("#email", seed.userEmail);
  await page.fill("#password", "TestPass123!x");
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]");
    try {
      await page.waitForURL(/dashboard/, { timeout: 8_000 });
      break;
    } catch {
      if (i >= 2) throw new Error("login did not reach the dashboard after retries");
    }
  }
  // The owner belongs to three seeded orgs — the PRO studio owns the store.
  await page.evaluate(async (orgId: string) => {
    await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
  }, seed.proOrgId);
}

test("an empty store opens the setup wizard, and ?setup=1 lands on it", async ({ page }) => {
  await loginAsOwner(page);

  // The Setup Guide's "Set up your store" deep link (lib/repos/setup.ts).
  await page.goto("/dashboard/store?setup=1", { waitUntil: "load" });

  await expect(page.getByRole("heading", { name: "Set up your store" })).toBeVisible();
  for (const step of WIZARD_STEPS) {
    // step titles share wording with their action buttons — any match counts
    await expect(page.getByText(step, { exact: true }).first()).toBeVisible();
  }

  // Step 1 hosts the first-run template picker (approved WEB-175 copy).
  await expect(page.getByRole("button", { name: "Use template" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Start from scratch" })).toBeVisible();

  // F2: the money step is a plain primary action, not a subtle toggle.
  await expect(page.getByRole("button", { name: "Open your store" })).toBeDisabled(); // no list yet
});
