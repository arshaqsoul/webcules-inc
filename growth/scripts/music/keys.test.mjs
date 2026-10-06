// Run: node --test growth/scripts/music/keys.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKey, keyName, freq, scaleNote, triad, pentNote, estimateKey } from "./keys.mjs";
import { AN_SR } from "./beats.mjs";

test("note frequencies are right: A4 is 440, middle C is 261.63", () => {
  assert.ok(Math.abs(freq(9, 4) - 440) < 1e-9);
  assert.ok(Math.abs(freq(0, 4) - 261.6256) < 0.001);
  assert.ok(Math.abs(freq(9, 3) - 220) < 1e-9);
});

test("key names parse, including sharps and flats", () => {
  assert.deepEqual(parseKey("G major"), { tonic: 7, mode: "major" });
  assert.deepEqual(parseKey("F# minor"), { tonic: 6, mode: "minor" });
  assert.deepEqual(parseKey("Bb major"), { tonic: 10, mode: "major" });
  assert.deepEqual(parseKey("Eb minor"), { tonic: 3, mode: "minor" });
  assert.equal(keyName(parseKey("a minor")), "A minor");
  assert.throws(() => parseKey("H major"));
});

test("a G major triad is G B D, an E minor triad is E G B", () => {
  const g = parseKey("G major");
  const t = triad(g, 0, 4).map((f) => Math.round(f));
  assert.deepEqual(t, [Math.round(freq(7, 4)), Math.round(freq(11, 4)), Math.round(freq(2, 5))]);
  const e = triad(g, 5, 4).map((f) => Math.round(f)); // vi chord
  assert.deepEqual(e, [Math.round(freq(4, 5)), Math.round(freq(7, 5)), Math.round(freq(11, 5))]);
});

test("every pentatonic note belongs to the key's scale, in major and minor", () => {
  for (const name of ["G major", "A minor", "F# minor", "Eb major"]) {
    const k = parseKey(name);
    const inScale = new Set([0, 2, 4, 5, 7, 9, 11].map((s) => (k.tonic + s) % 12));
    const minor = new Set([0, 2, 3, 5, 7, 8, 10].map((s) => (k.tonic + s) % 12));
    for (let n = 0; n < 15; n++) {
      const pc = ((Math.round(12 * Math.log2(pentNote(k, n, 5) / 440) + 69) % 12) + 12) % 12;
      assert.ok((k.mode === "major" ? inScale : minor).has(pc), `${name} note ${n} is pitch class ${pc}`);
    }
  }
});

/** A chord progression rendered as stacked sines with a few harmonics, a stand-in for real music in a known key. */
function progression(key, degrees, seconds = 24) {
  const n = Math.round(seconds * AN_SR);
  const x = new Float32Array(n);
  const per = Math.floor(n / (degrees.length * 2));
  for (let i = 0; i < n; i++) {
    const d = degrees[Math.floor(i / per) % degrees.length];
    for (const f of triad(key, d, 3)) for (const h of [1, 2, 3]) x[i] += (0.25 / h) * Math.sin((2 * Math.PI * f * h * i) / AN_SR);
    x[i] += 0.3 * Math.sin((2 * Math.PI * scaleNote(key, d, 2) * i) / AN_SR); // bass
  }
  return x;
}

test("detects the key of a G major progression", () => {
  const k = estimateKey(progression(parseKey("G major"), [0, 3, 4, 0]));
  assert.equal(k.tonic, 7, `tonic ${k.tonic}`);
  assert.equal(k.mode, "major");
});

test("detects a minor key and a different tonic", () => {
  // a progression that keeps coming home to the minor tonic (i iv v i i). A progression centred on the relative major chord
  // would legitimately read as the relative major: the two share the same seven notes, and the sound effects use the same notes either way.
  const k = estimateKey(progression(parseKey("F# minor"), [0, 0, 3, 4, 0, 0]));
  assert.equal(k.tonic, 6, `tonic ${k.tonic}`);
  assert.equal(k.mode, "minor");
});
