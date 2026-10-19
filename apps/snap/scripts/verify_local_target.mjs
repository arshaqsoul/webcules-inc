// End-to-end verification of the local recording target (:5173), walking the
// exact fixture paths of PP-002/008/009/010. Run: node scripts/verify_local_target.mjs
import fs from "node:fs";

const BASE = "http://localhost:5173";
const SCRATCH = "/home/arsha/multica_workspaces_desktop-api.multica.ai/webcules-5ad313fa3874/webc-104-8152d2588f3d/hermes-home/cache/scratch";
let cookie = "";

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
  body: JSON.stringify({ email: "amara-local@webcules.com", password: "LocalReel-2026!x" }),
});
console.log("sign-in:", login.status);
if (!login.ok) process.exit(1);

// 2. asset serving through the staff route (validates org-prefix + local R2)
const assets = await req("/api/assets/demo-ast-wedding-01?variant=preview");
console.log("asset preview:", assets.status, assets.headers.get("content-type"), (await assets.arrayBuffer()).byteLength, "bytes");

// 3. mint a selection grant (the PP-002 fixture call)
const mint = await req("/api/projects/demo-proj-wedding/grants", {
  method: "POST",
  body: JSON.stringify({ clientEmail: "client@example.com", selectionMode: "selection", selectionLimit: 5, selectionDeadline: Math.floor(Date.now() / 1000) + 7 * 86400, allowDownload: true }),
});
const mintBody = await mint.json();
console.log("grant mint:", mint.status, "url:", mintBody.url, "host ok:", (mintBody.url ?? "").startsWith(BASE));
if (!mint.ok) process.exit(1);

// 4. open the client URL (PP-002 fixture: OTP gate expected)
const gal = await req(new URL(mintBody.url).pathname);
const galHtml = await gal.text();
console.log("gallery open:", gal.status, "otp gate:", galHtml.includes("you@example.com"));

// 5. request the OTP code (client email step) and read it from the capture dir
const capDir = new URL("../../apps/snap/.wrangler/tmp/email", "file://" + import.meta.dirname).pathname;
const before = fs.existsSync(capDir) ? fs.readdirSync(capDir, { recursive: true }).join(",") : "";
const otpStart = Date.now();
const sendRes = await fetch(BASE + new URL(mintBody.url).pathname.replace(/\/$/, "") , { method: "POST" }).catch(() => null);
// The exact OTP post-back route lives inside the gallery app; instead reuse the
// fixture's own approach: the code email is sent by the gallery send-code form.
console.log("capture dir before:", before ? before.slice(0, 80) : "(empty)");
let code = null;
for (let i = 0; i < 20 && !code; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    for (const org of fs.readdirSync(capDir)) {
      const dir = `${capDir}/${org}/email-text`;
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const p = `${dir}/${f}`;
        if (fs.statSync(p).mtimeMs < otpStart - 1000) continue;
        const m = fs.readFileSync(p, "utf8").match(/\b(\d{6})\b/);
        if (m) code = m[1];
      }
    }
  } catch { /* dir not there yet */ }
}
console.log("otp code captured:", code ?? "NONE");

// 6. clean up the verification grant
const revoke = await req(`/api/grants/${mintBody.grantId}/revoke`, { method: "POST" });
console.log("cleanup revoke:", revoke.status);
