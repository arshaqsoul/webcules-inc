/* Custom-domains E2E (WEB-233 Layer 3) — the real settings flow against the
 * real worker, with CF + DoH mocked by tests/e2e/server.mjs (CF_API_BASE /
 * DOH_BASE point at 127.0.0.1:3117). Walks: tier-locked upsell (free studio)
 * → add domain on the pro studio → DNS records rendered → publish TXT via
 * the mock → Check status → cert pending → mock cert activates → Check
 * status → Active → remove. Multi-studio: switching studios re-scopes the
 * panel. Serial: the pro-studio flow builds on the seeded org state. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));
const MOCK = `http://127.0.0.1:${seed.mockPort}`;
const HOSTNAME = "gallery.e2e-pro.test";

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

/** Hydration gate — clicks before React attaches are silent no-ops (the
 * login form taught us this the hard way; the panel buttons are the same). */
async function hydrated(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await page.locator("section[aria-label^='Domain '] button, #hostname").first().waitFor({ state: "visible" });
}

async function mockDns(name: string, type: "TXT" | "CNAME", value: string) {
  const res = await fetch(`${MOCK}/__mock/dns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type, value }),
  });
  if (!res.ok) throw new Error("mock dns publish failed");
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  // login once per test (cheap, keeps each step independently re-runnable).
  // The dev server occasionally drops its first socket (cold compile) —
  // same retry guard as booking-widget.spec.ts.
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
  // to the browser's native form GET (?email=…&password=…) and never signs in
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]");
    try {
      await page.waitForURL(/dashboard/, { timeout: 8_000 });
      break;
    } catch {
      if (i >= 2) throw err0();
      if (page.url().includes("login?")) await page.goto("/login");
      await page.fill("#email", seed.userEmail);
      await page.fill("#password", "TestPass123!x");
      await page.waitForLoadState("networkidle");
    }
  }
});

function err0(): Error {
  return new Error("login did not reach the dashboard after retries");
}

test("free studio sees the tier-locked upsell", async ({ page }) => {
  await setActiveOrg(page, seed.freeOrgId);
  await page.goto("/dashboard/settings/domains");
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
  await expect(page.getByText(HOSTNAME)).toHaveCount(0);
});

test("pro studio: add domain renders the DNS records", async ({ page }) => {
  await setActiveOrg(page, seed.proOrgId);
  await page.goto("/dashboard/settings/domains");
  await expect(page.getByText("0 of 2 domains in use")).toBeVisible();

  await page.fill("#hostname", HOSTNAME);
  await hydrated(page);
  await page.getByRole("button", { name: "Add domain" }).click();

  const card = page.locator(`section[aria-label="Domain ${HOSTNAME}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Pending verification")).toBeVisible();
  // records: CNAME row + ownership TXT row (scrape the token for the mock)
  const text = await card.innerText();
  expect(text).toContain("_snap-verify." + HOSTNAME);
  expect(text).toContain("snap-verify=");
  const token = text.match(/snap-verify=[0-9a-f]{32}/)?.[0];
  expect(token).toBeTruthy();
  await mockDns(`_snap-verify.${HOSTNAME}`, "TXT", token!);
  await mockDns(HOSTNAME, "CNAME", "snap-saas-origin.webcules.com");
});

test("check status verifies ownership and issues the certificate", async ({ page }) => {
  await setActiveOrg(page, seed.proOrgId);
  await page.goto("/dashboard/settings/domains");
  const card = page.locator(`section[aria-label="Domain ${HOSTNAME}"]`);
  await hydrated(page);
  await card.getByRole("button", { name: "Check status" }).click();
  // TXT matched → verified → CF custom hostname created → cert pending
  await expect(card.getByText("Certificate issuing")).toBeVisible({ timeout: 20_000 });
});

test("cert activation flips the domain live", async ({ page }) => {
  const res = await fetch(`${MOCK}/__mock/cf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sslStatus: "active", hostnameStatus: "active" }),
  });
  expect(res.ok).toBeTruthy();

  await setActiveOrg(page, seed.proOrgId);
  await page.goto("/dashboard/settings/domains");
  const card = page.locator(`section[aria-label="Domain ${HOSTNAME}"]`);
  await hydrated(page);
  await card.getByRole("button", { name: "Check status" }).click();
  await expect(card.getByText("Active", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText(`https://${HOSTNAME}`)).toBeVisible();
});

test("removal takes the domain off the panel", async ({ page }) => {
  await setActiveOrg(page, seed.proOrgId);
  await page.goto("/dashboard/settings/domains");
  const card = page.locator(`section[aria-label="Domain ${HOSTNAME}"]`);
  await hydrated(page);
  await card.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove domain" }).click();
  await expect(page.locator(`section[aria-label="Domain ${HOSTNAME}"]`)).toHaveCount(0);
  await expect(page.getByText("0 of 2 domains in use")).toBeVisible();
});

test("switching studios re-scopes the panel", async ({ page }) => {
  await setActiveOrg(page, seed.freeOrgId);
  await page.goto("/dashboard/settings/domains");
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
  await expect(page.getByText(HOSTNAME)).toHaveCount(0);
});
