#!/usr/bin/env node
// Turn an episode's generated clips into the 1080x1920 30 fps frames the clip scene plays.
// Per shot in clips.json: "use": [from, to] seconds of the clip to keep (default all),
// "speed": playback rate (1.4 = 40% faster, for moves), and for films "camera": the editorial
// push, land, drift or whip baked into the frames (hybrid/film.mjs), and "grade": an ffmpeg colour
// filter for a take that came out hazier than its keyframe. Prints each shot's frame count.
//
// clips.json "interp": "rife" doubles Wan's 16 fps with RIFE on ComfyUI first (hybrid/rife.mjs,
// cached as <shot>.rife.mp4), which keeps fast motion clean; otherwise ffmpeg's minterpolate fills in.
//
//   node growth/motion/hybrid/frames.mjs <episode dir>

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { camera } from "./film.mjs";
import { rife } from "./rife.mjs";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const epDir = process.argv[2];
const list = JSON.parse(fs.readFileSync(path.join(epDir, "clips.json"), "utf8"));
const dir = path.join(MOTION, list.dir);
const counts = {};
for (const s of list.shots) {
  const out = path.join(dir, "frames", s.name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  let src = path.join(dir, `${s.name}.mp4`);
  if (list.interp === "rife") {
    const smooth = path.join(dir, `${s.name}.rife.mp4`);
    if (!fs.existsSync(smooth) || fs.statSync(smooth).mtimeMs < fs.statSync(src).mtimeMs) await rife(src, smooth);
    src = smooth;
  }
  const [a, b] = s.use ?? [0, 99];
  const speed = s.speed ?? 1;
  const fill = list.interp === "rife" ? "fps=30" : "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1";
  const vf = [`trim=${a}:${b}`, `setpts=(PTS-STARTPTS)/${speed}`, fill, "scale=1080:1920:flags=lanczos"];
  // "grade": an ffmpeg filter that brings a washed-out take back to its keyframe's levels and colour.
  if (s.grade) vf.push(s.grade);
  const cam = camera(s.camera, Math.min(b, clipSeconds(src)) / speed - a / speed);
  if (cam) vf.push(cam);
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-vf", vf.join(","), "-q:v", "2", path.join(out, "%04d.jpg")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${s.name}`);
  counts[s.name] = fs.readdirSync(out).length;
}
fs.writeFileSync(path.join(dir, "frames", "counts.json"), JSON.stringify(counts, null, 2));
console.log(counts);

function clipSeconds(file) {
  return Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim());
}
