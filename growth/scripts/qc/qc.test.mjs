// Run: node --test growth/scripts/qc/qc.test.mjs
// Proves QC can FAIL: a frozen reel, an off-spec reel and an unbacked claim must not pass.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const QC = path.join(HERE, "qc.mjs");
const made = [];

function fixture(id, { source, seconds = 12, size = "1080x1920", edl = {}, meta = {} }) {
  const dir = path.join(ROOT, "growth", "out", id);
  fs.mkdirSync(dir, { recursive: true });
  made.push(dir);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `${source}${source.includes("=") ? ":" : "="}size=${size}:rate=30`, "-t", String(seconds), "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-c:v", "libx264", "-an", path.join(dir, "reel.mp4")]);
  assert.equal(r.status, 0, String(r.stderr));
  const base = {
    endcard_start_ms: (seconds - 2) * 1000,
    layout: [{ kind: "caption", text: "Open galleries", x: 120, y: 330, w: 600, h: 90, clipped: false }],
    captions: [{ index: 0, text: "Open galleries", words: 2, start_ms: 0, end_ms: 2000 }],
    hook: "Short hook here",
    end: { claim: "All in one place", link: "snap.webcules.com" },
    clicks_total: 1,
    clicks_covered: 1,
    claims: [],
    ...edl,
  };
  fs.writeFileSync(path.join(dir, "edl.json"), JSON.stringify(base));
  const metaFile = path.join(dir, "meta.json");
  fs.writeFileSync(metaFile, JSON.stringify({ claims: [], ...meta }));
  const out = spawnSync("node", [QC, "--pp", id, "--meta", metaFile], { encoding: "utf8" });
  return { status: out.status, report: JSON.parse(fs.readFileSync(path.join(dir, "qc.json"), "utf8")) };
}

after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

test("a moving 1080x1920 reel passes", () => {
  const r = fixture("PP-990", { source: "testsrc2" });
  assert.equal(r.report.pass, true, JSON.stringify(r.report.failures));
});

test("a frozen reel fails", () => {
  const r = fixture("PP-991", { source: "color=c=white" });
  assert.equal(r.report.pass, false);
  assert.ok(r.report.failures.some((f) => f.startsWith("no frozen frames")), JSON.stringify(r.report.failures));
});

test("wrong size fails", () => {
  const r = fixture("PP-992", { source: "testsrc2", size: "1280x720" });
  assert.ok(r.report.failures.some((f) => f.startsWith("resolution")));
});

test("unbacked price on screen fails the claims check", () => {
  const r = fixture("PP-993", { source: "testsrc2", edl: { end: { claim: "Studio plan is $29", link: "snap.webcules.com" } } });
  assert.ok(r.report.failures.some((f) => f.startsWith("claims backed")), JSON.stringify(r.report.failures));
});

test("a long caption and an out-of-zone caption fail", () => {
  const r = fixture("PP-994", {
    source: "testsrc2",
    edl: {
      captions: [{ index: 0, text: "This caption has far too many words", words: 7, start_ms: 0, end_ms: 2000 }],
      layout: [{ kind: "caption", text: "x", x: 900, y: 100, w: 400, h: 90, clipped: false }],
    },
  });
  assert.ok(r.report.failures.some((f) => f.startsWith("captions are short")));
  assert.ok(r.report.failures.some((f) => f.startsWith("text inside safe zones")));
});

test("a still stretch is excused only where the cursor visibly travels", () => {
  // a fully still reel: fails with no cursor travel, passes when the logged cursor travel covers the still stretch
  const still = fixture("PP-978", { source: "color=c=white" });
  assert.equal(still.report.pass, false);
  const covered = fixture("PP-977", { source: "color=c=white", edl: { cursor_motion: [[0, 10000]] } });
  assert.ok(!covered.report.failures.some((f) => f.startsWith("no frozen frames")), JSON.stringify(covered.report.failures));
  // travel that covers only a small part of the stretch does not excuse it
  const partial = fixture("PP-976", { source: "color=c=white", edl: { cursor_motion: [[0, 1000]] } });
  assert.ok(partial.report.failures.some((f) => f.startsWith("no frozen frames")));
});
