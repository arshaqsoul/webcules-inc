// OTP-capture check: mint a grant, hit /g/<token>/otp/send like the gallery
// does, then read the 6-digit code from apps/snap/.wrangler/tmp/email — the
// exact mechanism the PP-002/008/009/010 fixtures rely on.
import fs from "node:fs";

const BASE = "http://localhost:5173";
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

const login = await req("/api/auth/sign-in/email", {
  method: "POST",
  body: JSON.stringify({ email: "amara-local@webcules.com", password: "LocalReel-2026!x" }),
});
console.log("sign-in:", login.status);

const mint = await req("/api/projects/demo-proj-wedding/grants", {
  method: "POST",
  body: JSON.stringify({ clientEmail: "client@example.com", selectionMode: "selection", selectionLimit: 5, selectionDeadline: Math.floor(Date.now() / 1000) + 7 * 86400, allowDownload: true }),
});
const mintBody = await mint.json();
console.log("grant mint:", mint.status);

// open the gallery once (sets the link cookie), then send the code
await req(new URL(mintBody.url).pathname);
const token = new URL(mintBody.url).pathname.split("/g/")[1];
const send = await req(`/g/${token}/otp/send`, { method: "POST", body: JSON.stringify({ email: "client@example.com" }) });
console.log("otp/send:", send.status);

const capDir = "apps/snap/.wrangler/tmp/email";
const otpStart = Date.now();
let code = null;
for (let i = 0; i < 20 && !code; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  for (const org of fs.existsSync(capDir) ? fs.readdirSync(capDir) : []) {
    const dir = `${capDir}/${org}/email-text`;
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const p = `${dir}/${f}`;
      if (fs.statSync(p).mtimeMs < otpStart - 1000) continue;
      const text = fs.readFileSync(p, "utf8");
      if (!text.includes("client@example.com")) continue;
      const m = text.match(/\b(\d{6})\b/);
      if (m) code = m[1];
    }
  }
}
console.log("otp code captured from local email dir:", code ?? "NONE");

const revoke = await req(`/api/grants/${mintBody.grantId}/revoke`, { method: "POST" });
console.log("cleanup revoke:", revoke.status);
