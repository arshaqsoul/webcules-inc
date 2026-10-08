#!/usr/bin/env node
/* WEB-330 guard: product hostnames live in lib/hosts.ts only. Fails when a
 * source file hardcodes snap.webcules.com (or snaphq.app) in code, so the
 * domain flip stays a constants edit. Comment lines are ignored. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const ALLOW = new Set(["lib/hosts.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const EXT = /\.(ts|tsx|js|mjs)$/;
const HOST = /snap\.webcules\.com|snaphq\.app/;

const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (EXT.test(name) && !ALLOW.has(path)) {
      readFileSync(path, "utf8").split("\n").forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        if (HOST.test(line)) bad.push(`${path}:${i + 1}: ${t.slice(0, 120)}`);
      });
    }
  }
}
ROOTS.forEach(walk);
if (bad.length) {
  console.error("Hardcoded product host outside lib/hosts.ts:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("check-hosts: ok");
