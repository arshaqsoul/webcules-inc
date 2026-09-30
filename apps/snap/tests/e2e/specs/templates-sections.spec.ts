/* Templates sections E2E (WEB-286) — every section page must render for a
 * logged-in studio through the REAL RSC pipeline. Guards the class of bug
 * where a page 500s on document load (e.g. an unserializable function prop
 * passed to a client component) while unit tests and link prefetches stay
 * green — exactly what shipped on 2026-09-30 and blanked invoice-presets +
 * gallery-styles in production. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

const SECTIONS: Array<[string, RegExp]> = [
  ["/dashboard/templates/contracts", /Contract templates/],
  ["/dashboard/templates/forms", /^Forms/],
  ["/dashboard/templates/emails", /^Emails/],
  ["/dashboard/templates/invoice-presets", /Invoice presets/],
  ["/dashboard/templates/gallery-styles", /Gallery styles/],
  ["/dashboard/templates/session-types", /Session types/],
];

/** The dev workerd runtime restarts once on cold boot on Windows (known
 * flake this rig tolerates elsewhere) — the first navigation can hit an
 * empty response mid-restart. Retry it. */
async function gotoWithRetry(page: import("@playwright/test").Page, path: string) {
  for (let i = 0; ; i++) {
    try {
      await page.goto(path, { waitUntil: "load", timeout: 15_000 });
      return;
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForTimeout(5_000);
    }
  }
}

test("all template sections render for a logged-in studio", async ({ page }) => {
  await gotoWithRetry(page, "/login");
  await page.fill("#email", seed.userEmail);
  await page.fill("#password", "TestPass123!x");
  // wait for hydration — a pre-hydration click falls through to a native GET
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]");
    try {
      await page.waitForURL(/dashboard/, { timeout: 8_000 });
      break;
    } catch {
      if (i >= 2) throw new Error("login did not reach the dashboard after retries");
      await page.goto("/login");
      await page.fill("#email", seed.userEmail);
      await page.fill("#password", "TestPass123!x");
      await page.waitForLoadState("networkidle");
    }
  }
  await page.evaluate(async (orgId) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    if (!res.ok) throw new Error(`set-active failed: ${res.status}`);
  }, seed.proOrgId);

  for (const [path, heading] of SECTIONS) {
    await gotoWithRetry(page, path);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(heading);
  }
});

test("old hub URLs redirect to their section", async ({ page }) => {
  await gotoWithRetry(page, "/login");
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
      await gotoWithRetry(page, "/login");
      await page.fill("#email", seed.userEmail);
      await page.fill("#password", "TestPass123!x");
      await page.waitForLoadState("networkidle");
    }
  }
  await page.goto("/dashboard/templates?kind=email_snippet");
  await expect(page).toHaveURL(/templates\/emails/);
  await page.goto("/dashboard/templates");
  await expect(page).toHaveURL(/templates\/contracts/);
});
