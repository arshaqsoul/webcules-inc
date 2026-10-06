// PP-002 take: a selection-mode gallery, the client picking in it, and the picks
// landing back on the project row. Format desktop, seed from record.mjs.
// Recorded against the local dev server (see growth/storyboards/PP-002.md,
// "Recording target note").
import fs from "node:fs";
import path from "node:path";

export const format = "desktop";

// The demo client. Minting the grant emails this address (captured to disk on the
// local target, never delivered), so the safe-recipient guard applies to it.
const CLIENT = "client@example.com";
export const mask = { allowEmails: [CLIENT] }; // every other address on screen is blurred
export const sendsEmail = true; // minting the grant emails the client: record.mjs refuses unless CLIENT is in GROWTH_SAFE_EMAILS

const PROJECT_TITLE = "Willow Creek Estate Wedding";
const PICKS = 3;
const LIMIT = 5;
// The gallery write APIs need the snap-g session cookie, which only an OTP
// verification mints. The fixture completes that verification before capture,
// the way a real client's first open does, so the reel itself starts on the
// gallery like every later client visit.
const EMAIL_DIR = path.resolve(import.meta.dirname, "..", "..", "apps", "snap", ".wrangler", "tmp", "email");

// filled in by fixture(), read by run() and teardown()
let galleryPath = null; // /dashboard/projects/<id>?tab=gallery
let clientUrl = null; // the grant's client gallery URL
let grantId = null;

