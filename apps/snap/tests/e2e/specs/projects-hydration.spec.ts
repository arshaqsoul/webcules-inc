/* Projects kanban hydration E2E (WEB-367) — loads /dashboard/projects in a
 * NON-UTC browser timezone with a seeded event at exactly 00:00 UTC. Before
 * the fix, the worker (UTC) rendered "Oct 18" while the America/Regina client
 * hydrated "Oct 17" → React error #418 (text mismatch) on every load, and
 * React discarded the server HTML. Guards: zero console/page errors, and the
 * card shows the UTC-anchored date. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

// WEB-367: force a client timezone west of UTC so a midnight-UTC event date
// falls on the previous local day — the exact mismatch class from staging.
test.use({ timezoneId: "America/Regina" });

// The seeded "Autumn Winds Shoot" project (pro org) has event_date at
// 2026-10-18T00:00:00Z — midnight UTC, i.e. Oct 17 evening in Regina.
const EVENT_UTC_LABEL = "📅 Oct 18";

/** The dev workerd runtime restarts once on cold boot on Windows (known flake
 * this rig tolerates elsewhere) — the first navigation can hit an empty
 * response mid-restart. Retry it. */
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

test("kanban hydrates clean in a non-UTC timezone (WEB-367)", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

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

  await gotoWithRetry(page, "/dashboard/projects");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Projects");
  // The seeded project card with the midnight-UTC event date is rendered
  // (post-hydration — a mismatch would have made React re-render the board).
  await expect(page.getByText("Autumn Winds Shoot")).toBeVisible();
  await expect(page.getByText(EVENT_UTC_LABEL).first()).toBeVisible();

  // Zero hydration fallout: no uncaught page errors, no console errors
  // (React #418 surfaces as "Minified React error #418" here).
  expect(pageErrors, `pageerrors: ${pageErrors.join(" | ")}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
});
