// PP-010 take: the client signs into the portal with email plus a magic code
// and lands on "Your studios" - every delivery in one place.
// Format desktop, seed from record.mjs. Recorded against the local dev server
// (see growth/storyboards/PP-010.md, "Recording target note"): the operator
// points the seeded wedding client row at the demo client address before the
// take and restores it after; the take itself uses no database access at all.

import fs from "node:fs";
import path from "node:path";

export const format = "desktop";

// The demo client. The portal login emails this address a magic code (captured
// to disk on the local target, never delivered), so the safe-recipient guard applies.
const CLIENT = "client@example.com";
export const mask = { allowEmails: [CLIENT] };
export const sendsEmail = true;

const STUDIO_NAME = "Amara & Oak Photography";
const EMAIL_DIR = path.resolve(import.meta.dirname, "..", "..", "apps", "snap", ".wrangler", "tmp", "email");

/** Newest 6-digit code in the locally captured OTP email (dev email worker). */
function capturedOtpCode(afterMs) {
  if (!fs.existsSync(EMAIL_DIR)) return null;
  const newest = [];
  for (const org of fs.readdirSync(EMAIL_DIR)) {
    const dir = path.join(EMAIL_DIR, org, "email-text");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).mtimeMs < afterMs) continue;
      const text = fs.readFileSync(p, "utf8");
      const m = text.match(/\b(\d{6})\b/);
      if (m) newest.push({ mtime: fs.statSync(p).mtimeMs, code: m[1], text });
    }
  }
  newest.sort((a, b) => b.mtime - a.mtime);
  return newest[0]?.code ?? null;
}

export async function fixture({ page, env, log }) {
  // The portal login must be reachable and the email step must render. No data
  // is minted: the operator's client-row flip is the preparation.
  await page.goto(env.url + "/portal", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const emailInput = page.getByPlaceholder("you@example.com");
  await emailInput.waitFor({ state: "visible", timeout: 20000 });
  log("fixture: portal login ready");
}

export async function run({ p, page, env }) {
  // s1 - email in, code out
  p.step("s1", "Clients sign in by email");
  const emailInput = page.getByPlaceholder("you@example.com");
  await p.hover(emailInput, 300);
  await p.type(emailInput, CLIENT);
  const sendBtn = page.getByRole("button", { name: "Email me a code" });
  await p.hover(sendBtn, 250);
  await p.click(sendBtn, { selector: "button send code" });
  const checkState = page.getByText("Enter your code").first();
  await checkState.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(checkState, 400);

  // s2 - the code from the email opens the portal
  p.step("s2", "Six digits, no password");
  const codeInput = page.locator("input[placeholder='••••••']");
  await codeInput.waitFor({ state: "visible", timeout: 15000 });
  // Poll for the emailed code while the cursor keeps visiting the code field,
  // so the wait never reads as a frozen frame.
  let code = null;
  const otpStart = Date.now() - 4000;
  for (let i = 0; i < 40 && !code; i++) {
    await page.waitForTimeout(500);
    code = capturedOtpCode(otpStart);
    if (!code) await p.hover(codeInput, 150);
  }
  if (!code) throw new Error("TAKE STOP: no portal code appeared in the local email capture within 30s");
  await p.type(codeInput, code);
  const openBtn = page.getByRole("button", { name: "Open my portal" });
  await p.hover(openBtn, 250);
  await p.click(openBtn, { selector: "button Open my portal" });
  const heading = page.getByRole("heading", { name: "Your studios" });
  await heading.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(heading, 400);

  // s3 - the studio section: everything delivered, one page
  p.step("s3", "Your studios, one page");
  const section = page
    .locator("section")
    .filter({ hasText: STUDIO_NAME })
    .first();
  await section.waitFor({ state: "visible", timeout: 20000 });
  await p.move(section);
  await p.hover(section, 600);
  const signedIn = page.getByText(`Signed in as ${CLIENT}`).first();
  if (await signedIn.count()) await p.hover(signedIn, 400);

  // s4 - the payoff: always theirs
  p.step("s4", "Always there, no resend");
  await p.focus(section, { label: "payoff" });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Nothing to undo through the app: the portal session is the demo client's
  // own, and the operator restores the seeded client email after the run.
  await page.goto(env.url + "/portal", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  log("teardown: portal session left as the demo client's own; the operator restores the seeded client email");
}
