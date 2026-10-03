// Run: node --test growth/scripts/ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ledger.mjs");
const state = fs.mkdtempSync(path.join(os.tmpdir(), "growth-ledger-"));

function run(...args) {
  const r = spawnSync("node", [CLI, ...args], { encoding: "utf8", env: { ...process.env, GROWTH_STATE_DIR: state } });
  const out = r.status === 0 ? r.stdout : r.stderr;
  return { ok: r.status === 0, json: JSON.parse(out) };
}

const evidence = JSON.stringify([
  { source: "reddit", url: "https://reddit.com/r/WeddingPhotography/comments/a", summary: "Clients forward gallery links to guests", captured_at: "2026-10-03" },
  { source: "facebook-group", url: "https://facebook.com/groups/x/posts/1", summary: "Link leaked to a wedding group", captured_at: "2026-10-03" },
  { source: "instagram", url: "https://instagram.com/p/abc", summary: "Reel complaining about open gallery links", captured_at: "2026-10-03" },
]);

test("new -> guards -> solved track to DEMO_SCRIPTED", () => {
  const created = run("new", "--title", "Gallery links leak to strangers", "--statement", "Clients forward open gallery links and strangers download full-res files.", "--persona", "wedding", "--severity", "4", "--set", `evidence=${evidence}`);
  assert.ok(created.ok, JSON.stringify(created.json));
  const id = created.json.id;
  assert.equal(id, "PP-001");

  // illegal skip
  assert.equal(run("transition", id, "TIER_MAPPED", "--by", "mapper").ok, false);

  assert.ok(run("transition", id, "VALIDATED", "--by", "researcher").ok);

  // solved verdict without code surfaces is rejected
  const noSurface = run("transition", id, "TIER_MAPPED", "--by", "mapper", "--set", 'tier_mapping={"verdict":"solved","tier":"free","notes":"OTP galleries cover this"}');
  assert.equal(noSurface.ok, false);

  const mapped = run("transition", id, "TIER_MAPPED", "--by", "mapper", "--set", 'tier_mapping={"verdict":"solved","tier":"free","surfaces":["apps/snap/lib/shares/grants.ts"],"notes":"OTP galleries cover this"}');
  assert.ok(mapped.ok, JSON.stringify(mapped.json));

  // solved pain points cannot enter the build track
  assert.equal(run("transition", id, "CLUSTERED", "--by", "architect").ok, false);

  // storyboard file must exist
  assert.equal(run("transition", id, "DEMO_SCRIPTED", "--by", "designer", "--set", "demo.storyboard=growth/storyboards/does-not-exist.md").ok, false);
  assert.ok(run("transition", id, "DEMO_SCRIPTED", "--by", "designer", "--set", "demo.storyboard=growth/schemas/pain-point.schema.json").ok);
});

test("evidence guard demands 3 items from 2+ hosts", () => {
  const one = JSON.stringify([{ source: "reddit", url: "https://reddit.com/a", summary: "only one thread here", captured_at: "2026-10-03" }]);
  const r = run("new", "--title", "Single anecdote pain point", "--statement", "Only one person ever said this and nobody agreed.", "--persona", "any", "--severity", "2", "--set", `evidence=${one}`);
  assert.equal(run("transition", r.json.id, "VALIDATED", "--by", "researcher").ok, false);
});

test("leases stop double-processing, humans alone mark HUMAN_POSTED", () => {
  const r = run("new", "--title", "Lease behaviour check", "--statement", "Two agents should never work the same record at once.", "--persona", "any", "--severity", "1");
  const id = r.json.id;
  assert.ok(run("claim", id, "--by", "agent-a").ok);
  assert.equal(run("claim", id, "--by", "agent-b").ok, false);
  assert.equal(run("transition", id, "VALIDATED", "--by", "agent-b").ok, false);
  assert.ok(run("release", id).ok);
  assert.ok(run("claim", id, "--by", "agent-b").ok);
});

test("next offers only role-appropriate, unleased work, best score first", () => {
  const out = run("next", "--role", "researcher");
  assert.ok(out.ok);
  assert.ok(Array.isArray(out.json));
});

test("validate passes on the store", () => {
  assert.ok(run("validate").ok);
});
