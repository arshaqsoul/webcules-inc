#!/usr/bin/env node
// Keep the finished media in step across every PC. The reels, covers and generated music are gitignored (too big, and they
// change), so they live in a private R2 bucket and each machine pushes what it made and pulls what the others made.
//
//   node growth/scripts/sync.mjs status [--dry-run]       what differs between this PC and the bucket
//   node growth/scripts/sync.mjs push   [--dry-run]       upload what is new or changed here
//   node growth/scripts/sync.mjs pull   [--dry-run] [--force]   download what is new or changed in the bucket
//
// Config (growth/.env.local): GROWTH_R2_BUCKET (default webcules-growth). Uses `wrangler` from apps/snap, so `wrangler login`
// must have been done on this PC. GROWTH_SYNC_DIR=<folder> swaps R2 for a local folder (tests, or a shared drive).
//
// A manifest (manifest.json) in the bucket records every file's sha256, so only changed files move and a download is verified.
// Two PCs pushing at the same instant can overwrite each other's manifest entry: push, then `status` shows any file that went missing.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { ROOT, readEnvFile } from "./record/lib.mjs";

const PREFIX = "v1/";

/** What is allowed to leave this machine. Anything not matching is never synced. */
export const ALLOW = [
  /^growth\/packages\/[^/]+\/(reel\.mp4|reel\.music\.mp4|cover\.png)$/,
  /^growth\/out\/[^/]+\/(reel\.mp4|reel\.music\.mp4|cover\.png|edl\.json|qc\.json|qc\.music\.json|music\.json)$/,
  /^growth\/assets\/music\/[^/]+\.(flac|wav)$/,
];
/** Defence in depth: even if an allow rule is widened by mistake, these never sync (mailbox crops, secrets, raw footage, ledger). */
const NEVER = /(inbox|\.env|state\/|locks\/|recordings\/|\/frames\/|failure\.png)/i;

export function syncable(rel) {
  return ALLOW.some((re) => re.test(rel)) && !NEVER.test(rel);
}

export function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** A music version made with the synthesised stand-in is a test artefact, not a deliverable: it must not be mistaken for real music elsewhere. */
function isStandin(root, rel) {
  if (/^growth\/assets\/music\/standin-/.test(rel)) return true;
  const m = rel.match(/^(growth\/(?:out|packages)\/[^/]+)\/(reel\.music\.mp4|music\.json|qc\.music\.json)$/);
  if (!m) return false;
  try {
    return JSON.parse(fs.readFileSync(path.join(root, m[1].replace("/packages/", "/out/"), "music.json"), "utf8")).engine === "standin";
  } catch {
    return false;
  }
}

export function localFiles(root = ROOT) {
  const files = {};
  for (const top of ["growth/packages", "growth/out", "growth/assets/music"]) {
    for (const f of walk(path.join(root, top))) {
      const rel = path.relative(root, f).split(path.sep).join("/");
      if (!syncable(rel) || isStandin(root, rel)) continue;
      const buf = fs.readFileSync(f);
      files[rel] = { size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), mtime_ms: fs.statSync(f).mtimeMs };
    }
  }
  return files;
}

const CT = { ".mp4": "video/mp4", ".png": "image/png", ".json": "application/json", ".flac": "audio/flac", ".wav": "audio/wav" };

