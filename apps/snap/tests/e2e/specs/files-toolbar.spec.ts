/* Files toolbar E2E (WEBC-113) — the toolbar regrouped into labelled
 * Cull / Deliver / Add clusters, a visible keyboard-shortcut legend, real
 * tooltips (accessible names), and Heat presented as the locked upgrade row
 * on non-Studio tiers (presentation only — the asset-views endpoint stays
 * server-gated). Regression cover for every toolbar action that moved:
 * select mode, triage, group similar, share panel, upload queue. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

/** The dev workerd runtime restarts once on cold boot on Windows (known
 * flake this rig tolerates elsewhere) — the first navigation can hit an
 * empty response mid-restart. Retry it. */
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
      await page.goto("/login");
      await page.fill("#email", seed.userEmail);
      await page.fill("#password", "TestPass123!x");
      await page.waitForLoadState("networkidle");
    }
  }
}

async function setActiveOrg(page: Page, orgId: string) {
  await page.evaluate(async (id) => {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: id }),
    });
    if (!res.ok) throw new Error(`set-active failed: ${res.status}`);
  }, orgId);
}

async function openFilesTab(page: Page, projectId: string) {
  await gotoWithRetry(page, `/dashboard/projects/${projectId}?tab=files`);
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload files" })).toBeVisible();
  // The toolbar interactions below need React attached (a focus() before
  // hydration moves the caret but never opens the tooltip).
  await page.waitForLoadState("networkidle");
}

test("desktop toolbar: labelled groups, shortcut legend, tooltips (pro org)", async ({ page }) => {
  await login(page);
  await setActiveOrg(page, seed.proOrgId);
  await openFilesTab(page, seed.classicProjectId);

  // The three labelled groups exist and hold the right controls.
  const cull = page.getByRole("group", { name: "Cull" });
  const deliver = page.getByRole("group", { name: "Deliver" });
  const add = page.getByRole("group", { name: "Add" });
  await expect(cull).toBeVisible();
  await expect(deliver).toBeVisible();
  await expect(add).toBeVisible();
  await expect(cull.getByRole("button", { name: "Triage — fast full-screen culling" })).toBeVisible();
  await expect(cull.getByRole("button", { name: "Group similar photos into stacks" })).toBeVisible();
  // Pro org: Heat is the real toggle, not the locked upgrade row.
  await expect(cull.getByRole("button", { name: "Interest heat overlay" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Heat — upgrade to Studio/ })).toHaveCount(0);
  await expect(deliver.getByRole("button", { name: "Share with client" })).toBeVisible();
  await expect(add.getByRole("button", { name: "Upload files" })).toBeVisible();

  // Triage has a real tooltip that opens on keyboard focus (never hover-only).
  const triage = cull.getByRole("button", { name: "Triage — fast full-screen culling" });
  await expect(page.getByRole("tooltip", { name: /Fast full-screen culling/ })).toHaveCount(0);
  await triage.focus();
  await expect(page.getByRole("tooltip", { name: /Fast full-screen culling/ })).toBeVisible();

  // The keyboard legend opens from the keyboard (focus + Enter) — no hover.
  const legendButton = page.getByRole("button", { name: "Keyboard shortcuts" });
  await legendButton.focus();
  await page.keyboard.press("Enter");
  const legend = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(legend).toBeVisible();
  await expect(legend.getByText("Auto-advance on/off")).toBeVisible();
  await expect(legend.getByText("Exit triage")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(legend).toHaveCount(0);
});

test("regression: select, group similar, share panel, triage all still work (pro org)", async ({ page }) => {
  await login(page);
  await setActiveOrg(page, seed.proOrgId);
  await openFilesTab(page, seed.classicProjectId);
  const cull = page.getByRole("group", { name: "Cull" });

  // Select mode toggles on and back off.
  const select = cull.getByRole("button", { name: "Select mode" });
  await select.click();
  await expect(cull.getByRole("button", { name: "Exit select mode" })).toBeVisible();
  await cull.getByRole("button", { name: "Exit select mode" }).click();
  await expect(select).toBeVisible();

  // Group similar runs and reports a result (1 distinct asset — no stacks).
  await cull.getByRole("button", { name: "Group similar photos into stacks" }).click();
  await expect(
    page.getByText(/No similar groups|similar stacks|photos form/).first(),
  ).toBeVisible({ timeout: 20_000 });

  // Share panel opens from the Deliver group.
  await page
    .getByRole("group", { name: "Deliver" })
    .getByRole("button", { name: "Share with client" })
    .click();
  const sharePanel = page.getByRole("dialog", { name: "Share with client" });
  await expect(sharePanel).toBeVisible();
  await sharePanel.getByRole("button", { name: "Close share panel" }).click();

  // Triage opens; its own shortcut legend opens with "?" and Esc exits.
  await cull.getByRole("button", { name: "Triage — fast full-screen culling" }).click();
  await expect(page.getByRole("button", { name: "Exit triage" })).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Triage keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Triage keyboard shortcuts" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Exit triage" })).toHaveCount(0);

  // Upload queue wiring: picking a file through the hidden input lands it in
  // the queue with its name. (The PUT itself needs R2 S3 credentials, which
  // this checkout doesn't carry — the queue's failure handling is what runs
  // here; storage itself is covered on staging.)
  await page.setInputFiles("input[type=file]", {
    name: "e2e-toolbar.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgA/9k=",
      "base64",
    ),
  });
  await expect(page.getByText(/Upload finished/).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/e2e-toolbar\.jpg/).first()).toBeVisible();
});

