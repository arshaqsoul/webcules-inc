#!/usr/bin/env node
// Turn an episode's generated clips into the 1080x1920 30 fps frames the clip scene plays.
// Per shot in clips.json: "use": [from, to] seconds of the clip to keep (default all),
// "speed": playback rate (1.4 = 40% faster, for moves). Prints each shot's frame count.
//
//   node growth/motion/hybrid/frames.mjs <episode dir>

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const epDir = process.argv[2];
const list = JSON.parse(fs.readFileSync(path.join(epDir, "clips.json"), "utf8"));
const dir = path.join(MOTION, list.dir);
const counts = {};
for (const s of list.shots) {
  const out = path.join(dir, "frames", s.name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const [a, b] = s.use ?? [0, 99];
  const vf = [`trim=${a}:${b}`, `setpts=(PTS-STARTPTS)/${s.speed ?? 1}`, "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1", "scale=1080:1920:flags=lanczos"].join(",");
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", path.join(dir, `${s.name}.mp4`), "-vf", vf, "-q:v", "2", path.join(out, "%04d.jpg")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${s.name}`);
  counts[s.name] = fs.readdirSync(out).length;
}
fs.writeFileSync(path.join(dir, "frames", "counts.json"), JSON.stringify(counts, null, 2));
console.log(counts);