// ------------------------------------------------------------------ stores: R2 through wrangler, or a plain folder
export function r2Store(bucket) {
  const cwd = path.join(ROOT, "apps", "snap"); // the repo's wrangler lives here
  const run = (args) => spawnSync("npx", ["wrangler", ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 26 });
  return {
    name: `r2:${bucket}`,
    get(key) {
      const tmp = path.join(os.tmpdir(), `growth-sync-${crypto.randomBytes(6).toString("hex")}`);
      const r = run(["r2", "object", "get", `${bucket}/${key}`, "--file", tmp, "--remote"]);
      if (r.status !== 0) {
        if (/does not exist|not found|NoSuchKey|10007/i.test(r.stdout + r.stderr)) return null;
        throw new Error(`r2 get ${key} failed: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
      }
      const buf = fs.readFileSync(tmp);
      fs.rmSync(tmp, { force: true });
      return buf;
    },
    put(key, buf, contentType) {
      const tmp = path.join(os.tmpdir(), `growth-sync-${crypto.randomBytes(6).toString("hex")}`);
      fs.writeFileSync(tmp, buf);
      try {
        const r = run(["r2", "object", "put", `${bucket}/${key}`, "--file", tmp, "--content-type", contentType, "--remote"]);
        if (r.status !== 0) throw new Error(`r2 put ${key} failed: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    },
  };
}

export function dirStore(dir) {
  const f = (key) => path.join(dir, key);
  return {
    name: `dir:${dir}`,
    get: (key) => (fs.existsSync(f(key)) ? fs.readFileSync(f(key)) : null),
    put(key, buf) {
      fs.mkdirSync(path.dirname(f(key)), { recursive: true });
      fs.writeFileSync(f(key), buf);
    },
  };
}

function readManifest(store) {
  const buf = store.get(PREFIX + "manifest.json");
  if (!buf) return { version: 1, files: {} };
  return JSON.parse(buf.toString("utf8"));
}

/** Compare local files with the manifest. */
export function diff(local, manifest) {
  const push = [];
  const pull = [];
  const same = [];
  const conflict = [];
  for (const [rel, l] of Object.entries(local)) {
    const r = manifest.files[rel];
    if (!r) push.push(rel);
    else if (r.sha256 === l.sha256) same.push(rel);
    else if (l.mtime_ms > Date.parse(r.updated_at)) push.push(rel); // ours is newer
    else conflict.push(rel); // theirs is newer: pull will replace ours
  }
  for (const rel of Object.keys(manifest.files)) if (!local[rel]) pull.push(rel);
  return { push, pull, same, conflict };
}

// ------------------------------------------------------------------ commands (exported for tests)
export function status({ store, root = ROOT }) {
  const local = localFiles(root);
  const manifest = readManifest(store);
  return { ...diff(local, manifest), local, manifest };
}

export function push({ store, root = ROOT, dry = false, log = console.log }) {
  const { push: todo, local, manifest } = status({ store, root });
  if (dry) return { pushed: [], would: todo };
  const by = os.hostname();
  for (const rel of todo) {
    const buf = fs.readFileSync(path.join(root, rel));
    store.put(PREFIX + rel, buf, CT[path.extname(rel)] ?? "application/octet-stream");
    manifest.files[rel] = { size: buf.length, sha256: local[rel].sha256, updated_at: new Date().toISOString(), by };
    log(`  uploaded ${rel} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
  if (todo.length) store.put(PREFIX + "manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)), "application/json"); // last, so a failed upload is never advertised
  return { pushed: todo };
}

export function pull({ store, root = ROOT, dry = false, force = false, log = console.log }) {
  const { pull: missing, conflict, manifest } = status({ store, root });
  const todo = [...missing, ...(force ? conflict : [])];
  const skipped = force ? [] : conflict;
  if (dry) return { would: todo, skipped };
  const pulled = [];
  for (const rel of todo) {
    if (!syncable(rel)) {
      log(`  REFUSED ${rel}: not an allowed path`);
      continue;
    }
    const buf = store.get(PREFIX + rel);
    if (!buf) {
      log(`  missing in store: ${rel}`);
      continue;
    }
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    if (sha !== manifest.files[rel].sha256) {
      log(`  CORRUPT ${rel}: checksum differs from the manifest, not written`);
      continue;
    }
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    pulled.push(rel);
    log(`  downloaded ${rel} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
  return { pulled, skipped };
}

// ------------------------------------------------------------------ cli
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [cmd, ...rest] = process.argv.slice(2);
  readEnvFile();
  if (!["status", "push", "pull"].includes(cmd)) {
    console.error("usage: sync.mjs <status|push|pull> [--dry-run] [--force]");
    process.exit(2);
  }
  const dry = rest.includes("--dry-run");
  const force = rest.includes("--force");
  const bucket = process.env.GROWTH_R2_BUCKET || "webcules-growth";
  const store = process.env.GROWTH_SYNC_DIR ? dirStore(process.env.GROWTH_SYNC_DIR) : r2Store(bucket);
  console.log(`[sync] ${cmd}${dry ? " (dry run)" : ""} via ${store.name}`);
  try {
    if (cmd === "status" || dry) {
      const s = status({ store });
      console.log(`  here only (push): ${s.push.length}\n  bucket only (pull): ${s.pull.length}\n  identical: ${s.same.length}\n  differs, bucket newer: ${s.conflict.length}`);
      for (const k of ["push", "pull", "conflict"]) for (const rel of s[k]) console.log(`   ${k.padEnd(8)} ${rel}`);
    } else if (cmd === "push") {
      const r = push({ store });
      console.log(`[sync] pushed ${r.pushed.length} file(s)`);
    } else {
      const r = pull({ store, force });
      console.log(`[sync] pulled ${r.pulled.length} file(s)${r.skipped.length ? `, skipped ${r.skipped.length} that differ and are newer in the bucket (use --force)` : ""}`);
    }
  } catch (e) {
    console.error(`[sync] ${e.message}`);
    process.exit(1);
  }
}
