// Sound effects that belong to the tune. The classic effects (../edit/sfx.mjs) are noise ticks and whooshes. These are NOTES in the
// key of the music: a click plays the next note of the key's pentatonic scale (so a run of clicks within one step is a small
// melody that can never be wrong), a step change is a chord stab on a simple progression, the fast-forward is a rising arpeggio, the
// hook is a bell. All synthesised, seeded and deterministic, like the rest.

import { SR } from "../edit/sfx.mjs";
import { freq, scaleNote, triad, pentNote } from "./keys.mjs";

const TAU = Math.PI * 2;
const buf = (ms) => new Float32Array(Math.round((ms / 1000) * SR));

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

const norm = (out) => {
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
};

/** A marimba or kalimba-like pluck at f Hz: a clean fundamental, a quickly fading overtone, a tiny wooden tick. */
export function pluck({ f, ms = 320, seed = 1 }) {
  const out = buf(ms);
  const r = rng(seed);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const body = Math.sin(TAU * f * t) * Math.exp(-t / 0.16) + 0.45 * Math.sin(TAU * f * 4 * t) * Math.exp(-t / 0.035) + 0.2 * Math.sin(TAU * f * 2 * t) * Math.exp(-t / 0.09);
    const tick = (r() * 2 - 1) * Math.exp(-t / 0.004) * 0.25;
    out[i] = (body + tick) * Math.min(1, t / 0.0015);
  }
  return norm(out);
}

/** A bright chord stab (the notes given, in Hz) with a soft handclap on top. */
export function stab({ freqs, ms = 520, seed = 5, clap = 0.7 }) {
  const out = buf(ms);
  const r = rng(seed);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const f of freqs) {
      s += 2 * ((t * f) % 1) - 1;
      s += 2 * ((t * f * 1.004) % 1) - 1;
    }
    const env = Math.exp(-t / 0.14) * Math.min(1, t / 0.002);
    const w = r() * 2 - 1;
    lp += 0.4 * (w - lp);
    out[i] = (s / (2 * freqs.length)) * env + clap * 0.5 * (w - lp) * Math.exp(-t / 0.05);
  }
  return norm(out);
}

/** A little bell: sines at inharmonic partials of each note, ringing out. */
export function chime({ freqs, ms = 900 }) {
  const out = buf(ms);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const f of freqs) s += Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / 0.2) + 0.25 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t / 0.08);
    out[i] = (s / freqs.length) * Math.exp(-t / 0.45) * Math.min(1, t / 0.002);
  }
  return norm(out);
}

/** The fast-forward: a quick ascending run up the key's pentatonic scale, with an airy swell, landing on the top note. */
export function run({ key, ms = 600, octave = 4, seed = 9 }) {
  const out = buf(ms);
  const r = rng(seed);
  const notes = Math.max(4, Math.min(10, Math.round(ms / 70)));
  const gap = Math.floor(out.length / (notes + 1));
  for (let n = 0; n < notes; n++) {
    const p = pluck({ f: pentNote(key, n, octave), ms: 260, seed: seed + n });
    const at = n * gap;
    const g = 0.45 + 0.55 * (n / (notes - 1));
    for (let i = 0; i < p.length && at + i < out.length; i++) out[at + i] += p[i] * g;
  }
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < out.length; i++) {
    const w = r() * 2 - 1;
    lp += 0.5 * (w - lp);
    hp += 0.15 * (lp - hp);
    out[i] += 0.18 * (lp - hp) * Math.pow(i / out.length, 1.5);
  }
  return norm(out);
}

// the chord for each step change: I, V, vi, IV, the progression behind a thousand feel-good songs
const PROGRESSION = [0, 4, 5, 3];

/**
 * Render a list of cues ({ t_ms, kind, dur_ms? }, already snapped to the groove) as tuned notes. Returns a mono Float32Array of
 * exactly durationMs, peak about 0.5. `beatS` is the length of one beat, used to size the fast-forward run.
 */
export function tonalTrack(cues, { key, durationMs }) {
  const mix = new Float32Array(Math.round((durationMs / 1000) * SR));
  let step = -1;
  let clickInStep = 0;
  const put = (snd, atMs, gain) => {
    const i0 = Math.round((atMs / 1000) * SR);
    for (let i = 0; i < snd.length && i0 + i < mix.length; i++) if (i0 + i >= 0) mix[i0 + i] += snd[i] * gain;
  };
  for (const c of [...cues].sort((a, b) => a.t_ms - b.t_ms)) {
    if (c.kind === "hook") {
      put(chime({ freqs: [scaleNote(key, 0, 5), scaleNote(key, 4, 5), scaleNote(key, 7, 5)] }), c.t_ms, 0.55);
    } else if (c.kind === "caption") {
      step++;
      clickInStep = 0;
      const deg = PROGRESSION[step % PROGRESSION.length];
      put(stab({ freqs: triad(key, deg, 4), seed: 40 + step }), c.t_ms, 0.7);
    } else if (c.kind === "click") {
      // climb the pentatonic scale within a step, a different octave every five notes: a tiny melody that is always in key
      put(pluck({ f: pentNote(key, clickInStep, 5), seed: 70 + clickInStep }), c.t_ms, 0.8);
      clickInStep++;
    } else if (c.kind === "ramp") {
      put(run({ key, ms: c.dur_ms ?? 600, seed: 90 + step }), c.t_ms, 0.7);
    }
    // the end card is handled by the finale in the mix, played on this key's tonic
  }
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.5 / peak : 1;
  for (let i = 0; i < mix.length; i++) mix[i] *= g;
  return mix;
}

export { freq };
