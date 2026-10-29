#!/usr/bin/env node
// Keyframes for an episode: every <name>.keyframe.txt in the episode folder is one shot's
// first frame. Generate candidates, look at the contact sheet, pick one per shot.
//
//   node growth/motion/hybrid/keyframes.mjs <episode dir> [--only=a,b] [--n=4] [--seed=N]
//     -> out/<ID>/kf/<name>/<seed>.png and a contact sheet out/<ID>/kf/<name>.jpg (seeds left to right)
//   node growth/motion/hybrid/keyframes.mjs <episode dir> --pick=<name>:<seed>[,<name>:<seed>]
//     -> copies the pick to out/<ID>/<name>.png (what run-clips animates) and records the seed in clips.json
//
// Seeds start at clips.json "keyframes"[name] when set (so a rerun reproduces the pick), else --seed (default 1001).
// 768x1344 Z-Image Turbo, about 7 s each. Never hand-edit assets/assets.json for keyframes.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generate } from "./comfy-image.mjs";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const epDir = path.resolve(process.argv[2] ?? "");
const clipsFile = path.join(epDir, "clips.json");
if (!fs.existsSync(clipsFile)) throw new Error(`no clips.json in ${epDir}: write the shot list first (see the growth-motion-reel skill)`);
const clips = JSON.parse(fs.readFileSync(clipsFile, "utf8"));
const outDir = path.join(MOTION, clips.dir);
const names = fs.readdirSync(epDir).filter((f) => f.endsWith(".keyframe.txt")).map((f) => f.replace(".keyframe.txt", ""));

const pick = arg("pick");
if (pick) {
  clips.keyframes ??= {};
  for (const pair of pick.split(",")) {
    const [name, seed] = pair.split(":");
    const src = path.join(outDir, "kf", name, `${seed}.png`);
    if (!fs.existsSync(src)) throw new Error(`no candidate ${src}`);
    fs.copyFileSync(src, path.join(outDir, `${name}.png`));
    clips.keyframes[name] = Number(seed);
    console.log(`${name}: seed ${seed} -> ${path.relative(MOTION, path.join(outDir, `${name}.png`))}`);
  }
  fs.writeFileSync(clipsFile, JSON.stringify(clips, null, 2) + "\n");
  process.exit(0);
}

const only = arg("only")?.split(",");
const n = Number(arg("n", 4));
for (const name of names.filter((x) => !only || only.includes(x))) {
  const prompt = fs.readFileSync(path.join(epDir, `${name}.keyframe.txt`), "utf8").trim();
  const base = Number(arg("seed", clips.keyframes?.[name] ?? 1001));
  const dir = path.join(outDir, "kf", name);
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 0; i < n; i++) {
    const seed = base + i;
    const file = path.join(dir, `${seed}.png`);
    fs.writeFileSync(file, await generate({ model: "zimage", w: 768, h: 1344, seed, prompt }));
    files.push(file);
  }
  const sheet = path.join(outDir, "kf", `${name}.jpg`);
  const inputs = files.flatMap((f) => ["-i", f]);
  const filter = files.map((_, i) => `[${i}]scale=360:-1[v${i}]`).join(";") + ";" + files.map((_, i) => `[v${i}]`).join("") + `hstack=${files.length}`;
  spawnSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", files.length > 1 ? filter : "[0]scale=360:-1", "-frames:v", "1", sheet], { stdio: "inherit" });
  console.log(`${name}: seeds ${base}-${base + n - 1}, contact sheet ${path.relative(MOTION, sheet)}`);
}
