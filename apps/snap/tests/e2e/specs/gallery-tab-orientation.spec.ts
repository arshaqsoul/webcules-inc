/* Gallery tab orientation E2E (WEBC-114) — the Client gallery tab must
 * surface sharing and download protection up front instead of hiding them
 * in a 4,000px scroll:
 *  - a step map (Design → Select files → Protect & settings → Share →
 *    Uploads) whose anchors all exist and whose "Select files" step really
 *    lands on the Files tab;
 *  - a pre-share protection panel listing PIN / web sizes / favorites-only /
 *    email capture / approvals with the correct plan locks (Lite+ /
 *    Studio+) BEFORE any share link exists;
 *  - with zero approved files, a real "Approve files" link to ?tab=files.
 * UI-only change — server behaviour (share creation, per-link settings,
 * selection-only enforcement) is covered by tests/integration and must not
 * change. */
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
  classicProjectId: string;
  freeFilesProjectId: string;
} => JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

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

test("step map + protection panel render on Studio+ before any link exists", async ({ page }) => {
  await login(page, readSeed().proOrgId);
  await gotoWithRetry(page, `/dashboard/projects/${readSeed().classicProjectId}?tab=gallery`);

  // The five steps, in order, with "Select files" pointing at the Files tab.
  const steps = page.getByRole("navigation", { name: "Client gallery steps" });
  await expect(steps).toBeVisible();
  const labels = await steps.getByRole("link").allInnerTexts();
  expect(labels.map((l) => l.replace(/\d/g, "").trim())).toEqual([
    "Design",
    "Select files",
    "Protect & settings",
    "Share",
    "Uploads",
  ]);
  expect(await steps.getByRole("link", { name: /Select files/ }).getAttribute("href")).toMatch(/tab=files$/);

  // Every anchor target exists on the page.
  for (const id of ["gallery-design", "download-protection", "share", "client-uploads"]) {
    expect(await page.locator(`#${id}`).count()).toBe(1);
  }

  // Pre-share protection panel: every option visible with NO grants on the
  // project, and on Studio+ nothing is locked.
  const panel = page.locator("#download-protection");
  await expect(panel).toBeVisible();
  for (const name of [
    "Download PIN",
    "Web sizes (2048px · 1280px)",
    "Favorites only",
    "Email before download",
    "Download approvals",
  ]) {
    await expect(panel.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(panel.getByRole("link", { name: /Upgrade/ })).toHaveCount(0);
  await expect(panel.getByText("Included")).toHaveCount(5);
});

test("Free sees plan locks on every gated option and 'Approve files' lands on the Files tab", async ({ page }) => {
  await login(page, readSeed().freeOrgId);
  await gotoWithRetry(page, `/dashboard/projects/${readSeed().freeFilesProjectId}?tab=gallery`);

  const panel = page.locator("#download-protection");
  await expect(panel).toBeVisible();
  // Four Lite locks + the Studio approvals lock — the photographer can see
  // what each option costs BEFORE creating a link.
  await expect(panel.getByRole("link", { name: "Lite · Upgrade" })).toHaveCount(4);
  await expect(panel.getByRole("link", { name: "Studio · Upgrade" })).toHaveCount(1);

  // Nothing approved on this project → a real link to the Files tab.
  const approve = page.getByRole("link", { name: /Approve files on the Files tab/ });
  await expect(approve).toBeVisible();
  await approve.click();
  await expect(page).toHaveURL(/tab=files/);
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
});
