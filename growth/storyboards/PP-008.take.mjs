// PP-008 take: the client gallery footer carries the platform badge, one
// toggle in the studio brand settings removes it, and the same gallery now
// shows only the studio. Format desktop, seed from record.mjs.
// Recorded against the local dev server (see growth/storyboards/PP-008.md,
// "Recording target note"). Fixture mints the grant and completes the gallery
// email verification before capture, exactly as a real client's first open.

import fs from "node:fs";
import path from "node:path";

export const format = "desktop";

// The demo client. Minting the grant emails this address (captured to disk on
// the local target, never delivered), so the safe-recipient guard applies.
const CLIENT = "client@example.com";
export const mask = { allowEmails: [CLIENT] };
export const sendsEmail = true;

const PROJECT_TITLE = "Willow Creek Estate Wedding";
const STUDIO_NAME = "Amara & Oak Photography";
const BADGE_TEXT = "via Snap"; // the gallery footer reads "Delivered by <studio> via Snap"
const EMAIL_DIR = path.resolve(import.meta.dirname, "..", "..", "apps", "snap", ".wrangler", "tmp", "email");

// filled in by fixture(), read by run() and teardown()
let galleryPath = null; // /dashboard/projects/<id>?tab=gallery
let clientUrl = null; // the grant's client gallery URL
let grantId = null;

function rowsOf(page) {
  return page
    .locator("div.p-4")
    .filter({ hasText: CLIENT })
    .filter({ has: page.getByRole("button", { name: "New link" }) });
}

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

/** First visit to a route compiles fresh chunks on the dev server, which can
 *  reload the page mid-navigation (net::ERR_ABORTED). One retry absorbs it. */
