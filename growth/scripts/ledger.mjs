#!/usr/bin/env node
// Growth ledger - the single source of truth for the pain-point pipeline.
// Agents never edit state files by hand. Every change goes through this CLI so that
// illegal transitions, missing artifacts and double-processing are rejected mechanically.
//
// State lives OUTSIDE git, in the main checkout (resolved through the git common dir) so that
// agents running in separate worktrees all see the same ledger. Override with GROWTH_STATE_DIR.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(HERE, "..", "schemas");

// ---------------------------------------------------------------- paths

function git(args, cwd = process.cwd()) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function mainRoot() {
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], HERE);
  return common ? path.dirname(common) : path.resolve(HERE, "..", "..");
}

export function stateDir() {
  return process.env.GROWTH_STATE_DIR || path.join(mainRoot(), "growth", "state");
}

const ppDir = () => path.join(stateDir(), "pain-points");
const ppFile = (id) => path.join(ppDir(), `${id}.json`);

// ---------------------------------------------------------------- state machine

export const STATES = [
  "DISCOVERED", "VALIDATED", "TIER_MAPPED", "CLUSTERED", "EPIC_FILED", "ARCHITECTED",
  "BUILT", "REVIEWED", "QA_PASSED", "STAGING_VERIFIED", "DEMO_SCRIPTED", "RECORDED",
  "ENHANCED", "QC_PASSED", "PACKAGED", "HUMAN_POSTED", "MEASURED",
];

const NEXT = {
  DISCOVERED: ["VALIDATED"],
  VALIDATED: ["TIER_MAPPED"],
  TIER_MAPPED: ["CLUSTERED", "DEMO_SCRIPTED"], // gap/partial -> build track, solved -> straight to demo
  CLUSTERED: ["EPIC_FILED"],
  EPIC_FILED: ["ARCHITECTED"],
  ARCHITECTED: ["BUILT"],
  BUILT: ["REVIEWED"],
  REVIEWED: ["QA_PASSED"],
  QA_PASSED: ["STAGING_VERIFIED"],
  STAGING_VERIFIED: ["DEMO_SCRIPTED"],
  DEMO_SCRIPTED: ["RECORDED"],
  RECORDED: ["ENHANCED"],
  ENHANCED: ["QC_PASSED"],
  QC_PASSED: ["PACKAGED"],
  PACKAGED: ["HUMAN_POSTED"],
  HUMAN_POSTED: ["MEASURED"],
  MEASURED: [],
};

// Which states each role may pick up. `next --role X` only offers these.
export const ROLE_STATES = {
  researcher: ["DISCOVERED"],
  mapper: ["VALIDATED"],
  architect: ["TIER_MAPPED:build", "CLUSTERED", "EPIC_FILED"],
  developer: ["ARCHITECTED"],
  reviewer: ["BUILT"],
  qa: ["REVIEWED", "QA_PASSED"],
  designer: ["TIER_MAPPED:solved", "STAGING_VERIFIED"],
  recorder: ["DEMO_SCRIPTED"],
  editor: ["RECORDED", "ENHANCED"],
  packager: ["QC_PASSED"],
  human: ["PACKAGED"],
  analyst: ["HUMAN_POSTED"],
};

// ---------------------------------------------------------------- tiny helpers

const now = () => new Date().toISOString();

class Die extends Error {}

/** Throws (never process.exit) so withLock's finally always releases the record lock. */
function die(msg) {
  throw new Die(msg);
}

function getPath(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof o[k] !== "object" || o[k] === null) o[k] = {};
    o = o[k];
  }
  o[keys.at(-1)] = value;
}

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Artifact paths are repo-relative and may live in the current worktree (feature branch) or the main checkout. */
function artifactExists(rel) {
  if (!rel || typeof rel !== "string") return false;
  if (path.isAbsolute(rel)) return fs.existsSync(rel);
  const tops = [git(["rev-parse", "--show-toplevel"]), mainRoot()].filter(Boolean);
  return tops.some((t) => fs.existsSync(path.join(t, rel)));
}

