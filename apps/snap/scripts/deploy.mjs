/* Snap deploy pipeline — STAGING FIRST, ALWAYS.
 *
 *   node scripts/deploy.mjs staging
 *       Clean caches → build → rewrite the generated wrangler config for the
 *       staging worker (own name/D1/R2/domain/vars) → deploy → smoke-check.
 *
 *   node scripts/deploy.mjs production --staging-verified
 *       The ONLY way to ship to snap.webcules.com. Refuses to run without
 *       --staging-verified, which is your assertion that the SAME commit was
 *       deployed to staging and manually verified (surfaced, DB, key flows).
 *
 * Staging resources (isolated from prod by design):
 *   worker  snap-staging            https://staging.snaphq.app
 *   D1      webcules-snap-staging   9b850d02-67d3-4c1b-a7ed-482cc587b2d5
 *   R2      snap-staging
 * Secrets on staging are its OWN; Stripe on staging = TEST keys. Never copy
 * prod secret values over.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING = {
  worker: "snap-staging",
  // WEB-330: staging rehearses the production cutover - staging.snaphq.app is
  // the canonical origin (links in emails/galleries, auth); snap-staging.webcules.com
  // stays attached like the legacy host does on production.
  url: "https://staging.snaphq.app",
  d1Name: "webcules-snap-staging",
  d1Id: "9b850d02-67d3-4c1b-a7ed-482cc587b2d5",
  r2Bucket: "snap-staging",
};
const PROD_URL = "https://snaphq.app";
const LEGACY_PROD_URL = "https://snap.webcules.com"; // must keep answering forever (WEB-330)
// WEB-330: the Cloudflare for SaaS zone moved from webcules.com to snaphq.app.
const ZONE_ID = "9576286851f6ba68ddcb3ff31a1e74db";

const args = process.argv.slice(2);
const target = args[0];
const stagingVerified = args.includes("--staging-verified");
// WEB-331: create/update the Worker WITHOUT touching custom domains or routes, so a
// renamed Worker can get its secrets before any traffic moves to it.
const noRoutes = args.includes("--no-routes");

/* WEB-331 guard: a Worker must never take over a domain while its secrets are
 * missing (a renamed Worker starts with none, and secrets cannot be copied).
 * Fails closed when the secret list cannot be read. --no-routes skips it. */
const REQUIRED_SECRETS = {
  staging: ["BETTER_AUTH_SECRET", "R2_S3_ACCESS_KEY_ID", "R2_S3_SECRET_ACCESS_KEY", "SNAP_INBOUND_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TURNSTILE_SECRET_KEY"],
  production: ["BETTER_AUTH_SECRET", "CLOUDFLARE_API_TOKEN", "R2_S3_ACCESS_KEY_ID", "R2_S3_SECRET_ACCESS_KEY", "SNAP_INBOUND_WEBHOOK_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TURNSTILE_SECRET_KEY"],
};
function assertSecretsPresent(worker, env) {
  if (noRoutes || args.includes("--skip-secret-check")) return;
  let have;
  try {
    const out = execSync(`cf workers secrets list --worker ${worker}`, { cwd: appDir, stdio: ["ignore", "pipe", "ignore"] }).toString();
    have = new Set([...out.matchAll(/"name":\s*"([A-Z0-9_]+)"/g)].map((m) => m[1]));
  } catch {
    console.error(`⛔ Could not read the secret list for ${worker}. Refusing to move domains onto it. Use --no-routes to upload only, or --skip-secret-check to override.`);
    process.exit(1);
  }
  const missing = REQUIRED_SECRETS[env].filter((n) => !have.has(n));
  if (missing.length) {
    console.error(`⛔ ${worker} is missing secrets: ${missing.join(", ")}.\n   Set them first (cf workers secrets update <NAME> --worker ${worker} --type secret_text --text ...), or use --no-routes. See docs/SNAP-WORKER-RENAME.md.`);
    process.exit(1);
  }
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: appDir, stdio: "inherit", shell: process.platform === "win32" ? "bash" : true });
}

function cleanBuildCaches() {
  console.log("• clearing build caches (stale .vite/.vinext/tsbuildinfo have burned us before)");
  for (const p of ["node_modules/.vite", "node_modules/.vinext", "node_modules/.vitest", ".vinext", "tsconfig.tsbuildinfo"]) {
    const abs = join(appDir, p);
    if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
  }
}

function build() {
  cleanBuildCaches();
  console.log("• building (vinext build — ~1-2 min)");
  run("pnpm build");
}

function writeStagingConfig() {
  const src = join(appDir, "dist/server/wrangler.json");
  if (!existsSync(src)) throw new Error("dist/server/wrangler.json missing — run the build first");
  const cfg = JSON.parse(readFileSync(src, "utf8"));
  cfg.name = STAGING.worker;
  // Prod-only routes stay on prod; staging is its own custom domain.
  // WEB-330: staging.snaphq.app rehearses the snaphq.app move on staging first.
  cfg.routes = noRoutes
    ? []
    : [
        { pattern: "staging.snaphq.app", custom_domain: true },
        { pattern: "snap-staging.webcules.com", custom_domain: true },
      ];
  cfg.d1_databases[0].database_name = STAGING.d1Name;
  cfg.d1_databases[0].database_id = STAGING.d1Id;
  cfg.r2_buckets[0].bucket_name = STAGING.r2Bucket;
  cfg.vars.NEXT_PUBLIC_APP_URL = STAGING.url;
  cfg.vars.BETTER_AUTH_URL = STAGING.url;
  cfg.vars.EMAIL_FROM = "Snap Staging <hello@snaphq.app>";
  // Presigned S3 uploads (r2s3.ts) must target staging's own bucket — the
  // code default is the production bucket name.
  cfg.vars.R2_S3_BUCKET = STAGING.r2Bucket;
  // WEB-333: staging runs the real Turnstile code paths (widget, /ts bridge,
  // siteverify) with Cloudflare's published always-pass TEST keys - public
  // by design. The matching test secret is set on the staging worker.
  cfg.vars.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  const out = join(appDir, "dist/server/wrangler.staging.json");
  writeFileSync(out, JSON.stringify(cfg, null, 2));
  console.log(`• staging config written: ${out}`);
  return out;
}