async function gotoSteady(page, url) {
  try {
    await page.goto(url, { waitUntil: "load" });
  } catch {
    await page.goto(url, { waitUntil: "load" });
  }
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function finishFixture(page, env, log) {
  await page.goto(env.url + galleryPath, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const live = await rowsOf(page).count();
  if (live !== 1) throw new Error(`FIXTURE STOP: expected exactly one live gallery row for ${CLIENT}, found ${live}.`);
}

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/projects", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const card = page.getByRole("link", { name: new RegExp(PROJECT_TITLE) }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  const href = await card.getAttribute("href");
  if (!href || !href.includes("/projects/")) throw new Error(`FIXTURE STOP: could not resolve the project link for "${PROJECT_TITLE}"`);
  const projectId = href.split("/projects/")[1].split(/[/?]/)[0];
  galleryPath = `/dashboard/projects/${projectId}?tab=gallery`;

  // Self-clean: revoke any live grant an earlier crashed run left.
  const stale = await page.evaluate(async ({ projectId, clientEmail }) => {
    const res = await fetch(`/api/projects/${projectId}/grants`);
    const body = await res.json();
    const live = (body.grants ?? []).filter((g) => g.clientEmail === clientEmail && (g.state === "active" || g.state === "expiring_soon"));
    for (const g of live) await fetch(`/api/grants/${g.id}/revoke`, { method: "POST" });
    return live.length;
  }, { projectId, clientEmail: CLIENT });
  if (stale > 0) log(`fixture: revoked ${stale} stale live grant(s) from earlier runs`);

  // Mint a fresh download-enabled grant through the app's own API.
  const minted = await page.evaluate(async ({ projectId, clientEmail }) => {
    const res = await fetch(`/api/projects/${projectId}/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientEmail, selectionMode: "favorites", allowDownload: true }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, { projectId, clientEmail: CLIENT });
  if (minted.status !== 200 || !minted.body.url) throw new Error(`FIXTURE STOP: minting the grant failed (HTTP ${minted.status}): ${JSON.stringify(minted.body)}`);
  clientUrl = minted.body.url;
  grantId = minted.body.grantId;
  log(`fixture: grant ${grantId} minted`);

  // Complete the gallery's email verification once, before capture.
  const otpStart = Date.now() - 1000;
  await page.goto(clientUrl, { waitUntil: "load" });
  const emailInput = page.getByPlaceholder("you@example.com");
  try {
    await emailInput.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    log("fixture: no OTP gate shown (gallery opened directly)");
    await finishFixture(page, env, log);
    return;
  }
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await emailInput.click();
  await emailInput.pressSequentially(CLIENT, { delay: 20 });
  await page.getByRole("button", { name: "Send code" }).click();
  let code = null;
  for (let i = 0; i < 30 && !code; i++) {
    await page.waitForTimeout(1000);
    code = capturedOtpCode(otpStart);
  }
  if (!code) throw new Error("FIXTURE STOP: no OTP code appeared in the local email capture within 30s");
  await page.waitForTimeout(800);
  const codeInput = page.locator("input[autocomplete='one-time-code']");
  await codeInput.click();
  await codeInput.pressSequentially(code, { delay: 40 });
  await page.getByRole("button", { name: /Open gallery|Open/ }).first().click();
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  log("fixture: gallery verified and open");

  // The white-label toggle must start OFF (the before state this reel flips).
  await gotoSteady(page, env.url + "/dashboard/settings/brand");
  const toggle = page.getByLabel("Remove Snap branding");
  if (!(await toggle.count())) throw new Error("FIXTURE STOP: white-label card not found on the brand settings page");
  if (await toggle.isChecked()) {
    await toggle.click();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (await toggle.isChecked()) throw new Error("FIXTURE STOP: could not reset the white-label toggle to off");
    log("fixture: white-label toggle reset to off (before state)");
  }
  await finishFixture(page, env, log);
}

export async function run({ p, page, env }) {
  // s1 - the badge the client sees today
  p.step("s1", "Spot the extra brand");
  await gotoSteady(page, clientUrl);
  const badge = page.getByText(BADGE_TEXT).last();
  await badge.scrollIntoViewIfNeeded();
  await p.hold(400);
  await p.hover(badge, 600);
  await p.focus(badge, { label: "before", tight: true });
  await p.hold(1300, { label: "before" });

  // s2 - the studio card that walks the flip
  p.step("s2", "Studio unlocks the flip");
  try {
    await p.navigate(env.url + "/dashboard/settings/brand");
  } catch {
    await p.navigate(env.url + "/dashboard/settings/brand");
  }
  const cardTitle = page.getByText("White-label").first();
  await cardTitle.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(cardTitle, 300);
  const stepRow = page.getByText("Snap wordmark, \u201cvia Snap\u201d").first();
  if (await stepRow.count()) await p.hover(stepRow, 250);

  // s3 - the flip
  p.step("s3", "Flip it once");
  const toggle = page.getByLabel("Remove Snap branding");
  await toggle.scrollIntoViewIfNeeded();
  await p.move(toggle);
  await p.hover(toggle, 300);
  await p.click(toggle, { selector: "toggle Remove Snap branding" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const savedNote = page.getByText(/Saved|saved/).first();
  if (await savedNote.count()) await p.hover(savedNote, 300);
  await p.hold(500);

  // s4 - the same gallery, all studio
  p.step("s4", "Now it is all yours");
  await gotoSteady(page, clientUrl);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const copyright = page.getByText(`© ${STUDIO_NAME}`, { exact: false }).first();
  await copyright.scrollIntoViewIfNeeded();
  await p.hover(copyright, 400);
  await p.focus(copyright, { label: "payoff", tight: true });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Flip the toggle back so the next run starts from the same before state.
  await gotoSteady(page, env.url + "/dashboard/settings/brand");
  const toggle = page.getByLabel("Remove Snap branding");
  for (let i = 0; i < 3 && (await toggle.isChecked()); i++) {
    await toggle.click();
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (await toggle.isChecked()) await page.reload({ waitUntil: "load" });
  }
  if (!(await toggle.isChecked())) log("teardown: white-label toggle restored to off");
  else throw new Error("teardown: white-label toggle is still on");

  // Revoke this run's grant so the gallery list stays clean.
  if (!grantId) {
    log("teardown: no grant to revoke (fixture never minted)");
    return;
  }
  await page.goto(env.url + galleryPath, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const status = await page.evaluate(async (id) => (await fetch(`/api/grants/${id}/revoke`, { method: "POST" })).status, grantId);
  if (status !== 200) throw new Error(`teardown: revoke returned HTTP ${status}, the demo grant may still be live`);
  log("teardown: this run's grant is revoked, toggle is off");
}
