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

function audioArgs(audio, seconds) {
  if (audio === "none") return ["-an"];
  const af = audio === "ok" ? "volume=9dB" : audio === "hot" ? "volume=30dB,alimiter=limit=1:level=disabled" : audio;
  return ["-map", "1:v", "-map", "0:a", "-af", af, "-c:a", "aac", "-b:a", "128k", "-t", String(seconds)];
}

// audio: "ok" (a 440 Hz tone at about -9 dB), "none", "hot" (clipping), or a custom ffmpeg -af chain applied to the tone
function fixture(id, { source, seconds = 12, size = "1080x1920", edl = {}, meta = {}, audio = "ok" }) {
  const dir = path.join(ROOT, "growth", "out", id);
  fs.mkdirSync(dir, { recursive: true });
  made.push(dir);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...(audio === "none" ? [] : ["-f", "lavfi", "-t", String(seconds), "-i", "sine=frequency=440:sample_rate=48000"]), "-f", "lavfi", "-i", `${source}${source.includes("=") ? ":" : "="}size=${size}:rate=30`, "-t", String(seconds), "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-c:v", "libx264", ...audioArgs(audio, seconds), path.join(dir, "reel.mp4")]);
  assert.equal(r.status, 0, String(r.stderr));
  const base = {
    endcard_start_ms: (seconds - 2) * 1000,
    layout: [{ kind: "caption", text: "Open galleries", x: 120, y: 330, w: 600, h: 90, clipped: false }],
    captions: [{ index: 0, text: "Open galleries", words: 2, start_ms: 0, end_ms: 2000 }],
    hook: "Short hook here",
    end: { claim: "All in one place", link: "snaphq.app" },
    clicks_total: 1,
    clicks_covered: 1,
    click_view: [{ event_index: 1, out_ms: 3000, box_visible: 1, point_visible: true }],
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
  const r = fixture("PP-993", { source: "testsrc2", edl: { end: { claim: "Studio plan is $29", link: "snaphq.app" } } });
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

test("a reel with no audio track fails the sfx check", () => {
  const r = fixture("PP-975", { source: "testsrc2", audio: "none" });
  assert.ok(r.report.failures.some((f) => f.startsWith("sfx track")), JSON.stringify(r.report.failures));
});

test("clipping audio fails the sfx level check", () => {
  const r = fixture("PP-974", { source: "testsrc2", audio: "hot" });
  assert.ok(r.report.failures.some((f) => f.startsWith("sfx level")), JSON.stringify(r.report.failures));
});

test("audio that is silent at a click fails, and passes where the sound is", () => {
  const audio = "volume=9dB,volume=0:enable='gte(t,2)'";
  const bad = fixture("PP-973", { source: "testsrc2", audio, edl: { highlights: [{ event_index: 1, out_ms: 6000 }] } });
  assert.ok(bad.report.failures.some((f) => f.startsWith("sfx on every click")), JSON.stringify(bad.report.failures));
  const good = fixture("PP-972", { source: "testsrc2", audio, edl: { highlights: [{ event_index: 1, out_ms: 500 }] } });
  assert.ok(!good.report.failures.some((f) => f.startsWith("sfx")), JSON.stringify(good.report.failures));
});

test("a click that is cut off or off screen fails, and so does missing visibility data", () => {
  const cutOff = fixture("PP-971", { source: "testsrc2", edl: { click_view: [{ event_index: 1, out_ms: 3000, box_visible: 0.2, point_visible: false }] } });
  assert.ok(cutOff.report.failures.some((f) => f.startsWith("every click is inside the frame")), JSON.stringify(cutOff.report.failures));
  const partial = fixture("PP-970", { source: "testsrc2", edl: { click_view: [{ event_index: 1, out_ms: 3000, box_visible: 0.9, point_visible: true }] } });
  assert.ok(partial.report.failures.some((f) => f.startsWith("every click is inside the frame")));
  const missing = fixture("PP-969", { source: "testsrc2", edl: { click_view: [] } });
  assert.ok(missing.report.failures.some((f) => f.includes("re-run edit.mjs")), JSON.stringify(missing.report.failures));
});
