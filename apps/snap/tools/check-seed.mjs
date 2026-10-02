#!/usr/bin/env node
/* WEB-320 — deterministic gate for seed drafts: renders a draft through the
 * dev harness (the running built worker) and proves it parsed + rendered a
 * real gallery (not the harness help page), then captures desktop + mobile
 * screenshots for visual review.
 *
 *   node tools/check-seed.mjs <draft-key | path>     one draft
 *   node tools/check-seed.mjs --all                 every draft, exit 1 if any fail
 *
 * Exit codes: 0 ok · 1 render/parse failure · 2 harness unreachable. */
import { execFile as execFileCb } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const appRoot = join(fileURLToPath(import.meta.url), "..", "..");
const HARNESS = process.env.HARNESS_BASE ?? "http://localhost:3210";
const DRAFTS = join(appRoot, "tools", "seed-drafts");
const SHOTS = join(appRoot, "tools", "preview-shots");

function draftPaths() {
  return existsSync(DRAFTS) ? readdirSync(DRAFTS).filter((f) => f.endsWith(".json")).map((f) => join(DRAFTS, f)) : [];
}

async function checkOne(path) {
  const draft = JSON.parse(readFileSync(path, "utf8"));
  const key = draft.key ?? path.replace(/[/\\]/g, "-").replace(/\.json$/, "");
  const genre = Array.isArray(draft.genres) && draft.genres[0] ? `&genre=${encodeURIComponent(draft.genres[0])}` : "";
  const accent = draft.harnessAccent ? `&accent=${encodeURIComponent(draft.harnessAccent)}` : "";
  // The built worker has no repo filesystem — the design travels urlencoded
  // (?design=). ?draft=<key> works only under `pnpm dev`.
  const url = `${HARNESS}/dev/template-harness?design=${encodeURIComponent(JSON.stringify(draft.design))}${genre}${accent}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res || !res.ok) {
    console.log(`FAIL ${key}: harness unreachable (${res ? res.status : "no response"})`);
    return false;
  }
  const html = await res.text();
  // The help card only renders when the design failed to parse.
  if (html.includes("Template harness</h1>")) {
    console.log(`FAIL ${key}: design did not parse (harness help page rendered)`);
    return false;
  }
  if (!html.includes("Snap Template Studio")) {
    console.log(`FAIL ${key}: gallery header missing — unexpected page`);
    return false;
  }

  // Screenshots for visual review (desktop full-page + mobile full-page).
  const shot = async (w, h, suffix) => {
    await execFile("node", ["tools/shot.mjs", url, join(SHOTS, `${key}${suffix}.png`), String(w), String(h)], { cwd: appRoot });
  };
  await shot(1280, 900, "");
  await shot(390, 844, "-mobile");
  console.log(`ok   ${key}`);
  return true;
}

const targets = process.argv[2] === "--all" ? draftPaths() : [process.argv[2]?.includes("/") || process.argv[2]?.includes("\\") ? process.argv[2] : join(DRAFTS, `${process.argv[2]}.json`)];
if (!targets[0] || !existsSync(targets[0])) {
  console.log(`no draft at ${targets[0] ?? "(none)"}`);
  process.exit(1);
}
let allOk = true;
for (const t of targets) {
  const ok = await checkOne(t).catch((e) => {
    console.log(`FAIL ${t}: ${e.message}`);
    return false;
  });
  if (!ok) allOk = false;
}
process.exit(allOk ? 0 : 1);
