#!/usr/bin/env node
// The one entry point for making a demo reel. Any agent can drive a record from storyboard to QC with these four commands.
//
//   node growth/scripts/reel.mjs new    PP-###              scaffold storyboard.md, meta.json and take.mjs from the templates
//   node growth/scripts/reel.mjs check  PP-###              lint the storyboard, meta and take BEFORE anything touches staging
//   node growth/scripts/reel.mjs make   PP-### [--fast] [--skip-record]   record, edit, QC, stop at the first failure
//   node growth/scripts/reel.mjs status PP-###              where the record is and exactly what to do next
//   node growth/scripts/reel.mjs music  PP-### [flags]      make reel.music.mp4 (trailer score synced to the beats) and QC it; flags go to music.mjs
//
// `check` is cheap and offline. Run it every time you change a file. `make` is the only command that touches staging.
// Worked example: growth/examples/PP-003/WALKTHROUGH.md. Pitfalls: growth/LESSONS.md. Full procedure: growth/RUNBOOK.md.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { ROOT, safeEmails } from "./record/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [cmd, pp, ...rest] = process.argv.slice(2);
const flags = new Set(rest);

const P = (...a) => path.join(ROOT, ...a);
const files = (id) => ({
  storyboard: P("growth", "storyboards", `${id}.md`),
  meta: P("growth", "storyboards", `${id}.meta.json`),
  take: P("growth", "storyboards", `${id}.take.mjs`),
});
const rel = (f) => path.relative(ROOT, f);

function usage() {
  console.error("usage: reel.mjs <new|check|make|status|music> PP-### [--fast] [--skip-record] [music flags]");
  process.exit(2);
}
if (!["new", "check", "make", "status", "music"].includes(cmd) || !/^PP-\d{3,}$/.test(pp ?? "")) usage();
const F = files(pp);

// ------------------------------------------------------------------ new
async function scaffold() {
  const exists = Object.values(F).filter((f) => fs.existsSync(f));
  if (exists.length) {
    console.error(`refusing to overwrite: ${exists.map(rel).join(", ")}`);
    process.exit(1);
  }
  const sb = fs.readFileSync(P("growth", "templates", "storyboard.md"), "utf8").replaceAll("PP-###", pp);
  const take = fs.readFileSync(P("growth", "templates", "take.mjs"), "utf8").replaceAll("PP-###", pp);
  fs.writeFileSync(F.storyboard, sb);
  fs.copyFileSync(P("growth", "templates", "meta.example.json"), F.meta);
  fs.writeFileSync(F.take, take);
  console.log(`created:\n  ${rel(F.storyboard)}\n  ${rel(F.meta)}\n  ${rel(F.take)}\nNext: fill them in, then: node growth/scripts/reel.mjs check ${pp}`);
}

// ------------------------------------------------------------------ check
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

