// Beat analysis: find the REAL tempo and beat positions of a piece of audio.
// A generator is asked for a BPM but never lands on it exactly (and its first beat is wherever it likes), so the music
// version syncs to the measured beats, not the requested ones.
//
//   const { bpm, phase_s, beats, confidence } = analyzeFile("bed.flac");
//
// Method: spectral-flux onset envelope, then a comb filter over tempo and phase (mean onset strength at the beat
// positions), with a mild prior toward 85-140 BPM so it does not pick half or double time. Pure JS, no dependencies.

import { spawnSync } from "node:child_process";

export const AN_SR = 22050;
const N = 1024; // FFT size
const HOP = 128; // 5.8 ms per frame
// Spectral flux peaks when a transient first fills the analysis window, which is ~0.75 of a window AFTER the window starts.
// Without this the beats read about 35 ms early. Measured against synthetic rhythms with known phase.
const LATENCY_S = (0.75 * N) / AN_SR;

/** Decode any audio file to mono float32 at AN_SR. */
export function decodeMono(file, { seconds } = {}) {
  const args = ["-v", "error", "-i", file, ...(seconds ? ["-t", String(seconds)] : []), "-vn", "-ac", "1", "-ar", String(AN_SR), "-f", "f32le", "-"];
  const r = spawnSync("ffmpeg", args, { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
}

export function fftReal(re, im) {
  return fft(re, im);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Onset strength per frame: positive spectral flux of the log-compressed magnitude spectrum, locally mean-removed. */
export function onsetEnvelope(x) {
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const frames = Math.max(0, Math.floor((x.length - N) / HOP));
  const bins = N / 2;
  const hi = Math.floor((4000 / (AN_SR / 2)) * bins); // rhythm lives below ~4 kHz
  let prev = new Float32Array(bins);
  const env = new Float32Array(frames);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = x[f * HOP + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    const cur = new Float32Array(bins);
    for (let b = 1; b < hi; b++) {
      cur[b] = Math.log1p(10 * Math.hypot(re[b], im[b]));
      const d = cur[b] - prev[b];
      if (d > 0) flux += d;
    }
    env[f] = flux;
    prev = cur;
  }
  const fps = AN_SR / HOP;
  // remove the slow average so sustained loud passages do not look like beats
  const w = Math.round(0.4 * fps);
  const out = new Float32Array(frames);
  let sum = 0;
  for (let i = 0; i < frames; i++) {
    sum += env[i];
    if (i >= 2 * w + 1) sum -= env[i - 2 * w - 1];
    const lo = Math.max(0, i - 2 * w);
    out[i] = Math.max(0, env[i] - sum / (i - lo + 1));
  }
  let mx = 0;
  for (const v of out) mx = Math.max(mx, v);
  if (mx > 0) for (let i = 0; i < out.length; i++) out[i] /= mx;
  return { env: out, fps };
}

const at = (env, pos) => {
  if (pos < 0 || pos >= env.length - 1) return 0;
  const i = Math.floor(pos);
  const f = pos - i;
  return env[i] * (1 - f) + env[i + 1] * f;
};

/** Best (bpm, phase) by a comb filter. Returns the mean onset strength at the beat positions as the score. */
export function estimateTempo(env, fps, { min = 70, max = 165, prior = 112, priorWidth = 0.55 } = {}) {
  let best = { score: -1, bpm: 0, phase: 0 };
  const scores = [];
  for (let bpm = min; bpm <= max; bpm += 0.1) {
    const p = (60 / bpm) * fps; // frames per beat
    let bestPhase = 0;
    let bestMean = -1;
    const steps = Math.max(8, Math.ceil(p));
    for (let s = 0; s < steps; s++) {
      const phase = (s / steps) * p;
      let sum = 0;
      let n = 0;
      for (let pos = phase; pos < env.length - 1; pos += p) {
        sum += at(env, pos);
        n++;
      }
      const mean = n ? sum / n : 0;
      if (mean > bestMean) {
        bestMean = mean;
        bestPhase = phase;
      }
    }
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / prior) / priorWidth, 2));
    const score = bestMean * (0.55 + 0.45 * weight);
    scores.push(score);
    if (score > best.score) best = { score, bpm, phase: bestPhase, mean: bestMean };
  }
  scores.sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)] || 1e-9;
  const p = 60 / best.bpm;
  const phase_s = (((best.phase / fps + LATENCY_S) % p) + p) % p;
  return { bpm: best.bpm, phase_s, confidence: best.score / median };
}

export function beatTimes(bpm, phase_s, duration_s) {
  const p = 60 / bpm;
  const out = [];
  for (let t = phase_s; t < duration_s; t += p) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/** Analyse an audio file: { bpm, phase_s, beats[], confidence, duration_s }. */
export function analyzeSamples(x) {
  const { env, fps } = onsetEnvelope(x);
  const t = estimateTempo(env, fps);
  const duration_s = x.length / AN_SR;
  return { ...t, duration_s, beats: beatTimes(t.bpm, t.phase_s, duration_s) };
}

export function analyzeFile(file, opts) {
  return analyzeSamples(decodeMono(file, opts));
}