/** The gallery link row for CLIENT: the app's row element carries p-4.
 *  Only LIVE rows carry a "New link" button - revoked rows keep their status
 *  text forever, so the text alone must never be the liveness test. */
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

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/projects", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const card = page.getByRole("link", { name: new RegExp(PROJECT_TITLE) }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  const href = await card.getAttribute("href");
  if (!href || !href.includes("/dashboard/projects/")) {
    throw new Error(`FIXTURE STOP: could not resolve the project link for "${PROJECT_TITLE}" (got ${href}).`);
  }
  const projectId = href.split("/projects/")[1].split(/[/?]/)[0];
  galleryPath = `/dashboard/projects/${projectId}?tab=gallery`;

  // Self-clean: revoke any live grant left for the demo client by an earlier
  // crashed run, so the list shows exactly one awaiting row for this take.
  const stale = await page.evaluate(async ({ projectId, clientEmail }) => {
    const res = await fetch(`/api/projects/${projectId}/grants`);
    const body = await res.json();
    const live = (body.grants ?? []).filter((g) => g.clientEmail === clientEmail && (g.state === "active" || g.state === "expiring_soon"));
    for (const g of live) await fetch(`/api/grants/${g.id}/revoke`, { method: "POST" });
    return live.length;
  }, { projectId, clientEmail: CLIENT });
  if (stale > 0) log(`fixture: revoked ${stale} stale live grant(s) from earlier runs`);

  // Mint a fresh selection grant through the app's own API (the session is the key).
  const deadline = Math.floor(Date.now() / 1000) + 7 * 86400;
  const minted = await page.evaluate(
    async ({ projectId, clientEmail, selectionLimit, selectionDeadline }) => {
      const res = await fetch(`/api/projects/${projectId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEmail,
          selectionMode: "selection",
          selectionLimit,
          selectionDeadline,
          allowDownload: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },
    { projectId, clientEmail: CLIENT, selectionLimit: LIMIT, selectionDeadline: deadline },
  );
  if (minted.status !== 200 || !minted.body.url) {
    throw new Error(`FIXTURE STOP: minting the selection grant failed (HTTP ${minted.status}): ${JSON.stringify(minted.body)}`);
  }
  if (!minted.body.url.startsWith(env.url)) {
    throw new Error(`FIXTURE STOP: the client URL ${minted.body.url} does not match the recording target ${env.url}.`);
  }
  clientUrl = minted.body.url;
  grantId = minted.body.grantId;
  log(`fixture: grant ${grantId} minted, client URL ready`);

  // Complete the gallery's email verification once, before capture, so the
  // write APIs accept the client submits. This mirrors the client's own first
  // open: enter the address, the code arrives by email, the gallery opens.
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
  // React hydration: the server-rendered input exists before the form is live.
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
  log(`fixture: OTP code captured`);
  await page.waitForTimeout(800);
  const codeInput = page.locator("input[autocomplete='one-time-code']");
  await codeInput.click();
  await codeInput.pressSequentially(code, { delay: 40 });
  await page.getByRole("button", { name: "Open gallery" }).click();
  await page.getByRole("button", { name: /^Add .* to selection/ }).first().waitFor({ state: "visible", timeout: 20000 });
  log("fixture: gallery verified and open");
  // Warm the lazy photo grid: walk the page so every image loads and caches.
  // Without this, every scroll during the take fires new image requests and
  // the performer's network-idle waits burn their full timeout.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  await finishFixture(page, env, log);
}

/** Back to the project gallery tab; verify exactly one awaiting row and frame it. */
async function finishFixture(page, env, log) {
  await page.goto(env.url + galleryPath, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const live = await rowsOf(page).filter({ hasText: /Awaiting selection/ }).count();
  if (live !== 1) {
    throw new Error(`FIXTURE STOP: expected exactly one awaiting-selection row for ${CLIENT}, found ${live}. Revoke stale grants through the app first.`);
  }
  await rowsOf(page).filter({ hasText: /Awaiting selection/ }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

export async function run({ p, page, env }) {
  const row = rowsOf(page).filter({ hasText: /Awaiting selection/ }).first();

  p.step("s1", "You asked for 5 picks");
  await p.hold(700);
  await p.move(row);
  await p.hover(row, 800);

  p.step("s2", "They open the link");
  await p.navigate(clientUrl);
  const grid = page.getByRole("button", { name: /^Add .* to selection/ }).first();
  await grid.waitFor({ state: "visible", timeout: 20000 });
  await p.scroll(300);
  await p.hold(600);

  p.step("s3", "Picks take three taps");
  for (let i = 0; i < PICKS; i++) {
    const add = page.getByRole("button", { name: /^Add .* to selection/ }).first();
    await p.move(add);
    await p.click(add, { selector: "pick control" });
    await p.hold(400);
  }
  const counter = page.getByText(new RegExp(`^${PICKS} picked of ${LIMIT} allowed`)).first();
  await counter.waitFor({ timeout: 10000 });
  await p.hover(counter, 500);

  p.step("s4", "Sent from the gallery");
  const send = page.getByRole("button", { name: "Send selection" });
  await p.move(send);
  await p.hover(send, 250);
  await p.click(send, { selector: "button Send selection" });
  const flash = page.getByText(/Selection sent to your photographer/).first();
  await flash.waitFor({ timeout: 15000 });
  // The flash unmounts after 4s: land the camera on it at once and keep the
  // whole payoff inside that window.
  await p.focus(flash, { label: "payoff", tight: true });
  await p.hold(1600, { label: "payoff" });

  p.step("s5", "They land in your project");
  await p.navigate(env.url + galleryPath);
  const picked = page
    .locator("div.p-4")
    .filter({ hasText: CLIENT })
    .filter({ hasText: new RegExp(`Selection in: ${PICKS} picked of ${LIMIT}`) })
    .first();
  await picked.waitFor({ timeout: 20000 });
  await p.hover(picked, 400); // wide row: keep the camera full-width so the row state flip is in frame
  const viewPicks = picked.getByRole("button", { name: "View picks" });
  await p.move(viewPicks);
  await p.hover(viewPicks, 250);
  await p.click(viewPicks, { selector: "button View picks" });
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/Client picks/).waitFor({ timeout: 15000 });
  await p.hold(700);
  await p.focus(dialog.getByText(/Client picks/), { label: "payoff", tight: true });
  await p.hold(2000, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  if (!grantId) {
    log("teardown: nothing to revoke (fixture never minted)");
    return;
  }
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/grants/${id}/revoke`, { method: "POST" });
    return res.status;
  }, grantId);
  if (result !== 200) throw new Error(`teardown: revoke returned HTTP ${result}, the demo grant may still be live`);
  await page.goto(env.url + galleryPath, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const awaiting = await rowsOf(page).filter({ hasText: /Awaiting selection/ }).count();
  if (awaiting > 0) throw new Error(`teardown: ${awaiting} awaiting row(s) still live after revoke`);
  log("teardown: this run's grant is revoked, gallery list is clean");
}