function readArtifactJson(rel) {
  const tops = [git(["rev-parse", "--show-toplevel"]), mainRoot()].filter(Boolean);
  for (const t of tops) {
    const p = path.isAbsolute(rel) ? rel : path.join(t, rel);
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** Per-record mutex so two agents cannot interleave read-modify-write. */
function withLock(id, fn) {
  const lock = `${ppFile(id)}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + 3000;
  for (;;) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.closeSync(fd);
      break;
    } catch {
      if (Date.now() > deadline) die(`could not lock ${id} (another agent is writing it)`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// ---------------------------------------------------------------- schema validation (subset)

function validate(value, schema, at = "$") {
  const errs = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  const typeOk = (t) => t === actual || (t === "number" && actual === "integer");
  if (types.length && !types.some(typeOk)) return [`${at}: expected ${types.join("|")}, got ${actual}`];
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} not in [${schema.enum.join(", ")}]`);
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) errs.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${at}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errs.push(`${at}: needs at least ${schema.minItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items, `${at}[${i}]`)));
  }
  if (actual === "object") {
    for (const k of schema.required ?? []) if (!(k in value)) errs.push(`${at}: missing required "${k}"`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in value) errs.push(...validate(value[k], sub, `${at}.${k}`));
  }
  return errs;
}

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), "utf8"));
}

// ---------------------------------------------------------------- transition guards

/** Each guard returns an error string, or null when the record may enter that state. */
const GUARDS = {
  VALIDATED(pp) {
    if (pp.evidence.length < 3) return "needs >= 3 evidence items";
    const hosts = new Set(pp.evidence.map((e) => { try { return new URL(e.url).host; } catch { return e.url; } }));
    if (hosts.size < 2) return "evidence must come from >= 2 distinct hosts (one thread is an anecdote, not a pattern)";
    return null;
  },
  TIER_MAPPED(pp) {
    const m = pp.tier_mapping;
    if (!m) return "tier_mapping missing";
    if (m.verdict !== "gap" && !(m.surfaces?.length > 0)) return "solved/partial verdicts must cite code surfaces (tier_mapping.surfaces)";
    return null;
  },
  CLUSTERED(pp) {
    if (pp.tier_mapping?.verdict === "solved") return "solved pain points skip the build track (go straight to DEMO_SCRIPTED)";
    if (!pp.cluster_id) return "cluster_id missing";
    if (!artifactExists(`growth/clusters/${pp.cluster_id}.md`)) return `growth/clusters/${pp.cluster_id}.md does not exist`;
    return null;
  },
  EPIC_FILED(pp) {
    if (!pp.linear?.epic && !pp.linear?.outbox) return "linear.epic (issue id) or linear.outbox (draft path) required";
    if (!pp.linear.epic && !artifactExists(pp.linear.outbox)) return `linear.outbox ${pp.linear.outbox} does not exist`;
    return null;
  },
  ARCHITECTED(pp) {
    if (!pp.adr) return "adr path missing";
    return artifactExists(pp.adr) ? null : `${pp.adr} does not exist`;
  },
  BUILT(pp) {
    if (!pp.branch || !pp.pr) return "branch and pr required (feature work goes through a PR, never straight to master)";
    return null;
  },
  REVIEWED(pp) {
    return pp.review?.verdict === "approve" ? null : "review.verdict must be 'approve'";
  },
  QA_PASSED(pp) {
    return pp.qa?.verdict === "pass" && pp.qa?.typecheck === "pass" ? null : "qa.verdict and qa.typecheck must both be 'pass'";
  },
  STAGING_VERIFIED(pp) {
    return pp.qa?.staging_commit && pp.qa?.staging_verified_at ? null : "qa.staging_commit and qa.staging_verified_at required (logged-in browser run on staging)";
  },
  DEMO_SCRIPTED(pp) {
    const from = pp.state;
    if (from === "TIER_MAPPED" && pp.tier_mapping?.verdict !== "solved") return "only 'solved' pain points may be demoed without building";
    return artifactExists(pp.demo?.storyboard) ? null : "demo.storyboard must point at an existing file";
  },
  RECORDED(pp) {
    if (!artifactExists(pp.demo?.raw)) return "demo.raw missing";
    if (!artifactExists(pp.demo?.events)) return "demo.events missing (the editor cannot enhance without the events timeline)";
    const ev = readArtifactJson(pp.demo.events);
    if (!ev) return "demo.events is not valid JSON";
    const errs = validate(ev, loadSchema("demo-events.schema.json"));
    return errs.length ? `demo.events invalid: ${errs.slice(0, 3).join("; ")}` : null;
  },
  ENHANCED(pp) {
    return artifactExists(pp.demo?.edited) ? null : "demo.edited missing";
  },
  QC_PASSED(pp) {
    const qc = readArtifactJson(pp.demo?.qc);
    if (!qc) return "demo.qc report missing";
    return qc.pass === true ? null : `QC report says pass=${qc.pass}: ${(qc.failures ?? []).join("; ")}`;
  },
  PACKAGED(pp) {
    return artifactExists(pp.demo?.package) ? null : "demo.package missing";
  },
  HUMAN_POSTED(pp, ctx) {
    if (ctx.by !== "human") return "only a human may mark a post as posted (use --by human)";
    return pp.post?.url ? null : "post.url required";
  },
  MEASURED(pp) {
    return typeof pp.metrics?.views === "number" ? null : "metrics.views (number) required";
  },
};

// ---------------------------------------------------------------- store

function load(id) {
  const f = ppFile(id);
  if (!fs.existsSync(f)) die(`${id} not found`);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function save(pp) {
  const errs = validate(pp, loadSchema("pain-point.schema.json"));
  if (errs.length) die(`schema: ${errs.slice(0, 5).join("; ")}`);
  atomicWrite(ppFile(pp.id), pp);
}

function listAll() {
  if (!fs.existsSync(ppDir())) return [];
  return fs
    .readdirSync(ppDir())
    .filter((f) => /^PP-\d+\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(ppDir(), f), "utf8")));
}

function leaseLive(pp) {
  return pp.lease_by && pp.lease_expires && new Date(pp.lease_expires) > new Date();
}

function score(pp) {
  if (typeof pp.priority === "number") return pp.priority;
  // The 30-day goal is PAID users: pain points that only a paid tier solves rank first.
  return (pp.severity ?? 1) * 2 + (pp.frequency ?? 1) + (pp.tier_mapping?.paid_tier_trigger ? 4 : 0);
}

// ---------------------------------------------------------------- commands

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  const sets = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--set") sets.push(argv[++i]);
    else if (a.startsWith("--")) flags[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    else pos.push(a);
  }
  return { pos, flags, sets };
}

function applySets(pp, sets) {
  for (const s of sets) {
    const eq = s.indexOf("=");
    if (eq < 1) die(`bad --set "${s}" (want key.path=value)`);
    const key = s.slice(0, eq);
    if (["id", "state", "history", "lease_by", "lease_expires"].includes(key)) die(`--set cannot write ${key}`);
    setPath(pp, key, parseValue(s.slice(eq + 1)));
  }
}

const commands = {
  new({ flags, sets }) {
    for (const k of ["title", "statement", "persona", "severity"]) if (!flags[k]) die(`--${k} required`);
    fs.mkdirSync(ppDir(), { recursive: true });
    const used = listAll().map((p) => Number(p.id.slice(3)));
    const id = `PP-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
    const pp = {
      id,
      title: flags.title,
      statement: flags.statement,
      persona: flags.persona,
      severity: Number(flags.severity),
      frequency: flags.frequency ? Number(flags.frequency) : 1,
      state: "DISCOVERED",
      evidence: [],
      history: [{ to: "DISCOVERED", at: now(), by: flags.by ?? "researcher", note: "created" }],
    };
    applySets(pp, sets);
    withLock(id, () => save(pp));
    return pp;
  },

  show({ pos }) {
    return load(pos[0]);
  },

  list({ flags }) {
    return listAll()
      .filter((p) => !flags.state || p.state === flags.state)
      .map((p) => ({ id: p.id, state: p.state, title: p.title, verdict: p.tier_mapping?.verdict, tier: p.tier_mapping?.tier, blocked: !!p.blocked, lease_by: leaseLive(p) ? p.lease_by : undefined, score: score(p) }));
  },

  /** What may this role work on right now? Highest score first; skips blocked and leased records. */
  next({ flags }) {
    const role = flags.role;
    if (!ROLE_STATES[role]) die(`--role must be one of ${Object.keys(ROLE_STATES).join(", ")}`);
    const rules = ROLE_STATES[role];
    const matches = (pp) =>
      rules.some((r) => {
        const [state, track] = r.split(":");
        if (pp.state !== state) return false;
        if (!track) return true;
        return track === "solved" ? pp.tier_mapping?.verdict === "solved" : pp.tier_mapping?.verdict !== "solved";
      });
    return listAll()
      .filter((p) => matches(p) && !p.blocked && !leaseLive(p))
      .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
      .slice(0, Number(flags.limit ?? 5))
      .map((p) => ({ id: p.id, state: p.state, title: p.title, score: score(p) }));
  },

  claim({ pos, flags }) {
    const by = flags.by;
    if (!by) die("--by required");
    return withLock(pos[0], () => {
      const pp = load(pos[0]);
      if (pp.blocked) die(`${pp.id} is blocked: ${pp.blocked.reason}`);
      if (leaseLive(pp) && pp.lease_by !== by) die(`${pp.id} is leased by ${pp.lease_by} until ${pp.lease_expires}`);
      pp.lease_by = by;
      pp.lease_expires = new Date(Date.now() + Number(flags.ttl ?? 45) * 60_000).toISOString();
      save(pp);
      return pp;
    });
  },

  release({ pos }) {
    return withLock(pos[0], () => {
      const pp = load(pos[0]);
      delete pp.lease_by;
      delete pp.lease_expires;
      save(pp);
      return pp;
    });
  },

  transition({ pos, flags, sets }) {
    const [id, to] = pos;
    const by = flags.by;
    if (!by) die("--by required");
    return withLock(id, () => {
      const pp = load(id);
      if (pp.blocked) die(`${id} is blocked: ${pp.blocked.reason}`);
      if (leaseLive(pp) && pp.lease_by !== by && by !== "human") die(`${id} is leased by ${pp.lease_by}`);
      if (!NEXT[pp.state]?.includes(to)) die(`illegal transition ${pp.state} -> ${to} (allowed: ${NEXT[pp.state]?.join(", ") || "none"})`);
      applySets(pp, sets);
      const err = GUARDS[to]?.(pp, { by });
      if (err) die(`guard for ${to} failed: ${err}`);
      pp.history.push({ from: pp.state, to, at: now(), by, note: flags.note ?? "" });
      pp.state = to;
      delete pp.lease_by;
      delete pp.lease_expires;
      save(pp);
      return pp;
    });
  },

  /** Send a record back to an earlier state (failed review, failed QC, bad take). Needs a reason. */
  rework({ pos, flags, sets }) {
    const [id, to] = pos;
    if (!flags.by || !flags.note) die("--by and --note (the reason) required");
    return withLock(id, () => {
      const pp = load(id);
      if (STATES.indexOf(to) < 0 || STATES.indexOf(to) >= STATES.indexOf(pp.state)) die(`rework target must be an earlier state than ${pp.state}`);
      applySets(pp, sets);
      pp.history.push({ from: pp.state, to, at: now(), by: flags.by, note: `REWORK: ${flags.note}` });
      pp.state = to;
      delete pp.lease_by;
      delete pp.lease_expires;
      save(pp);
      return pp;
    });
  },

  block({ pos, flags }) {
    if (!flags.reason) die("--reason required");
    return withLock(pos[0], () => {
      const pp = load(pos[0]);
      pp.blocked = { reason: flags.reason, since: now(), by: flags.by ?? "unknown" };
      save(pp);
      return pp;
    });
  },

  unblock({ pos }) {
    return withLock(pos[0], () => {
      const pp = load(pos[0]);
      delete pp.blocked;
      save(pp);
      return pp;
    });
  },

  drop({ pos, flags }) {
    if (!flags.reason || !flags.by) die("--by and --reason required");
    return withLock(pos[0], () => {
      const pp = load(pos[0]);
      pp.history.push({ from: pp.state, to: "DROPPED", at: now(), by: flags.by, note: flags.reason });
      pp.state = "DROPPED";
      delete pp.lease_by;
      delete pp.lease_expires;
      save(pp);
      return pp;
    });
  },

  validate() {
    const schema = loadSchema("pain-point.schema.json");
    const bad = listAll().flatMap((p) => validate(p, schema).map((e) => `${p.id} ${e}`));
    if (bad.length) die(bad.slice(0, 10).join(" | "));
    return { ok: true, records: listAll().length };
  },

  /** Counts per state - used by the SessionStart hook and the orchestrator's status line. */
  status() {
    const counts = {};
    for (const p of listAll()) counts[p.state] = (counts[p.state] ?? 0) + 1;
    return counts;
  },

  /** Portable, committable copy of the (gitignored) ledger. The orchestrator commits these from the main checkout. */
  snapshot() {
    const out = path.join(mainRoot(), "growth", "snapshots", `ledger-${now().slice(0, 10)}.json`);
    atomicWrite(out, { taken_at: now(), records: listAll() });
    return { ok: true, file: path.relative(mainRoot(), out) };
  },
};

// ---------------------------------------------------------------- entry

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (!commands[cmd]) die(`usage: ledger.mjs <${Object.keys(commands).join("|")}> ...`);
    console.log(JSON.stringify(commands[cmd](parseArgs(rest)), null, 2));
  } catch (e) {
    if (!(e instanceof Die)) throw e;
    console.error(JSON.stringify({ ok: false, error: e.message }));
    process.exit(1);
  }
}
