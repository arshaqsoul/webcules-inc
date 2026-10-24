// PP-014 take script. Written by the recorder from growth/storyboards/PP-014.md.
// Check it before it touches staging:   node growth/scripts/reel.mjs check PP-014
// Run it (record, edit, QC):            node growth/scripts/reel.mjs make PP-014
//
// Brand kit reel: white-label checklist, click "Upload logo", hand the real
// file chooser a synthetic PNG (fixture-generated, in growth/assets/PP-014/),
// and film the automatic brand-asset generation payoff. No email is sent.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const format = "desktop";
export const mask = { allowEmails: [] };

const PATH = "/dashboard/settings/brand";
const LOGO_PATH = path.join("growth", "assets", "PP-014", "logo.png");

// ---------------------------------------------------------------- tiny PNG writer
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
/** A simple studio-mark PNG: warm accent block + two dark wordmark bars. */
function makeLogoPng() {
  const W = 320, H = 100;
  const raw = Buffer.alloc(H * (1 + W * 3));
  const set = (x, y, r, g, b) => {
    const o = y * (1 + W * 3) + 1 + x * 3;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  };
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    for (let x = 0; x < W; x++) set(x, y, 0xff, 0xff, 0xff);
  }
  for (let y = 20; y < 80; y++) for (let x = 16; x < 64; x++) set(x, y, 0xb0, 0x71, 0x3f); // accent block
  for (let y = 30; y < 44; y++) for (let x = 84; x < 290; x++) set(x, y, 0x1c, 0x1a, 0x17); // wordmark bar 1
  for (let y = 56; y < 70; y++) for (let x = 84; x < 230; x++) set(x, y, 0x6b, 0x5b, 0x4a); // wordmark bar 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", (() => { const b = Buffer.alloc(13); b.writeUInt32BE(W, 0); b.writeUInt32BE(H, 4); b[8] = 8; b[9] = 2; return b; })()),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function fixture({ page, env, log }) {
  await page.goto(env.url + PATH, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  if (!/\/dashboard\/settings\/brand/.test(new URL(page.url()).pathname)) {
    throw new Error("FIXTURE STOP: redirected away from Settings - Brand. The login must be the org owner.");
  }

  // the white-label card renders the checklist only when the org is entitled
  if ((await page.getByText(/Upload your logo/i).count()) === 0) {
    throw new Error("FIXTURE STOP: no white-label checklist on the brand page - the staging org is not white-label entitled. Map it to Studio before recording.");
  }
  // the take films a real upload: it needs a clean "No logo yet" start
  if ((await page.getByText(/No logo yet/i).count()) === 0) {
    throw new Error("FIXTURE STOP: this org already has a logo (there is no logo delete endpoint, so a re-run needs a fresh org or a manual logo reset).");
  }

  fs.mkdirSync(path.dirname(LOGO_PATH), { recursive: true });
  fs.writeFileSync(LOGO_PATH, makeLogoPng());
  log(`fixture: synthetic logo written to ${LOGO_PATH}`);

  // frame the checklist step 1 with the upload control visible
  const uploadLabel = page.getByText(/Upload logo \(/i).first();
  await uploadLabel.waitFor({ timeout: 10000 });
  await uploadLabel.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  log("fixture: white-label checklist up, upload control framed, ready");
}

export async function run({ p, page }) {
  p.step("s1", "White-label starts here");
  await p.settle(900);
  const step1 = page.getByText(/Upload your logo/i).first();
  await p.move(step1);
  await p.hover(step1, 600);

  p.step("s2", "One logo in");
  const uploadLabel = page.getByText(/Upload logo \(/i).first();
  await uploadLabel.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.settle(400);
  await p.move(uploadLabel);
  await p.hover(uploadLabel, 400);
  // a file picker is OS UI: hand the real chooser our synthetic logo the
  // moment it opens (setFiles is plumbing, not a performed click)
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });
  await p.click(uploadLabel, { selector: "Upload logo label" });
  const chooser = await chooserPromise;
  await chooser.setFiles(path.resolve(LOGO_PATH));

  p.step("s3", "The kit generates itself");
  const preview = page.locator("img[alt='Studio logo']").first();
  await preview.waitFor({ timeout: 20000 });
  await p.hover(preview, 500);

  p.step("s4", "Your brand, everywhere");
  const status = page.getByText(/Brand assets generated . favicon, share cards and email header updated/i).first();
  await status.waitFor({ timeout: 30000 });
  await p.settle(500);
  await p.focus(status, { label: "payoff", tight: true });
  await p.hold(1800, { label: "payoff" });
}

// the generated bundle is idempotent and there is no logo delete endpoint, so
// there is nothing to restore (a re-run needs a fresh org - the fixture STOPs)
// export async function teardown({ page, env, log }) {}
