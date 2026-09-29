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
 *   worker  webcules-snap-staging   https://snap-staging.webcules.com
 *   D1      webcules-snap-staging   9b850d02-67d3-4c1b-a7ed-482cc587b2d5
 *   R2      snap-staging
 * Secrets on staging are its OWN (BETTER_AUTH_SECRET, SNAP_INBOUND_WEBHOOK_SECRET);
 * Stripe on staging = TEST keys (sk_test_…). Never copy prod secret values over.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING = {
  worker: "webcules-snap-staging",
  url: "https://snap-staging.webcules.com",
  d1Name: "webcules-snap-staging",
  d1Id: "9b850d02-67d3-4c1b-a7ed-482cc587b2d5",
  r2Bucket: "snap-staging",
};
const PROD_URL = "https://snap.webcules.com";

const args = process.argv.slice(2);
const target = args[0];
const stagingVerified = args.includes("--staging-verified");

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: appDir, stdio: "inherit", shell: process.platform === "win32" ? "bash" : true, ...opts });
}

function cleanBuildCaches() {
  console.log("• clearing build caches (stale .vite/.vinext/tsbuildinfo have burned us before)");
  for (const p of [
    "node_modules/.vite",
    "node_modules/.vinext",
    "node_modules/.vitest",
    ".vinext",
    "tsconfig.tsbuildinfo",
  ]) {
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
  // Prod-only routes stay on prod: snap.webcules.com (app), snap-fallback
  // (Custom Hostnames fallback origin), gallery-test (probe host).
  cfg.routes = [{ pattern: "snap-staging.webcules.com", custom_domain: true }];
  cfg.d1_databases[0].database_name = STAGING.d1Name;
  cfg.d1_databases[0].database_id = STAGING.d1Id;
  cfg.r2_buckets[0].bucket_name = STAGING.r2Bucket;
  cfg.vars.NEXT_PUBLIC_APP_URL = STAGING.url;
  cfg.vars.BETTER_AUTH_URL = STAGING.url;
  cfg.vars.EMAIL_FROM = "Snap Staging <hello@snap.webcules.com>";
  // No Turnstile secret on staging → leave the site key out so client
  // widgets skip rendering (verifyTurnstile passes when secret is unset).
  delete cfg.vars.TURNSTILE_SITE_KEY;
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
      console.log(`  ${res.status} ${path}${good ? "" : "  ← UNEXPECTED"}`);
    } catch (err) {
      ok = false;
      console.log(`  ERR ${path} — ${String(err)}`);
    }
  }
  return ok;
}

if (target === "staging") {
  console.log("== SNAP STAGING DEPLOY ==");
  build();
  const cfg = writeStagingConfig();
  console.log("• deploying staging worker");
  // Plain wrangler deploy — vinext-cloudflare deploy rebuilds and wipes the
  // generated dist/server (including this staging config) mid-run.
  run(`npx wrangler deploy --config ${cfg.replace(/\\/g, "/")}`);
  console.log("• smoke check (expect 200/3xx on all):");
  const ok = await smoke(STAGING.url);
  console.log(ok ? "✅ staging live — verify your change at " + STAGING.url : "⚠️  smoke check failed — inspect before proceeding");
  console.log(`   deploy prod from here ONLY after verifying: node scripts/deploy.mjs production --staging-verified`);
} else if (target === "production") {
  if (!stagingVerified) {
    console.error(
      "⛔ REFUSED: production deploys require the same commit to be deployed AND verified on staging first.\n" +
        "   1. node scripts/deploy.mjs staging\n" +
        "   2. verify your change at " + STAGING.url + " (surface it, exercise the flow, check D1 if relevant)\n" +
        "   3. node scripts/deploy.mjs production --staging-verified",
    );
    process.exit(1);
  }
  console.log("== SNAP PRODUCTION DEPLOY (staging-verified) ==");
  build();
  console.log("• deploying production worker (snap.webcules.com)");
  run("pnpm deploy");
  console.log("• smoke check:");
  const ok = await smoke(PROD_URL);
  console.log(ok ? "✅ production live at " + PROD_URL : "⚠️  smoke check failed — CHECK IMMEDIATELY");
  console.log("   D1 reminder: apply any new migrations to BOTH databases (staging first, then prod).");
} else {
  console.error("usage: node scripts/deploy.mjs <staging|production> [--staging-verified]");
  process.exit(1);
}
