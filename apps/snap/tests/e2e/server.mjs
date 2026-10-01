/* E2E webServer wrapper — serializes what must be serial: reset the isolated
 * D1, apply every migration, seed the widget studio + the domain-flow studios,
 * start the CF/DoH mock, swap in an E2E .dev.vars, THEN boot vinext dev.
 * (Playwright starts webServer and globalSetup concurrently; doing setup in
 * globalSetup races wrangler's own miniflare state creation.) */
import { execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";

const root = process.cwd();
const stateDir = join(root, "tests", "e2e", ".state");
const port = process.env.E2E_PORT ?? "3000";
const base = `http://localhost:${port}`;
const mockPort = 3117;

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: root, shell: true });
}

// Windows: dying miniflare/wrangler processes hold sqlite -wal/-shm handles
// briefly — remove files individually with retries, then the directories.
const rmTree = (dir) => {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rmTree(p);
    else {
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(p, { force: true });
          break;
        } catch {
          if (i === 4) throw new Error(`locked (kill stray workerd/wrangler): ${p}`);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
        }
      }
    }
  }
  try {
    rmSync(dir, { force: true });
  } catch {
    /* parent retried by its own caller */
  }
};

/* ------------------------------------------------------------------ *
 * CF + DoH mock (WEB-233) — the domain E2E never touches real APIs.
 *   POST /__mock/dns  {name, type: "TXT"|"CNAME", value}   publish a record
 *   POST /__mock/cf   {sslStatus?, hostnameStatus?}        drive cert state
 *   GET  /dns-query?name=&type=                            DoH JSON answers
 *   /client/v4/zones/:zone/custom_hostnames…               CF-shaped CRUD
 * ------------------------------------------------------------------ */
