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
 * Run AFTER `opennextjs-cloudflare build` (idempotent).
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
  }
}

console.log(`fix-worker-manifest: patched ${patched} bundle file(s)`);
if (patched === 0) {
  console.log("fix-worker-manifest: nothing to patch (already patched, or no dynamic-require shims present)");
}
