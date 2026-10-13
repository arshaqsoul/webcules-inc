#!/usr/bin/env node
/**
 * Post-processes the open-next bundle for the "Dynamic require of
 * /.next/server/<x>-manifest.json is not supported" runtime error.
 *
 * A. Next's compiled `getMiddlewareManifest()` does a computed
 *    require(this.middlewareManifestPath) — impossible in workerd. This app
 *    has no middleware, so it is patched to return null.
 * B. Any remaining dynamic-require throw shims get a lookup into the inlined
 *    manifest store (self.__WC_MANIFESTS) and only then rethrow.
 *
 * Run AFTER `opennextjs-cloudflare build`. Idempotent: a re-run on an
 * already-patched tree (detected via the self.__WC_MANIFESTS marker) exits 0.
 *
 * Tripwire: if this patches 0 files and finds no marker, it exits 1 — the
 * minified Next.js internals it string-matches have changed. Runbook when it
 * fires (e.g. a Next/OpenNext upgrade fixes the dynamic-require bug upstream):
 * verify the "Dynamic require" runtime error no longer reproduces, then delete
 * this script and its call sites in package.json.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const openNextDir = join(root, ".open-next");
const nextServerDir = join(root, ".next", "server");

// 1. collect every manifest JSON under .next/server
const manifests = {};
for (const f of readdirSync(nextServerDir)) {
  if (!f.endsWith(".json")) continue;
  try {
    const obj = JSON.parse(readFileSync(join(nextServerDir, f), "utf-8"));
    manifests[`/.next/server/${f}`] = obj;
    manifests[`.next/server/${f}`] = obj;
    manifests[f] = obj;
  } catch {
    /* ignore malformed */
  }
}

// 2. walk .open-next and patch js/mjs bundles
let patched = 0;
let alreadyPatched = 0;
const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(mjs|js)$/.test(e.name)) files.push(p);
  }
}
walk(openNextDir);

for (const file of files) {
  let src = readFileSync(file, "utf-8");
  const before = src;

  // A. the failing computed require — this app has no middleware
  const GM = "getMiddlewareManifest(){return this.minimalMode?null:require(this.middlewareManifestPath)}";
  if (src.includes(GM)) {
    src = src.replace(GM, "getMiddlewareManifest(){return null}");
  }

  // B. any remaining dynamic-require throw shims get a manifest lookup + rethrow
  if (src.includes("Dynamic require of")) {
    const guard = (v) =>
      `{const __wc_m=self.__WC_MANIFESTS&&self.__WC_MANIFESTS[${v}];if(__wc_m!==undefined)return __wc_m;throw new Error('Dynamic require of "'+${v}+'" is not supported')}`;
    src = src.replace(
      /throw (?:new )?Error\('Dynamic require of "'\s*\+\s*([A-Za-z0-9_$]+)\s*\+\s*'" is not supported'\)/g,
      (_, v) => guard(v),
    );
    if (!src.includes("self.__WC_MANIFESTS=")) {
      src =
        `self.__WC_MANIFESTS=self.__WC_MANIFESTS||${JSON.stringify(manifests).replace(/[\u2028\u2029]/g, (m) => (m === "\u2028" ? "\\u2028" : "\\u2029"))};\n` +
        src;
    }
  }

  if (src !== before) {
    writeFileSync(file, src);
    patched++;
    console.log(`patched ${file}`);
  } else if (src.includes("self.__WC_MANIFESTS=")) {
    // Patch B's marker is present — this file was already patched on a
    // previous run, so a no-op here is a successful idempotent re-run.
    alreadyPatched++;
  }
}

console.log(`fix-worker-manifest: patched ${patched} bundle file(s)`);
if (patched === 0) {
  if (alreadyPatched > 0) {
    console.log(
      `fix-worker-manifest: ${alreadyPatched} bundle file(s) already patched (idempotent re-run) — nothing to do.`,
    );
  } else {
    console.error(
      "fix-worker-manifest: patched 0 bundle files and no previous patch marker found — the expected minified Next.js patterns " +
        "(getMiddlewareManifest / dynamic-require shims) were not found. Next.js internals " +
        "likely changed and the runtime \"Dynamic require\" error would NOT be fixed. " +
        "Failing the deploy pipeline so this is investigated instead of silently shipping " +
        "a worker that 500s at runtime.",
    );
    process.exit(1);
  }
}