async function check() {
  const problems = [];
  const warns = [];
  const bad = (m) => problems.push(m);

  for (const [k, f] of Object.entries(F)) if (!fs.existsSync(f)) bad(`missing ${rel(f)} (run: reel.mjs new ${pp})`);
  if (problems.length) return report(problems, warns);

  // no em dashes anywhere (founder rule)
  for (const f of Object.values(F)) if (fs.readFileSync(f, "utf8").includes("—")) bad(`${rel(f)} contains an em dash, use a plain dash`);

  // meta.json
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(F.meta, "utf8"));
  } catch (e) {
    bad(`${rel(F.meta)} is not valid JSON: ${e.message}`);
  }
  if (meta) {
    if (!meta.hook) bad("meta.hook missing");
    else if (words(meta.hook) > 6) bad(`meta.hook is ${words(meta.hook)} words, max 6`);
    if (!meta.end?.claim || !meta.end?.link) bad("meta.end needs claim and link");
    if (!Array.isArray(meta.claims)) bad("meta.claims must be an array");
    for (const c of meta.claims ?? []) {
      if (!c.text || !c.source) bad(`claim needs text and source: ${JSON.stringify(c)}`);
      else if (!fs.existsSync(P(c.source))) bad(`claim "${c.text}" cites ${c.source}, which does not exist`);
    }
    for (const ins of meta.inserts ?? []) {
      if (!ins.image || !fs.existsSync(P(ins.image))) bad(`insert image missing: ${ins.image}`);
      if (/growth\/recordings\//.test(ins.image ?? "")) bad(`insert image ${ins.image} is inside growth/recordings, which the recorder wipes. Use growth/assets/${pp}/`);
      if (!ins.caption || words(ins.caption) > 6) bad(`insert caption must be 1-6 words: "${ins.caption}"`);
      if (!ins.duration_ms) bad("insert needs duration_ms");
    }
  }

  // storyboard
  const sb = fs.readFileSync(F.storyboard, "utf8");
  const placeholders = [...sb.replace(/<[a-z]+@[^>]+>/g, "").matchAll(/<([^>\n]{3,})>/g)].map((m) => m[0]).filter((t) => !/^<\/?(br|b|i|code|a)\b/.test(t));
  if (placeholders.length) bad(`${rel(F.storyboard)} still has template placeholders: ${placeholders.slice(0, 3).join(" ")}`);
  if (!/## Claims/i.test(sb)) bad(`${rel(F.storyboard)} has no "## Claims" section`);
  if (!/## Do not show/i.test(sb)) warns.push("storyboard has no 'Do not show' section");

  // take script
  const src = fs.readFileSync(F.take, "utf8");
  let mod;
  try {
    mod = await import(pathToFileURL(F.take).href + `?t=${Date.now()}`);
  } catch (e) {
    bad(`${rel(F.take)} does not load: ${e.message}`);
  }
  if (mod) {
    if (typeof mod.run !== "function") bad("take must export async function run({ p, page })");
    if (mod.format && !["desktop", "phone"].includes(mod.format)) bad(`format must be desktop or phone, got ${mod.format}`);
    if (!mod.mask?.allowEmails) warns.push("take has no `export const mask = { allowEmails: [...] }`: every email on screen will be blurred, which is the safe default");
    if (mod.sendsEmail) {
      const safe = safeEmails();
      const allowed = (mod.mask?.allowEmails ?? []).map((e) => e.toLowerCase());
      if (!allowed.length) bad("take sets sendsEmail but declares no recipient in mask.allowEmails");
      for (const e of allowed) if (!safe.includes(e)) bad(`take would email ${e}, which is not in GROWTH_SAFE_EMAILS (${safe.join(", ") || "none set"})`);
    } else if (/(New link|Re-send|Resend|Send invoice|Send contract|Share \d+)/i.test(src)) {
      warns.push("take mentions an action that may send email (New link, Re-send, Send, Share) but does not export `sendsEmail = true`. If it sends email, declare it so the safe-recipient guard applies.");
    }
  }
  // the run() body may only use the performer
  const runStart = src.indexOf("export async function run");
  const nextExport = src.slice(runStart + 10).search(/\nexport /);
  const runBody = src.slice(runStart, nextExport < 0 ? src.length : runStart + 10 + nextExport);
  if (/First caption here/.test(src)) bad("take still has the template placeholder caption \"First caption here\"");
  for (const m of runBody.matchAll(/([\w\])]+)\.(click|dblclick|fill|press|check|uncheck|selectOption|hover|type|goto)\(/g)) {
    if (m[1] !== "p") bad(`run() calls ${m[0]} directly. Every interaction must go through the performer (p.click, p.type, p.select, p.hover, p.scroll)`);
  }
  if (/waitForTimeout\(/.test(runBody)) warns.push("run() uses waitForTimeout: use p.settle()/p.hold() so waits are honest and logged");
  if (!/p\.step\(/.test(runBody)) bad("run() never calls p.step(id, caption): the editor needs steps for captions and zooms");
  if (/label:\s*["']payoff["']/.test(runBody) === false) warns.push('no p.hold(ms, { label: "payoff" }) or p.focus(..., { label: "payoff" }): the payoff shot would be speed-ramped');
  for (const m of runBody.matchAll(/p\.step\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/g)) if (words(m[1]) > 6) bad(`step caption "${m[1]}" is ${words(m[1])} words, max 6`);

  return report(problems, warns);
}

function report(problems, warns) {
  for (const w of warns) console.log(`WARN  ${w}`);
  for (const p of problems) console.log(`FAIL  ${p}`);
  if (!problems.length) console.log(`OK    ${pp}: storyboard, meta and take pass the pre-flight check${warns.length ? ` (${warns.length} warning${warns.length > 1 ? "s" : ""})` : ""}`);
  return problems.length === 0;
}

// ------------------------------------------------------------------ make
function step(label, args) {
  console.log(`\n== ${label}`);
  const r = spawnSync("node", args, { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) {
    console.error(`\nSTOPPED at "${label}" (exit ${r.status}). Fix it and rerun. Nothing after this step ran.`);
    process.exit(r.status || 1);
  }
}

async function make() {
  if (!(await check())) {
    console.error("\npre-flight failed, not touching staging");
    process.exit(1);
  }
  if (!flags.has("--skip-record")) step("record (touches staging)", [path.join(HERE, "record", "record.mjs"), "--pp", pp, "--take", rel(F.take)]);
  step("edit", [path.join(HERE, "edit", "edit.mjs"), "--pp", pp, ...(flags.has("--fast") ? ["--fast"] : [])]);
  step("qc", [path.join(HERE, "qc", "qc.mjs"), "--pp", pp]);
  console.log(`
DONE. growth/out/${pp}/reel.mp4 passed QC.
Roles for the commands below: the recorder owns RECORDED, the editor owns ENHANCED and QC_PASSED, then the packager takes over.
Look at real frames before you report (extract a few with ffmpeg and view them), then record the stages:
  node growth/scripts/ledger.mjs transition ${pp} RECORDED --by recorder --set demo.raw=growth/recordings/${pp}/raw.mp4 --set demo.events=growth/recordings/${pp}/events.json
  node growth/scripts/ledger.mjs transition ${pp} ENHANCED --by editor   --set demo.edited=growth/out/${pp}/reel.mp4
  node growth/scripts/ledger.mjs transition ${pp} QC_PASSED --by editor   --set demo.qc=growth/out/${pp}/qc.json`);
}

// ------------------------------------------------------------------ status
const NEXT = {
  DISCOVERED: ["researcher", "validate the evidence (3 sources, 2 hosts) and transition to VALIDATED"],
  VALIDATED: ["mapper", "map to solved/partial/gap and a tier (growth-tier-mapping skill)"],
  TIER_MAPPED: ["designer (solved) or architect (gap/partial)", "solved: write the storyboard; gap: cluster, epic, ADR"],
  CLUSTERED: ["architect", "file the epic (or outbox draft)"],
  EPIC_FILED: ["architect", "write the ADR"],
  ARCHITECTED: ["developer", "build on a branch in a worktree"],
  BUILT: ["reviewer", "independent review"],
  REVIEWED: ["qa", "typecheck, tests, logged-in staging pass"],
  QA_PASSED: ["qa", "staging verification"],
  STAGING_VERIFIED: ["designer", "write the storyboard"],
  DEMO_SCRIPTED: ["recorder", `reel.mjs check ${pp}, then reel.mjs make ${pp}`],
  RECORDED: ["editor", `reel.mjs make ${pp} --skip-record`],
  ENHANCED: ["editor", `node growth/scripts/qc/qc.mjs --pp ${pp}`],
  QC_PASSED: ["packager", `optionally first: reel.mjs music ${pp} (needs ACE-Step in ComfyUI); then build growth/packages/<PP>/package.md from the template`],
  PACKAGED: ["the founder", "post it, then ledger transition HUMAN_POSTED --by human (sync.mjs push shares the media with your other PCs)"],
  HUMAN_POSTED: ["analyst", "measure after 48 hours"],
  MEASURED: ["nobody", "done"],
};
function status() {
  const r = spawnSync("node", [path.join(HERE, "ledger.mjs"), "show", pp], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  const rec = JSON.parse(r.stdout);
  const [who, what] = NEXT[rec.state] ?? ["?", "?"];
  console.log(`${rec.id} [${rec.kind ?? "pain_point"}] ${rec.state}${rec.blocked ? `  BLOCKED: ${rec.blocked.reason}` : ""}\n  ${rec.title}\n  next role: ${who}\n  next step: ${what}`);
  const f = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, fs.existsSync(v)]));
  console.log(`  files: storyboard ${f.storyboard ? "yes" : "no"}, meta ${f.meta ? "yes" : "no"}, take ${f.take ? "yes" : "no"}`);
}

function music() {
  const passthrough = rest.filter((x) => x !== "--allow-standin");
  step("music version", [path.join(HERE, "music", "music.mjs"), "--pp", pp, ...passthrough]);
  const li = rest.indexOf("--label");
  const label = li >= 0 ? rest[li + 1] : null;
  step("qc (music)", [path.join(HERE, "qc", "qc.mjs"), "--pp", pp, "--variant", "music", ...(label ? ["--label", label] : []), ...(rest.includes("--allow-standin") || rest.includes("standin") ? ["--allow-standin"] : [])]);
  console.log(`\nDONE. growth/out/${pp}/reel.music${label ? "." + label : ""}.mp4 passed QC. Push it to the other PCs: node growth/scripts/sync.mjs push`);
}

if (cmd === "new") await scaffold();
else if (cmd === "check") process.exit((await check()) ? 0 : 1);
else if (cmd === "make") await make();
else if (cmd === "music") music();
else status();
