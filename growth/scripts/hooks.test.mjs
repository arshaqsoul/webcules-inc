// Run: node --test growth/scripts/hooks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const hook = (name, input) => spawnSync("node", [path.join(DIR, "hooks", name)], { input: JSON.stringify(input), encoding: "utf8" });
const bash = (command) => hook("guard-bash.mjs", { tool_input: { command } }).status;
const write = (file_path, content) => hook("guard-write.mjs", { tool_input: { file_path, content } }).status;

test("bash guard blocks the irreversible things", () => {
  const blocked = [
    "node scripts/deploy.mjs production --staging-verified",
    "git push --force origin feat/x",
    "git push origin :refs/tags/v0.3.0",
    "git commit --no-verify -m x",
    "git reset --hard HEAD~1",
    "npx wrangler d1 execute webcules-snap --remote --file a.sql",
    "rm -rf growth/state",
  ];
  for (const c of blocked) assert.equal(bash(c), 2, c);
});

test("bash guard lets normal work through", () => {
  const ok = [
    "node scripts/deploy.mjs staging",
    "git push origin feat/gallery-ai",
    "npx wrangler d1 execute webcules-snap-staging --remote --file a.sql",
    "pnpm typecheck",
  ];
  for (const c of ok) assert.equal(bash(c), 0, c);
});

test("write guard protects machine-owned state and secrets", () => {
  const fakeLiveKey = ["sk", "live", "abcdefghijklmnop"].join("_"); // built at runtime so this file itself passes the guard
  assert.equal(write("/r/growth/state/pain-points/PP-001.json", "{}"), 2);
  assert.equal(write("/r/growth/locks/staging.lock.json", "{}"), 2);
  assert.equal(write("/r/growth/AGENTS.md", `login with ${fakeLiveKey}`), 2);
  assert.equal(write("/r/growth/AGENTS.md", "plain documentation"), 0);
  assert.equal(write("/r/growth/.env.local", "GROWTH_STAGING_PASSWORD=whatever"), 0);
});

test("lock is exclusive, re-entrant for the owner, and releasable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "growth-lock-"));
  const lock = (...a) => spawnSync("node", [path.join(DIR, "lock.mjs"), ...a], { encoding: "utf8", env: { ...process.env, GROWTH_LOCK_DIR: dir } }).status;
  assert.equal(lock("acquire", "staging", "--by", "a"), 0);
  assert.equal(lock("acquire", "staging", "--by", "b"), 1);
  assert.equal(lock("acquire", "staging", "--by", "a"), 0);
  assert.equal(lock("release", "staging", "--by", "b"), 1);
  assert.equal(lock("release", "staging", "--by", "a"), 0);
  assert.equal(lock("acquire", "staging", "--by", "b"), 0);
});
