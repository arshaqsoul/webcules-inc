// Run: node --test growth/scripts/music/sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyEvents, planGrid, alignToBeats, alignmentScore } from "./sync.mjs";

// a reel whose step changes happen to fall on a 104 BPM grid whose first beat is at 0.37 s, with a little human jitter
const P = 60 / 104;
const on = (k, jitter = 0) => 0.37 + k * P + jitter;
const edl = {
  hook: "Hook",
  captions: [{ start_ms: Math.round(on(2) * 1000) }, { start_ms: Math.round(on(6, 0.012) * 1000) }, { start_ms: Math.round(on(10, -0.01) * 1000) }, { start_ms: Math.round(on(15) * 1000) }],
  endcard_start_ms: Math.round(on(20) * 1000),
  highlights: [{ out_ms: Math.round(on(7, 0.05) * 1000) }],
};

test("key events: hook, every step change, the end card (heaviest), and clicks (lightest)", () => {
  const ev = keyEvents(edl);
  assert.equal(ev.filter((e) => e.kind === "step").length, 4);
  assert.equal(ev.find((e) => e.kind === "end").w, 2);
  assert.ok(ev.find((e) => e.kind === "click").w < 0.5);
  assert.deepEqual(ev.map((e) => e.t), [...ev.map((e) => e.t)].sort((a, b) => a - b));
});

test("planGrid recovers a tempo whose grid fits the moments", () => {
  const plan = planGrid(keyEvents(edl));
  // any tempo whose beats fit every moment is a good answer, so judge by the fit, not by the number
  assert.ok(plan.cost < 0.2, `cost ${plan.cost}`);
  assert.ok(Number.isInteger(plan.bpm) && plan.bpm >= 88 && plan.bpm <= 132);
});

test("a tempo that does not fit is worse than the planned one", () => {
  const ev = keyEvents(edl);
  const plan = planGrid(ev);
  const awkward = planGrid(ev, { bpmMin: 131, bpmMax: 131 });
  assert.ok(plan.cost <= awkward.cost);
});

test("alignToBeats fixes a generator that came out 4 percent slow with an arbitrary first beat", () => {
  const ev = keyEvents(edl);
  // asked for 104, the generator delivered 100 BPM and its first beat sits at 0.2 s
  const a = alignToBeats(ev, { bpm0: 100, phase0: 0.2, target_bpm: 104 });
  assert.ok(a.rate > 1.02 && a.rate < 1.07, `rate ${a.rate}`);
  const score = alignmentScore(a.deviations, 70);
  assert.ok(score.ratio >= 0.8, `only ${(score.ratio * 100).toFixed(0)} percent within 70 ms: ${JSON.stringify(a.deviations)}`);
  assert.ok(a.trim_s >= 0 && a.trim_s < 4 * 0.6, `trim ${a.trim_s}`);
});

test("alignToBeats never over-stretches: the rate stays within 8 percent", () => {
  const a = alignToBeats(keyEvents(edl), { bpm0: 90, phase0: 0.05, target_bpm: 104 });
  assert.ok(a.rate >= 0.92 - 1e-9 && a.rate <= 1.08 + 1e-9, `rate ${a.rate}`);
});

test("alignmentScore only counts non-click moments and respects the tolerance", () => {
  const dev = [
    { kind: "step", dev_ms: 20, w: 1 },
    { kind: "step", dev_ms: 90, w: 1 },
    { kind: "end", dev_ms: 10, w: 2 },
    { kind: "click", dev_ms: 400, w: 0.25 },
  ];
  const s = alignmentScore(dev, 70);
  assert.equal(s.total, 3);
  assert.equal(s.within, 2);
  assert.ok(Math.abs(s.ratio - 0.75) < 1e-9);
});
