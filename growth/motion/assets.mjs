#!/usr/bin/env node
// Painted assets for the 3D world, made once in ComfyUI and then used by code:
// sky backdrops per time of day, tileable surface textures, concept sheets.
// The motion itself never comes from a model; these are stills the engine loads.
//
//   node growth/motion/assets.mjs list
//   node growth/motion/assets.mjs try  <name> [--n=4] [--seed=100]   candidates -> out/assets/<name>/<seed>.png, pick one
//   node growth/motion/assets.mjs make <name|all>                    the manifest seed -> assets/<file> (committed)
//
// The manifest is assets/assets.json: { name: { use, model, w, h, seed, size, crop, out, prompt } }.
// Change the seed there after `try` to lock in a candidate, then `make`.
// GROWTH_COMFY_URL comes from growth/.env.local (the same server the music beds use).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generate } from "./hybrid/comfy-image.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "assets");
const MANIFEST = path.join(DIR, "assets.json");

/** PNG bytes -> a compact JPEG at the manifest's size. */
function toJpeg(png, file, { w, h, crop = 0, quality = 3 } = {}) {
  const tmp = file + ".tmp.png";
  fs.writeFileSync(tmp, png);
  // crop trims a fraction off every edge first (a model that insists on drawing the swatch's rim).
  const f = [crop ? `crop=iw*${1 - 2 * crop}:ih*${1 - 2 * crop}` : null, w && h ? `scale=${w}:${h}:flags=lanczos` : null].filter(Boolean);
  const vf = f.length ? ["-vf", f.join(",")] : [];
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", tmp, ...vf, "-q:v", String(quality), file], { stdio: "inherit" });
  fs.rmSync(tmp);
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}`);
}

const manifest = () => JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const flag = (name, dflt) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? dflt);

const [cmd, name] = process.argv.slice(2);
const M = manifest();

if (cmd === "list") {
  for (const [k, v] of Object.entries(M)) console.log(`${k.padEnd(22)} ${v.model ?? "zimage"} ${v.w}x${v.h} seed ${v.seed} -> ${v.out}  (${v.use})`);
} else if (cmd === "try") {
  const spec = M[name];
  if (!spec) throw new Error(`no asset "${name}" in ${MANIFEST}`);
  const dir = path.join(HERE, "out", "assets", name);
  fs.mkdirSync(dir, { recursive: true });
  const base = flag("seed", spec.seed);
  for (let i = 0; i < flag("n", 4); i++) {
    const seed = base + i;
    const t0 = Date.now();
    fs.writeFileSync(path.join(dir, `${seed}.png`), await generate({ ...spec, seed }));
    console.log(`${name} seed ${seed}: ${path.join(dir, `${seed}.png`)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
} else if (cmd === "make") {
  for (const k of name === "all" ? Object.keys(M) : [name]) {
    const spec = M[k];
    if (!spec) throw new Error(`no asset "${k}" in ${MANIFEST}`);
    const file = path.join(DIR, spec.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    toJpeg(await generate(spec), file, { w: spec.size?.[0], h: spec.size?.[1], crop: spec.crop });
    console.log(`${k}: ${path.relative(HERE, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  }
} else {
  console.log("usage: assets.mjs list | try <name> [--n=4] [--seed=N] | make <name|all>");
}
