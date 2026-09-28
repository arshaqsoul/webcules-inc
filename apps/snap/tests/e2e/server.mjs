/* E2E webServer wrapper — serializes what must be serial: reset the isolated
 * D1, apply every migration, seed the widget studio, THEN boot wrangler dev.
 * (Playwright starts webServer and globalSetup concurrently; doing setup in
 * globalSetup races wrangler's own miniflare state creation.) */
import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const stateDir = join(root, "tests", "e2e", ".state");
const port = process.env.E2E_PORT ?? "3000";
const base = `http://localhost:${port}`;

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
writeFileSync(
  join(root, "tests", "e2e", ".seed.sql"),
  `INSERT INTO organization (id, name, slug, created_at, updated_at)
     VALUES ('${orgId}', 'E2E Widget Studio', 'e2e-widget-${orgId.slice(0, 8)}', unixepoch(), unixepoch());
   INSERT INTO studio_profile (organization_id, studio_name, timezone, contact_email, embed_key, plan)
     VALUES ('${orgId}', 'E2E Widget Studio', 'UTC', 'e2e@test.test', '${embedKey}', 'free');
   INSERT INTO availability_rule (id, organization_id, weekday, start_minute, end_minute, slot_minutes, buffer_minutes, active)
     VALUES ('${crypto.randomUUID()}', '${orgId}', ${weekday}, 540, 1020, 60, 0, 1);`,
  "utf8",
);
run("pnpm exec wrangler d1 execute webcules-snap --local --persist-to tests/e2e/.state --file tests/e2e/.seed.sql");
writeFileSync(join(root, "tests", "e2e", ".seed.json"), JSON.stringify({ orgId, embedKey, weekday, date }), "utf8");
console.log(`[e2e-server] seeded widget studio (weekday ${weekday}, ${date}); starting vinext dev on ${base}`);

const child = spawn(
  "pnpm",
  ["exec", "vinext", "dev", "--port", port, "--strictPort"],
  { stdio: "inherit", cwd: root, shell: true, env: { ...process.env, SNAP_E2E: "1" } },
)
child.on("exit", (code) => process.exit(code ?? 0));

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
  await probe(`/embed/calendar?key=${embedKey}`);
  console.log("[e2e-server] cold routes warmed");
})();
