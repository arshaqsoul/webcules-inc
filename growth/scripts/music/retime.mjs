// Beat-locked retime: move the PICTURE onto the music, the way an editor cuts on the beat.
//
// A sound effect has to play at the exact moment of what you see, so the sound never moves. For the sound to also sit on the
// music's groove, the moment itself has to land on a groove slot. This nudges the video's timeline between cues, by a few percent of
// speed, so every click, step change and fast-forward falls on a sixteenth-note slot of the track. A segment that plays 4 percent
// faster or slower is not visible; a sound 50 ms late is.
//
//   planWarp(cues, grid, opts)   which slot each cue goes to, chosen so no stretch of video speeds up or slows down by much
//   warpEdl(edl, points)         the edit list with every output-time field mapped through the warp
//   warpVideo({reel, points})    the video itself, retimed and re-encoded

import fs from "node:fs";
import { spawnSync } from "node:child_process";

const WEIGHT = { hook: 2, caption: 3, ramp: 1.5, click: 1, end: 5 };
// which slots a kind of cue may land on, as a division of the beat: the end card on a beat, a step change or the hook on a beat or an
// eighth, the many small clicks and fast-forwards on any sixteenth. The important moments sit where the music itself puts its accents.
const DIVISION = { end: 1, caption: 2, hook: 2, ramp: 4, click: 4 };

/** Output time (ms) of original time t (ms) under the piecewise-linear warp `points` [{ t, u }] (sorted, t increasing). */
export function warpTime(points, t) {
  if (t <= points[0].t) return points[0].u + (t - points[0].t);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (t <= b.t) return a.u + ((t - a.t) * (b.u - a.u)) / (b.t - a.t);
  }
  const last = points.at(-1);
  return last.u + (t - last.t);
}

/**
 * Choose, for each cue time, a groove slot to move it onto, subject to the video never speeding up or slowing down much between cues.
 *
 * cues:  [{ t_ms, kind }]   (cuesFromEdl: hook, captions, clicks, ramp starts, the end card)
 * grid:  { phase_s, period_s }  of the FINAL timeline
 * opts:  { durationMs, subdivision = 4, soft = 0.06, hard = 0.30 }
 *        soft: a speed change up to this is free (6 percent); beyond it costs more and more.  hard: never beyond (30 percent).
 */
export function planWarp(cues, grid, { durationMs, subdivision = 4, soft = 0.06, hard = 0.3 } = {}) {
  const slot = (grid.period_s * 1000) / subdivision;
  const phase = grid.phase_s * 1000;

  // one anchor per distinct moment (cues within 20 ms are the same moment and share a slot)
  const anchors = [];
  for (const c of [...cues].sort((a, b) => a.t_ms - b.t_ms)) {
    const last = anchors.at(-1);
    const w = WEIGHT[c.kind] ?? 1;
    if (last && c.t_ms - last.t < 20) {
      last.w = Math.max(last.w, w);
      last.kinds.push(c.kind);
    } else anchors.push({ t: c.t_ms, w, kinds: [c.kind] });
  }
  if (!anchors.length) return { points: [{ t: 0, u: 0 }, { t: durationMs, u: durationMs }], anchors: [], stats: { max_factor_dev: 0, max_shift_ms: 0, mean_abs_shift_ms: 0, on_groove_ratio: 1, tol_ms: 20, duration_ms: durationMs } };

  // candidate slots for every anchor: the nearest and two either side, on the grid its most important cue is allowed to use
  for (const a of anchors) {
    const div = Math.min(...a.kinds.map((k) => DIVISION[k] ?? subdivision));
    const step = (grid.period_s * 1000) / div;
    const k0 = Math.round((a.t - phase) / step);
    a.cand = [];
    for (let k = k0 - 2; k <= k0 + 2; k++) {
      const u = phase + k * step;
      if (u >= 0) a.cand.push(u);
    }
    if (!a.cand.length) a.cand.push(a.t);
  }

  // A long stretch is judged by how much its SPEED changes (percent): a 6 percent change is invisible, 15 is not.
  // A short stretch between cues that sit close together is judged by how much its DURATION changes (milliseconds): a 14 percent speed
  // change over 130 ms moves the picture by under 20 ms, which no one can see, so percent would be the wrong measure and would force bad
  // choices elsewhere.
  const SHORT = 600;
  const segCost = (t0, u0, t1, u1) => {
    if (u1 <= u0) return Infinity;
    const len = t1 - t0;
    const abs = Math.abs(u1 - u0 - len);
    if (len < SHORT) {
      if (abs > 150) return Infinity;
      return 0.5 * Math.pow(abs / SHORT, 2) + (abs > 60 ? 40 * Math.pow((abs - 60) / 60, 2) : 0);
    }
    const dev = abs / len;
    if (dev > hard) return Infinity;
    return 0.5 * dev * dev + (dev > soft ? 40 * Math.pow((dev - soft) / soft, 2) : 0);
  };
  const posCost = (a, u) => a.w * 10 * Math.pow((u - a.t) / slot, 2);

  // dynamic programming over the anchors, from (0 -> 0)
  const n = anchors.length;
  const dp = anchors.map((a) => a.cand.map(() => ({ c: Infinity, from: -1 })));
  // the stretch from the very start to the first cue is a few frames at most, so it may start a little late: there is no speed to
  // distort, only a short delay before the first moment, so it is bounded by the shift alone (never earlier than 0)
  anchors[0].cand.forEach((u, j) => {
    const ok = u >= 0 && u - anchors[0].t <= 300;
    dp[0][j] = { c: ok ? posCost(anchors[0], u) : Infinity, from: -1 };
  });
  for (let i = 1; i < n; i++) {
    anchors[i].cand.forEach((u, j) => {
      anchors[i - 1].cand.forEach((up, jp) => {
        if (dp[i - 1][jp].c === Infinity) return;
        const c = dp[i - 1][jp].c + segCost(anchors[i - 1].t, up, anchors[i].t, u) + posCost(anchors[i], u);
        if (c < dp[i][j].c) dp[i][j] = { c, from: jp };
      });
    });
  }
  let j = dp[n - 1].reduce((best, x, idx, arr) => (x.c < arr[best].c ? idx : best), 0);
  if (dp[n - 1][j].c === Infinity) {
    // no feasible assignment under the hard limit: leave the picture alone rather than distort it
    return { points: [{ t: 0, u: 0 }, { t: durationMs, u: durationMs }], anchors: anchors.map((a) => ({ ...a, u: a.t })), stats: { max_factor_dev: 0, max_shift_ms: 0, mean_abs_shift_ms: 0, on_groove_ratio: 0, tol_ms: 20, duration_ms: durationMs, infeasible: true } };
  }
  const chosen = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    chosen[i] = anchors[i].cand[j];
    j = dp[i][j].from;
  }

  const points = [{ t: 0, u: 0 }, ...anchors.map((a, i) => ({ t: a.t, u: chosen[i] }))];
  // after the last anchor (the end card) the picture plays at its normal speed
  const last = points.at(-1);
  points.push({ t: durationMs, u: last.u + (durationMs - last.t) });

  let maxDev = 0;
  // the first stretch is exempt (see above). Percent is reported for long stretches, milliseconds for short ones.
  let maxShortMs = 0;
  for (let i = 2; i < points.length; i++) {
    const len = points[i].t - points[i - 1].t;
    const abs = Math.abs(points[i].u - points[i - 1].u - len);
    if (len >= SHORT) maxDev = Math.max(maxDev, abs / len);
    else maxShortMs = Math.max(maxShortMs, abs);
  }
  const shifts = anchors.map((a, i) => chosen[i] - a.t);
  const onGroove = anchors.filter((a, i) => Math.abs(((chosen[i] - phase) / slot) % 1 - Math.round(((chosen[i] - phase) / slot) % 1)) * slot <= 20).length;
  return {
    points,
    anchors: anchors.map((a, i) => ({ t_ms: Math.round(a.t), u_ms: Math.round(chosen[i]), shift_ms: Math.round(chosen[i] - a.t), kinds: a.kinds })),
    stats: {
      max_factor_dev: Math.round(maxDev * 1000) / 1000, // the biggest speed change over any stretch of 600 ms or more
      max_short_change_ms: Math.round(maxShortMs), // the biggest duration change over any shorter stretch
      max_shift_ms: Math.round(Math.max(...shifts.map(Math.abs))),
      mean_abs_shift_ms: Math.round(shifts.reduce((s, v) => s + Math.abs(v), 0) / shifts.length),
      on_groove_ratio: Math.round((onGroove / anchors.length) * 100) / 100,
      tol_ms: 20,
      duration_ms: Math.round(points.at(-1).u),
    },
  };
}

