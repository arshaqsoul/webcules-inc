/* Sidebar visibility E2E (WEBC-111) — the desktop sidebar must show the
 * Templates and Settings groups without scrolling at common laptop sizes
 * (the old setup card ate the nav's height and pushed both below the fold),
 * and the studio setup checklist must stay reachable from the Overview page
 * with its dismiss/reopen persistence intact. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

async function gotoWithRetry(page: Page, path: string) {
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

/** Login through the real form and land on the dashboard. */
async function login(page: Page) {
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
}

/** The sidebar's Templates/Settings rows must be fully inside the viewport
 * (visible AND below the fold — not clipped by it). */
async function expectGroupsInViewport(page: Page, w: number, h: number) {
  const aside = page.locator("aside");
  for (const name of ["Templates", "Settings"]) {
    const row = aside.getByRole("link", { name, exact: true });
    await expect(row, `${name} row visible at ${w}x${h}`).toBeVisible();
    const box = await row.boundingBox();
    expect(box, `${name} row has a box at ${w}x${h}`).not.toBeNull();
    expect(box!.y, `${name} row top inside viewport at ${w}x${h}`).toBeGreaterThanOrEqual(0);
    expect(
      box!.y + box!.height,
      `${name} row bottom inside viewport at ${w}x${h}`,
    ).toBeLessThanOrEqual(h);
  }
}

async function setupAction(page: Page, action: "dismiss" | "reopen") {
  const res = await page.evaluate(async (a) => {
    const r = await fetch("/api/studio/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: a }),
    });
    return r.status;
  }, action);
  expect(res, `${action} accepted`).toBeLessThan(400);
}

test.describe("sidebar shows Templates/Settings without scrolling (WEBC-111)", () => {
  for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900]] as const) {
    test(`${w}x${h}: both groups fully visible on Overview`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await login(page);
      await page.evaluate(async (orgId) => {
        const res = await fetch("/api/auth/organization/set-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: orgId }),
        });
        if (!res.ok) throw new Error(`set-active failed: ${res.status}`);
      }, seed.freeOrgId);
      await gotoWithRetry(page, "/dashboard");
      await expectGroupsInViewport(page, w, h);
    });
  }
});

test("setup checklist lives on Overview and persists dismiss/reopen (WEBC-111)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page);
  await page.evaluate(async (orgId) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    if (!res.ok) throw new Error(`set-active failed: ${res.status}`);
  }, seed.freeOrgId);
  await gotoWithRetry(page, "/dashboard");

  // The checklist card renders on the Overview page (fresh seeded membership
  // → the first-login panel variant).
  const checklist = page.getByText("Let's get your studio ready");
  await expect(checklist).toBeVisible();

  // …and the sidebar keeps a slim progress link pointing at it.
  await expect(page.getByRole("link", { name: /Studio setup/ })).toBeVisible();

  // Dismissal persists: no checklist, no sidebar progress link.
  await setupAction(page, "dismiss");
  await gotoWithRetry(page, "/dashboard");
  await expect(page.getByText("Let's get your studio ready")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Studio setup/ })).toHaveCount(0);

  // Reopen (the sidebar's "Setup guide" affordance path) restores it.
  await setupAction(page, "reopen");
  await gotoWithRetry(page, "/dashboard");
  await expect(page.getByText("Let's get your studio ready")).toBeVisible();
});
