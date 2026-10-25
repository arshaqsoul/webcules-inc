/* WEBC-117 — the Billing feature chips must tell the tier truth from
 * lib/plans-data.ts. On the free studio the capability chips strike through
 * (locked) and "Custom form fields" shows its REAL cap (up to 2 — the API
 * allows it; the old chip struck the feature through); on the pro studio
 * everything reads included. Serial: reuses the seeded orgs. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

const LOCKED_FEATURES = [
  "Booking page designer",
  "Designed galleries + client app",
  "Slideshows w/ music + sharing",
  "Download PIN + web size",
];
const STUDIO_FEATURES = ["Sneak peeks + approvals", "Per-photo insights"];

async function setActiveOrg(page: import("@playwright/test").Page, organizationId: string) {
  await page.evaluate(
    async (orgId) => {
      const res = await fetch("/api/auth/organization/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) throw new Error(`set-active failed: ${res.status}`);
    },
    organizationId,
  );
}

/** Hydration gate — the chips render client-side after /api/studio/plan. */
async function chipsLoaded(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await page.getByText(/galleries/).first().waitFor({ state: "visible" });
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  // login once per test (cheap, keeps each step independently re-runnable).
  // The dev server occasionally drops its first socket (cold compile) —
  // same retry guard as domains.spec.ts.
  for (let i = 0; ; i++) {
    try {
      await page.goto("/login", { timeout: 30_000 });
      break;
    } catch (err) {
      if (i >= 2) throw err;
      await page.waitForTimeout(2_000);
    }
  }
  await page.fill("#email", seed.userEmail);
  await page.fill("#password", "TestPass123!x");
  // wait for hydration before clicking — a pre-hydration click falls through
  // to the browser's native form GET (?email=…&password=…) and never signs in.
  // networkidle alone has proven too tight on a cold wrangler dev, so give
  // React a moment to attach before the first click.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]");
    try {
      await page.waitForURL(/dashboard/, { timeout: 20_000 });
      break;
    } catch {
      if (i >= 2) throw new Error("login did not reach the dashboard after retries");
      if (page.url().includes("login?")) await page.goto("/login");
      await page.fill("#email", seed.userEmail);
      await page.fill("#password", "TestPass123!x");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1_500);
    }
  }
});

test("free studio: locked chips strike through, custom fields show the real cap", async ({ page }) => {
  await setActiveOrg(page, seed.freeOrgId);
  await page.goto("/dashboard/settings/billing");
  await chipsLoaded(page);

  // The corrected chip: the API allows up to 2 custom fields on Free —
  // never a strike-through again.
  await expect(page.getByText("Custom form fields · up to 2")).toBeVisible();

  for (const label of [...LOCKED_FEATURES, ...STUDIO_FEATURES]) {
    const chip = page.locator("span.line-through").filter({ hasText: label });
    await expect(chip, `${label} must read locked on Free`).toHaveCount(1);
  }
});

test("pro studio: the same chips read included, custom fields unlimited", async ({ page }) => {
  await setActiveOrg(page, seed.proOrgId);
  await page.goto("/dashboard/settings/billing");
  await chipsLoaded(page);

  await expect(page.getByText("Unlimited custom form fields")).toBeVisible();

  for (const label of [...LOCKED_FEATURES, ...STUDIO_FEATURES]) {
    const included = page.locator("section span.rounded-full").filter({ hasText: label }).filter({ hasNot: page.locator(".line-through") });
    await expect(included, `${label} must read included on Pro`).toHaveCount(1);
  }
  // and nothing in the capability set is struck through on Pro.
  for (const label of [...LOCKED_FEATURES, ...STUDIO_FEATURES]) {
    await expect(page.locator("span.line-through").filter({ hasText: label })).toHaveCount(0);
  }
});
