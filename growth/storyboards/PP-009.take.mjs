// PP-009 take: the client opens the gallery, opens the Download menu, picks
// "Everything, full resolution" and the parts sheet shows the whole set leaving
// in safe parts. Format desktop, seed from record.mjs. Recorded against the
// local dev server (see growth/storyboards/PP-009.md, "Recording target note").
// The take never starts a real download; the menu and the parts sheet are the beat.

import fs from "node:fs";
import path from "node:path";

export const format = "desktop";

// The demo client. Minting the grant emails this address (captured to disk on
// the local target, never delivered), so the safe-recipient guard applies.
const CLIENT = "client@example.com";
export const mask = { allowEmails: [CLIENT] };
export const sendsEmail = true;

const PROJECT_TITLE = "Willow Creek Estate Wedding";
const EMAIL_DIR = path.resolve(import.meta.dirname, "..", "..", "apps", "snap", ".wrangler", "tmp", "email");

// filled in by fixture(), read by run() and teardown()
let galleryPath = null;
let clientUrl = null;
let grantId = null;

function rowsOf(page) {
  return page
    .locator("div.p-4")
    .filter({ hasText: CLIENT })
    .filter({ has: page.getByRole("button", { name: "New link" }) });
}

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
  if (!href || !href.includes("/projects/")) throw new Error(`FIXTURE STOP: could not resolve the project link for "${PROJECT_TITLE}"`);
  const projectId = href.split("/projects/")[1].split(/[/?]/)[0];
  galleryPath = `/dashboard/projects/${projectId}?tab=gallery`;

  const stale = await page.evaluate(async ({ projectId, clientEmail }) => {
    const res = await fetch(`/api/projects/${projectId}/grants`);
    const body = await res.json();
    const live = (body.grants ?? []).filter((g) => g.clientEmail === clientEmail && (g.state === "active" || g.state === "expiring_soon"));
    for (const g of live) await fetch(`/api/grants/${g.id}/revoke`, { method: "POST" });
    return live.length;
  }, { projectId, clientEmail: CLIENT });
  if (stale > 0) log(`fixture: revoked ${stale} stale live grant(s) from earlier runs`);

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

  const otpStart = Date.now() - 1000;
  await page.goto(clientUrl, { waitUntil: "load" });
  const emailInput = page.getByPlaceholder("you@example.com");
  try {
    await emailInput.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    log("fixture: no OTP gate shown (gallery opened directly)");
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
  // The verification ends in a reload; wait for the reloaded grid before warming.
  await page.getByRole("button", { name: "Download" }).first().waitFor({ state: "visible", timeout: 20000 });
  log("fixture: gallery verified and open");

  // Warm the lazy photo grid so mid-take scrolls never stall on image loads.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}

export async function run({ p, page, env }) {
  // s1 - the delivered gallery
  p.step("s1", "Delivered, no Drive link");
  await p.navigate(clientUrl);
  const downloadCtl = page.getByRole("button", { name: "Download" }).first();
  await downloadCtl.waitFor({ state: "visible", timeout: 20000 });
  await p.hold(500);
  await p.scroll(220);
  await p.hold(500);

  // s2 - the download menu
  p.step("s2", "One tap, everything");
  const downloadBtn = page.getByRole("button", { name: "Download" }).first();
  await downloadBtn.waitFor({ state: "visible", timeout: 20000 });
  await p.move(downloadBtn);
  await p.hover(downloadBtn, 300);
  await p.click(downloadBtn, { selector: "button Download" });
  const menuTitle = page.getByText("Download all").first();
  await menuTitle.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(menuTitle, 400);
  const everything = page.getByRole("button", { name: "Everything · full resolution" });
  await everything.waitFor({ state: "visible", timeout: 10000 });
  await p.hover(everything, 400);

  // s3 - the whole set, on its way (a small gallery leaves as one download;
  // large galleries get the same beat as a parts sheet)
  p.step("s3", "Everything, full resolution");
  await p.click(everything, { selector: "menu item Everything full resolution" });
  const flash = page.getByText(/Your download is starting/).first();
  await flash.waitFor({ state: "visible", timeout: 30000 });
  await p.hover(flash, 400);

  // s4 - the payoff, held while the flash is up
  p.step("s4", "Ten files, on the way");
  await p.focus(flash, { label: "payoff", tight: true });
  await p.hold(2400, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  if (!grantId) {
    log("teardown: no grant to revoke (fixture never minted)");
    return;
  }
  await page.goto(env.url + galleryPath, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const status = await page.evaluate(async (id) => (await fetch(`/api/grants/${id}/revoke`, { method: "POST" })).status, grantId);
  if (status !== 200) throw new Error(`teardown: revoke returned HTTP ${status}, the demo grant may still be live`);
  const awaiting = await rowsOf(page).filter({ hasText: /Awaiting selection/ }).count();
  if (awaiting > 0) throw new Error(`teardown: ${awaiting} awaiting row(s) still live after revoke`);
  log("teardown: this run's grant is revoked, gallery list is clean");
}