const dnsRecords = new Map(); // `${type}:${name}` → value
const chHostnames = new Map(); // custom_hostname id → hostname
let cfState = { sslStatus: "pending_validation", hostnameStatus: "pending" };
const readBody = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${mockPort}`);
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "POST" && url.pathname === "/__mock/dns") {
      const b = JSON.parse(await readBody(req));
      dnsRecords.set(`${b.type}:${b.name}`, b.value);
      return json(200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/__mock/cf") {
      cfState = { ...cfState, ...JSON.parse(await readBody(req)) };
      return json(200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/dns-query") {
      const type = url.searchParams.get("type");
      const name = url.searchParams.get("name");
      const value = dnsRecords.get(`${type}:${name}`);
      // TXT wire format carries the quotes; the app strips them
      return json(200, { Status: 0, Answer: value ? [{ data: type === "TXT" ? `"${value}"` : value }] : [] });
    }
    const ch = url.pathname.match(/^\/zones\/([^/]+)\/custom_hostnames(?:\/([^/?]+))?/);
    if (ch) {
      if (req.method === "POST" && !ch[2]) {
        const b = JSON.parse(await readBody(req));
        const id = `ch_mock_${chHostnames.size + 1}`;
        chHostnames.set(id, b.hostname);
        return json(200, {
          success: true,
          result: {
            id,
            hostname: b.hostname,
            status: "pending",
            ssl: { status: cfState.sslStatus, txt_name: `_snap-acme.${b.hostname}`, txt_value: `cf-dcv-${id}` },
          },
        });
      }
      if (req.method === "GET" && ch[2]) {
        return json(200, {
          success: true,
          result: { id: ch[2], hostname: chHostnames.get(ch[2]) ?? "mock.host.test", status: cfState.hostnameStatus, ssl: { status: cfState.sslStatus } },
        });
      }
      if (req.method === "DELETE" && ch[2]) {
        chHostnames.delete(ch[2]);
        return json(200, { success: true, result: { id: ch[2] } });
      }
      if (req.method === "GET" && !ch[2]) {
        return json(200, {
          success: true,
          result: [...chHostnames.entries()].map(([id, hostname]) => ({ id, hostname, status: cfState.hostnameStatus, ssl: { status: cfState.sslStatus } })),
          result_info: { total_count: chHostnames.size },
        });
      }
    }
    json(404, { success: false });
  } catch {
    json(500, { success: false });
  }
});
mock.listen(mockPort, "127.0.0.1", () => console.log(`[e2e-server] CF/DoH mock on :${mockPort}`));

console.log("[e2e-server] preparing isolated D1…");
rmTree(stateDir);
mkdirSync(stateDir, { recursive: true });
// workerd's crash-restart path requires the standard miniflare storage dirs
// to already exist (a restart with a missing cache dir is fatal) — pre-create.
for (const sub of ["v3/cache", "v3/d1", "v3/kv", "v3/r2", "v3/observability"]) {
  mkdirSync(join(stateDir, ...sub.split("/")), { recursive: true });
}

const migrations = readdirSync(join(root, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const combined = migrations.map((f) => readFileSync(join(root, "migrations", f), "utf8")).join("\n");
writeFileSync(join(root, "tests", "e2e", ".migrations-combined.sql"), combined, "utf8");
run("pnpm exec wrangler d1 execute webcules-snap --local --persist-to tests/e2e/.state --file tests/e2e/.migrations-combined.sql");

// Widget studio: org + profile (free) + availability ~12 days out. No user —
// the booking widget is public.
const orgId = crypto.randomUUID();
const embedKey = crypto.randomUUID().replace(/-/g, "");
const target = new Date(Date.now() + 12 * 86400_000);
target.setUTCHours(0, 0, 0, 0);
const weekday = target.getUTCDay();
const date = target.toISOString().slice(0, 10);

// WEB-272 manage-booking journey: a confirmed 9:00 booking on the target day
// with a pre-minted manage token (hash-only — resolve needs no ciphertext;
// format matches lib/shares/grants.ts mintToken).
const manageToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32)))
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
const manageTokenHash = createHash("sha256").update(manageToken).digest("hex");
const manageBookingId = crypto.randomUUID();
const manageStartEpoch = Math.floor(target.getTime() / 1000) + 540 * 60;
const manageEndEpoch = manageStartEpoch + 3600;

// Domain-flow studios (WEB-233): one pro + one free, one shared owner — the
// E2E walks the locked upsell on free, the full lifecycle on pro, and the
// panel re-scope when switching studios.
const userId = crypto.randomUUID();
const userEmail = "e2e-domains@test.test";
const previewProjectId = crypto.randomUUID();
const classicProjectId = crypto.randomUUID();
const proOrgId = crypto.randomUUID();
const freeOrgId = crypto.randomUUID();
const passwordHash = await hashPassword("TestPass123!x");

const seedSql = `INSERT INTO organization (id, name, slug, created_at, updated_at)
     VALUES ('${orgId}', 'E2E Widget Studio', 'e2e-widget-${orgId.slice(0, 8)}', unixepoch(), unixepoch());
   INSERT INTO studio_profile (organization_id, studio_name, timezone, contact_email, embed_key, plan)
     VALUES ('${orgId}', 'E2E Widget Studio', 'UTC', 'e2e@test.test', '${embedKey}', 'free');
   INSERT INTO availability_rule (id, organization_id, weekday, start_minute, end_minute, slot_minutes, buffer_minutes, active)
     VALUES ('${crypto.randomUUID()}', '${orgId}', ${weekday}, 540, 1020, 60, 0, 1);
   INSERT INTO booking (id, organization_id, start_at, end_at, timezone, client_email, client_name, status, payment_status, manage_token_hash, manage_token_status, created_at, updated_at)
     VALUES ('${manageBookingId}', '${orgId}', ${manageStartEpoch}, ${manageEndEpoch}, 'UTC', 'e2e-manage@test.test', 'E2E Manage Client', 'confirmed', 'unpaid', '${manageTokenHash}', 'active', unixepoch(), unixepoch());
   INSERT INTO organization (id, name, slug, created_at, updated_at)
     VALUES ('${proOrgId}', 'E2E Pro Studio', 'e2e-pro-${proOrgId.slice(0, 8)}', unixepoch(), unixepoch());
   INSERT INTO studio_profile (organization_id, studio_name, timezone, contact_email, embed_key, plan)
     VALUES ('${proOrgId}', 'E2E Pro Studio', 'UTC', '${userEmail}', '${crypto.randomUUID().replace(/-/g, "")}', 'pro');
   INSERT INTO organization (id, name, slug, created_at, updated_at)
     VALUES ('${freeOrgId}', 'E2E Side Studio', 'e2e-side-${freeOrgId.slice(0, 8)}', unixepoch(), unixepoch());
   INSERT INTO studio_profile (organization_id, studio_name, timezone, contact_email, embed_key, plan)
     VALUES ('${freeOrgId}', 'E2E Side Studio', 'UTC', '${userEmail}', '${crypto.randomUUID().replace(/-/g, "")}', 'free');
   INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ('${userId}', 'E2E Domains Owner', '${userEmail}', 1, unixepoch(), unixepoch());
   INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
     VALUES ('${crypto.randomUUID()}', '${userId}', '${userId}', 'credential', '${passwordHash}', unixepoch(), unixepoch());
   INSERT INTO member (id, organization_id, user_id, role, created_at)
     VALUES ('${crypto.randomUUID()}', '${proOrgId}', '${userId}', 'owner', unixepoch());
   INSERT INTO member (id, organization_id, user_id, role, created_at)
     VALUES ('${crypto.randomUUID()}', '${freeOrgId}', '${userId}', 'owner', unixepoch());

-- WEB-301 preview e2e: a designed project (columns + hero slider) plus a
-- zero-config one, each with approved assets (no R2 objects — DOM-level
-- assertions only).
INSERT INTO project (id, organization_id, title, event_date, status, gallery_design, created_at, updated_at)
VALUES ('${previewProjectId}', '${proOrgId}', 'Autumn Winds Shoot', strftime('%s','2026-10-18') * 1000, 'booked',
        '{"layout":"grid","columns":{"mobile":2,"md":2},"theme":{"background":"light","padding":"normal","radius":"16px","captions":"off"},"cover":{"assetId":"","focal":{"x":0.5,"y":0.5},"style":"static","title":"Anna & Elias","subtitle":"Preview family session"}}',
        unixepoch(), unixepoch());
