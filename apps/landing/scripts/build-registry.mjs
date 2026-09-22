#!/usr/bin/env node
/**
 * Builds the shadcn-compatible registry JSON for WildcodeField.
 * Reads the component sources from packages/ui (single source of truth)
 * and writes apps/landing/public/r/wildcode-field.json, which the
 * shadcn CLI can consume:  npx shadcn@latest add <site-url>/r/wildcode-field.json
 *
 * Run from apps/landing:  pnpm registry:build
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/landing/scripts
const landing = resolve(here, "..");
const repo = resolve(landing, "..", ".."); // webcules-inc root
const uiSrc = resolve(repo, "packages", "ui", "src", "components");

const read = (f) => readFileSync(resolve(uiSrc, f), "utf-8");

// Source files per component (paths relative to packages/ui/src/components).
// Components with extra engine/lib files list them explicitly; the default is
// the single component file, resolved from components/<name>.tsx or ui/<name>.tsx.
const SRC_FILES = {
  "wildcode-field": [
    { src: "wildcode-field.tsx", path: "components/wildcode-field.tsx", type: "registry:component" },
    { src: "wildcode-field-engine.js", path: "components/wildcode-field-engine.js", type: "registry:lib" },
    { src: "wildcode-field-engine.d.ts", path: "components/wildcode-field-engine.d.ts", type: "registry:lib" },
  ],
};

const exists = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

/** default: single file, at components/<name>.tsx or ui/<name>.tsx */
function resolveDefaultFiles(name) {
  const candidates = [
    { src: `${name}.tsx`, path: `components/${name}.tsx` },
    { src: `ui/${name}.tsx`, path: `components/ui/${name}.tsx` },
  ];
  for (const c of candidates) {
    if (exists(resolve(uiSrc, c.src))) return [{ ...c, type: "registry:component" }];
  }
  throw new Error(`no source found for component "${name}" (tried ${candidates.map((c) => c.src).join(", ")})`);
}

const lib = JSON.parse(readFileSync(resolve(landing, "components", "library", "library.json"), "utf-8"));

const COMPONENTS = lib.components
  .filter((c) => c.phase === "approved" && !c.premium)
  .map((c) => ({
    name: c.name,
    title: c.title,
    description: c.tagline,
    homepage: `https://webcules.com/components/${c.name}`,
    keywords: c.tags ?? [],
    files:
      SRC_FILES[c.name] ??
      resolveDefaultFiles(c.name),
    }));

const outDir = resolve(landing, "public", "r");
mkdirSync(outDir, { recursive: true });

for (const c of COMPONENTS) {
  const files = c.files.map((f) => ({ path: f.path, type: f.type, content: read(f.src) }));
  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: c.name,
    type: "registry:component",
    title: c.title,
    description: c.description,
    homepage: c.homepage,
    keywords: c.keywords,
    author: "Webcules",
    dependencies: [],
    registryDependencies: [],
    files,
  };
  const out = resolve(outDir, `${c.name}.json`);
  writeFileSync(out, JSON.stringify(registry, null, 2));
  console.log(`registry written: ${out} (${files.length} files)`);
}
