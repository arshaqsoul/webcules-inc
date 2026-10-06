// Run: node --test growth/scripts/music/tonalsfx.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pluck, stab, tonalTrack } from "./tonalsfx.mjs";
import { parseKey, pentNote, triad, freq } from "./keys.mjs";
import { SR } from "../edit/sfx.mjs";

/** The strongest frequency in a buffer, by a plain DFT over a window (accurate to a couple of Hz at these lengths). */
function peakHz(x, lo, hi, from = 0.01, len = 0.12) {
  const i0 = Math.round(from * SR);
  const n = Math.round(len * SR);
  let best = { hz: 0, mag: 0 };
  for (let hz = lo; hz <= hi; hz += 1) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const v = x[i0 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
      re += v * Math.cos((2 * Math.PI * hz * i) / SR);
      im -= v * Math.sin((2 * Math.PI * hz * i) / SR);
    }
    const mag = Math.hypot(re, im);
    if (mag > best.mag) best = { hz, mag };
  }
  return best.hz;
}

test("a pluck sounds at the pitch it was asked for", () => {
  for (const f of [392, 523.25, 659.26]) {
    const hz = peakHz(pluck({ f }), f - 40, f + 40);
    assert.ok(Math.abs(hz - f) <= 3, `asked ${f}, heard ${hz}`);
  }
});

test("successive clicks climb the key's pentatonic scale", () => {
  const key = parseKey("G major");
  const cues = [{ kind: "caption", t_ms: 100 }, ...[0, 1, 2, 3].map((i) => ({ kind: "click", t_ms: 1000 + i * 600 }))];
  const track = tonalTrack(cues, { key, durationMs: 4000 });
  const heard = [0, 1, 2, 3].map((i) => peakHz(track, 300, 1200, 1 + i * 0.6 + 0.012, 0.1));
  const want = [0, 1, 2, 3].map((i) => pentNote(key, i, 5));
  heard.forEach((h, i) => assert.ok(Math.abs(h - want[i]) <= 4, `click ${i}: wanted ${want[i].toFixed(1)}, heard ${h}`));
  assert.ok(heard[0] < heard[1] && heard[1] < heard[2] && heard[2] < heard[3], "the run goes up");
});

test("the clicks restart their little melody at every step change", () => {
  const key = parseKey("A minor");
  const cues = [
    { kind: "caption", t_ms: 100 },
    { kind: "click", t_ms: 900 },
    { kind: "click", t_ms: 1500 },
    { kind: "caption", t_ms: 2300 },
    { kind: "click", t_ms: 3100 },
  ];
  const t = tonalTrack(cues, { key, durationMs: 4200 });
  const first = peakHz(t, 300, 1200, 0.9 + 0.012, 0.1);
  const afterReset = peakHz(t, 300, 1200, 3.1 + 0.012, 0.1);
  assert.ok(Math.abs(first - afterReset) <= 4, `the first click of each step is the same note: ${first} vs ${afterReset}`);
});

test("a step change plays a chord made of the key's own notes", () => {
  const key = parseKey("G major");
  const s = stab({ freqs: triad(key, 0, 4) });
  const hz = peakHz(s, 150, 700, 0.01, 0.1);
  const chordTones = triad(key, 0, 4).flatMap((f) => [f, f * 2, f / 2]);
  assert.ok(chordTones.some((f) => Math.abs(f - hz) <= 6), `the loudest tone ${hz} Hz is a G, B or D`);
});

test("the output is deterministic and never clips", () => {
  const key = parseKey("G major");
  const cues = [{ kind: "hook", t_ms: 60 }, { kind: "caption", t_ms: 1500 }, { kind: "click", t_ms: 2500 }, { kind: "ramp", t_ms: 3200, dur_ms: 700 }];
  const a = tonalTrack(cues, { key, durationMs: 5000 });
  const b = tonalTrack(cues, { key, durationMs: 5000 });
  assert.ok(Buffer.from(a.buffer).equals(Buffer.from(b.buffer)));
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak > 0.3 && peak <= 0.51, `peak ${peak}`);
});

