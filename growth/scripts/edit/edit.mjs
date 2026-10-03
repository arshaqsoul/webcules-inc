#!/usr/bin/env node
// Turn a recording into a 9:16 reel. Every effect is derived from events.json and cursor.json,
// never from guessing at pixels, and every output frame is a pure function of its timestamp.
//
//   node growth/scripts/edit/edit.mjs --pp PP-001 [--meta growth/storyboards/PP-001.meta.json] [--fast]
//
// Inputs : growth/recordings/<PP>/{frames.json, cursor.json, events.json, frames/*.jpg}
//          growth/storyboards/<PP>.meta.json   { hook, end:{claim,link,note?}, claims:[{text,source}], mark? }
// Outputs: growth/out/<PP>/{reel.mp4, cover.png, edl.json}
// Spec   : growth/DEMO-STANDARD.md

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { launch, ROOT } from "../record/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const W = 1080;
const H = 1920;
const HOOK_MS = 1500;
const END_MS = 1800;

const a = process.argv.slice(2);
const flag = (k) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : undefined);
const pp = flag("pp");
if (!pp || !/^PP-\d{3,}$/.test(pp)) {
  console.error("usage: edit.mjs --pp PP-### [--meta file] [--fast]");
  process.exit(2);
}
const fast = a.includes("--fast"); // lower quality, for iterating on the look

const recDir = path.join(ROOT, "growth", "recordings", pp);
const outDir = path.join(ROOT, "growth", "out", pp);
const metaPath = path.resolve(ROOT, flag("meta") ?? path.join("growth", "storyboards", `${pp}.meta.json`));
const need = (p) => {
  if (!fs.existsSync(p)) {
    console.error(`missing ${path.relative(ROOT, p)}`);
    process.exit(1);
  }
  return p;
};
const events = JSON.parse(fs.readFileSync(need(path.join(recDir, "events.json")), "utf8"));
const framesDoc = JSON.parse(fs.readFileSync(need(path.join(recDir, "frames.json")), "utf8"));
const cursorPath = JSON.parse(fs.readFileSync(need(path.join(recDir, "cursor.json")), "utf8")).path;
const meta = JSON.parse(fs.readFileSync(need(metaPath), "utf8"));
for (const k of ["hook", "end", "claims"]) if (!meta[k]) throw new Error(`meta.json needs "${k}"`);
if (!meta.end.claim || !meta.end.link) throw new Error('meta.end needs "claim" and "link"');

const frames = framesDoc.frames;
const vw = events.viewport.width;
const vh = events.viewport.height;
const format = events.format ?? "desktop";
const D = events.duration_ms;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (x, y, t) => x + (y - x) * t;

// ------------------------------------------------------------------ 1. speed ramps (dead time only)
function findStaticRuns() {
  // A JPEG of unchanged pixels is not always byte-identical, so compare decoded content cheaply:
  // same size within 0.15% AND same sampled bytes. Cursor motion is drawn separately and handled in protectedInterval.
  const bufs = frames.map((f) => fs.readFileSync(path.join(recDir, "frames", f.file)));
  const sig = (b) => crypto.createHash("md5").update(b.subarray(b.length >> 1, (b.length >> 1) + 4096)).digest("hex");
  const same = (x, y) => Math.abs(bufs[x].length - bufs[y].length) / bufs[x].length < 0.0015 && sig(bufs[x]) === sig(bufs[y]);
  const runs = [];
  let i = 0;
  while (i < frames.length) {
    let j = i;
    while (j + 1 < frames.length && same(i, j + 1)) j++;
    const s0 = frames[i].t_ms;
    const s1 = j + 1 < frames.length ? frames[j + 1].t_ms : D;
    if (s1 - s0 > 700) runs.push([s0, s1]);
    i = j + 1;
  }
  return runs;
}

