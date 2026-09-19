/* pnpm webcules-forge-w-analyse <reference-path-or-url> [name] [--premium]
 *
 * One-shot analyse command: point it at a reference image or video (local
 * file or URL) and it will
 *   1. create the component draft (if it doesn't exist yet — name is derived
 *      from the reference filename unless you pass one)
 *   2. stage the reference into the component's .forge/ folder
 *   3. extract video keyframes (videos only) + write ANALYSIS.md
 *
 * Then fill spec.json → breakdown and continue with
 *   pnpm forge:record <name>  →  pnpm forge:approve <name>
 */
import {
  log, die, existsSync, loadSpec, specPath, readLibrary, writeLibrary,
  join, dirname, ROOT,
} from "./lib/common.mjs";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const premium = args.includes("--premium");
const positional = args.filter((a) => !a.startsWith("--"));
const ref = positional[0];
let name = positional[1];

if (!ref) {
  console.log(`usage: pnpm webcules-forge-w-analyse <reference-path-or-url> [name] [--premium]

examples:
  pnpm webcules-forge-w-analyse ./hero-reference.mp4
  pnpm webcules-forge-w-analyse ./mockup.png aurora-hero --premium
  pnpm webcules-forge-w-analyse https://example.com/reference.mp4 aurora-hero`);
  process.exit(0);
}

const run = (cmd, args2) => {
  const r = spawnSync(process.execPath, [cmd, ...args2], { stdio: "inherit" });
  return r.status === 0;
};
const forge = (script, scriptArgs) => {
  const path = new URL("./" + script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  return run(path, scriptArgs);
};

/* derive a component name from the reference filename if not given */
if (!name) {
  const base = ref.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  name = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "new-component";
  log.info("derived name: " + name + "  (pass a name to override)");
}

/* 1. scaffold the draft if needed */
const spec = loadSpec(name);
if (!spec) {
  log.info(`creating draft "${name}"…`);
  const newArgs = [join(ROOT, "tools", "forge", "new.mjs"), name];
  if (premium) newArgs.push("--premium");
  const r = spawnSync(process.execPath, newArgs, { stdio: "inherit" });
  if (r.status !== 0) die(`could not scaffold "${name}"`);
} else {
  log.info(`draft "${name}" already exists — skipping scaffold`);
}

/* 2. download the reference if it's a URL */
let localRef = ref;
if (/^https?:\/\//.test(ref)) {
  const ext = (ref.split("?")[0].match(/\.(mp4|webm|mov|m4v|png|jpg|jpeg|webp|gif|avif)$/i)?.[1] || "bin").toLowerCase();
  // outside public/ — references must never be deployed to the live site
  const dir = join(ROOT, "apps", "landing", ".forge-downloads", name);
  mkdirSync(dir, { recursive: true });
  localRef = join(dir, `reference.${ext}`);
  log.info("downloading reference…");
  const res = await fetch(ref);
  if (!res.ok) die(`download failed: ${res.status} ${res.statusText}`);
  writeFileSync(localRef, Buffer.from(await res.arrayBuffer()));
  log.ok(`downloaded ${localRef}`);
}

/* 3. run the analysis */
const analyzePath = new URL("./analyze.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ok = run(analyzePath, [name, localRef]);
if (!ok) process.exit(1);

console.log(`
Analysis complete for "${name}".
  spec:     ${specPath(name)}
  breakdown: fill spec.json → breakdown (layers / animation / scroll / ux / scrub)
  then:      pnpm forge:record ${name}   →   pnpm forge:approve ${name}${premium ? " --premium" : ""}
`);

function LIBRARY_DIR_ABS() {
  return join(ROOT, "apps", "landing", "public", "components");
}
