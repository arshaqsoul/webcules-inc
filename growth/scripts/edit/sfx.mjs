#!/usr/bin/env node
// Sound effects for a reel. Every cue is derived from edl.json (the same timeline the visual effects come from) and the
// sounds are synthesised here, so there is no sample library, no licence to track, and the same edl gives the same audio.
//
//   node growth/scripts/edit/sfx.mjs --pp PP-001 [--reel growth/out/PP-001/reel.mp4]
//
// Reads  : growth/out/<PP>/edl.json
// Writes : the reel with an AAC track muxed in (video stream copied untouched, safe to rerun), and an `sfx` block in edl.json.
// Spec   : growth/DEMO-STANDARD.md (Audio)

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const SR = 48000;
// Peak of the finished mix. Effects are sparse, so a fixed peak (not integrated loudness) is the sensible target.
export const PEAK_DB = -6;

// Relative gain of each cue (linear, before the mix is peak-normalised).
const GAIN = { hook: 0.8, caption: 0.35, click: 0.85, ramp: 0.7, end: 0.8 };

/** Cue list from an edl: [{ t_ms, kind, dur_ms? }], sorted by time. */
export function cuesFromEdl(edl) {
  const cues = [];
  if (edl.hook) cues.push({ t_ms: 60, kind: "hook" });
  for (const c of edl.captions ?? []) cues.push({ t_ms: c.start_ms, kind: "caption" });
  for (const h of edl.highlights ?? []) cues.push({ t_ms: h.out_ms, kind: "click" });
  for (const r of edl.ramps ?? []) cues.push({ t_ms: r.out_start_ms, kind: "ramp", dur_ms: Math.min(900, Math.max(260, r.out_end_ms - r.out_start_ms)) });
  cues.push({ t_ms: edl.endcard_start_ms, kind: "end" });
  return cues.filter((c) => c.t_ms >= 0 && c.t_ms < edl.duration_ms).sort((a, b) => a.t_ms - b.t_ms || a.kind.localeCompare(b.kind));
}

// ------------------------------------------------------------------ synthesis (pure functions of their arguments)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const buf = (ms) => new Float32Array(Math.round((ms / 1000) * SR));
const TAU = Math.PI * 2;

/** Band-limited noise swept from f0 to f1 Hz (state-variable band-pass), shaped by env(0..1). */
function sweptNoise(ms, f0, f1, q, env, seed) {
  const out = buf(ms);
  const r = rng(seed);
  let low = 0;
  let band = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const f = f0 * Math.pow(f1 / f0, p);
    const g = 2 * Math.sin((Math.PI * f) / SR);
    const x = r() * 2 - 1;
    low += g * band;
    const high = x - low - band / q;
    band += g * high;
    out[i] = band * env(p) * 0.9;
  }
  // two gentle one-pole low-passes take the harsh top end off, so the sweep reads as air rather than hiss
  const a = Math.exp((-TAU * 6000) / SR);
  for (let pass = 0; pass < 2; pass++) {
    let y = 0;
    for (let i = 0; i < out.length; i++) {
      y = (1 - a) * out[i] + a * y;
      out[i] = y;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] *= 2.2;
  return out;
}

const SOUNDS = {
  // a soft, dry UI tick: a short high partial over a small low body
  click() {
    const out = buf(120);
    const r = rng(11);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      const noise = (r() * 2 - 1) * Math.exp(-t / 0.0018) * 0.3;
      const tone = Math.sin(TAU * 2300 * t) * Math.exp(-t / 0.011) * 0.55;
      const body = Math.sin(TAU * 190 * t) * Math.exp(-t / 0.022) * 0.7;
      out[i] = noise + tone + body;
    }
    return out;
  },
  // a very quiet bubble for a caption appearing
  caption() {
    const out = buf(110);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      ph += (TAU * (520 + 300 * Math.min(1, t / 0.05))) / SR;
      out[i] = Math.sin(ph) * Math.exp(-t / 0.028) * Math.min(1, t / 0.002);
    }
    return out;
  },
  // the 4x section: a quick rising zip
  ramp(ms) {
    const out = buf(ms);
    let ph = 0;
    const noise = sweptNoise(ms, 500, 5000, 3, () => 1, 23);
    for (let i = 0; i < out.length; i++) {
      const p = i / out.length;
      ph += (TAU * (260 * Math.pow(5, p))) / SR;
      const env = Math.min(1, p / 0.12) * (1 - Math.pow(p, 3));
      out[i] = (Math.sin(ph) * 0.55 + noise[i] * 0.45) * env;
    }
    return out;
  },
  // the hook: a low thump with a small bright pluck
  hook() {
    const out = buf(520);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      ph += (TAU * (55 + 60 * Math.exp(-t / 0.05))) / SR;
      const thump = Math.sin(ph) * Math.exp(-t / 0.13);
      const pluck = (Math.sin(TAU * 880 * t) + 0.35 * Math.sin(TAU * 1760 * t)) * Math.exp(-t / 0.09) * Math.min(1, t / 0.003);
      out[i] = thump * 0.9 + pluck * 0.28;
    }
    return out;
  },
  // end card: a gentle rising arpeggio (C6 E6 G6), resolving
  end() {
    const out = buf(1500);
    [1046.5, 1318.5, 1568].forEach((f, k) => {
      const start = Math.round((k * 0.085 + 0) * SR);
      for (let i = 0; start + i < out.length; i++) {
        const t = i / SR;
        const env = Math.exp(-t / 0.4) * Math.min(1, t / 0.004) * Math.min(1, (1.5 - start / SR - t) / 0.12);
        out[start + i] += (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) + 0.1 * Math.sin(TAU * 3 * f * t)) * env * 0.33;
      }
    });
    return out;
  },
};

