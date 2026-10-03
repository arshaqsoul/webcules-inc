#!/usr/bin/env node
// PreToolUse(Write|Edit) guard. Ledger state and locks are machine-owned: agents go through ledger.mjs / lock.mjs.
// Also keeps secrets out of committed files.

import fs from "node:fs";

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const file = String(input?.tool_input?.file_path ?? "");
const body = String(input?.tool_input?.content ?? input?.tool_input?.new_string ?? "");

if (/\/growth\/(state|locks)\//.test(file)) {
  console.error("BLOCKED: growth/state and growth/locks are owned by growth/scripts/ledger.mjs and lock.mjs. Use the CLI so guards and schema validation run.");
  process.exit(2);
}

const committed = !/\/growth\/\.env\.local$|\/\.dev\.vars$|\/growth\/(state|locks|recordings|out)\//.test(file);
if (committed && /(TestPass\d*[!\w]*|sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|BETTER_AUTH_SECRET\s*=\s*\S+)/.test(body) && /\/growth\/|\/\.claude\//.test(file)) {
  console.error("BLOCKED: looks like a credential or secret in a committed growth/.claude file. Put it in growth/.env.local (gitignored) and reference the variable name.");
  process.exit(2);
}
process.exit(0);
