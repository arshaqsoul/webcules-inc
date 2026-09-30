/* 2FA E2E (WEB-279) — the full lifecycle against real Better Auth endpoints:
 * enable (password → QR secret → live-code verify → backup codes), sign-in
 * with TOTP, sign-in with a backup code, disable (code + password), then a
 * plain password sign-in again. TOTP codes are computed locally (RFC 6238,
 * HMAC-SHA1) from the secret the setup screen shows. */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const seed = JSON.parse(readFileSync(join(process.cwd(), "tests", "e2e", ".seed.json"), "utf8"));

/* ---------- RFC 6238 TOTP (better-auth defaults: 6 digits, 30s, SHA-1) ---------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret: string, windowOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const h = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** Open one of the security card's inline steps. The dev workerd crashes
 * once per boot on Windows and vite HMR can reset client state — a full
 * reload per attempt sidesteps both instead of chasing stale DOM. */
async function openStep(page: Page, opener: { button: string; marker: string }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await gotoWithRetry(page, "/dashboard/settings/security");
    await page.waitForLoadState("networkidle");
    const btn = page.getByRole("button", { name: opener.button });
    try {
      await btn.waitFor({ state: "visible", timeout: 15_000 });
      await btn.click();
      await page.locator(opener.marker).waitFor({ state: "visible", timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error(`could not open step "${opener.button}"`);
}

/** Fill the live TOTP input; on failure (window rolled over mid-test) retry
 * with the neighboring windows. Adds spacing so the plugin's per-endpoint
 * rate limit (3/10s) never trips across steps. */
async function fillLiveTotp(page: Page, secret: string, selector: string) {
  await page.waitForTimeout(3_500);
  for (const offset of [0, 1, -1]) {
    await page.fill(selector, totp(secret, offset));
    await page.click("button[type=submit]");
    const wrong = await page
      .locator("text=/didn't work|didn't match/i")
      .first()
      .isVisible({ timeout: 6_000 })
      .catch(() => false);
    if (!wrong) return;
    await page.waitForTimeout(3_500);
  }
  throw new Error("TOTP verification failed for all time windows");
}

/* ---------- shared helpers ---------- */

/** The dev workerd runtime restarts once on cold boot on Windows — the first
 * navigation can hit an empty response mid-restart. Retry it. */
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

async function loginPassword(page: Page) {
  for (let i = 0; ; i++) {
    await gotoWithRetry(page, "/login");
    try {
      await page.locator("#email").waitFor({ state: "visible", timeout: 10_000 });
      break;
    } catch {
      // a stale session bounces /login → /dashboard; clear and retry
      await page.context().clearCookies();
      if (i >= 3) throw new Error("login form never appeared (dev-server crash window)");
    }
  }
  await page.fill("#email", seed.userEmail);
  await page.fill("#password", "TestPass123!x");
  await page.waitForLoadState("networkidle");
  await page.click("button[type=submit]");
  // 2FA-enabled accounts stay on /login showing the code step instead.
  await Promise.race([
    page.waitForURL(/dashboard/, { timeout: 20_000 }).then(() => "dash" as const),
    page.getByText("Two-factor code").waitFor({ timeout: 20_000 }).then(() => "2fa" as const),
  ]);
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

test("2FA lifecycle: enable → TOTP sign-in → backup-code sign-in → disable", async ({ page }) => {
  test.setTimeout(180_000);

  // --- enable: password → secret → live code → backup codes shown once ---
  await loginPassword(page);
  await openStep(page, { button: "Enable two-factor", marker: "#twofa-password" });
  await page.fill("#twofa-password", "TestPass123!x");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("code").first()).toBeVisible({ timeout: 10_000 });
  const secret = ((await page.locator("code").first().textContent()) ?? "").trim();
  expect(secret.length).toBeGreaterThanOrEqual(16);

  await fillLiveTotp(page, secret, "#twofa-setup-code");
  await expect(page.getByText("Save your backup codes now")).toBeVisible({ timeout: 10_000 });
  const codes = await page.getByRole("main").locator("ol li").allTextContents(); // sidebar setup card has its own list
  expect(codes.length).toBe(10);
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.getByText("Two-factor authentication").first()).toBeVisible();
  await expect(page.locator("text=/^On$/").first()).toBeVisible();

  // --- sign out, sign back in: TOTP step appears and passes ---
  await logout(page);
  await loginPassword(page);
  await expect(page.getByText("Enter the 6-digit code")).toBeVisible({ timeout: 10_000 });
  await fillLiveTotp(page, secret, "#code");
  await page.waitForURL(/dashboard/, { timeout: 15_000 });

  // --- sign out, sign in with a backup code ---
  await logout(page);
  await loginPassword(page);
  await page.getByRole("button", { name: "Use a backup code instead" }).click();
  await page.fill("#code", codes[0]);
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/, { timeout: 15_000 });

  // --- disable: code + password ---
  await openStep(page, { button: "Disable…", marker: "#twofa-off-code" });
  await page.fill("#twofa-off-password", "TestPass123!x");
  await fillLiveTotp(page, secret, "#twofa-off-code");
  await expect(page.locator("text=/^Off$/").first()).toBeVisible({ timeout: 10_000 });

  // --- plain password sign-in works again ---
  await logout(page);
  await loginPassword(page);
  await expect(page.getByText("Enter the 6-digit code")).toBeHidden();
  await page.waitForURL(/dashboard/, { timeout: 15_000 });
});
