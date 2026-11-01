#!/usr/bin/env node
// Break a reference film down before writing one (FILM.md, "Study the reference"): where it cuts, what
// each shot looks like, how loud and fast it moves, and what the narrator says and when.
//
//   node growth/motion/hybrid/reference.mjs <video> [--name=airbnb-exp2] [--threshold=8]
//
// Writes growth/motion/out/refs/<name>/ (gitignored, references are never committed):
//   breakdown.md   the shot table (start, length, still), the word-timed transcript, tempo and loudness
//   sheet.jpg      one frame a second with timestamps; shot-NN.jpg, one still from the middle of each shot
//   cuts.json      machine-readable shots, words and loudness for planning a film's timeline
// The transcript needs faster-whisper in the tools venv (GROWTH_PIPER_PY, see preflight --film);
// without it the breakdown skips the words.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeFile } from "../../scripts/music/beats.mjs";
import { PIPER_PY } from "./vo.mjs";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const video = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!video || !fs.existsSync(video)) throw new Error("usage: reference.mjs <video> [--name=x] [--threshold=8]");
const name = arg("name", path.basename(video).replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase());
const out = path.join(MOTION, "out", "refs", name);
fs.mkdirSync(out, { recursive: true });
const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28 });
const r2 = (x) => Math.round(x * 100) / 100;

const duration = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).stdout.trim());

// 1. Cuts: ffmpeg's scene detector; drop cuts closer than 0.25 s (flashes and dissolves fire several in a row).
const sc = run("ffmpeg", ["-hide_banner", "-i", video, "-vf", `scdet=threshold=${arg("threshold", 8)}`, "-an", "-f", "null", "-"]).stderr;
const cuts = [];
for (const m of sc.matchAll(/lavfi\.scd\.time: ([\d.]+)/g)) { const t = +m[1]; if (!cuts.length || t - cuts.at(-1) > 0.25) cuts.push(t); }
const bounds = [0, ...cuts.filter((t) => t > 0.1 && t < duration - 0.1), duration];
const shots = bounds.slice(0, -1).map((a, i) => ({ n: i + 1, start: r2(a), dur: r2(bounds[i + 1] - a) }));
for (const s of shots) run("ffmpeg", ["-y", "-v", "error", "-ss", String(s.start + s.dur / 2), "-i", video, "-frames:v", "1", "-vf", "scale=480:-2", path.join(out, `shot-${String(s.n).padStart(2, "0")}.jpg`)]);

// 2. A one-frame-a-second sheet with timestamps.
const cols = 6, rows = Math.ceil(duration / cols);
run("ffmpeg", ["-y", "-v", "error", "-i", video, "-vf", `fps=1,scale=320:-2,drawtext=text='%{pts\\:hms}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black,tile=${cols}x${rows}`, "-frames:v", "1", path.join(out, "sheet.jpg")]);

// 3. Audio: tempo (with confidence), and loudness every half second.
const wav = path.join(os.tmpdir(), `ref-${name}.wav`);
const hasAudio = run("ffmpeg", ["-y", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "48000", wav]).status === 0 && fs.existsSync(wav);
let tempo = null, loud = [];
if (hasAudio) {
  const a = analyzeFile(wav, { seconds: Math.ceil(duration) });
  tempo = { bpm: r2(a.bpm), confidence: r2(a.confidence) };
  const st = run("ffmpeg", ["-i", wav, "-af", "asetnsamples=n=24000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level", "-f", "null", "-"]).stderr;
  loud = [...st.matchAll(/RMS_level=(-?[\d.inf]+)/g)].map((m, i) => ({ t: r2(i * 0.5), db: m[1].includes("inf") ? -99 : r2(+m[1]) }));
}

// 4. Words: faster-whisper with word timestamps, if the tools venv has it.
let words = [];
if (hasAudio && run(PIPER_PY, ["-I", "-c", "import faster_whisper"]).status === 0) {
  // The samples go in as an array (16 kHz mono): some PyAV builds reject faster-whisper's own file reader.
  const py = `import json,sys,wave\nimport numpy as np\nfrom faster_whisper import WhisperModel\nw=wave.open(sys.argv[1])\na=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768\na=a[::3].copy()\nm=WhisperModel('small',device='cpu',compute_type='int8')\nsegs,_=m.transcribe(a,word_timestamps=True)\nprint(json.dumps([{'w':w.word.strip(),'t':round(w.start,2),'e':round(w.end,2)} for s in segs for w in s.words]))`;
  const r = run(PIPER_PY, ["-I", "-c", py, wav]);
  if (r.status === 0) words = JSON.parse(r.stdout.trim().split("\n").at(-1));
  else console.warn("transcript failed:", r.stderr.slice(-400));
}
fs.rmSync(wav, { force: true });

// Sentences: break the word stream on sentence ends and on pauses over 0.6 s.
const lines = [];
for (const w of words) {
  const last = lines.at(-1);
  if (!last || /[.!?]$/.test(last.words.at(-1).w) || w.t - last.words.at(-1).e > 0.6) lines.push({ words: [w] });
  else last.words.push(w);
}
const said = lines.map((l) => ({ start: l.words[0].t, end: l.words.at(-1).e, text: l.words.map((w) => w.w).join(" ") }));

fs.writeFileSync(path.join(out, "cuts.json"), JSON.stringify({ video: path.resolve(video), duration: r2(duration), shots, tempo, said, words, loud }, null, 1));
const bar = (db) => "#".repeat(Math.max(0, Math.round((db + 50) / 2)));
const md = `# Reference breakdown: ${name}

Source: \`${path.resolve(video)}\` (${r2(duration)} s). Generated by \`growth/motion/hybrid/reference.mjs\`; look at \`sheet.jpg\` and the \`shot-NN.jpg\` stills next to this file.

## Shots (${shots.length}, average ${r2(duration / shots.length)} s)

| # | Start | Length | Still |
|---|---|---|---|
${shots.map((s) => `| ${s.n} | ${s.start.toFixed(2)} s | ${s.dur.toFixed(2)} s | shot-${String(s.n).padStart(2, "0")}.jpg |`).join("\n")}

## What is said

${said.length ? said.map((l) => `- ${l.start.toFixed(2)}-${l.end.toFixed(2)} s: ${l.text}`).join("\n") : "_No transcript (no audio, no speech, or faster-whisper is not installed)._"}

## Music

${tempo ? `Tempo ${tempo.bpm} BPM (confidence ${tempo.confidence}; under 2 means no clear beat, so do not trust the number).` : "No audio."}

Loudness every 0.5 s (RMS dB):

\`\`\`
${loud.map((l) => `${l.t.toFixed(1).padStart(5)} s ${String(l.db).padStart(6)} ${bar(l.db)}`).join("\n")}
\`\`\`
`;
fs.writeFileSync(path.join(out, "breakdown.md"), md);
console.log(`${shots.length} shots, ${said.length} spoken lines, tempo ${tempo?.bpm ?? "-"} -> ${path.relative(MOTION, out)}/breakdown.md`);
