// Mix a music bed with the reel's sound effects and trailer accents into one stereo track, then mux it onto the reel's video.
//
//   bed  ->  time-stretched + trimmed so its beats land on the reel's moments (see sync.mjs)
//        ->  filter sweep that opens up as the first step arrives (a trailer "build")
//        ->  ducked under every sound effect so clicks stay crisp over a continuous track
//        ->  + impacts on step changes, riser + big impact into the end card
//        ->  + the existing sound effects (../edit/sfx.mjs)
//        ->  fade out, peak-normalised, written as 48 kHz stereo AAC onto a copy of the video.

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { SR, synthesize, cuesFromEdl } from "../edit/sfx.mjs";
import { impact, riser, popHit, popRiser, popFinale } from "./hits.mjs";
import { tonalTrack } from "./tonalsfx.mjs";
import { freq } from "./keys.mjs";

const TAU = Math.PI * 2;
export const FINAL_PEAK = 0.589; // about -4.6 dBFS: AAC encoding overshoots by up to ~2 dB on dense music, and QC allows a peak of -3 dB at most

/** Decode the bed with the alignment applied: drop `trim_s` of the original, then change speed by `rate` (pitch preserved). */
export function readBed(file, { trim_s = 0, rate = 1, seconds }) {
  const af = [`atrim=start=${trim_s.toFixed(4)}`, "asetpts=PTS-STARTPTS", `atempo=${rate.toFixed(5)}`].join(",");
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vn", "-af", af, "-t", String(seconds), "-ar", String(SR), "-ac", "2", "-f", "f32le", "-"], { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error(`could not decode the bed: ${r.stderr}`);
  const inter = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
  const n = Math.floor(inter.length / 2);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = inter[2 * i];
    R[i] = inter[2 * i + 1];
  }
  return { L, R };
}

/** Ducking depth (0..1) over time from a list of cue times: a fast dip, a short hold, then a smooth recovery. */
function duckCurve(n, cues) {
  const depth = new Float32Array(n);
  for (const c of cues) {
    const i0 = Math.round((c.t_ms / 1000) * SR);
    const att = Math.round(0.008 * SR);
    const hold = Math.round(0.045 * SR);
    const rel = Math.round(0.26 * SR);
    for (let k = 0; k < att + hold + rel; k++) {
      const i = i0 + k;
      if (i < 0 || i >= n) continue;
      const shape = k < att ? k / att : k < att + hold ? 1 : Math.exp((-3 * (k - att - hold)) / rel);
      depth[i] = Math.max(depth[i], c.depth * shape);
    }
  }
  return depth;
}

const DUCK = { hook: 0.5, caption: 0.45, click: 0.3, ramp: 0.4, end: 0.7 };

