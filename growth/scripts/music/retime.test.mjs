// Run: node --test growth/scripts/music/retime.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planWarp, warpTime, warpEdl, warpVideo } from "./retime.mjs";

const grid = { phase_s: 0.12, period_s: 0.6 }; // 100 BPM, a sixteenth every 150 ms
const slotMs = 150;
const onSlot = (u) => {
  const x = (u - 120) / slotMs;
  return Math.abs(x - Math.round(x)) * slotMs;
};
// cues at awkward times: a hook, steps, clicks and an end card
const cues = [
  { kind: "hook", t_ms: 60 },
  { kind: "caption", t_ms: 1550 },
  { kind: "click", t_ms: 3110 },
  { kind: "click", t_ms: 4380 },
  { kind: "caption", t_ms: 7918 },
  { kind: "ramp", t_ms: 9870, dur_ms: 500 },
  { kind: "click", t_ms: 11400 },
  { kind: "caption", t_ms: 15853 },
  { kind: "end", t_ms: 19133 },
];

test("every cue lands on a groove slot after the warp, and no stretch of picture changes speed much", () => {
  const plan = planWarp(cues, grid, { durationMs: 21000 });
  assert.ok(!plan.stats.infeasible);
  for (const a of plan.anchors) assert.ok(onSlot(a.u_ms) <= 1.5, `cue at ${a.t_ms} ms went to ${a.u_ms} ms, ${onSlot(a.u_ms).toFixed(1)} ms off a slot`);
  assert.ok(plan.stats.max_factor_dev <= 0.15, `speed change ${plan.stats.max_factor_dev}`);
  assert.equal(plan.stats.on_groove_ratio, 1);
});

test("the warp is monotonic and continuous, and the end card stretch plays at normal speed", () => {
  const plan = planWarp(cues, grid, { durationMs: 21000 });
  for (let i = 1; i < plan.points.length; i++) {
    assert.ok(plan.points[i].u > plan.points[i - 1].u && plan.points[i].t > plan.points[i - 1].t, `point ${i}`);
  }
  const n = plan.points.length;
  const tail = (plan.points[n - 1].u - plan.points[n - 2].u) / (plan.points[n - 1].t - plan.points[n - 2].t);
  assert.ok(Math.abs(tail - 1) < 1e-9, `end card speed ${tail}`);
  assert.equal(Math.round(warpTime(plan.points, 19133)), plan.anchors.at(-1).u_ms);
});

test("the end card goes to the nearest feasible beat and the picture before it absorbs the shift gently", () => {
  const plan = planWarp(cues, grid, { durationMs: 21000 });
  const end = plan.anchors.at(-1);
  assert.ok(Math.abs(end.shift_ms) <= 300, `the end card moved ${end.shift_ms} ms, more than half a beat`);
  const n = plan.points.length;
  const before = plan.points[n - 2]; // the end card anchor
  const prev = plan.points[n - 3];
  const f = (before.u - prev.u) / (before.t - prev.t);
  assert.ok(Math.abs(f - 1) <= 0.1, `the stretch of picture before the end card runs at ${f.toFixed(3)}x`);
});

test("two cues that cannot both be reached without distortion do not distort the picture", () => {
  // 100 ms apart on a grid with a 150 ms slot: one slot apart would be a 50 percent speed change, so the plan must not do it
  const tight = [{ kind: "click", t_ms: 2000 }, { kind: "click", t_ms: 2100 }, { kind: "end", t_ms: 6000 }];
  const plan = planWarp(tight, grid, { durationMs: 8000 });
  assert.ok(plan.stats.max_factor_dev <= 0.3, `speed change ${plan.stats.max_factor_dev}`);
});

test("warpEdl maps every output-time field and leaves source-time fields alone", () => {
  const plan = planWarp(cues, grid, { durationMs: 21000 });
  const edl = {
    duration_ms: 21000, main_ms: 19133, endcard_start_ms: 19133,
    captions: [{ start_ms: 1550, end_ms: 4000 }], highlights: [{ out_ms: 3110 }], click_view: [{ out_ms: 3110 }],
    ramps: [{ out_start_ms: 9870, out_end_ms: 10370, src_start_ms: 12000, src_end_ms: 14000 }], inserts: [], zooms: [{ in_ms: 1000, hold_end_ms: 3000 }],
    cursor_motion: [[1000, 1400]], sfx: { cue_list: [] },
  };
  const w = warpEdl(edl, plan.points);
  assert.equal(w.endcard_start_ms, plan.anchors.at(-1).u_ms);
  assert.equal(w.highlights[0].out_ms, w.click_view[0].out_ms);
  assert.equal(w.captions[0].start_ms, plan.anchors.find((a) => a.t_ms === 1550).u_ms);
  assert.equal(w.ramps[0].src_start_ms, 12000, "source-time field untouched");
  assert.equal(w.sfx, undefined);
  assert.ok(w.retimed);
  assert.equal(edl.captions[0].start_ms, 1550, "the input edit list is not mutated");
});

test("warpVideo really retimes: the output is as long as the plan says, at constant 30 fps", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "retime-"));
  const src = path.join(dir, "in.mp4");
  assert.equal(spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30", "-t", "8", "-pix_fmt", "yuv420p", "-c:v", "libx264", src]).status, 0);
  const points = [{ t: 0, u: 0 }, { t: 2000, u: 2100 }, { t: 5000, u: 4900 }, { t: 8000, u: 7900 }];
  const out = path.join(dir, "out.mp4");
  warpVideo({ reel: src, points, out });
  const p = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,duration", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout.trim().split(",");
  assert.equal(p[0], "30/1");
  assert.ok(Math.abs(parseFloat(p[1]) - 7.9) < 0.12, `duration ${p[1]}, wanted 7.9`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the end card lands on a beat, a step change on a beat or eighth, a click on any sixteenth", () => {
  const plan = planWarp(cues, grid, { durationMs: 21000 });
  const beat = 600; // 100 BPM
  const off = (u, div) => {
    const x = (u - 120) / (beat / div);
    return Math.abs(x - Math.round(x)) * (beat / div);
  };
  for (const a of plan.anchors) {
    if (a.kinds.includes("end")) assert.ok(off(a.u_ms, 1) <= 1.5, `end card ${a.u_ms} is ${off(a.u_ms, 1)} ms off a beat`);
    else if (a.kinds.includes("caption") || a.kinds.includes("hook")) assert.ok(off(a.u_ms, 2) <= 1.5, `step ${a.u_ms} is ${off(a.u_ms, 2)} ms off an eighth`);
    else assert.ok(off(a.u_ms, 4) <= 1.5, `click ${a.u_ms}`);
  }
});