/** The edit list with every output-time field mapped through the warp. Source-time fields (recording timestamps) are left alone. */
export function warpEdl(edl, points) {
  const w = (t) => Math.round(warpTime(points, t));
  const e = JSON.parse(JSON.stringify(edl));
  for (const k of ["duration_ms", "main_ms", "endcard_start_ms"]) if (typeof e[k] === "number") e[k] = w(e[k]);
  for (const c of e.captions ?? []) {
    c.start_ms = w(c.start_ms);
    c.end_ms = w(c.end_ms);
  }
  for (const h of e.highlights ?? []) h.out_ms = w(h.out_ms);
  for (const v of e.click_view ?? []) if (typeof v.out_ms === "number") v.out_ms = w(v.out_ms);
  for (const r of e.ramps ?? []) {
    r.out_start_ms = w(r.out_start_ms);
    r.out_end_ms = w(r.out_end_ms);
  }
  for (const i of e.inserts ?? []) {
    i.start_ms = w(i.start_ms);
    i.end_ms = w(i.end_ms);
  }
  for (const z of e.zooms ?? []) {
    if (typeof z.in_ms === "number") z.in_ms = w(z.in_ms);
    if (typeof z.hold_end_ms === "number") z.hold_end_ms = w(z.hold_end_ms);
  }
  if (Array.isArray(e.cursor_motion)) e.cursor_motion = e.cursor_motion.map(([a, b]) => [w(a), w(b)]);
  delete e.sfx; // the old classic-effects cue list refers to the un-warped timeline
  e.retimed = true;
  return e;
}

/** Re-time the video through the warp (speed up or slow down each stretch), constant 30 fps, no audio. */
export function warpVideo({ reel, points, out }) {
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (b.t - a.t < 1) continue;
    segs.push({ t0: a.t / 1000, t1: b.t / 1000, f: (b.u - a.u) / (b.t - a.t) });
  }
  const labels = segs.map((_, i) => `[s${i}]`).join("");
  const parts = [`[0:v]split=${segs.length}${labels}`];
  segs.forEach((s, i) => parts.push(`[s${i}]trim=start=${s.t0.toFixed(4)}:end=${s.t1.toFixed(4)},setpts=(PTS-STARTPTS)*${s.f.toFixed(6)}[t${i}]`));
  parts.push(`${segs.map((_, i) => `[t${i}]`).join("")}concat=n=${segs.length}:v=1:a=0,fps=30,format=yuv420p[v]`);
  // the graph goes inline: newer ffmpeg builds dropped -filter_complex_script
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", reel, "-filter_complex", parts.join(";"), "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg retime failed: ${r.stderr}`);
}
