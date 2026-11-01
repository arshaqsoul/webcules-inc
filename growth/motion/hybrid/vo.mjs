#!/usr/bin/env node
// Voice-over for a Film episode: each line of episode.json "vo" is read by Piper (local, free),
// trimmed, stretched toward its slot and placed on the shot timeline -> out/<ID>/vo.wav + vo.json.
//
//   node growth/motion/hybrid/vo.mjs <episode dir>
//
// episode.json:
//   "vo": { "voice": "en_US-ryan-high", "lines": [ { "shot": "beach", "at": 0.3, "text": "...", "fit": 2.4 }, ... ] }
// "at" counts from the shot's first frame (negative: back from its end); "shot": "end" is the end card.
// Run after frames.mjs (the timeline comes from its frame counts). Piper lives outside the repo:
//   GROWTH_PIPER_PY      python with piper-tts   (default ~/.cache/growth-tts/venv/bin/python)
//   GROWTH_PIPER_VOICES  folder of <voice>.onnx  (default ~/.cache/growth-tts/voices)
// preflight.mjs --film prints the two setup commands.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readEnvFile } from "../../scripts/record/lib.mjs";
import { timeline, placeLines, fitTempo } from "./film.mjs";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
readEnvFile();
export const PIPER_PY = process.env.GROWTH_PIPER_PY || path.join(os.homedir(), ".cache/growth-tts/venv/bin/python");
export const PIPER_VOICES = process.env.GROWTH_PIPER_VOICES || path.join(os.homedir(), ".cache/growth-tts/voices");

/** The film's timeline and total length (shots plus the end card), from an episode folder after frames.mjs. */
export function filmTimeline(epDir) {
  const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const clips = read(path.join(epDir, "clips.json"));
  const ep = read(path.join(epDir, "episode.json"));
  const countsFile = path.join(MOTION, clips.dir, "frames", "counts.json");
  if (!fs.existsSync(countsFile)) throw new Error("no frames/counts.json: run hybrid/frames.mjs first");
  const tl = timeline(clips.shots, read(countsFile));
  const endDur = ep.endcard === false ? 0 : ep.endcard?.dur ?? 3.3;
  return { clips, ep, tl, total: Math.ceil((tl.end + endDur) * 100 - 1e-6) / 100, out: path.join(MOTION, clips.dir) };
}

const seconds = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim());
const ff = (args) => { const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" }); if (r.status !== 0) throw new Error("ffmpeg failed"); };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ep, tl, total, out } = filmTimeline(path.resolve(process.argv[2] ?? ""));
  if (!ep.vo?.lines?.length) throw new Error("episode.json has no vo.lines");
  for (const l of ep.vo.lines) if (l.text.includes("—")) throw new Error(`em dash in a voice-over line: "${l.text}" (founder rule)`);
  const voice = path.join(PIPER_VOICES, `${ep.vo.voice ?? "en_US-ryan-high"}.onnx`);
  if (!fs.existsSync(PIPER_PY) || !fs.existsSync(voice)) throw new Error(`Piper or the voice ${path.basename(voice)} is missing: run hybrid/preflight.mjs --film`);
  const lines = placeLines(ep.vo.lines, tl, total);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vo-"));
  const placed = [];
  for (const l of lines) {
    const raw = path.join(tmp, `${l.i}.raw.wav`), trim = path.join(tmp, `${l.i}.trim.wav`), fit = path.join(tmp, `${l.i}.wav`);
    const r = spawnSync(PIPER_PY, ["-I", "-m", "piper", "-m", voice, "-f", raw, "--sentence-silence", "0"], { input: l.text });
    if (r.status !== 0) throw new Error(`piper failed: ${r.stderr}`);
    ff(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", trim]);
    const tempo = fitTempo(seconds(trim), l.fit);
    ff(["-i", trim, "-af", `atempo=${tempo.toFixed(4)},aresample=48000`, "-ac", "2", fit]);
    const len = seconds(fit);
    placed.push({ ...l, tempo: Math.round(tempo * 100) / 100, seconds: Math.round(len * 100) / 100, file: fit });
    console.log(`${l.start.toFixed(2)}s  ${len.toFixed(2)}s  x${tempo.toFixed(2)}  ${l.text}`);
  }
  for (let k = 1; k < placed.length; k++) if (placed[k - 1].start + placed[k - 1].seconds > placed[k].start) console.warn(`WARNING line ${placed[k - 1].i} still overlaps line ${placed[k].i} after fitting: shorten it or give it a later slot`);
  const inputs = placed.flatMap((p) => ["-i", p.file]);
  const delays = placed.map((p, j) => `[${j}]adelay=${Math.round(p.start * 1000)}|${Math.round(p.start * 1000)}[a${j}]`);
  const mix = placed.map((_, j) => `[a${j}]`).join("") + `amix=inputs=${placed.length}:normalize=0,apad,atrim=0:${total}[o]`;
  ff([...inputs, "-filter_complex", [...delays, mix].join(";"), "-map", "[o]", "-ar", "48000", path.join(out, "vo.wav")]);
  fs.writeFileSync(path.join(out, "vo.json"), JSON.stringify(placed.map(({ file, ...p }) => p), null, 2));
  fs.rmSync(tmp, { recursive: true });
  console.log(`vo: ${placed.length} lines -> ${path.relative(MOTION, path.join(out, "vo.wav"))} (${total} s)`);
}
