/* WEB-320 e2e — the template picker: visual grid renders, applying a seed
 * restyles the gallery (design only), undo restores, and the page builder
 * loads for a plan that has it. Runs against the e2e seed's pro org + its
 * designed project. (Thumbs are static R2 images — absent in the local e2e
 * state, so assertions are text-level by design.) */
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
    await page.click("button[type=submit]");
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

test("template picker: browse → apply → gallery reflects → undo", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await gotoWithRetry(page, `/dashboard/projects/${seed.previewProjectId}?tab=gallery`);
  await expect(page.getByText("Start from a template")).toBeVisible({ timeout: 20_000 });
  // Category chips + at least the reference seed card.
  await expect(page.getByRole("tab", { name: "Wedding" })).toBeVisible();
  const card = page.locator("div", { hasText: "Classic Wedding" }).filter({ has: page.getByRole("button", { name: "Apply" }) }).first();
  await expect(page.getByText("Classic Wedding").first()).toBeVisible();

  // Applying replaces an existing design → inline confirm appears.
  await page.getByRole("button", { name: "Apply" }).first().click();
  const confirm = page.getByRole("button", { name: "Confirm" });
  try {
    await confirm.waitFor({ state: "visible", timeout: 4_000 });
    await confirm.click();
  } catch {
    // no prior design → applied immediately
  }
  await expect(page.getByText(/applied — your photos, a new look/i)).toBeVisible({ timeout: 15_000 });

  // The client-view preview renders the seed's hero copy.
  await gotoWithRetry(page, `/g/${seed.previewProjectId}/preview`);
  await expect(page.getByText("Anna & Benjamin").first()).toBeVisible({ timeout: 20_000 });

  // Undo restores the prior design (the WEB-301 cover config).
  await gotoWithRetry(page, `/dashboard/projects/${seed.previewProjectId}?tab=gallery`);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Previous design restored.")).toBeVisible({ timeout: 15_000 });
  await gotoWithRetry(page, `/g/${seed.previewProjectId}/preview`);
  await expect(page.getByText("Anna & Elias").first()).toBeVisible({ timeout: 20_000 });
});

test("page builder loads for the pro org", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await gotoWithRetry(page, `/dashboard/projects/${seed.previewProjectId}/builder`);
  await expect(page.getByText("Page builder")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Sections").first()).toBeVisible();
  await expect(page.getByText("+ Add section")).toBeVisible();
  // Theme tab carries the font selector from the self-hosted pack.
  await page.getByRole("button", { name: "Theme" }).click();
  await expect(page.getByText("Type scale")).toBeVisible();
});
