#!/usr/bin/env node
// PreToolUse(Bash) guard for the growth system. Exit 2 = block, stderr is shown to the agent.
// These are the rules agents must not be able to talk themselves out of.

import fs from "node:fs";

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const cmd = String(input?.tool_input?.command ?? "");

const RULES = [
  [/deploy\.mjs\s+production/, "Production deploys are a human gate. Deploy to staging, verify, then ask the founder to run the production deploy."],
  [/--env\s+production|wrangler\s+(rollback|deploy)[^|;&]*webcules-snap(?!-)/, "Production worker changes are a human gate."],
  [/d1\s+(execute|migrations)[^|;&]*\bwebcules-snap(\s|$)/, "Never write to the production D1 database. Apply migrations to webcules-snap-staging only."],
  [/git\s+push[^|;&]*(--force|-f\b|--force-with-lease)/, "No force pushes."],
  [/git\s+push[^|;&]*(--delete|:refs\/tags|\s:v\d)/, "Never move or delete a pushed tag. A bad release gets a new patch tag."],
  [/git\s+(commit|push)[^|;&]*--no-verify/, "Never skip hooks."],
  [/git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f/, "No destructive git commands in the shared tree. Use your own worktree."],
  [/rm\s+(-[a-z]*r[a-z]*f?|-[a-z]*f[a-z]*r?)\s+[^|;&]*growth\/(state|locks)/, "Do not delete ledger state or locks. Use ledger.mjs drop/block."],
  [/stripe[^|;&]*(sk_live|--live)|sk_live_/, "Live Stripe keys are off limits to agents."],
];

for (const [re, why] of RULES) {
  if (re.test(cmd)) {
    console.error(`BLOCKED by growth guard: ${why}\n(command: ${cmd.slice(0, 160)})`);
    process.exit(2);
  }
}
process.exit(0);
