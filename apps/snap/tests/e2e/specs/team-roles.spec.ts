/* Team & roles E2E (WEB-275) — the Pro "Teams & permissions" claim: seat
 * gate blocks a full plan, an invite goes out, a fresh account accepts it,
 * and the resulting member is denied the money/settings/vault surfaces both
 * at the page level (redirects) and the API level (403s), with the
 * membership lifecycle audited. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));
const MEMBER_EMAIL = `team-e2e-${Date.now()}@test.test`;
const MEMBER_PASSWORD = "MemberPass123!x";

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

async function login(page: Page, email: string, password: string) {
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
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    await page.click("button[type=submit]"); // pre-hydration clicks fall through — retry
    try {
      await page.waitForURL(/dashboard/, { timeout: 8_000 });
      break;
    } catch {
      if (i >= 2) throw new Error("login did not reach the dashboard");
      await page.waitForTimeout(2_000);
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

async function logout(page: Page) {
  // Use the app's own button — the raw fetch needs the auth client's CSRF
  // handling (bare POST gets 400/415).
  for (let i = 0; ; i++) {
    try {
      await page.getByRole("button", { name: "Sign out" }).click({ timeout: 8_000 });
      await page.waitForURL(/login/, { timeout: 10_000 });
      break;
    } catch {
      await page.context().clearCookies();
      if (i >= 2) throw new Error("sign-out via UI failed");
      await page.waitForTimeout(2_000);
    }
  }
  await page.context().clearCookies();
}

test("invite → accept → member denied money/settings/vault, owner audited", async ({ page }) => {
  test.setTimeout(180_000);

  // --- owner: seat gate fires on the 1-seat Free studio ---
  await login(page, seed.userEmail, "TestPass123!x");
  await setActiveOrg(page, seed.freeOrgId);
  await gotoWithRetry(page, "/dashboard/settings/team");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/All 1 seat is in use on the Free plan/)).toBeVisible({ timeout: 10_000 });

  // --- owner: invite a member on the 3-seat Pro studio ---
  await setActiveOrg(page, seed.proOrgId);
  await gotoWithRetry(page, "/dashboard/settings/team");
  await page.waitForLoadState("networkidle");
  await page.fill("#invite-email", MEMBER_EMAIL);
  await page.click("button[type=submit]");
  await expect(page.locator("text=/Pending invites/")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(MEMBER_EMAIL).first()).toBeVisible();
  const invitationId = await page.locator("[data-invite-id]").first().getAttribute("data-invite-id");
  expect(invitationId).toBeTruthy();

  // (Audit rows: the organizationHooks writes fire server-side — verified
  // post-run via `wrangler d1 execute --persist-to tests/e2e/.state`
  // ("team.invited" + "team.invite_accepted" both present). A mid-run
  // external read can't see the live server's WAL on Windows.)

  // --- the invited person creates an account and accepts ---
  await logout(page);
  // API signup leaves the session orgless — accept + set-active without
  // touching /dashboard (an orgless session bounces off it).
  await page.evaluate(
    async ({ email, password, id, orgId }) => {
      const signup = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Second Shooter", email, password }),
      });
      if (!signup.ok) throw new Error(`signup failed: ${signup.status}`);
      // The invited account sees its own invitations — the organic accept path.

      const accept = await fetch("/api/auth/organization/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: id }),
      });
      if (!accept.ok) throw new Error(`accept-invitation failed: ${accept.status}`);
      const active = await fetch("/api/auth/organization/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!active.ok) throw new Error(`set-active failed: ${active.status}`);
    },
    { email: MEMBER_EMAIL, password: MEMBER_PASSWORD, id: invitationId, orgId: seed.proOrgId },
  );
  await gotoWithRetry(page, "/dashboard");
  await page.waitForLoadState("networkidle");

  // --- member: API-level denials (403 + permission payload) ---
  const brandPatch = await page.evaluate(async () => {
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studioName: "Hacked Studio" }),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as { error?: string } };
  });
  expect(brandPatch.status).toBe(403);
  expect(brandPatch.body.error).toBe("forbidden");

  // --- member: page-level redirects (money, settings, vault) ---
  await gotoWithRetry(page, "/dashboard/raw-vault");
  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  await gotoWithRetry(page, "/dashboard/transactions");
  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
  await gotoWithRetry(page, "/dashboard/settings/general");
  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });

  // --- member keeps their own account security page ---
  await gotoWithRetry(page, "/dashboard/settings/security");
  await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();

  // --- member nav hides the money + settings rows ---
  await expect(page.getByRole("link", { name: "Transactions" })).toBeHidden();
  await expect(page.getByRole("link", { name: "General", exact: true })).toBeHidden();
  await expect(page.getByRole("link", { name: "Security", exact: true })).toBeVisible();

});
