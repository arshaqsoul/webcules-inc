/* Tracked D1 migrations for Snap — WEB-468.
 *
 * The migrations/ directory is the source of truth. Every remote database
 * (staging, production) carries a `d1_migrations` ledger table (same schema
 * wrangler uses). A migration "is applied" ONLY if its file name is a row in
 * that ledger. Applying by hand with `wrangler d1 execute --file` and no
 * ledger row is what let production run code that needed asset.mid_key
 * (migration 0074, WEB-196) while prod D1 never got it — client galleries
 * 500'd (second such drift after the first incident).
 *
 * Usage (run from apps/snap):
 *   node scripts/migrate.mjs status  <staging|production>   list applied/pending
 *   node scripts/migrate.mjs apply   <staging|production>   apply pending in order, record ledger
 *   node scripts/migrate.mjs assert  <staging|production>   exit 1 if anything is pending (deploy gate)
 *   node scripts/migrate.mjs backfill <staging|production> <file.sql...>
 *                                                           record already-applied migrations
 *                                                           (use ONLY after verifying the schema
 *                                                           effects are present in that database)
 *
 * Deploys refuse unless the ledger is complete — see scripts/deploy.mjs
 * (assertMigrationsApplied) which calls `assert` in preflight for BOTH targets.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computePending, TARGETS } from "./migrate-core.mjs";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(appDir, "migrations");

function fail(msg) {
  console.error(`⛔ ${msg}`);
  process.exit(1);
}

/* Fail closed: any wrangler/ledger read error aborts rather than guessing. */
function d1(dbName, args) {
  return execSync(`npx wrangler d1 ${args} ${dbName} --remote --json -y`, {
    cwd: appDir,
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32" ? "bash" : true,
  }).toString();
}

function ensureLedger(dbName) {
  d1(
    dbName,
    `execute --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)"`,
  );
}

function listApplied(dbName) {
  ensureLedger(dbName);
  const out = d1(dbName, `execute --command "SELECT name FROM d1_migrations ORDER BY name" --json`);
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed) || !parsed[0]?.results) fail("could not read the d1_migrations ledger (unexpected wrangler output)");
  return new Set(parsed[0].results.map((r) => r.name));
}

function listFiles() {
  if (!existsSync(MIGRATIONS_DIR)) fail("migrations/ directory not found");
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

function applyFile(dbName, file) {
  console.log(`  applying ${file} …`);
  d1(dbName, `execute --file ./migrations/${file}`);
  d1(dbName, `execute --command "INSERT INTO d1_migrations (name) VALUES ('${file}')"`);
}

function run() {
  const [cmd, target, ...rest] = process.argv.slice(2);
  const db = TARGETS[target];
  if (!db) fail(`unknown target "${target ?? ""}" — use staging or production`);
  const files = listFiles();
  const applied = listApplied(db);
  const pending = computePending(files, applied);

  if (cmd === "status") {
    console.log(`${target} D1: ${db}`);
    console.log(`  applied on ledger: ${files.filter((f) => applied.has(f)).length}/${files.length}`);
    console.log(`  ledger rows not in migrations/: ${[...applied].filter((n) => !files.includes(n)).join(", ") || "none"}`);
    if (pending.length) {
      console.log(`  PENDING (${pending.length}):`);
      for (const f of pending) console.log(`    ${f}`);
    } else {
      console.log("  pending: none — ledger complete");
    }
    return;
  }

  if (cmd === "assert") {
    if (pending.length) {
      fail(
        `${target} D1 (${db}) is missing ${pending.length} migration(s): ${pending.join(", ")}.\n` +
          `   The deployed code may need them. Apply with:  node scripts/migrate.mjs apply ${target}\n` +
          `   (staging first, then production — never the other way around.)`,
      );
    }
    console.log(`• ${target} D1 ledger complete: all ${files.length} migrations applied`);
    return;
  }

  if (cmd === "apply") {
    if (!pending.length) {
      console.log(`nothing to apply — ${target} ledger is complete (${files.length}/${files.length})`);
      return;
    }
    console.log(`applying ${pending.length} migration(s) to ${target} (${db}) in order:`);
    for (const f of pending) applyFile(db, f);
    console.log(`done — ${target} ledger complete (${files.length}/${files.length})`);
    return;
  }

  if (cmd === "backfill") {
    if (!rest.length) fail("backfill needs explicit file names, e.g. `backfill production 0074_mid_derivative.sql`");
    const unknown = rest.filter((f) => !files.includes(f));
    if (unknown.length) fail(`not migration files: ${unknown.join(", ")}`);
    console.log(`Recording ${rest.length} migration(s) as already applied on ${target} (${db}):`);
    for (const f of rest) {
      d1(db, `execute --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('${f}')"`);
      console.log(`  ledger += ${f}`);
    }
    console.log("NOTE: backfill only writes ledger rows. Verify the schema effects are really present first.");
    return;
  }

  fail(`unknown command "${cmd ?? ""}" — use status | apply | assert | backfill`);
}

run();
