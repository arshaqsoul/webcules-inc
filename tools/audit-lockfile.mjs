#!/usr/bin/env node
/* Dependency audit for the pnpm lockfile via npm's bulk advisory endpoint.
 * pnpm 10.4's own `pnpm audit` targets a retired endpoint and hangs, so this is
 * the supported path (runbook: docs/SECURITY-RUNBOOK.md).
 *
 *   node tools/audit-lockfile.mjs [--importer=apps/snap] [--prod] [--min=high] [--json]
 *
 * --importer  only packages reachable from that workspace package
 * --prod      follow `dependencies` only (skip devDependencies of the importer)
 * Exit code 1 when any advisory at/above --min (default high) is found. */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const ORDER = ["info", "low", "moderate", "high", "critical"];
const min = ORDER.indexOf(args.get("min") ?? "high");

const yamlDir = readdirSync(join(root, "node_modules/.pnpm")).find((d) => d.startsWith("yaml@2"));
const YAML = createRequire(import.meta.url)(join(root, "node_modules/.pnpm", yamlDir, "node_modules/yaml"));
const lock = YAML.parse(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));

const split = (key) => {
  const m = /^(@?[^@]+)@(.+)$/.exec(key);
  return [m[1], m[2].replace(/\(.*$/, "")];
};

let keys = Object.keys(lock.snapshots ?? {});
const importer = args.get("importer");
if (importer) {
  const imp = lock.importers[importer];
  if (!imp) throw new Error(`unknown importer ${importer}`);
  const direct = { ...imp.dependencies, ...(args.has("prod") ? {} : imp.devDependencies), ...imp.optionalDependencies };
  const queue = [];
  for (const [name, spec] of Object.entries(direct)) if (!spec.version.startsWith("link:")) queue.push(`${name}@${spec.version}`);
  const seen = new Set();
  while (queue.length) {
    const k = queue.pop();
    if (seen.has(k)) continue;
    seen.add(k);
    const snap = lock.snapshots[k];
    if (!snap) continue;
    for (const [n, v] of Object.entries({ ...snap.dependencies, ...snap.optionalDependencies })) queue.push(`${n}@${v}`);
  }
  keys = [...seen];
}

const pkgs = new Map();
for (const k of keys) {
  const [name, version] = split(k);
  if (!/^\d/.test(version)) continue;
  (pkgs.get(name) ?? pkgs.set(name, new Set()).get(name)).add(version);
}

const names = [...pkgs.keys()];
const found = [];
for (let i = 0; i < names.length; i += 400) {
  const body = Object.fromEntries(names.slice(i, i + 400).map((n) => [n, [...pkgs.get(n)]]));
  const res = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`advisory endpoint ${res.status}`);
  for (const [name, advisories] of Object.entries(await res.json())) {
    for (const a of advisories) found.push({ name, installed: [...pkgs.get(name)], severity: a.severity, title: a.title, range: a.vulnerable_versions, url: a.url });
  }
}

found.sort((a, b) => ORDER.indexOf(b.severity) - ORDER.indexOf(a.severity));
if (args.has("json")) console.log(JSON.stringify(found, null, 2));
else {
  console.log(`${importer ?? "workspace"}: ${names.length} packages scanned, ${found.length} advisories`);
  for (const f of found) console.log(`[${f.severity}] ${f.name}@${f.installed.join(",")} (${f.range}) ${f.title} ${f.url}`);
}
process.exit(found.some((f) => ORDER.indexOf(f.severity) >= min) ? 1 : 0);
