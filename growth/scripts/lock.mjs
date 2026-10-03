#!/usr/bin/env node
// Shared-resource lock. Staging is ONE Cloudflare worker (webcules-snap-staging) and ONE D1/R2 pair,
// so two agents deploying or seeding it at once corrupt each other's verification runs.
// Anything that mutates staging (deploy, migration, fixture seeding) or records on it holds `staging`.
//
//   node growth/scripts/lock.mjs acquire staging --by developer-PP-004 [--ttl 30] [--wait 600]
//   node growth/scripts/lock.mjs release staging --by developer-PP-004
//   node growth/scripts/lock.mjs status  staging
//
// Locks live in the main checkout (git common dir) so every worktree sees the same one.

import fs from "node:fs";
import path from "node:path";
import { mainRoot } from "./ledger.mjs";

const dir = path.join(process.env.GROWTH_LOCK_DIR || path.join(mainRoot(), "growth", "locks"));
const file = (name) => path.join(dir, `${name}.lock.json`);

const [cmd, name, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[++i];

function read(n) {
  try {
    return JSON.parse(fs.readFileSync(file(n), "utf8"));
  } catch {
    return null;
  }
}

function live(l) {
  return l && new Date(l.expires) > new Date();
}

function out(obj, code = 0) {
  console[code ? "error" : "log"](JSON.stringify(obj));
  process.exit(code);
}

if (!["acquire", "release", "status"].includes(cmd) || !name) out({ ok: false, error: "usage: lock.mjs <acquire|release|status> <name> --by <who>" }, 2);
fs.mkdirSync(dir, { recursive: true });

if (cmd === "status") out({ ok: true, held: live(read(name)) ? read(name) : null });

if (!flags.by) out({ ok: false, error: "--by required" }, 2);

if (cmd === "release") {
  const l = read(name);
  if (l && l.by !== flags.by && live(l)) out({ ok: false, error: `held by ${l.by}` }, 1);
  fs.rmSync(file(name), { force: true });
  out({ ok: true });
}

// acquire: atomic create, polling until --wait seconds (default 0 = fail fast)
const deadline = Date.now() + Number(flags.wait ?? 0) * 1000;
for (;;) {
  const existing = read(name);
  if (existing && !live(existing)) fs.rmSync(file(name), { force: true }); // expired lease
  try {
    const fd = fs.openSync(file(name), "wx");
    fs.writeSync(fd, JSON.stringify({ by: flags.by, at: new Date().toISOString(), expires: new Date(Date.now() + Number(flags.ttl ?? 30) * 60_000).toISOString() }));
    fs.closeSync(fd);
    out({ ok: true, name, by: flags.by });
  } catch {
    if (read(name)?.by === flags.by) out({ ok: true, name, by: flags.by, reentrant: true });
    if (Date.now() >= deadline) out({ ok: false, error: `${name} is held by ${read(name)?.by} until ${read(name)?.expires}` }, 1);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
}