test("every note in the track belongs to the key", () => {
  // the pentatonic run for a minor key must stay inside its scale for a long run of clicks
  const key = parseKey("F# minor");
  for (let n = 0; n < 12; n++) {
    const pc = ((Math.round(12 * Math.log2(pentNote(key, n, 5) / 440) + 69) % 12) + 12) % 12;
    assert.ok([0, 2, 3, 5, 7, 8, 10].map((s) => (6 + s) % 12).includes(pc), `note ${n} pitch class ${pc}`);
  }
  assert.ok(freq(6, 3) > 0);
});

import { softBell, softPluck, softRun, STYLES } from "./tonalsfx.mjs";

const rms = (x, from = 0, to = x.length) => Math.sqrt(x.slice(from, to).reduce((s, v) => s + v * v, 0) / Math.max(1, to - from));
/** Share of a signal's energy above `hz`, by a plain DFT sweep: how buzzy or hissy it is. */
function energyAbove(x, hz) {
  let hi = 0;
  let all = 0;
  const n = Math.min(x.length, Math.round(0.2 * SR));
  for (let f = 100; f <= 12000; f += 100) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      re += x[i] * Math.cos((2 * Math.PI * f * i) / SR);
      im -= x[i] * Math.sin((2 * Math.PI * f * i) / SR);
    }
    const e = re * re + im * im;
    all += e;
    if (f >= hz) hi += e;
  }
  return hi / (all || 1);
}

test("the light step change is far quieter, rounder and less buzzy than the full stab", () => {
  const key = parseKey("A major");
  const cues = [{ kind: "caption", t_ms: 300 }];
  const full = tonalTrack(cues, { key, durationMs: 1500, style: "tonal" });
  const light = tonalTrack(cues, { key, durationMs: 1500, style: "light" });
  const whisper = tonalTrack(cues, { key, durationMs: 1500, style: "whisper" });
  const db = (a, b) => 20 * Math.log10(rms(a, Math.round(0.3 * SR), Math.round(0.8 * SR)) / rms(b, Math.round(0.3 * SR), Math.round(0.8 * SR)));
  assert.ok(db(light, full) <= -8, `light is only ${db(light, full).toFixed(1)} dB below the full stab`);
  assert.ok(db(whisper, light) <= -4, `whisper is only ${db(whisper, light).toFixed(1)} dB below light`);
  // buzz lives in the upper harmonics of a saw wave and the noise of a clap
  assert.ok(energyAbove(light.slice(Math.round(0.3 * SR)), 3000) < 0.02, "the light step change has almost no energy above 3 kHz");
  assert.ok(energyAbove(full.slice(Math.round(0.3 * SR)), 3000) > energyAbove(light.slice(Math.round(0.3 * SR)), 3000) * 5, "the full stab is far brighter and buzzier");
});

test("soft sounds have a rounded attack: no abrupt first sample, no click", () => {
  for (const s of [softBell({ freqs: [440, 660] }), softPluck({ f: 880 }), softRun({ key: parseKey("A major"), ms: 500 })]) {
    // an abrupt start is a click; a rounded attack starts from silence
    const first = Math.max(...Array.from(s.slice(0, Math.round(0.0003 * SR)), Math.abs));
    assert.ok(first < 0.1, `the first 0.3 ms already reaches ${first.toFixed(2)} of the peak`);
  }
});

test("a click right next to a step change is not doubled up in the light styles", () => {
  const key = parseKey("A major");
  const near = tonalTrack([{ kind: "caption", t_ms: 400 }, { kind: "click", t_ms: 553 }], { key, durationMs: 1500, style: "light" });
  const alone = tonalTrack([{ kind: "caption", t_ms: 400 }], { key, durationMs: 1500, style: "light" });
  const a = rms(near, Math.round(0.545 * SR), Math.round(0.6 * SR));
  const b = rms(alone, Math.round(0.545 * SR), Math.round(0.6 * SR));
  assert.ok(Math.abs(a - b) / b < 0.2, "the click adds nothing audible on top of the bell");
});

test("the light and whisper styles dip the music much less than the normal ones", () => {
  assert.ok(STYLES.light.duck < STYLES.tonal.duck * 0.5);
  assert.equal(STYLES.whisper.duck, 0);
  assert.ok(STYLES.light.rms < STYLES.tonal.rms && STYLES.whisper.rms < STYLES.light.rms);
});
