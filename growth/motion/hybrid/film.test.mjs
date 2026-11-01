// Run: node --test growth/motion/hybrid/film.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { timeline, anchor, placeLines, fitTempo, sections, camera } from "./film.mjs";

const shots = [{ name: "open" }, { name: "beach" }, { name: "city" }];
const tl = timeline(shots, { open: 90, beach: 60, city: 45 });

test("timeline stacks shots in order from frame counts", () => {
  assert.deepEqual(tl.shots.open, { at: 0, dur: 3 });
  assert.deepEqual(tl.shots.beach, { at: 3, dur: 2 });
  assert.deepEqual(tl.shots.city, { at: 5, dur: 1.5 });
  assert.equal(tl.end, 6.5);
  assert.throws(() => timeline([{ name: "x" }], {}), /no frames for shot "x"/);
});

test("anchors count from a shot's start, or back from its end when negative", () => {
  assert.equal(anchor({ shot: "beach", at: 0.5 }, tl), 3.5);
  assert.equal(anchor({ shot: "beach", at: -0.5 }, tl), 4.5);
  assert.equal(anchor({ shot: "city" }, tl), 5);
  assert.equal(anchor("end", tl), 6.5);
  assert.equal(anchor({ shot: "end", at: 0.4 }, tl), 6.9);
  assert.throws(() => anchor({ shot: "nope" }, tl), /unknown shot/);
});

test("voice-over lines must be in order, inside the film and not overlap", () => {
  const ok = placeLines([{ shot: "open", at: 0.4, text: "a", fit: 2 }, { shot: "beach", at: 0, text: "b" }], tl, 9);
  assert.deepEqual(ok.map((l) => l.start), [0.4, 3]);
  assert.throws(() => placeLines([{ shot: "open", at: 0.4, text: "a", fit: 3 }, { shot: "beach", at: 0, text: "b" }], tl, 9), /runs into line 1/);
  assert.throws(() => placeLines([{ shot: "beach", text: "a" }, { shot: "open", text: "b" }], tl, 9), /out of order/);
  assert.throws(() => placeLines([{ shot: "end", at: 5, text: "a" }], tl, 9), /outside the film/);
});

test("fitTempo stretches toward the slot but never past a natural range", () => {
  assert.equal(fitTempo(2, null), 1);
  assert.equal(fitTempo(2, 2), 1);
  assert.equal(fitTempo(2.2, 2), 1.1);
  assert.equal(fitTempo(4, 2), 1.2);
  assert.equal(fitTempo(1, 2), 0.85);
});

test("score sections resolve anchors and may not leave silent gaps", () => {
  const s = sections([{ tags: "a", to: { shot: "city" } }, { tags: "b", from: { shot: "city" } }], tl, 9);
  assert.deepEqual(s.map((c) => [c.start, c.end]), [[0, 5], [5, 9]]);
  assert.throws(() => sections([{ tags: "a", to: { shot: "beach" } }, { tags: "b", from: { shot: "city" } }], tl, 9), /silent gap/);
});

test("camera builds one zoompan filter, or nothing without a camera", () => {
  assert.equal(camera(undefined, 3), "");
  assert.equal(camera({}, 3), "");
  const f = camera({ push: { zoom: 4, from: 0.6, at: [0.51, 0.53] }, drift: { zoom: [1, 1.05] } }, 3);
  assert.match(f, /^scale=1620:2880:flags=lanczos,zoompan=z='/);
  assert.match(f, /gt\(\(in\/30\),2\.4\),0\.51/);
  assert.match(f, /s=1080x1920:fps=30$/);
  assert.match(camera({ whip: "out" }, 1), /tmix=frames=3$/);
});
