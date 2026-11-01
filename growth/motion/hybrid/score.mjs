#!/usr/bin/env node
// Music for a Film episode: each section of episode.json "score" is generated with ACE-Step 1.5 on
// ComfyUI (growth/scripts/music/comfy.mjs, cached by content) and laid over its span of the timeline,
// with short crossfades where one section hands to the next -> out/<ID>/music.wav.
//
//   node growth/motion/hybrid/score.mjs <episode dir>
//
// episode.json:
//   "score": [
//     { "to": { "shot": "neon" }, "tags": "whimsical orchestral ...", "bpm": 96, "key": "D major", "seed": 2 },
//     { "from": { "shot": "neon" }, "to": "end", "tags": "K-pop dance ...", "bpm": 120, "seed": 2, "offset": 0 }
//   ]
// A section without "from" starts at 0, without "to" runs to the end. "offset" skips into the generated
// track (an intro you do not want). Sections must tile the film; render.mjs ducks the music under vo.wav.
// Run after frames.mjs.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preflight, generate } from "../../scripts/music/comfy.mjs";
import { sections } from "./film.mjs";
import { filmTimeline } from "./vo.mjs";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { ep, tl, total, out } = filmTimeline(path.resolve(process.argv[2] ?? ""));
if (!ep.score?.length) throw new Error("episode.json has no score sections");
const pf = await preflight();
if (!pf.ok) throw new Error(pf.error ?? `ACE-Step is not ready on ComfyUI:\n${pf.help}`);

const XF = 0.35;
const parts = [];
for (const s of sections(ep.score, tl, total)) {
  const seconds = Math.ceil(s.end - s.start + (s.offset ?? 0) + XF + 2);
  const r = await generate({ tags: s.tags, seed: s.seed ?? 1, bpm: s.bpm ?? 100, seconds, keyscale: s.key ?? "C major", prefix: "growth/film" }, { variant: pf.variant });
  console.log(`${s.start.toFixed(2)}-${s.end.toFixed(2)}s  ${r.cached ? "cached" : "generated"}  ${s.tags.slice(0, 60)}...`);
  parts.push({ ...s, file: r.file });
}
const inputs = parts.flatMap((p) => ["-i", p.file]);
const chains = parts.map((p, j) => {
  const len = p.end - p.start + (j < parts.length - 1 ? XF : 0);
  const fadeIn = j > 0 ? `afade=t=in:d=${XF},` : "afade=t=in:d=0.05,";
  const fadeOut = j < parts.length - 1 ? `afade=t=out:st=${(len - XF).toFixed(3)}:d=${XF}` : `afade=t=out:st=${Math.max(0, len - 0.8).toFixed(3)}:d=0.8`;
  const ms = Math.round(p.start * 1000);
  return `[${j}]atrim=${p.offset ?? 0}:${(p.offset ?? 0) + len},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,${fadeIn}${fadeOut},adelay=${ms}|${ms},apad[m${j}]`;
});
const mix = parts.map((_, j) => `[m${j}]`).join("") + `amix=inputs=${parts.length}:normalize=0,atrim=0:${total}[o]`;
const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", [...chains, mix].join(";"), "-map", "[o]", "-ar", "48000", path.join(out, "music.wav")], { stdio: "inherit" });
if (r.status !== 0) throw new Error("ffmpeg failed");
fs.writeFileSync(path.join(out, "score.json"), JSON.stringify(parts.map(({ file, ...p }) => ({ ...p, file: path.basename(file) })), null, 2));
console.log(`score: ${parts.length} sections -> ${path.relative(MOTION, path.join(out, "music.wav"))} (${total} s)`);
