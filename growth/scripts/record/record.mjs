#!/usr/bin/env node
// Record a demo take against staging.
//
//   node growth/scripts/record/record.mjs --pp PP-001 --take growth/storyboards/PP-001.take.mjs [--format desktop|phone] [--keep-lock]
//
// A take script is a module exporting:
//   export const format = "desktop" | "phone";                  // optional, default desktop
//   export async function fixture({ page, env, log }) {}        // optional: get to the starting screen
//   export async function run({ p, page, env }) {}              // the performance, via the performer API only
//   export async function teardown({ page, env, log }) {}       // optional: restore staging data the take changed
//
// Output (growth/recordings/<PP>/): frames/*.jpg, frames.json, cursor.json, raw.mp4, events.json
// Capture is a loop of full-resolution CDP screenshots (not Playwright recordVideo, not the 1x screencast),
// each with an exact timestamp. The cursor is not in the pixels: it is logged to cursor.json and drawn by the editor.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { loadEnv, launch, apiLogin, ROOT } from "./lib.mjs";
import { createPerformer, CURSOR_INIT } from "./performer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FORMATS = {
  desktop: { viewport: { width: 1360, height: 1020 }, dsf: 2, mobile: false },
  phone: { viewport: { width: 390, height: 693 }, dsf: 3, mobile: true },
};

function args() {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : undefined);
  return { pp: get("pp"), take: get("take"), format: get("format"), keepLock: a.includes("--keep-lock") };
}

function lockCmd(...a) {
  return spawnSync("node", [path.join(HERE, "..", "lock.mjs"), ...a], { encoding: "utf8" });
}

const { pp, take, format: formatFlag, keepLock } = args();
if (!pp || !/^PP-\d{3,}$/.test(pp) || !take) {
  console.error("usage: record.mjs --pp PP-### --take <take.mjs> [--format desktop|phone]");
  process.exit(2);
}

const seed = Number(pp.slice(3)) * 7919;
const outDir = path.join(ROOT, "growth", "recordings", pp);
const framesDir = path.join(outDir, "frames");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const owner = `recorder-${pp}`;
const got = lockCmd("acquire", "staging", "--by", owner, "--ttl", "45", "--wait", "600");
if (got.status !== 0) {
  console.error(`could not acquire the staging lock: ${got.stderr || got.stdout}`);
  process.exit(1);
}

let browser;
try {
  const mod = await import(pathToFileURL(path.resolve(ROOT, take)).href);
  const fmt = FORMATS[formatFlag ?? mod.format ?? "desktop"];
  if (!fmt) throw new Error(`unknown format ${formatFlag ?? mod.format}`);
  const env = loadEnv();

  browser = await launch();
  const context = await browser.newContext({
    viewport: fmt.viewport,
    deviceScaleFactor: fmt.dsf,
    isMobile: fmt.mobile,
    hasTouch: false,
    colorScheme: "light",
    reducedMotion: "no-preference",
    locale: "en-CA",
    timezoneId: "America/Toronto",
  });
  await context.addCookies(await apiLogin(env));
  await context.addInitScript(CURSOR_INIT);
  const page = await context.newPage();

  // ---- get to the starting screen WITHOUT recording
  const log = (m) => console.log(`[record] ${m}`);
  await mod.fixture?.({ page, env, log });
  await page.waitForTimeout(400);

  // ---- start the capture loop
  // Page.captureScreenshot with clip.scale gives true device-resolution frames (the screencast API is capped at 1x).
  // Each frame is stamped with the midpoint of its capture call, on the same clock the performer uses.
  const cdp = await context.newCDPSession(page);
  const frames = [];
  const epoch = Date.now();
  let capturing = true;
  let n = 0;
  const clip = { x: 0, y: 0, width: fmt.viewport.width, height: fmt.viewport.height, scale: fmt.dsf };
  const loop = (async () => {
    while (capturing) {
      const t0 = Date.now();
      try {
        const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip, optimizeForSpeed: true });
        const t1 = Date.now();
        const file = `${String(++n).padStart(6, "0")}.jpg`;
        fs.writeFileSync(path.join(framesDir, file), Buffer.from(shot.data, "base64"));
        frames.push({ file, t_ms: Math.round((t0 + t1) / 2 - epoch) });
      } catch (e) {
        if (capturing) throw e;
      }
    }
  })();

  const p = createPerformer(page, { seed, epoch, viewport: fmt.viewport });
  await p.placeCursor();
  await page.waitForTimeout(500); // a beat on the opening screen before anything moves
  await mod.run({ p, page, env, log });
  await page.waitForTimeout(600);
  p.finish();

  capturing = false;
  await loop.catch(() => {});
  // restore any staging data the take changed (e.g. a revoked link); failures are reported, never hidden
  try {
    await mod.teardown?.({ page, env, log });
  } catch (e) {
    console.error(`[record] WARNING teardown failed, staging data may need manual restore: ${e.message}`);
    process.exitCode = 1;
  }
  const duration = Date.now() - epoch;

  // ---- frames index (timestamps relative to the epoch the performer used)
  if (!frames.length) throw new Error("no frames captured");
  const index = frames.map((f) => ({ file: f.file, t_ms: Math.max(0, f.t_ms) })).sort((a, b) => a.t_ms - b.t_ms);
  const capFps = Math.round((index.length / duration) * 1000 * 10) / 10;
  fs.writeFileSync(path.join(outDir, "frames.json"), JSON.stringify({ capture: "cdp-screenshot", capture_fps: capFps, scale: fmt.dsf, width: fmt.viewport.width * fmt.dsf, height: fmt.viewport.height * fmt.dsf, frames: index }, null, 2));
  fs.writeFileSync(path.join(outDir, "cursor.json"), JSON.stringify({ path: p.path }));

  // ---- raw.mp4: constant 30 fps from the variable-rate screencast
  const list = [];
  for (let i = 0; i < index.length; i++) {
    const end = i + 1 < index.length ? index[i + 1].t_ms : duration;
    const dur = Math.max(0.001, (end - (i === 0 ? 0 : index[i].t_ms)) / 1000);
    list.push(`file '${index[i].file}'`, `duration ${dur.toFixed(4)}`);
  }
  list.push(`file '${index.at(-1).file}'`);
  fs.writeFileSync(path.join(framesDir, "list.txt"), list.join("\n") + "\n");
  const enc = spawnSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(framesDir, "list.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-movflags", "+faststart", path.join(outDir, "raw.mp4")],
    { encoding: "utf8" },
  );
  if (enc.status !== 0) throw new Error(`ffmpeg failed: ${enc.stderr}`);

  const eventsDoc = {
    version: 1,
    pain_point: pp,
    seed,
    viewport: fmt.viewport,
    device_scale_factor: fmt.dsf,
    fps: 30,
    duration_ms: duration,
    format: formatFlag ?? mod.format ?? "desktop",
    steps: p.steps,
    events: p.events,
  };
  fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify(eventsDoc, null, 2));
  console.log(JSON.stringify({ ok: true, raw: `growth/recordings/${pp}/raw.mp4`, events: `growth/recordings/${pp}/events.json`, duration_ms: duration, frames: index.length, capture_fps: capFps, steps: p.steps.length, events: p.events.length }));
} catch (e) {
  console.error(`[record] failed: ${e.stack || e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (!keepLock) lockCmd("release", "staging", "--by", owner);
}
