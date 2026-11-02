#!/usr/bin/env node
// Generate every clip in an episode's shot list (episodes/<ep>/clips.json) in order.
// Shots animate their keyframe; moves fly from the frame where the previous shot is
// cut (its "use" out point, else its last frame) to the next keyframe, so the reel
// never jumps at a cut. Existing clips are kept, so a failed run resumes where it stopped.
//
//   node growth/motion/hybrid/run-clips.mjs <episode dir> [--only=name,name] [--draft]
//
// --draft makes 480x832 takes as <name>.draft.mp4 (chained from draft frames), so they never
// stand in for the 720x1280 keeps that frames.mjs reads.

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
const draft = process.argv.includes("--draft");
const [w, h] = draft ? [480, 832] : [list.w, list.h];
const tag = draft ? ".draft" : "";
const only = arg("only")?.split(",");
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: "inherit" }); if (r.status !== 0) throw new Error(`${cmd} failed`); };

let prev = null;
for (const s of list.shots) {
  const out = path.join(dir, `${s.name}${tag}.mp4`);
  if ((!only || only.includes(s.name)) && !fs.existsSync(out)) {
    // "key" animates another picked keyframe (a repaired one, e.g. camper_fix) without renaming the shot.
    const start = s.move ? prev : path.join(dir, `${s.key ?? s.name}.png`);
    const extra = s.move ? [`--last=${path.join(dir, `${s.to}.png`)}`, "--frames=33"] : [];
    // A shot that must hold still (a parked van on a diorama) drops "static frame" from the negative with its own "neg".
    if (s.neg) extra.push(`--neg=${s.neg}`);
    run("node", [path.join(HERE, "wan.mjs"), start, out, `--prompt=${s.prompt}`, `--seed=${s.seed}`, `--w=${w}`, `--h=${h}`, ...extra]);
  }
  if (fs.existsSync(out)) {
    prev = path.join(dir, `${s.name}${tag}.last.png`);
    const at = s.use ? ["-ss", String(Math.max(0, s.use[1] - 0.04))] : ["-sseof", "-0.1"];
    run("ffmpeg", ["-y", "-v", "error", ...at, "-i", out, "-frames:v", "1", "-update", "1", prev]);
  }
}
console.log("clips done:", list.shots.map((s) => s.name).join(" "));
