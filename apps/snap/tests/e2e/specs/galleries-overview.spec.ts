/* Galleries overview E2E (WEBC-115) — the nav "Galleries" page must read as
 * the studio's live galleries, not a raw share-link log:
 *  - the header slot usage ("n of cap active galleries") comes from the same
 *    entitlement source as Billing, so the number matches the Billing chip;
 *  - rows are grouped per project and dead links (revoked / regenerated /
 *    expired) are hidden by default, reachable behind "Show inactive";
 *  - every row links to its project's Client gallery tab, and "New gallery"
 *    routes through the project picker to that same tab.
 * UI-only change — server enforcement (grant creation, cap gating) must not
 * change; the seeded grant rows exist only to give the UI something real. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const readSeed = (): {
  userEmail: string;
  proOrgId: string;
  freeOrgId: string;
  previewProjectId: string;
  classicProjectId: string;
} => JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

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

async function login(page: import("@playwright/test").Page, orgId: string) {
  await gotoWithRetry(page, "/login");
  await page.fill("#email", readSeed().userEmail);
  await page.fill("#password", "TestPass123!x");
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]");
    try {
      await page.waitForURL(/dashboard/, { timeout: 8_000 });
      break;
    } catch {
      if (i >= 2) throw new Error("login did not reach the dashboard after retries");
      await page.goto("/login");
      await page.fill("#email", readSeed().userEmail);
      await page.fill("#password", "TestPass123!x");
      await page.waitForLoadState("networkidle");
    }
  }
  await page.evaluate(async (id) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id }),
    });
    if (!res.ok) throw new Error(`set-active failed: ${res.status}`);
  }, orgId);
}

test("pro org: grouped rows, inactive hidden by default, toggle reveals them, count matches Billing", async ({ page }) => {
  const seed = readSeed();
  await login(page, seed.proOrgId);
  await gotoWithRetry(page, "/dashboard/galleries");

  // Pro = no gallery cap → the count line, matching Billing's "Unlimited".
  const usage = page.getByTestId("gallery-slot-usage");
  await expect(usage).toHaveText("3 active galleries");

  // Grouped per project: two sections, newest grant's project first, only
  // the ACTIVE rows visible (1 on Autumn Winds, 2 on Rustic Barn).
  const sections = page.getByTestId("gallery-project-group");
  await expect(sections).toHaveCount(2);
  await expect(sections.first().getByRole("link", { name: "Autumn Winds Shoot" })).toBeVisible();
  await expect(sections.nth(1).getByRole("link", { name: "Rustic Barn Wedding" })).toBeVisible();
  await expect(page.getByText("client-a@test.test")).toBeVisible();
  await expect(page.getByText("client-c@test.test")).toBeVisible();
  // Nothing dead on the page until the toggle is used.
  await expect(page.getByText("revoked", { exact: true })).toHaveCount(0);
  await expect(page.getByText("regenerated", { exact: true })).toHaveCount(0);
  await expect(page.getByText("expired", { exact: true })).toHaveCount(0);

  // The header count equals the number of live rows the page shows.
  expect(await page.getByRole("link", { name: "Open project gallery" }).count()).toBe(3);

  // Toggle reveals the dead rows — no data is lost, just collapsed.
  const toggle = page.getByRole("button", { name: /Show inactive \(3\)/ });
  await toggle.click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
  await expect(page.getByText("regenerated", { exact: true })).toBeVisible();
  await expect(page.getByText("expired", { exact: true })).toBeVisible();
  await expect(page.getByText("client-old@test.test")).toBeVisible();
  expect(await page.getByRole("link", { name: "Open project gallery" }).count()).toBe(6);
  await expect(page.getByRole("button", { name: "Hide inactive" })).toBeVisible();

  // Every row's link lands on that project's Client gallery tab (the first
  // live row belongs to Autumn Winds Shoot = previewProjectId).
  await page.getByRole("link", { name: "Open project gallery" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${seed.previewProjectId}\\?tab=gallery`));
  await expect(page.getByRole("heading", { name: "Client gallery" })).toBeVisible();

  // Billing states the same usage from the same source.
  await gotoWithRetry(page, "/dashboard/settings/billing");
  await expect(page.getByText("Unlimited galleries")).toBeVisible();
});

test("new gallery picker routes into the project's Client gallery tab", async ({ page }) => {
  const seed = readSeed();
  await login(page, seed.proOrgId);
  await gotoWithRetry(page, "/dashboard/galleries");

  await page.getByRole("button", { name: "New gallery" }).click();
  const picker = page.getByLabel("Pick a project for the new gallery");
  await picker.selectOption({ label: "Autumn Winds Shoot" });
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${seed.previewProjectId}\\?tab=gallery`));
});

test("free org at cap: header shows n of 5 with the upgrade link and matches Billing's chip", async ({ page }) => {
  await login(page, readSeed().freeOrgId);
  await gotoWithRetry(page, "/dashboard/galleries");

  // Free cap is 5 (lib/plans-data.ts) and the seed fills exactly 5 slots.
  const usage = page.getByTestId("gallery-slot-usage");
  await expect(usage).toHaveText("5 of 5 active galleries");
  const upgrade = page.getByRole("link", { name: /at your plan cap/ });
  await expect(upgrade).toBeVisible();
  await expect(upgrade).toHaveAttribute("href", "/dashboard/settings/billing");

  // Same number, same page Billing computes it from.
  await gotoWithRetry(page, "/dashboard/settings/billing");
  await expect(page.getByText("5/5 galleries")).toBeVisible();
});
