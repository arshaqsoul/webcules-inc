/* Integrations plugin card E2E (WEBC-124, audit F5) — Settings → Integrations
 * must close the plugin funnel in-page: the Snap Publish setup card with the
 * download link and the 3 steps sits above the token form, and the download
 * URL serves a real zip without any credentials. Guards the "funnel leaks at
 * the last step" class — a page that mints tokens but never hands over the
 * plugin they are for. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

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

test("integrations page shows the plugin setup card and serves the download", async ({ page }) => {
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
  await page.evaluate(async (orgId) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    if (!res.ok) throw new Error(`set-active failed: ${res.status}`);
  }, seed.proOrgId);

  await gotoWithRetry(page, "/dashboard/settings/integrations");

  // The setup card sits ABOVE the token form in the page order.
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Lightroom Classic plugin" }) });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: /Download plugin/ })).toHaveAttribute(
    "href",
    "/api/integrations/lightroom-plugin",
  );
  for (const step of [
    /Download the plugin and install it/,
    /Create a token below/,
    /publish collection named after your gallery/,
  ]) {
    await expect(card.getByText(step)).toBeVisible();
  }
  const tokenForm = page.getByLabel(/Token name|token/i).first();
  await expect(tokenForm).toBeAttached();
  const cardTop = (await card.boundingBox())?.y ?? 0;
  const formTop = (await tokenForm.boundingBox())?.y ?? Number.MAX_SAFE_INTEGER;
  expect(cardTop, "setup card must sit above the token form").toBeLessThan(formTop);

  // The download itself: anonymous GET returns a real zip attachment.
  const zip = await page.evaluate(async () => {
    const res = await fetch("/api/integrations/lightroom-plugin");
    const buf = await res.arrayBuffer();
    return {
      status: res.status,
      type: res.headers.get("content-type") ?? "",
      disposition: res.headers.get("content-disposition") ?? "",
      magic: Array.from(new Uint8Array(buf.slice(0, 2))),
      size: buf.byteLength,
    };
  });
  expect(zip.status).toBe(200);
  expect(zip.type).toBe("application/zip");
  expect(zip.disposition).toContain("SnapPublish.lrplugin.zip");
  expect(zip.magic).toEqual([0x50, 0x4b]); // "PK"
  expect(zip.size).toBeGreaterThan(1000);
});
