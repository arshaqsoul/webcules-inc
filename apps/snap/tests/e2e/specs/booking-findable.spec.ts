/* Booking findability E2E (WEBC-112) — the public booking link must be
 * reachable in ≤2 clicks from the sidebar on every tier: Calendar →
 * "Booking page" tab → copy. Also guards the Settings rename ("Embeds" →
 * "Website & booking", SAME route /dashboard/settings/embeds) and the new
 * page order: booking link + designer first, widget snippets second.
 * Free sees the link + copy ungated and the Lite upsell on the designer;
 * Pro gets the editable designer. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// server.mjs writes .seed.json only at the END of its boot (after migrate +
// seed, before wrangler dev answers /__ready). Reading it lazily inside the
// tests — not at module top — means we always get the CURRENT run's values,
// even on a fresh checkout where the file doesn't exist at collection time.
const readSeed = (): {
  userEmail: string;
  proOrgId: string;
  freeOrgId: string;
} => JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

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

test("Calendar → Booking page tab → copy link works on Free", async ({ page }) => {
  await login(page, readSeed().freeOrgId);

  // Sidebar → Calendar (click 1) → Booking page pill (click 2) → copy.
  await gotoWithRetry(page, "/dashboard/calendar");
  await page.getByRole("link", { name: "Booking page" }).click();
  await expect(page).toHaveURL(/tab=booking/);
  await expect(page.getByRole("heading", { name: "Booking page" })).toBeVisible();

  const copyButton = page.getByRole("button", { name: "Copy booking link" });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(copyButton).toHaveText(/Copied/);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/\/b\//);

  // Free: the designer upsell shows here and the copy is NOT gated.
  await expect(page.getByText("included with Lite and above")).toBeVisible();
});

test("Settings row is renamed to 'Website & booking' with designer first (Free)", async ({ page }) => {
  await login(page, readSeed().freeOrgId);

  // Same route as before the rename — bookmarks and the setup checklist keep working.
  await gotoWithRetry(page, "/dashboard/settings/embeds");
  const renamedRow = page.getByRole("link", { name: "Website & booking" });
  await expect(renamedRow.first()).toBeVisible();

  // Page order: the Booking page card (designer + public link) leads, the
  // Embeds widget snippets follow.
  const bookingHeading = page.getByRole("heading", { name: "Booking page" });
  const embedsHeading = page.getByRole("heading", { name: "Embeds", exact: true });
  await expect(bookingHeading).toBeVisible();
  await expect(embedsHeading).toBeVisible();
  const bookingY = (await bookingHeading.boundingBox())!.y;
  const embedsY = (await embedsHeading.boundingBox())!.y;
  expect(bookingY).toBeLessThan(embedsY);

  // The Calendar "Customize" action deep-links to the designer anchor.
  expect(await page.locator("#booking-page").count()).toBe(1);

  // Free: link copy works, the designer stays locked.
  const copyButton = page.getByRole("button", { name: "Copy booking link" }).first();
  await copyButton.click();
  await expect(copyButton).toHaveText(/Copied/);
  await expect(page.getByRole("link", { name: "Upgrade to Lite →" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save booking page" })).toHaveCount(0);
});

test("Pro gets the same entry points with an editable designer", async ({ page }) => {
  await login(page, readSeed().proOrgId);

  await gotoWithRetry(page, "/dashboard/calendar?tab=booking");
  await expect(page.getByRole("heading", { name: "Booking page" })).toBeVisible();
  await expect(page.getByText("included with Lite and above")).toHaveCount(0);
  await page.getByRole("link", { name: "Customize" }).click();
  await expect(page).toHaveURL(/dashboard\/settings\/embeds#booking-page/);
  await expect(page.getByRole("button", { name: "Save booking page" })).toBeVisible();

  // Free upsell copy never shows on Pro.
  await expect(page.getByRole("link", { name: "Upgrade to Lite →" })).toHaveCount(0);
});
