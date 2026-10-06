// Run: node --test growth/scripts/music/beats.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSamples, AN_SR } from "./beats.mjs";

/** A deterministic rhythmic test signal: a kick-like thump on every beat plus quieter off-beat hats and a steady pad. */
function rhythm({ bpm, phase, seconds, swing = 0 }) {
  const n = Math.round(seconds * AN_SR);
  const x = new Float32Array(n);
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const p = 60 / bpm;
  for (let k = 0; phase + k * p < seconds; k++) {
    const t0 = Math.round((phase + k * p) * AN_SR);
    for (let i = 0; i < 0.12 * AN_SR && t0 + i < n; i++) {
      const env = Math.exp(-i / (0.03 * AN_SR));
      x[t0 + i] += 0.9 * env * Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-i / (0.02 * AN_SR))) * (i / AN_SR)) + 0.15 * env * rnd();
    }
    const h0 = Math.round((phase + k * p + p / 2 + swing) * AN_SR);
    for (let i = 0; i < 0.04 * AN_SR && h0 + i < n; i++) x[h0 + i] += 0.25 * Math.exp(-i / (0.01 * AN_SR)) * rnd();
  }
  for (let i = 0; i < n; i++) x[i] += 0.12 * Math.sin((2 * Math.PI * 220 * i) / AN_SR); // sustained pad
  return x;
}

const phaseErrMs = (found, expected, bpm) => {
  const p = 60 / bpm;
  let d = (found - expected) % p;
  if (d > p / 2) d -= p;
  if (d < -p / 2) d += p;
  return Math.abs(d) * 1000;
};

test("finds 120 BPM and the beat phase", () => {
  const r = analyzeSamples(rhythm({ bpm: 120, phase: 0.23, seconds: 24 }));
  assert.ok(Math.abs(r.bpm - 120) < 0.8, `bpm ${r.bpm}`);
  assert.ok(phaseErrMs(r.phase_s, 0.23, 120) < 20, `phase ${r.phase_s}`);
  assert.ok(r.confidence > 1.5, `confidence ${r.confidence}`);
});

test("finds 100 BPM with a different phase", () => {
  const r = analyzeSamples(rhythm({ bpm: 100, phase: 0.41, seconds: 24 }));
  assert.ok(Math.abs(r.bpm - 100) < 0.8, `bpm ${r.bpm}`);
  assert.ok(phaseErrMs(r.phase_s, 0.41, 100) < 20, `phase ${r.phase_s}`);
});

test("is not fooled into half or double time at 128 BPM", () => {
  const r = analyzeSamples(rhythm({ bpm: 128, phase: 0.1, seconds: 24 }));
  assert.ok(Math.abs(r.bpm - 128) < 1, `bpm ${r.bpm}`);
});

test("beats line up with the true beat grid across the whole clip, not just the start", () => {
  const r = analyzeSamples(rhythm({ bpm: 112, phase: 0.3, seconds: 28 }));
  const last = r.beats.at(-1);
  const expected = 0.3 + Math.round((last - 0.3) / (60 / 112)) * (60 / 112);
  assert.ok(Math.abs(last - expected) < 0.03, `drift ${Math.abs(last - expected)} s over ${last.toFixed(1)} s`);
});