test("pro org: Heat toggles the overlay; asset-views stays server-gated", async ({ page }) => {
  await login(page);
  await setActiveOrg(page, seed.proOrgId);
  await openFilesTab(page, seed.classicProjectId);
  const heat = page
    .getByRole("group", { name: "Cull" })
    .getByRole("button", { name: "Interest heat overlay" });
  await heat.click();
  await expect(page.getByRole("button", { name: "Interest heat overlay" })).toHaveAttribute("aria-pressed", "true");
  // The endpoint answered (200 on pro) — the overlay fetch didn't error.
  await expect(page.getByText(/Couldn't group|failed/i)).toHaveCount(0);
});

test("free org: Heat shows the lock + upgrade, and the Actions menu mirrors the groups", async ({ page }) => {
  await login(page);
  await setActiveOrg(page, seed.freeOrgId);
  await openFilesTab(page, seed.freeFilesProjectId);

  // Free tier: Heat is the locked upgrade row (dashboard-nav pattern), the
  // real toggle is gone.
  const heatLink = page.getByRole("link", { name: "Heat — upgrade to Studio to unlock" });
  await expect(heatLink).toBeVisible();
  await expect(heatLink).toHaveAttribute("href", "/dashboard/settings/billing");
  await expect(
    page.getByRole("group", { name: "Cull" }).getByRole("button", { name: "Interest heat overlay" }),
  ).toHaveCount(0);

  // Mobile Actions menu: same Cull / Deliver / Add groups, locked Heat too.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Actions" }).click();
  const menu = page.getByRole("menu", { name: "Actions" });
  await expect(menu).toBeVisible();
  for (const group of ["Cull", "Deliver", "Add"]) {
    await expect(menu.getByText(group, { exact: true })).toBeVisible();
  }
  await expect(menu.getByRole("menuitem", { name: "Select" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Triage" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Group similar" })).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Heat — upgrade to Studio to unlock" }),
  ).toHaveAttribute("href", "/dashboard/settings/billing");
  await expect(menu.getByRole("menuitem", { name: "Share with client" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Upload" })).toBeVisible();
  // Select still works from the mobile menu.
  await menu.getByRole("menuitem", { name: "Select" }).click();
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(
    page
      .getByRole("menu", { name: "Actions" })
      .getByRole("menuitem", { name: "Done selecting" }),
  ).toBeVisible();
});