async function smoke(url) {
  const checks = ["/", "/login", "/signup"];
  let ok = true;
  for (const path of checks) {
    try {
      const res = await fetch(url + path, { redirect: "manual" });
      const good = res.status >= 200 && res.status < 400;
      if (!good) ok = false;
      console.log(`  ${res.status} ${path}${good ? "" : "  <- UNEXPECTED"}`);
    } catch (err) {
      ok = false;
      console.log(`  ERR ${path} — ${String(err)}`);
    }
  }
  return ok;
}

/* WEB-233: wrangler prunes API-created workers routes that point at this
 * script on every deploy — re-create the per-custom-hostname routes for all
 * ACTIVE domains or SaaS hostnames stop serving (522) until the next
 * activation sync. */
async function ensureActiveDomainRoutes() {
  try {
    const { readFile } = await import("node:fs/promises");
    const token = process.env.CF_SAAS_TOKEN ?? (await readFile(join(appDir, ".cf-saas-token"), "utf8")).trim();
    const q = execSync(
      "npx wrangler d1 execute webcules-snap --remote --json --command \"SELECT hostname FROM custom_domain WHERE status = 'active' AND removed_at IS NULL\"",
      { cwd: appDir, shell: process.platform === "win32" ? "bash" : true },
    );
    const rows = JSON.parse(q.toString())[0].results ?? [];
    const listed = await (
      await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    const have = new Set((listed.result ?? []).map((r) => r.pattern));
    for (const { hostname } of rows) {
      const pattern = `${hostname}/*`;
      if (have.has(pattern)) continue;
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ pattern, script: "snap" }),
      });
      console.log(res.ok ? `  route re-ensured: ${pattern}` : `  route ensure FAILED for ${pattern} (${res.status}) — SaaS host may 522!`);
    }
    if (!rows.length) console.log("  no active custom domains — nothing to re-ensure");
  } catch (err) {
    console.log(`  hostname-route re-ensure skipped (${String(err).slice(0, 120)}) — SaaS domains may 522 until the next activation sync.`);
  }
}

if (target === "staging") {
  console.log("== SNAP STAGING DEPLOY ==");
  build();
  const cfg = writeStagingConfig();
  assertSecretsPresent(STAGING.worker, "staging");
  console.log("• deploying staging worker");
  // Plain wrangler deploy — vinext-cloudflare deploy rebuilds and wipes the
  // generated dist/server (including this staging config) mid-run.
  run(`npx wrangler deploy --config ${cfg.replace(/\\/g, "/")}`);
  if (noRoutes) {
    console.log("✅ staging worker uploaded WITHOUT routes (no traffic moved). Set its secrets, then deploy again without --no-routes.");
    process.exit(0);
  }
  console.log("• smoke check (expect 200/3xx on all):");
  const ok = await smoke(STAGING.url);
  console.log(ok ? "✅ staging live — verify your change at " + STAGING.url : "⚠️  smoke check failed — inspect before proceeding");
  console.log("   deploy prod from here ONLY after verifying: node scripts/deploy.mjs production --staging-verified");
} else if (target === "production") {
  if (!stagingVerified) {
    console.error(
      "⛔ REFUSED: production deploys require the same commit to be deployed AND verified on staging first.\n" +
        "   1. node scripts/deploy.mjs staging\n" +
        "   2. verify your change at " +
        STAGING.url +
        " (surface it, exercise the flow, check D1 if relevant)\n" +
        "   3. node scripts/deploy.mjs production --staging-verified",
    );
    process.exit(1);
  }
  console.log("== SNAP PRODUCTION DEPLOY (staging-verified) ==");
  build();
  assertSecretsPresent(JSON.parse(readFileSync(join(appDir, "dist/server/wrangler.json"), "utf8")).name, "production");
  console.log("• deploying production worker (snaphq.app + legacy snap.webcules.com)");
  // Plain wrangler deploy on the generated config — `pnpm deploy`
  // (vinext-cloudflare) currently crashes on Windows and would also rebuild,
  // discarding the cache-clean build above.
  if (noRoutes) {
    const cfg = JSON.parse(readFileSync(join(appDir, "dist/server/wrangler.json"), "utf8"));
    cfg.routes = [];
    const out = join(appDir, "dist/server/wrangler.noroutes.json");
    writeFileSync(out, JSON.stringify(cfg, null, 2));
    run(`npx wrangler deploy --config ${out.replace(/\\/g, "/")}`);
    console.log("✅ production worker uploaded WITHOUT routes (no traffic moved). Set its secrets, then deploy again without --no-routes.");
    process.exit(0);
  }
  run("npx wrangler deploy --config dist/server/wrangler.json");
  console.log("• smoke check:");
  const ok = (await smoke(PROD_URL)) && (await smoke(LEGACY_PROD_URL));
  console.log(ok ? "✅ production live at " + PROD_URL + " and " + LEGACY_PROD_URL : "⚠️  smoke check failed — CHECK IMMEDIATELY");
  console.log("   D1 reminder: apply any new migrations to BOTH databases (staging first, then prod).");
  await ensureActiveDomainRoutes();
} else {
  console.error("usage: node scripts/deploy.mjs <staging|production> [--staging-verified] [--no-routes]");
  process.exit(1);
}
