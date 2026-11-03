// PP-012 take: RAWs upload with the wedding, the vault tracks them, and the
// client pulls the full set through the gallery's OTP gate - no transfer link.
// Format desktop, seed from record.mjs. Recorded against the LOCAL dev server
// (see growth/storyboards/PP-012.md, "Recording target note"): the gallery OTP
// email is captured to disk on the local target and never delivered, the
// PP-010 precedent. The operator points the seeded client row at the demo
// client address before the take and restores it after.

import fs from "node:fs";
import path from "node:path";

export const format = "desktop";

// The gallery OTP emails this address (captured locally, never delivered),
// so the safe-recipient guard applies.
const CLIENT = "client@example.com";
export const mask = { allowEmails: [CLIENT] };
export const sendsEmail = true;

const PROJECT_TITLE = "Willow Creek Estate Wedding";
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
      if (m) newest.push({ mtime: fs.statSync(p).mtimeMs, code: m[1] });
    }
  }
  newest.sort((a, b) => b.mtime - a.mtime);
  return newest[0]?.code ?? null;
}

/** This run's project path, resolved from the projects list (fixture). */
let projectPath = null;

export async function fixture({ page, env, log }) {
  await page.goto(env.url + "/dashboard/projects", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const card = page.getByRole("link", { name: new RegExp(PROJECT_TITLE) }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  const href = await card.getAttribute("href");
  if (!href || !href.includes("/projects/")) throw new Error(`FIXTURE STOP: could not resolve the project link for "${PROJECT_TITLE}"`);
  projectPath = `/dashboard/projects/${href.split("/projects/")[1].split(/[/?]/)[0]}`;
  log("fixture: wedding project resolved, RAW files staged in the local upload folder");
}

export async function run({ p, page, env }) {
  // s1 - RAWs upload with everything else
  p.step("s1", "RAWs upload with everything else");
  await p.navigate(env.url + projectPath);
  const dropzone = page.getByText(/drag . drop|drag & drop|drag and drop/i).first();
  await dropzone.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(dropzone, 400);
  // The recorder's chooser handler feeds the staged .cr3/.arw files.
  const chooserPromise = page.waitForEvent("filechooser");
  await p.click(dropzone, { selector: "upload drop zone" });
  const chooser = await chooserPromise;
  await chooser.setFiles([
    "growth/assets/PP-012/wedding-01.cr3",
    "growth/assets/PP-012/wedding-02.arw",
  ]);
  const rawBadge = page.getByTitle(/RAW/i).first();
  await rawBadge.waitFor({ state: "visible", timeout: 30000 });
  await p.hover(rawBadge, 500);

  // s2 - the vault: hot vs cold, the 6-month window
  p.step("s2", "Six months hot, then cold");
  await p.navigate(env.url + "/dashboard/raw-vault");
  const hot = page.getByText(/hot/i).first();
  await hot.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(hot, 500);
  const window = page.getByText(/6-month|6 month/i).first();
  await p.hover(window, 500);

  // s3 - restorable, never silently deleted
  p.step("s3", "Restorable, never silently deleted");
  const row = page.getByText(/\.cr3|\.arw/i).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  await p.hover(row, 400);
  const warnings = page.getByText(/restorable|emailed warnings|restore/i).first();
  await p.hover(warnings, 400);

  // s4 - the client's side: the gallery OTP gate
  p.step("s4", "The client gets a code");
  // The operator opens this run's gallery link for the demo client grant; the
  // recorder passes it as env.galleryUrl (see the storyboard's recording note).
  if (!env.galleryUrl) throw new Error("FIXTURE STOP: env.galleryUrl missing - the recorder must pass this run's /g/{token} link");
  await p.navigate(env.galleryUrl);
  const gate = page.getByText("Verify it's you").first();
  await gate.waitFor({ state: "visible", timeout: 20000 });
  const emailInput = page.locator("input[type='email']").first();
  await p.hover(emailInput, 300);
  await p.type(emailInput, CLIENT);
  const sendBtn = page.getByRole("button", { name: /send|code/i }).first();
  await p.hover(sendBtn, 250);
  await p.click(sendBtn, { selector: "button send code" });
  const codeState = page.getByText(/Enter your code|We sent a code/i).first();
  await codeState.waitFor({ state: "visible", timeout: 20000 });
  await p.hover(codeState, 400);

  // s5 - the code from the captured email opens the gallery
  p.step("s5", "Six digits in, downloads out");
  const codeInput = page.locator("input[placeholder='------'], input[inputmode='numeric']").first();
  await codeInput.waitFor({ state: "visible", timeout: 15000 });
  let code = null;
  const otpStart = Date.now() - 4000;
  for (let i = 0; i < 40 && !code; i++) {
    code = capturedOtpCode(otpStart);
    if (!code) await p.hover(codeInput, 150);
  }
  if (!code) throw new Error("TAKE STOP: no gallery OTP appeared in the local email capture within 30s");
  await p.type(codeInput, code);
  const gallery = page.getByText(PROJECT_TITLE).first();
  await gallery.waitFor({ state: "visible", timeout: 20000 });
  const downloadAll = page.getByRole("button", { name: /download all/i }).first();
  await p.hover(downloadAll, 350);
  await p.click(downloadAll, { selector: "button Download all" });
  await p.settle(900);

  // payoff - the full set pulled with no link anywhere in the story
  p.step("s6", "No link ever expired");
  await p.focus(gallery, { label: "payoff" });
  await p.hold(2200, { label: "payoff" });
}

export async function teardown({ page, env, log }) {
  // Nothing to undo through the app: the session is the demo client's own and
  // the uploaded RAWs feed later cold-storage states. The operator restores the
  // seeded client email after the run.
  await page.goto(env.url + "/dashboard/raw-vault", { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  log("teardown: vault left as-is; the operator restores the seeded client email");
}
