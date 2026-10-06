// Musical keys: note names to frequencies, scales and chords, and key detection from audio.
// The sound effects are retuned to the KEY OF THE TRACK so a click is a note that belongs to the tune, not a noise tick.

import { AN_SR, fftReal } from "./beats.mjs";

export const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

export const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
export const PENTATONIC = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] };

/** "G major" or "F# minor" -> { tonic: 7, mode: "major" } */
export function parseKey(s) {
  const m = String(s).trim().match(/^([A-G][#b]?)\s+(major|minor)$/i);
  if (!m) throw new Error(`cannot read the key "${s}" (want e.g. "G major" or "F# minor")`);
  const name = FLATS[m[1]] ?? m[1].toUpperCase().replace(/^([A-G])B$/, "$1");
  const tonic = NAMES.indexOf(name);
  if (tonic < 0) throw new Error(`unknown note ${m[1]}`);
  return { tonic, mode: m[2].toLowerCase() };
}

export const keyName = (k) => `${NAMES[k.tonic]} ${k.mode}`;

/** Frequency of a pitch class in an octave (C4 is the C above the bass clef: middle C, 261.63 Hz). */
export function freq(pc, octave) {
  const midi = 12 * (octave + 1) + pc;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** The nth degree of the key's scale (0 = tonic), wrapping into higher octaves. Returns Hz. */
export function scaleNote(key, degree, octave) {
  const steps = SCALE[key.mode];
  const oct = Math.floor(degree / 7);
  const i = ((degree % 7) + 7) % 7;
  return freq((key.tonic + steps[i]) % 12, octave + oct + Math.floor((key.tonic + steps[i]) / 12));
}

/** The triad built on a scale degree: [root, third, fifth] in Hz. */
export function triad(key, degree, octave) {
  return [0, 2, 4].map((o) => scaleNote(key, degree + o, octave));
}

/** The nth note of the key's pentatonic scale (0 = tonic), climbing through octaves. Never a wrong note. */
export function pentNote(key, n, octave) {
  const p = PENTATONIC[key.mode];
  const oct = Math.floor(n / 5);
  const i = ((n % 5) + 5) % 5;
  const semis = key.tonic + p[i];
  return freq(semis % 12, octave + oct + Math.floor(semis / 12));
}

// ------------------------------------------------------------------ detecting the key of a recording
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

/** Pitch-class energy of mono samples at AN_SR (a chromagram summed over the whole clip). */
export function chroma(x) {
  const N = 8192;
  const hop = 4096;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const out = new Float64Array(12);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let f = 0; f + N <= x.length; f += hop) {
    for (let i = 0; i < N; i++) {
      re[i] = x[f + i] * win[i];
      im[i] = 0;
    }
    fftReal(re, im);
    for (let k = Math.floor((65 * N) / AN_SR); k < (2000 * N) / AN_SR; k++) {
      const hz = (k * AN_SR) / N;
      const pc = (((Math.round(69 + 12 * Math.log2(hz / 440)) % 12) + 12) % 12);
      out[pc] += Math.sqrt(Math.hypot(re[k], im[k]));
    }
  }
  return out;
}

/** Best-fitting key of a recording: { tonic, mode, score, margin }. margin is how far ahead of the runner-up (small = unsure). */
export function estimateKey(x) {
  const c = chroma(x);
  const ranked = [];
  for (let t = 0; t < 12; t++) {
    const rot = Array.from({ length: 12 }, (_, i) => c[(t + i) % 12]);
    ranked.push({ tonic: t, mode: "major", score: corr(rot, KS_MAJOR) });
    ranked.push({ tonic: t, mode: "minor", score: corr(rot, KS_MINOR) });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { ...ranked[0], margin: ranked[0].score - ranked[1].score };
}
