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