function protectedInterval(s0, s1) {
  // never ramp over actions, or a hold the storyboard marked as the payoff
  for (const e of events.events) {
    if (["click", "type", "select", "scroll", "navigate"].includes(e.type) && e.t_ms >= s0 - 100 && e.t_ms <= s1 + 100) return true;
    if (e.type === "wait" && /payoff/i.test(e.text ?? "") && e.t_ms >= s0 - 1500 && e.t_ms <= s1) return true;
  }
  const inside = cursorPath.filter((p) => p.t_ms >= s0 && p.t_ms <= s1);
  if (inside.length) {
    const xs = inside.map((p) => p.x);
    const ys = inside.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) > 6 || Math.max(...ys) - Math.min(...ys) > 6) return true;
  }
  return false;
}

const ramps = [];
for (const [s0, s1] of findStaticRuns()) {
  if (protectedInterval(s0, s1)) continue;
  const r0 = s0 + 250;
  const r1 = s1 - 250;
  if (r1 - r0 >= 400) ramps.push({ s0: r0, s1: r1, speed: 4 });
}
// segments covering [0, D]
const segs = [];
let cursor = 0;
for (const r of ramps) {
  if (r.s0 > cursor) segs.push({ s0: cursor, s1: r.s0, speed: 1 });
  segs.push(r);
  cursor = r.s1;
}
if (cursor < D) segs.push({ s0: cursor, s1: D, speed: 1 });
let acc = 0;
for (const s of segs) {
  s.o0 = acc;
  acc += (s.s1 - s.s0) / s.speed;
  s.o1 = acc;
}
const MAIN_MS = acc;
// Inserted still scenes after the recording (for example the client's inbox). Each is a prepared 4:3 image with a slow push-in.
const insertDefs = (meta.inserts ?? []).map((ins) => {
  const abs = path.resolve(ROOT, ins.image);
  if (!fs.existsSync(abs)) throw new Error(`meta.inserts image missing: ${ins.image}`);
  if (!ins.caption || !ins.duration_ms) throw new Error("each meta.inserts item needs image, caption and duration_ms");
  return { ...ins, url: pathToFileURL(abs).href };
});
let insAcc = MAIN_MS;
for (const ins of insertDefs) {
  ins.o0 = insAcc;
  insAcc += ins.duration_ms;
  ins.o1 = insAcc;
}
const INS_END = insAcc;
const TOTAL_MS = INS_END + END_MS;
const srcToOut = (t) => {
  const s = segs.find((x) => t >= x.s0 && t <= x.s1) ?? segs.at(-1);
  return s.o0 + (clamp(t, s.s0, s.s1) - s.s0) / s.speed;
};
const outToSrc = (o) => {
  const s = segs.find((x) => o >= x.o0 && o <= x.o1) ?? segs.at(-1);
  return s.s0 + (clamp(o, s.o0, s.o1) - s.o0) * s.speed;
};

// ------------------------------------------------------------------ 2. zoom keyframes
const stepsList = events.steps.map((s, i) => ({ ...s, index: i, o0: srcToOut(s.t_start_ms), o1: srcToOut(s.t_end_ms) }));
const home = { z: 1, cx: vw / 2, cy: vh / 2 };
const keys = [{ t: 0, ...home }];
const zooms = [];
for (const st of stepsList) {
  const ev = events.events.find((e) => e.step === st.id && e.box && ["click", "type", "select", "annotate", "hover"].includes(e.type));
  if (!ev) continue;
  const maxW = format === "phone" ? 0.7 : 0.6;
  if (ev.box.w > maxW * vw) continue; // a wide target (table row, hero) reads better unzoomed
  const z = clamp((0.5 * vw) / ev.box.w, format === "phone" ? 1.35 : 1.6, format === "phone" ? 1.8 : 2.2);
  const tHit = srcToOut(ev.t_ms);
  const inStart = Math.max(650, tHit - 450);
  const inEnd = inStart + 350;
  const holdEnd = Math.max(inEnd + 300, st.o1);
  const target = { z, cx: ev.box.x + ev.box.w / 2, cy: ev.box.y + ev.box.h / 2 };
  let last = keys.at(-1);
  if (last.ret && last.t > inStart) keys.pop();
  last = keys.at(-1);
  if (inStart <= last.t) continue; // overlaps the previous window, skip rather than fight it
  keys.push({ t: inStart, z: last.z, cx: last.cx, cy: last.cy });
  keys.push({ t: inEnd, ...target });
  keys.push({ t: holdEnd, ...target });
  keys.push({ t: holdEnd + 350, ...home, ret: true });
  zooms.push({ step: st.id, in_ms: Math.round(inStart), hold_end_ms: Math.round(holdEnd), z: Math.round(z * 100) / 100 });
}
function viewAt(t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const A = keys[i];
    const B = keys[i + 1];
    if (t >= A.t && t <= B.t) {
      const k = B.t === A.t ? 1 : smooth((t - A.t) / (B.t - A.t));
      return { z: lerp(A.z, B.z, k), cx: lerp(A.cx, B.cx, k), cy: lerp(A.cy, B.cy, k) };
    }
  }
  return keys.at(-1);
}

