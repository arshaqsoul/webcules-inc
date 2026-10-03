#!/usr/bin/env node
// SessionStart: give every growth session the pipeline picture before it does anything.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ledger = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ledger.mjs");
try {
  const counts = JSON.parse(execFileSync("node", [ledger, "status"], { encoding: "utf8" }));
  const parts = Object.entries(counts).map(([s, n]) => `${s}=${n}`);
  console.log(`[growth] pipeline: ${parts.length ? parts.join(" ") : "empty (no pain points yet)"}. Rules: growth/AGENTS.md. Pick work with: node growth/scripts/ledger.mjs next --role <role>`);
} catch {
  // never block a session on status
}
