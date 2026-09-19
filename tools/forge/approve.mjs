/* pnpm forge:approve <name> [--premium] [--allow-todo]
 * Validates a draft component and publishes it to the library:
 *   - regenerates the landing manifest (manifest.gen.ts)
 *   - standard:  writes public/r/<name>.json (shadcn registry) + mirrors into
 *                .open-next/assets/r/ so the CLI works immediately
 *   - premium:   guarantees NO registry file exists (code + CLI blocked) and
 *                requires a preview webp (the only thing shown on the site)
 * Works with or without a spec.json — custom-docs components (like
 * wildcode-field) approve from their existing library entry. */
import {
  log, die, readLibrary, writeLibrary, getEntry, loadSpec, validateSpec,
  writeJson, writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync,
  statSync, rmSync, readdirSync, join, LANDING, PUBLIC_DIR, REGISTRY_DIR, UI_PKG,
  writeManifestTs,
} from "./lib/common.mjs";

const [name] = process.argv.slice(2);
const premiumFlag = process.argv.includes("--premium");
const allowTodo = process.argv.includes("--allow-todo");
if (!name) die("usage: pnpm forge:approve <name> [--premium] [--allow-todo]");

const lib = readLibrary();
const existing = getEntry(lib, name);
const spec = loadSpec(name);

/* ---- meta resolution: spec wins, library entry is the fallback ---- */
let meta;
if (spec) {
  const errs = validateSpec(spec);
  const todos = JSON.stringify(spec).match(/TODO/g)?.length ?? 0;
  if (errs.length && !allowTodo) {
    errs.forEach((e) => log.err("spec: " + e));
    die("fix spec.json before approving (or pass --allow-todo for a draft)");
  }
  if (errs.length) errs.forEach((e) => log.warn("spec (draft): " + e));
  if (todos > 0 && !allowTodo)
    die(`spec still contains ${todos} TODO marker(s)`, "fill the breakdown or pass --allow-todo");
  meta = {
    title: spec.title,
    tagline: spec.tagline,
    description: spec.description,
    tags: spec.tags,
    premium: premiumFlag || spec.premium === true,
    docsMode: spec.docsMode === "custom" ? "custom" : "generated",
    phrase: spec.phrase,
  };
} else if (existing) {
  meta = {
    title: existing.title,
    tagline: existing.tagline,
    description: existing.description,
    tags: existing.tags,
    premium: premiumFlag || existing.premium === true,
    docsMode: existing.docsMode === "generated" ? "generated" : "custom",
    phrase: existing.phrase,
  };
  log.info("no spec.json — approving from existing library entry (custom docs)");
} else {
  die(`"${name}" not found`, "run: pnpm forge:new " + name);
}

const premium = meta.premium;

/* ---- component source (packages/ui) ---- */
const compFile = join(UI_PKG, `${name}.tsx`);
if (!existsSync(compFile))
  log.warn(`no packages/ui/src/components/${name}.tsx (custom-docs component — ok)`);

/* ---- preview webp ---- */
const preview = `components/${name}.webp`;
const previewAbs = join(PUBLIC_DIR, preview);
const hasWebp = existsSync(previewAbs);
if (!hasWebp) {
  if (premium) die(`missing preview webp: ${previewAbs}`, "run: pnpm forge:record " + name);
  log.warn("no preview webp — run `pnpm forge:record " + name + "` (recommended for the card)");
} else {
  log.ok(`preview webp: ${preview} (${statSync(previewAbs).size} bytes)`);
}

/* ---- registry: BLOCKED for premium, generated for standard ---- */
mkdirSync(REGISTRY_DIR, { recursive: true });
const regFile = join(REGISTRY_DIR, `${name}.json`);
if (premium) {
  if (existsSync(regFile)) {
    log.warn(`premium: removing ${name}.json from the registry (code + CLI are blocked)`);
    rmSync(regFile, { force: true });
  }
  const built = join(LANDING, ".open-next", "assets", "r", `${name}.json`);
  if (existsSync(built)) rmSync(built, { force: true });
  log.ok("premium: registry file removed — CLI installation is now blocked");
} else if (existsSync(compFile)) {
  const engineJs = join(UI_PKG, `${name}-engine.js`);
  const engineDts = join(UI_PKG, `${name}-engine.d.ts`);
  const files = [
    { path: `components/${name}.tsx`, type: "registry:component", content: readFileSync(compFile, "utf-8") },
  ];
  if (existsSync(engineJs))
    files.push({ path: `components/${name}-engine.js`, type: "registry:lib", content: readFileSync(engineJs, "utf-8") });
  if (existsSync(engineDts))
    files.push({ path: `components/${name}-engine.d.ts`, type: "registry:lib", content: readFileSync(engineDts, "utf-8") });

  const item = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name,
    type: "registry:component",
    title: meta.title,
    description: meta.description,
    homepage: `https://webcules.com/components/${name}`,
    keywords: meta.tags,
    author: "Webcules",
    dependencies: [],
    registryDependencies: [],
    files,
  };
  writeJson(regFile, item);
  mkdirSync(join(LANDING, ".open-next", "assets", "r"), { recursive: true });
  copyFileSync(regFile, join(LANDING, ".open-next", "assets", "r", `${name}.json`));
  log.ok(`registry: https://webcules.com/r/${name}.json`);
} else {
  log.info("custom docs, non-generated component: no registry file written");
}

/* ---- library entry + generated manifest ---- */
const entry = {
  name,
  title: meta.title,
  tagline: meta.tagline,
  description: meta.description,
  tags: meta.tags,
  premium: meta.premium,
  phase: "approved",
  docsMode: meta.docsMode,
  preview: hasWebp ? "/" + preview : undefined,
  phrase: meta.phrase,
};
lib.components = lib.components.filter((c) => c.name !== name);
lib.components.push(entry);
writeLibrary(lib);
writeManifestTs(lib.components.filter((c) => c.phase === "approved"));
log.ok(`"${name}" approved (${meta.premium ? "premium" : "standard"}, ${meta.docsMode} docs)`);
console.log(`
Next: pnpm forge:deploy   # ship webcules.com`);