// ------------------------------------------------------------------ 3. per-time lookups
function frameAt(tSrc) {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t_ms <= tSrc) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}
function cursorAt(tSrc) {
  const p = cursorPath;
  if (!p.length) return null;
  if (tSrc <= p[0].t_ms) return p[0];
  if (tSrc >= p.at(-1).t_ms) return p.at(-1);
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid].t_ms <= tSrc) lo = mid;
    else hi = mid;
  }
  const k = (tSrc - p[lo].t_ms) / Math.max(1, p[hi].t_ms - p[lo].t_ms);
  return { x: lerp(p[lo].x, p[hi].x, k), y: lerp(p[lo].y, p[hi].y, k) };
}
const kindEvents = events.events.filter((e) => e.cursor).sort((x, y) => x.t_ms - y.t_ms);
const kindAt = (tSrc) => {
  let k = "default";
  for (const e of kindEvents) {
    if (e.t_ms <= tSrc) k = e.cursor;
    else break;
  }
  return k;
};
const clicks = events.events.map((e, i) => ({ ...e, i })).filter((e) => e.type === "click" && e.box);
const typings = events.events.map((e, i) => ({ ...e, i })).filter((e) => (e.type === "type" || e.type === "select" || e.type === "annotate") && e.box);

// ------------------------------------------------------------------ 4. captions
const hookEnd = HOOK_MS + 50;
const caps = [];
for (const st of stepsList) {
  let start = Math.max(st.o0 - 150, meta.hook ? hookEnd : 0);
  let end = Math.max(st.o1, start + 1000);
  caps.push({ index: st.index, text: st.caption, start, end });
}
for (let i = 0; i < caps.length - 1; i++) caps[i].end = Math.min(caps[i].end, caps[i + 1].start);
const words = (s) => s.trim().split(/\s+/).length;

