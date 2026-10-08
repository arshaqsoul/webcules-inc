#!/usr/bin/env node
// Verifies the growth Bash guard wiring. Run: node growth/scripts/hooks/verify.mjs
//
// The guard (guard-bash.mjs) is registered in the frontmatter of every growth agent
// (.claude/agents/growth-*.md), NOT in .claude/settings.json, so it gates the autonomous
// growth agents (including `claude --agent growth-orchestrator`) and nothing else.
// A growth agent without the hook would fail open, so this check is the safety net.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const failures = [];
const fail = (m) => failures.push(m);

// 1. every growth agent carries the PreToolUse Bash guard
const agentsDir = path.join(root, ".claude/agents");
const agents = fs.readdirSync(agentsDir).filter((f) => /^growth-.*\.md$/.test(f));
if (agents.length === 0) fail("no growth agents found");
for (const f of agents) {
  const text = fs.readFileSync(path.join(agentsDir, f), "utf8");
  const fm = text.startsWith("---\n") ? text.slice(4, text.indexOf("\n---\n", 4)) : "";
  if (!/PreToolUse:/.test(fm) || !/matcher:\s*"Bash"/.test(fm) || !/guard-bash\.mjs/.test(fm)) {
    fail(`${f}: missing the Bash guard hook in frontmatter`);
  }
}

// 2. the guard is not registered project-wide (that would gate interactive sessions too)
const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
for (const entry of settings.hooks?.PreToolUse ?? []) {
  if (entry.matcher === "Bash" && JSON.stringify(entry).includes("guard-bash")) {
    fail(".claude/settings.json registers guard-bash project-wide; it must live in agent frontmatter only");
  }
}

// 3. the guard itself still blocks and allows the right things
const guard = path.join(root, "growth/scripts/hooks/guard-bash.mjs");
const cases = [
  ["node scripts/deploy.mjs production --staging-verified", 2],
  ["wrangler d1 execute webcules-snap --remote --file=x.sql", 2],
  ["wrangler d1 execute webcules-snap --remote --command \"SELECT 1\"", 2],
  ["git push --force origin master", 2],
  ["node scripts/deploy.mjs staging", 0],
  ["wrangler d1 execute webcules-snap-staging --remote --file=x.sql", 0],
  ["git push origin master", 0],
];
for (const [command, want] of cases) {
  const r = spawnSync("node", [guard], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });
  if (r.status !== want) fail(`guard: expected exit ${want} for "${command}", got ${r.status}`);
}

if (failures.length) {
  console.error("growth hook verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`ok: ${agents.length} growth agents carry the guard, settings.json does not, ${cases.length} guard cases pass`);
