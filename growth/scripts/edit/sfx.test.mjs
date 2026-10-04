// Run: node --test growth/scripts/edit/sfx.test.mjs
// Proves the sound effects are derived from the edl, deterministic, aligned to their cue times, and muxed without touching the video.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cuesFromEdl, synthesize, addSfx, SR, PEAK_DB } from "./sfx.mjs";

const edl = {
  duration_ms: 8000,
  endcard_start_ms: 6200,
  hook: "Juggling four tools?",
  captions: [{ start_ms: 1550 }, { start_ms: 4000 }],
  zooms: [
    { in_ms: 2000, hold_end_ms: 3800 },
    { in_ms: 4300, hold_end_ms: 6200 },
  ],
  highlights: [{ out_ms: 3000 }, { out_ms: 5000 }],
  ramps: [{ out_start_ms: 3900, out_end_ms: 4100 }],
};

const rms = (x, ms, len = 60) => {
  const i0 = Math.round((ms / 1000) * SR);
  const n = Math.round((len / 1000) * SR);
  let s = 0;
  for (let i = i0; i < Math.min(x.length, i0 + n); i++) s += x[i] * x[i];
  return Math.sqrt(s / n);
};

test("cues come from the edl and are sorted", () => {
  const cues = cuesFromEdl(edl);
  const kinds = (k) => cues.filter((c) => c.kind === k).map((c) => c.t_ms);
  assert.deepEqual(kinds("click"), [3000, 5000]);
  assert.deepEqual(kinds("caption"), [1550, 4000]);
  assert.equal(cues.some((c) => c.kind.startsWith("zoom")), false, "zooms are silent");
  assert.deepEqual(kinds("end"), [6200]);
  assert.equal(cues.find((c) => c.kind === "ramp").dur_ms, 260, "a short ramp still gets a whole-enough zip");
  assert.deepEqual(cues.map((c) => c.t_ms), cues.map((c) => c.t_ms).sort((a, b) => a - b));
  assert.equal(cuesFromEdl({ ...edl, hook: "" }).some((c) => c.kind === "hook"), false);
});

test("synthesis is deterministic, exactly as long as asked, and peaks at the target", () => {
  const a = synthesize(cuesFromEdl(edl), 8000);
  const b = synthesize(cuesFromEdl(edl), 8000);
  assert.equal(a.length, 8 * SR);
  assert.equal(crypto.createHash("sha1").update(a).digest("hex"), crypto.createHash("sha1").update(b).digest("hex"));
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  assert.ok(Math.abs(20 * Math.log10(peak) - PEAK_DB) < 0.2, `peak ${20 * Math.log10(peak)} dB`);
});

test("sound starts at each cue and the gaps between cues are silent", () => {
  const x = synthesize(cuesFromEdl(edl), 8000);
  assert.ok(rms(x, 3000) > 0.01, "audible at the click");
  assert.ok(rms(x, 5300, 800) < 1e-4, "silent in the gap between the last click and the end card");
  assert.ok(rms(x, 0, 50) < 1e-4, "silent before the first cue");
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sfx-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("muxing keeps every video frame untouched and matches the video length", () => {
  const reel = path.join(tmp, "reel.mp4");
  const make = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=270x480:rate=30", "-t", "8", "-c:v", "libx264", "-an", reel]);
  assert.equal(make.status, 0, String(make.stderr));
  const vhash = () => spawnSync("ffmpeg", ["-v", "error", "-i", reel, "-map", "0:v", "-c", "copy", "-f", "md5", "-"], { encoding: "utf8" }).stdout;
  const frames = () => spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", reel], { encoding: "utf8" }).stdout;
  const before = { v: vhash(), f: frames() };
  addSfx(reel, edl, {});
  const info = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,duration", "-of", "json", reel], { encoding: "utf8" }).stdout);
  const v = info.streams.find((s) => s.codec_type === "video");
  const au = info.streams.find((s) => s.codec_type === "audio");
  assert.equal(au.codec_name, "aac");
  assert.ok(Math.abs(Number(au.duration) - Number(v.duration)) <= 0.05);
  assert.deepEqual({ v: vhash(), f: frames() }, before);
  // a second run replaces the track rather than stacking another
  addSfx(reel, edl, {});
  assert.equal(JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", reel], { encoding: "utf8" }).stdout).streams.filter((s) => s.codec_type === "audio").length, 1);
});