// ------------------------------------------------------------------ 5. frame state
function stateAt(tOut, { forCover = false } = {}) {
  const past = tOut >= MAIN_MS; // after the recording: inserted scenes, then the end card
  const inEnd = tOut >= INS_END;
  const ins = insertDefs.find((i) => tOut >= i.o0 && tOut < i.o1);
  const tSrc = past ? D : outToSrc(tOut);
  const f = frameAt(tSrc);
  const v = viewAt(Math.min(tOut, MAIN_MS));
  const breathe = 1 + 0.05 * (0.5 - 0.5 * Math.cos((2 * Math.PI * tOut) / 5000));
  const s = {
    src: pathToFileURL(path.join(recDir, "frames", f.file)).href,
    z: v.z * breathe,
    // a pan a quarter-phase behind the zoom drift: when the zoom pauses, the pan is at full speed, so the camera never fully stops
    cx: v.cx + 14 * Math.sin((2 * Math.PI * tOut) / 5000),
    cy: v.cy + 9 * Math.sin((2 * Math.PI * tOut) / 5000),
    highlights: [],
    ripples: [],
    select: null,
    cursor: null,
    caption: null,
    hook: null,
    dots: null,
    mark: null,
    ramp: false,
    end: null,
  };
  if (ins) {
    const e = clamp((tOut - ins.o0) / ins.duration_ms, 0, 1); // steady linear push-in: an eased one nearly stops at the end and reads as frozen
    const idx = stepsList.length + insertDefs.indexOf(ins);
    s.src = ins.url;
    s.z = lerp(1, ins.zoom_to ?? 1.06, e) * breathe;
    s.cx = (ins.focus?.[0] ?? 0.5) * vw;
    s.cy = (ins.focus?.[1] ?? 0.5) * vh;
    s.caption = { index: idx, text: ins.caption, alpha: clamp((tOut - ins.o0) / 150, 0, 1) * clamp((ins.o1 - tOut) / 150, 0, 1) };
    s.dots = { alpha: 1, index: idx };
    s.mark = meta.mark === false ? null : { alpha: 1 };
    return s;
  }
  if (tOut < MAIN_MS) {
    const c = cursorAt(tSrc);
    if (c) {
      const pressing = clicks.some((e) => tSrc >= e.t_ms && tSrc <= e.t_ms + 110);
      s.cursor = { visible: true, x: c.x, y: c.y, kind: kindAt(tSrc), press: pressing };
    }
    for (const e of clicks) {
      const t0 = srcToOut(e.t_ms);
      const alpha = clamp((tOut - (t0 - 250)) / 150, 0, 1) * clamp((t0 + 800 - tOut) / 300, 0, 1);
      if (alpha > 0) s.highlights.push({ box: e.box, alpha, pulse: 0.5 + 0.5 * Math.sin(((tOut - t0) / 450) * Math.PI) });
      const p = (tOut - t0) / 450;
      if (p > 0 && p < 1) s.ripples.push({ x: e.x, y: e.y, p });
    }
    for (const e of events.events.filter((x) => x.type === "select" && x.box)) {
      const open = e.t_ms + 120;
      const close = (e.commit_ms ?? e.t_ms + 1500) + 220;
      if (tSrc >= open && tSrc <= close) {
        const passed = (e.steps_ms ?? []).filter((t) => t <= tSrc).length;
        const dir = e.to > e.from ? 1 : -1;
        s.select = { box: e.box, options: e.options, index: tSrc >= (e.commit_ms ?? Infinity) ? e.to : e.from + dir * passed, alpha: clamp((tSrc - open) / 120, 0, 1) * clamp((close - tSrc) / 160, 0, 1) };
      }
    }
    for (const e of typings) {
      const t0 = srcToOut(e.t_ms);
      const nxt = events.events.find((x, i) => i > e.i && x.t_ms > e.t_ms + 50);
      const t1 = Math.min(nxt ? srcToOut(nxt.t_ms) : t0 + 2500, t0 + 3500);
      const alpha = clamp((tOut - t0) / 150, 0, 1) * clamp((t1 - tOut) / 250, 0, 1);
      if (alpha > 0) s.highlights.push({ box: e.box, alpha: alpha * 0.9, pulse: 0 });
    }
    if (meta.hook && !forCover && tOut < HOOK_MS) {
      s.hook = { text: meta.hook, alpha: clamp(tOut / 200, 0, 1) * clamp((HOOK_MS - tOut) / 250, 0, 1) };
    }
    const cap = caps.find((c2) => tOut >= c2.start && tOut <= c2.end);
    if (cap) s.caption = { index: cap.index, text: cap.text, alpha: clamp((tOut - cap.start) / 150, 0, 1) * clamp((cap.end - tOut) / 150, 0, 1) };
    const active = stepsList.filter((st) => tOut >= st.o0).at(-1) ?? stepsList[0];
    s.dots = { alpha: 1, index: active.index };
    s.mark = meta.mark === false ? null : { alpha: 1 };
    s.ramp = segs.some((x) => x.speed > 1 && tOut >= x.o0 && tOut <= x.o1);
  } else if (inEnd) {
    s.end = { alpha: clamp((tOut - INS_END) / 320, 0, 1) };
  }
  return s;
}