export function wavStereo(L, R) {
  const n = L.length;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/**
 * Build the final stereo mix.
 * @param bed    { L, R } already trimmed and stretched, at SR
 * @param edl    the reel's edit list (captions, endcard_start_ms, duration_ms, highlights, ramps)
 * @param opts   { hits, sweep }
 */
export function mixMusic({ bed, edl, hits = true, sweep = true, accent = "trailer", sfx = null }) {
  // sfx: null for the classic noise effects, or { mode: "tonal", key, cues } for notes in the track's key on snapped cues
  const tonal = sfx?.mode === "tonal";
  const durationMs = edl.duration_ms;
  const n = Math.round((durationMs / 1000) * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const warnings = [];

  // ---- bed: normalise its own peak, then shape it
  let peak = 0;
  for (let i = 0; i < Math.min(n, bed.L.length); i++) peak = Math.max(peak, Math.abs(bed.L[i]), Math.abs(bed.R[i]));
  const bedGain = peak > 0 ? 0.3 / peak : 0;
  if (bed.L.length < n - SR * 0.05) warnings.push(`the bed is ${((n - bed.L.length) / SR).toFixed(1)} s shorter than the reel: generate a longer one`);

  const firstStepMs = (edl.captions?.[0]?.start_ms ?? 1500);
  const sfxCues = sfx?.cues ?? cuesFromEdl(edl);
  const duck = duckCurve(n, sfxCues.map((c) => ({ t_ms: c.t_ms, depth: DUCK[c.kind] ?? 0.3 })));
  const fadeInN = Math.round(0.12 * SR);
  const endMs = edl.endcard_start_ms;
  const fadeStart = Math.round(((endMs + 400) / 1000) * SR);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let l = i < bed.L.length ? bed.L[i] : 0;
    let r = i < bed.R.length ? bed.R[i] : 0;
    if (sweep) {
      // a low-pass that opens from 350 Hz to 16 kHz by the first step change: the classic trailer "build"
      const p = Math.min(1, t / (firstStepMs / 1000));
      const fc = 350 * Math.pow(16000 / 350, p * p);
      const a = 1 - Math.exp((-TAU * fc) / SR);
      lpL += a * (l - lpL);
      lpR += a * (r - lpR);
      l = lpL;
      r = lpR;
    }
    let g = bedGain * (1 - duck[i]) * Math.min(1, i / fadeInN);
    if (i > fadeStart) g *= Math.max(0, 1 - (i - fadeStart) / (n - fadeStart));
    L[i] = l * g;
    R[i] = r * g;
  }

  const addMono = (snd, atMs, gain) => {
    const i0 = Math.round((atMs / 1000) * SR);
    for (let k = 0; k < snd.length; k++) {
      const i = i0 + k;
      if (i < 0 || i >= n) continue;
      L[i] += snd[k] * gain;
      R[i] += snd[k] * gain;
    }
  };

  // ---- trailer accents
  if (hits && accent === "pop") {
    // bright, friendly accents for sunny styles: chord stabs with handclaps, a short riser, a cymbal-swell finish
    // with tuned effects the step-change stabs are already played in the track's key, so these generic ones are skipped
    if (!tonal) {
      const rootFor = (k) => [220, 246.94, 277.18, 220, 329.63][k % 5]; // A, B, C#, A, E: stays inside A major
      addMono(popHit({ ms: 420, seed: 3, root: 220, clap: 0.7 }), 0, 0.4);
      (edl.captions ?? []).forEach((c, k) => addMono(popHit({ ms: 460, seed: 30 + k, root: rootFor(k) }), c.start_ms, 0.5));
    }
    const lastStep = Math.max(0, ...(edl.captions ?? []).filter((c) => c.start_ms < endMs).map((c) => c.start_ms));
    const riseMs = Math.min(1100, Math.max(400, endMs - lastStep - 300));
    addMono(popRiser({ ms: riseMs, seed: 7 }), endMs - riseMs, 0.5);
    addMono(popFinale({ ms: 1700, seed: 61, root: tonal ? freq(sfx.key.tonic, 3) : 220 }), endMs, 0.85);
  } else if (hits) {
    addMono(impact({ ms: 900, seed: 3 }), 0, 0.42); // the cold open
    (edl.captions ?? []).forEach((c, k) => addMono(impact({ ms: 800, seed: 20 + k, crack: 0.8 }), c.start_ms, 0.5));
    const lastStep = Math.max(0, ...(edl.captions ?? []).filter((c) => c.start_ms < endMs).map((c) => c.start_ms));
    const riseMs = Math.min(1500, Math.max(500, endMs - lastStep - 300));
    addMono(riser({ ms: riseMs, seed: 5 }), endMs - riseMs, 0.5);
    addMono(impact({ ms: 2000, seed: 99 }), endMs, 0.95); // the end card
  }

  // ---- the existing sound effects, unchanged
  const sfxTrack = tonal ? tonalTrack(sfxCues, { key: sfx.key, durationMs }) : synthesize(sfxCues, durationMs);
  for (let i = 0; i < n; i++) {
    L[i] += sfxTrack[i] * 0.9;
    R[i] += sfxTrack[i] * 0.9;
  }

  // ---- limit, normalise, and fade the last few milliseconds
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(L[i]), Math.abs(R[i]));
  const drive = 1.6;
  const k = mx > 0 ? 1 / mx : 1;
  const tail = Math.round(0.2 * SR);
  for (let i = 0; i < n; i++) {
    const f = n - i < tail ? (n - i) / tail : 1;
    L[i] = (Math.tanh(L[i] * k * drive) / Math.tanh(drive)) * FINAL_PEAK * f;
    R[i] = (Math.tanh(R[i] * k * drive) / Math.tanh(drive)) * FINAL_PEAK * f;
  }
  return { L, R, warnings };
}

/** Mux a stereo mix onto the video of `reel` (video stream copied untouched) and write `out`. */
export function muxMix({ reel, L, R, out }) {
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", reel], { encoding: "utf8" });
  const videoS = parseFloat(probe.stdout);
  if (!(videoS > 0)) throw new Error(`cannot read the video duration of ${reel}`);
  const wav = `${out}.mix.wav`;
  fs.writeFileSync(wav, wavStereo(L, R));
  try {
    const r = spawnSync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-i", reel, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", String(SR), "-ac", "2", "-t", String(videoS), "-movflags", "+faststart", out],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error(`ffmpeg mux failed: ${r.stderr}`);
  } finally {
    fs.rmSync(wav, { force: true });
  }
}
