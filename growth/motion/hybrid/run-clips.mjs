#!/usr/bin/env node
// Generate every clip in an episode's shot list (episodes/<ep>/clips.json) in order.
// Shots animate their keyframe; moves fly from the frame where the previous shot is
// cut (its "use" out point, else its last frame) to the next keyframe, so the reel
// never jumps at a cut. Existing clips are kept, so a failed run resumes where it stopped.
//
//   node growth/motion/hybrid/run-clips.mjs <episode dir> [--only=name,name] [--w=480 --h=832 for drafts]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOTION = path.dirname(HERE);
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const epDir = process.argv[2];
const list = JSON.parse(fs.readFileSync(path.join(epDir, "clips.json"), "utf8"));
const dir = path.join(MOTION, list.dir);
const w = arg("w", list.w);
const h = arg("h", list.h);
const only = arg("only")?.split(",");
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: "inherit" }); if (r.status !== 0) throw new Error(`${cmd} failed`); };

let prev = null;
for (const s of list.shots) {
  const out = path.join(dir, `${s.name}.mp4`);
  if ((!only || only.includes(s.name)) && !fs.existsSync(out)) {
    const start = s.move ? prev : path.join(dir, `${s.name}.png`);
    const extra = s.move ? [`--last=${path.join(dir, `${s.to}.png`)}`, "--frames=33"] : [];
    run("node", [path.join(HERE, "wan.mjs"), start, out, `--prompt=${s.prompt}`, `--seed=${s.seed}`, `--w=${w}`, `--h=${h}`, ...extra]);
  }
  if (fs.existsSync(out)) {
    prev = path.join(dir, `${s.name}.last.png`);
    const at = s.use ? ["-ss", String(Math.max(0, s.use[1] - 0.04))] : ["-sseof", "-0.1"];
    run("ffmpeg", ["-y", "-v", "error", ...at, "-i", out, "-frames:v", "1", "-update", "1", prev]);
  }
}
console.log("clips done:", list.shots.map((s) => s.name).join(" "));