// ------------------------------------------------------------------ 6. render
function layoutFor() {
  if (format === "phone") return { x: 0, y: 0, w: W, h: H, r: 0, hookY: 340, capY: 300, dotsY: 1470, markY: 1520 };
  const w = 1020;
  const h = Math.round((w * vh) / vw);
  const y = 640;
  return { x: 30, y, w, h, r: 30, hookY: 310, capY: 330, dotsY: y + h + 70, markY: y + h + 150 };
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(pathToFileURL(path.join(HERE, "composer.html")).href);
await page.evaluate((cfg) => window.setup(cfg), {
  format,
  vw,
  vh,
  layout: layoutFor(),
  stepCount: stepsList.length + insertDefs.length,
  mark: meta.mark === false ? "" : (meta.mark ?? "snap.webcules.com"),
  end: meta.end,
});

const reelPath = path.join(outDir, "reel.mp4");
const ff = spawn(
  "ffmpeg",
  ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-vcodec", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", fast ? "veryfast" : "medium", "-crf", fast ? "24" : "17", "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-profile:v", "high", "-color_range", "tv", "-r", String(FPS), "-movflags", "+faststart", "-an", reelPath],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const ffDone = new Promise((res, rej) => {
  ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`))));
  ff.on("error", rej);
});

const layoutSeen = new Map();
const N = Math.ceil((TOTAL_MS / 1000) * FPS);
const started = Date.now();
for (let n = 0; n < N; n++) {
  const tOut = (n * 1000) / FPS;
  const state = stateAt(tOut);
  await page.evaluate((s) => window.render(s), state);
  if ((state.caption && state.caption.alpha > 0.99) || (state.hook && state.hook.alpha > 0.99) || (state.end && state.end.alpha > 0.99)) {
    const lay = await page.evaluate(() => window.layout());
    for (const l of lay) if (!layoutSeen.has(`${l.kind}:${l.text}`)) layoutSeen.set(`${l.kind}:${l.text}`, l);
  }
  const buf = await page.screenshot({ type: "jpeg", quality: fast ? 82 : 93 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (n % 90 === 0) process.stderr.write(`\r[edit] ${n}/${N} frames`);
}
ff.stdin.end();
await ffDone;
process.stderr.write(`\r[edit] ${N}/${N} frames in ${((Date.now() - started) / 1000).toFixed(0)}s\n`);

// cover: the payoff moment, with the step caption but no hook
const last = stepsList.at(-1);
const coverT = clamp(last.o1 - 400, 1200, MAIN_MS - 100);
await page.evaluate((s) => window.render(s), stateAt(coverT, { forCover: true }));
await page.screenshot({ path: path.join(outDir, "cover.png"), type: "png" });
await browser.close();

// ------------------------------------------------------------------ 7. EDL (the repeatable record of every decision)
const edl = {
  version: 1,
  pain_point: pp,
  fps: FPS,
  size: { width: W, height: H },
  format,
  duration_ms: Math.round(TOTAL_MS),
  main_ms: Math.round(MAIN_MS),
  endcard_start_ms: Math.round(INS_END),
  inserts: insertDefs.map((i) => ({ image: i.image, caption: i.caption, start_ms: Math.round(i.o0), end_ms: Math.round(i.o1) })),
  ramps: segs.filter((s) => s.speed > 1).map((s) => ({ out_start_ms: Math.round(s.o0), out_end_ms: Math.round(s.o1), src_start_ms: s.s0, src_end_ms: s.s1, speed: s.speed })),
  zooms,
  highlights: clicks.map((e) => ({ event_index: e.i, out_ms: Math.round(srcToOut(e.t_ms)) })),
  clicks_total: clicks.length,
  clicks_covered: clicks.length, // every click gets a highlight and ripple by construction
  captions: [
    ...caps.map((c) => ({ index: c.index, text: c.text, words: words(c.text), start_ms: Math.round(c.start), end_ms: Math.round(c.end) })),
    ...insertDefs.map((i, k) => ({ index: stepsList.length + k, text: i.caption, words: words(i.caption), start_ms: Math.round(i.o0), end_ms: Math.round(i.o1) })),
  ],
  hook: meta.hook,
  end: meta.end,
  claims: meta.claims,
  layout: [...layoutSeen.values()],
};
fs.writeFileSync(path.join(outDir, "edl.json"), JSON.stringify(edl, null, 2));
const mb = (fs.statSync(reelPath).size / 1e6).toFixed(1);
console.log(JSON.stringify({ ok: true, reel: path.relative(ROOT, reelPath), cover: path.relative(ROOT, path.join(outDir, "cover.png")), edl: path.relative(ROOT, path.join(outDir, "edl.json")), duration_s: Math.round(TOTAL_MS / 100) / 10, size_mb: Number(mb), ramps: edl.ramps.length, zooms: zooms.length }));