INSERT INTO project (id, organization_id, title, status, created_at, updated_at)
VALUES ('${classicProjectId}', '${proOrgId}', 'Rustic Barn Wedding', 'booked', unixepoch(), unixepoch());
INSERT INTO asset (id, organization_id, project_id, storage_key, kind, filename, mime_type, bytes, status, width, height, created_at) VALUES
 ('e2eprev-a1', '${proOrgId}', '${previewProjectId}', '${proOrgId}/${previewProjectId}/e2eprev-a1/one.jpg', 'image', 'one.jpg', 'image/jpeg', 1000, 'approved', 1600, 1000, unixepoch()),
 ('e2eprev-a2', '${proOrgId}', '${previewProjectId}', '${proOrgId}/${previewProjectId}/e2eprev-a2/two.jpg', 'image', 'two.jpg', 'image/jpeg', 1000, 'approved', 1600, 1000, unixepoch()),
 ('e2eprev-a3', '${proOrgId}', '${classicProjectId}', '${proOrgId}/${classicProjectId}/e2eprev-a3/three.jpg', 'image', 'three.jpg', 'image/jpeg', 1000, 'approved', 1600, 1000, unixepoch());`;
writeFileSync(join(root, "tests", "e2e", ".seed.sql"), seedSql, "utf8");
run("pnpm exec wrangler d1 execute webcules-snap --local --persist-to tests/e2e/.state --file tests/e2e/.seed.sql");
writeFileSync(
  join(root, "tests", "e2e", ".seed.json"),
  JSON.stringify({ orgId, embedKey, weekday, date, userId, userEmail, proOrgId, freeOrgId, mockPort, manageToken, previewProjectId, classicProjectId }),
  "utf8",
);
console.log(`[e2e-server] seeded widget + domain studios (weekday ${weekday}, ${date})`);

// E2E .dev.vars — the cloudflare vite plugin reads it; the real one (with
// REAL secrets) is backed up and restored on any exit path. Windows kills
// don't run exit handlers, so the swap SELF-HEALS: a leftover backup from a
// crashed run is restored before this run swaps again.
const devVarsPath = join(root, ".dev.vars");
const devVarsBackup = join(root, ".dev.vars.e2e-backup");
if (existsSync(devVarsBackup)) {
  console.warn("[e2e-server] restoring .dev.vars from a crashed previous run");
  copyFileSync(devVarsBackup, devVarsPath);
  rmSync(devVarsBackup, { force: true });
}
let hadDevVars = false;
try {
  copyFileSync(devVarsPath, devVarsBackup);
  hadDevVars = true;
} catch {
  /* no real .dev.vars — nothing to protect */
}
writeFileSync(
  devVarsPath,
  [
    `BETTER_AUTH_SECRET=e2e-secret-${crypto.randomUUID()}`,
    `SNAP_E2E=1`,
    `BETTER_AUTH_URL=${base}`,
    `NEXT_PUBLIC_APP_URL=${base}`,
    `GALLERY_OTP_MODE=off`,
    `CF_API_BASE=http://127.0.0.1:${mockPort}`,
    `DOH_BASE=http://127.0.0.1:${mockPort}`,
    `CLOUDFLARE_API_TOKEN=e2e-token`,
    `CLOUDFLARE_ZONE_ID=e2e-zone`,
  ].join("\n") + "\n",
  "utf8",
);
const restoreDevVars = () => {
  try {
    if (hadDevVars) copyFileSync(devVarsBackup, devVarsPath);
    else rmSync(devVarsPath, { force: true });
    rmSync(devVarsBackup, { force: true });
  } catch {
    /* best effort */
  }
};

console.log(`[e2e-server] starting vinext dev on ${base}`);
const child = spawn(
  "pnpm",
  ["exec", "vinext", "dev", "--port", port, "--strictPort"],
  { stdio: "inherit", cwd: root, shell: true, env: { ...process.env, SNAP_E2E: "1" } },
);
process.on("SIGINT", () => {
  restoreDevVars();
  process.exit(0);
});
process.on("SIGTERM", () => {
  restoreDevVars();
  process.exit(0);
});
child.on("exit", (code) => {
  restoreDevVars();
  mock.close();
  process.exit(code ?? 0);
});

// Warm the cold routes (vinext dev compiles on first hit — that first-hit
// latency would otherwise eat the tests' time budget).
(async () => {
  const deadline = Date.now() + 180_000;
  const probe = async (path) => {
    for (;;) {
      try {
        const res = await fetch(`${base}${path}`, { redirect: "manual" });
        if (res.status < 500) return;
      } catch { /* not up yet */ }
      if (Date.now() > deadline) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  await probe("/login");
  await probe("/signup");
  await probe("/dashboard/settings/security"); // WEB-279 (compiles the settings tree)
  await probe("/dashboard/settings/team"); // WEB-275
  await probe(`/embed/calendar?key=${embedKey}`);
  console.log("[e2e-server] cold routes warmed");
})();
