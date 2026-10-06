// Trailer-style accents, synthesised: a low impact for a step change, a bigger one for the end card, and a riser that builds into it.
// Pure functions of their arguments (seeded noise), like the sound effects in ../edit/sfx.mjs.

import { SR } from "../edit/sfx.mjs";

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

/** A cinematic impact: a falling sub boom, a body thump, and a short bright noise crack. Peak about 1. */
export function impact({ ms = 1100, seed = 7, crack = 1 } = {}) {
  const out = buf(ms);
  const r = rng(seed);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const sub = Math.sin(TAU * ((38 + 72 * Math.exp(-t / 0.07)) * t)) * Math.exp(-t / (ms / 1000 / 2.6));
    const body = 0.55 * Math.sin(TAU * 92 * t) * Math.exp(-t / 0.09);
    const w = r() * 2 - 1;
    lp += 0.55 * (w - lp);
    const air = crack * 0.5 * (w - lp) * Math.exp(-t / 0.05);
    const tail = 0.18 * lp * Math.exp(-t / 0.35);
    const attack = Math.min(1, i / (0.002 * SR));
    out[i] = (sub + body + air + tail) * attack;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] /= peak || 1;
  return out;
}

/** A riser: filtered noise sweeping up while a tone climbs, growing louder, with a brief suck-out right before the hit it leads into. */
export function riser({ ms = 1400, seed = 11 } = {}) {
  const out = buf(ms);
  const r = rng(seed);
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const fc = 300 * Math.pow(9000 / 300, p);
    const a = 1 - Math.exp((-TAU * fc) / SR);
    const w = r() * 2 - 1;
    lp += a * (w - lp);
    hp += 0.08 * (lp - hp);
    const noise = lp - hp;
    const tone = Math.sin(TAU * (180 + 720 * p * p) * (i / SR));
    const amp = Math.pow(p, 2.2);
    const suck = i > out.length - 0.05 * SR ? (out.length - i) / (0.05 * SR) : 1;
    out[i] = (0.9 * noise + 0.25 * tone) * amp * suck;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] /= peak || 1;
  return out;
}

// ------------------------------------------------------------------ bright accents for fun, sunny styles

/** A major chord stab (root in Hz) with a handclap: a short, bright "pop" for a step change. Peak about 1. */
export function popHit({ ms = 460, seed = 31, root = 220, clap = 1 } = {}) {
  const out = buf(ms);
  const r = rng(seed);
  const ratios = [1, 1.2599, 1.4983, 2]; // a major triad plus the octave: root, major third, fifth, octave (equal temperament)
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const k of ratios) {
      const f = root * k;
      s += 2 * ((t * f) % 1) - 1; // saw
      s += 2 * ((t * f * 1.004) % 1) - 1; // detuned twin for width
    }
    const env = Math.exp(-t / 0.13) * Math.min(1, t / 0.002);
    const w = r() * 2 - 1;
    lp += 0.4 * (w - lp);
    const c = clap * 0.55 * (w - lp) * Math.exp(-t / 0.05) * (t < 0.012 ? 0.6 : 1);
    out[i] = (s / 8) * env + c;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] /= peak || 1;
  return out;
}

/** A short, bright riser: a rising tone plus an airy noise sweep, with a tiny gap before the hit. */
export function popRiser({ ms = 1000, seed = 41 } = {}) {
  const out = buf(ms);
  const r = rng(seed);
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const w = r() * 2 - 1;
    lp += 0.7 * (w - lp);
    hp += 0.25 * (lp - hp);
    const air = lp - hp;
    const tone = Math.sin(TAU * (330 + 1320 * p * p) * (i / SR)) + 0.4 * Math.sin(TAU * (660 + 2640 * p * p) * (i / SR));
    const amp = Math.pow(p, 1.6);
    const gap = i > out.length - 0.03 * SR ? (out.length - i) / (0.03 * SR) : 1;
    out[i] = (0.6 * air + 0.35 * tone) * amp * gap;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] /= peak || 1;
  return out;
}

/** The big finish for a bright style: a wide chord stack, a cymbal-like swell and a soft kick. Not a dark boom. */
export function popFinale({ ms = 1700, seed = 51, root = 220 } = {}) {
  const out = buf(ms);
  const r = rng(seed);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const k of [0.5, 1, 1.2599, 1.4983, 2, 2.5198]) {
      s += 2 * (((t * root * k) % 1)) - 1;
      s += 2 * (((t * root * k * 1.005) % 1)) - 1;
    }
    const chord = (s / 12) * Math.exp(-t / 0.55) * Math.min(1, t / 0.002);
    const w = r() * 2 - 1;
    lp += 0.9 * (w - lp);
    const crash = 0.55 * (w - lp) * Math.exp(-t / 0.5); // bright, long noise decay
    const kick = 0.7 * Math.sin(TAU * (50 + 90 * Math.exp(-t / 0.025)) * t) * Math.exp(-t / 0.12);
    out[i] = chord + crash + kick;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] /= peak || 1;
  return out;
}