/** Mix every cue into a mono float buffer of exactly duration_ms, peak-normalised to PEAK_DB, with a short fade at the very end. */
export function synthesize(cues, durationMs) {
  const mix = new Float32Array(Math.round((durationMs / 1000) * SR));
  for (const c of cues) {
    const snd = SOUNDS[c.kind](c.dur_ms);
    const at = Math.round((c.t_ms / 1000) * SR);
    for (let i = 0; i < snd.length && at + i < mix.length; i++) mix[at + i] += snd[i] * GAIN[c.kind];
  }
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  // a gentle soft limiter keeps the sharp click transients from dictating the level of the softer cues
  const drive = 1.8;
  const k = peak > 0 ? 1 / peak : 1;
  const out = Math.pow(10, PEAK_DB / 20);
  const fade = Math.round(0.25 * SR);
  for (let i = 0; i < mix.length; i++) {
    const tail = mix.length - i;
    mix[i] = (Math.tanh(mix[i] * k * drive) / Math.tanh(drive)) * out * (tail < fade ? tail / fade : 1);
  }
  return mix;
}

export function wavBytes(samples) {
  // stereo (the same signal in both channels), so the level the file is normalised to is the level that plays
  const data = Buffer.alloc(samples.length * 4);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
    data.writeInt16LE(v, i * 4);
    data.writeInt16LE(v, i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(2, 22); // stereo
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Replace the audio of `reel` with the sound-effects track for `edl`. The video stream is copied bit for bit. */
export function addSfx(reel, edl, { edlPath } = {}) {
  const cues = cuesFromEdl(edl);
  // match the video's real length (a whole number of frames), so the mux neither trims frames nor leaves a silent tail
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", reel], { encoding: "utf8" });
  const videoMs = Math.round(parseFloat(probe.stdout) * 1000);
  if (!(videoMs > 0)) throw new Error(`cannot read the video duration of ${reel}`);
  const wav = `${reel}.sfx.wav`;
  const tmp = `${reel}.sfx.mp4`;
  fs.writeFileSync(wav, wavBytes(synthesize(cues, videoMs)));
  try {
    const r = spawnSync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-i", reel, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", String(SR), "-ac", "2", "-t", String(videoMs / 1000), "-movflags", "+faststart", tmp],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error(`ffmpeg mux failed: ${r.stderr}`);
    fs.renameSync(tmp, reel);
  } finally {
    fs.rmSync(wav, { force: true });
    fs.rmSync(tmp, { force: true });
  }
  const counts = {};
  for (const c of cues) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  if (edlPath) fs.writeFileSync(edlPath, JSON.stringify({ ...edl, sfx: { peak_db: PEAK_DB, cues: counts, cue_list: cues } }, null, 2));
  return { cues: cues.length, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const flag = (k) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : undefined);
  const pp = flag("pp");
  if (!pp || !/^PP-\d{3,}$/.test(pp)) {
    console.error("usage: sfx.mjs --pp PP-### [--reel file]");
    process.exit(2);
  }
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  const outDir = path.join(root, "growth", "out", pp);
  const edlPath = path.join(outDir, "edl.json");
  const reel = path.resolve(root, flag("reel") ?? path.join(outDir, "reel.mp4"));
  for (const p of [edlPath, reel]) {
    if (!fs.existsSync(p)) {
      console.error(`missing ${path.relative(root, p)}`);
      process.exit(1);
    }
  }
  const edl = JSON.parse(fs.readFileSync(edlPath, "utf8"));
  console.log(JSON.stringify({ ok: true, reel: path.relative(root, reel), ...addSfx(reel, edl, { edlPath }) }));
}
