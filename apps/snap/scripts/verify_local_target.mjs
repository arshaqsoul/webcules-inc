// End-to-end verification of the local recording target (:5173), walking the
// exact fixture paths of PP-002/008/009/010. Run from apps/snap:
//   node scripts/verify_local_target.mjs
// Exits non-zero on the first failed step. Fresh-checkout note: run
// `node_modules/.bin/wrangler types` once before typechecking — the
// gitignored worker-configuration.d.ts is not in the repo.
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TARGET_BASE ?? "http://localhost:5173";
const EMAIL = "amara-local@webcules.com";
const PASSWORD = "LocalReel-2026!x";
const CAP_DIR = path.resolve(import.meta.dirname, "..", ".wrangler", "tmp", "email");
let cookie = "";
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return res;
}

// 1. staff login
const login = await req("/api/auth/sign-in/email", {
  method: "POST",
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
check("staff sign-in", login.ok, `HTTP ${login.status}`);
if (!login.ok) process.exit(1);

// 2. asset serving through the staff route (validates org-prefix + local R2)
const assets = await req("/api/assets/demo-ast-wedding-01?variant=preview");
const assetBytes = assets.status === 200 ? (await assets.arrayBuffer()).byteLength : 0;
check("asset preview (org-validated route)", assets.ok && assetBytes > 10000, `HTTP ${assets.status}, ${assetBytes} bytes`);

// 3. mint a selection grant (the PP-002 fixture call): the minted URL must be
// on the target origin or the take's startsWith(env.url) guard would throw.
const mint = await req("/api/projects/demo-proj-wedding/grants", {
  method: "POST",
  body: JSON.stringify({ clientEmail: "client@example.com", selectionMode: "selection", selectionLimit: 5, selectionDeadline: Math.floor(Date.now() / 1000) + 7 * 86400, allowDownload: true }),
});
const mintBody = await mint.json().catch(() => ({}));
check("grant mint on target origin", mint.ok && typeof mintBody.url === "string" && mintBody.url.startsWith(BASE), `HTTP ${mint.status}, url ${mintBody.url ?? "none"}`);
if (!mint.ok) process.exit(1);

// 4. open the client URL (PP-002 fixture: OTP gate expected)
const gal = await req(new URL(mintBody.url).pathname);
const galHtml = await gal.text();
check("gallery opens with OTP gate", gal.ok && galHtml.includes("you@example.com"), `HTTP ${gal.status}`);

// 5. send the OTP code exactly like the gallery UI does, then read it from the
// local email capture — the mechanism the PP-002/008/009/010 fixtures rely on.
const token = new URL(mintBody.url).pathname.split("/g/")[1];
const otpStart = Date.now();
const send = await req(`/g/${token}/otp/send`, { method: "POST", body: JSON.stringify({ email: "client@example.com" }) });
check("otp/send accepted", send.ok, `HTTP ${send.status}`);

let code = null;
for (let i = 0; i < 20 && !code; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  for (const org of fs.existsSync(CAP_DIR) ? fs.readdirSync(CAP_DIR) : []) {
    const dir = path.join(CAP_DIR, org, "email-text");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).mtimeMs < otpStart - 1000) continue;
      const m = fs.readFileSync(p, "utf8").match(/\b(\d{6})\b/);
      if (m) code = m[1];
    }
  }
}
check("otp code captured to local email dir", code !== null, code ? `code ${code}` : "no fresh capture with a 6-digit code");

// 6. clean up the verification grant
const revoke = await req(`/api/grants/${mintBody.grantId}/revoke`, { method: "POST" });
check("test grant revoked", revoke.ok, `HTTP ${revoke.status}`);

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
