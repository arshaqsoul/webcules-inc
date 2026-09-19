#!/usr/bin/env node
/**
 * Builds the shadcn-compatible registry JSON for WildcodeField.
 * Reads the component sources from packages/ui (single source of truth)
 * and writes apps/landing/public/r/wildcode-field.json, which the
 * shadcn CLI can consume:  npx shadcn@latest add <site-url>/r/wildcode-field.json
 *
 * Run from apps/landing:  pnpm registry:build
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/landing/scripts
const landing = resolve(here, "..");
const repo = resolve(landing, "..", ".."); // webcules-inc root
const uiSrc = resolve(repo, "packages", "ui", "src", "components");

const read = (f) => readFileSync(resolve(uiSrc, f), "utf-8");

const files = [
  {
    path: "components/wildcode-field.tsx",
    type: "registry:component",
    content: read("wildcode-field.tsx"),
  },
  {
    path: "components/wildcode-field-engine.js",
    type: "registry:lib",
    content: read("wildcode-field-engine.js"),
  },
  {
    path: "components/wildcode-field-engine.d.ts",
    type: "registry:lib",
    content: read("wildcode-field-engine.d.ts"),
  },
];

const registry = {
  $schema: "https://ui.shadcn.com/schema/registry-item.json",
  name: "wildcode-field",
  type: "registry:component",
  title: "WildcodeField",
  description:
    "A living wordmark: flowers, vines and critters grow through your lettering on an interactive canvas.",
  homepage: "https://webcules.com/components/wildcode-field",
  keywords: ["canvas", "animation", "wordmark", "flowers"],
  author: "Webcules",
  dependencies: [],
  registryDependencies: [],
  files,
};

const outDir = resolve(landing, "public", "r");
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, "wildcode-field.json");
writeFileSync(out, JSON.stringify(registry, null, 2));
console.log(`registry written: ${out} (${files.length} files)`);
