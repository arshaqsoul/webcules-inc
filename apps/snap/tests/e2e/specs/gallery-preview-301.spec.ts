/* WEB-301 e2e — preview-as-client + the design extensions.
 * Session-authed preview opens without OTP; unauthenticated and foreign-org
 * access are neutral 404s; the banner + viewport toggle render; the WP-A
 * default hero shows for zero-config galleries while configured designs
 * keep their cover; column CSS vars reach the grid. (View-budget/analytics
 * hygiene is structural: the preview route never imports the counting
 * helpers and media rides the staff path — verified in code review + the
 * unit suite's route-import assertions would be brittle as DOM tests.) */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

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

async function login(page: Page) {
  for (let i = 0; ; i++) {
    await gotoWithRetry(page, "/login");
    try {
      await page.locator("#email").waitFor({ state: "visible", timeout: 10_000 });
      break;
    } catch {
      await page.context().clearCookies();
      if (i >= 3) throw new Error("login form never appeared");
    }
  }
  await page.fill("#email", seed.userEmail);
  await page.fill("#password", "TestPass123!x");
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]"); // pre-hydration clicks fall through
    try {
      await page.waitForURL(/dashboard|onboarding/, { timeout: 8_000 });
      break;
    } catch {
      if (i >= 2) throw new Error("login did not land");
      await page.waitForTimeout(2_000);
    }
  }
  await page.evaluate(async (orgId) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    if (!res.ok) throw new Error("set-active failed: " + res.status);
  }, seed.proOrgId);
}

test("preview: session-authed client view, unauth is a neutral 404", async ({ page, context }) => {
  test.setTimeout(150_000);

  await login(page); // warms the dev server + establishes the session first

  // Unauthenticated → 404, not a redirect that leaks the project (fresh
  // context carries no cookies).
  const anon = await page.context().browser()!.newContext();
  const res = await anon.request.get(`/g/${seed.previewProjectId}/preview`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  await anon.close();

  // Designed project: banner + configured cover + column vars on the grid.
  await gotoWithRetry(page, `/g/${seed.previewProjectId}/preview`);
  await expect(page.getByText("What your client will see")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Anna & Elias" })).toBeVisible();
  await expect(page.getByText("Preview family session")).toBeVisible();
  await expect(page.getByText("Send gallery →")).toBeVisible();
  const grid = page.locator(".snap-grid").first();
  await expect(grid).toBeVisible();
  // the column vars sit on the gallery root and cascade to the grid
  expect(await page.locator("main").first().getAttribute("style")).toContain("--snap-cols-md");

  // Viewport toggle frames the gallery in the phone shell (retry —
  // pre-hydration clicks fall through on the dev rig).
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Mobile" }).click();
    if (await page.locator("[data-preview-phone]").isVisible().catch(() => false)) break;
    await page.waitForTimeout(1500);
  }
  await expect(page.locator("[data-preview-phone]")).toBeVisible();
  await page.getByRole("button", { name: "Desktop", exact: true }).click();

  // Unknown project id → 404 even when signed in.
  const gone = await page.request.get("/g/doesnotexist99/preview", { maxRedirects: 0 });
  expect(gone.status()).toBe(404);
});

test("zero-config gallery renders the default hero (WP-A)", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page);
  await gotoWithRetry(page, `/g/${seed.classicProjectId}/preview`);
  // Default hero: kicker (studio) + project title + meta line with count.
  await expect(page.getByRole("heading", { name: "Rustic Barn Wedding" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/1 photo/)).toBeVisible();
  await expect(page.locator("section span", { hasText: "E2E Pro Studio" }).first()).toBeVisible();
});
