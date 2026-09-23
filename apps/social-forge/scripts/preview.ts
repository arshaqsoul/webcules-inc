import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SOCIAL_ROOT, ensureDir, flagStr, log, resolveFfmpeg, parseArgs, sleep } from "../src/social/util.ts";

const require = createRequire(import.meta.url);

/**
 * Capture an animated WebP preview (plus a poster frame) of a component's demo page
 * into webcules/social/<slug>/docs/. Used by the registry packager and storefront.
 *
 * usage: node scripts/preview.ts <slug> [--url http://127.0.0.1:4322] [--path /demo/<slug>] [--seconds 4] [--variant neural]
 *        pass --selector "canvas" to record an element (e.g. the docs playground stage) instead of the viewport
 */
const slug = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
if (!slug) {
  console.error("usage: node scripts/preview.ts <slug> [--url u] [--path p] [--seconds 4] [--variant v] [--selector s]");
  process.exit(1);
}
const args = parseArgs(process.argv.slice(2));
const url = (flagStr(args, "url") ?? process.env.URL ?? "http://127.0.0.1:4322").replace(/\/$/, "");
// --path records any page (default: the demo gallery); e.g. the landing docs playground
const basePath = flagStr(args, "path") ?? `/demo/${slug}`;
const seconds = Number(flagStr(args, "seconds") ?? 4);
const variant = flagStr(args, "variant") ?? "neural";
const selector = flagStr(args, "selector") ?? "";

const { chromium } = require("playwright");
const ffmpeg = resolveFfmpeg();
const { spawnSync } = await import("node:child_process");

const docsDir = path.join(SOCIAL_ROOT, slug, "docs");
const framesDir = path.join(docsDir, ".frames");
ensureDir(framesDir);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
// networkidle never settles on a dev server with an animated canvas — use domcontentloaded
await page.goto(`${url}${basePath}?variant=${variant}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000); // let the intro settle
const stage = selector ? page.locator(selector).first() : null;
if (stage) await stage.scrollIntoViewIfNeeded().catch(() => {});

const fps = 10;
const count = Math.round(seconds * fps);
for (let i = 0; i < count; i++) {
  if (stage) await stage.screenshot({ path: path.join(framesDir, `f-${String(i).padStart(3, "0")}.png`) });
  else await page.screenshot({ path: path.join(framesDir, `f-${String(i).padStart(3, "0")}.png`) });
  await sleep(1000 / fps);
}
// poster: one clean high-res frame
const poster = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await poster.goto(`${url}${basePath}?variant=${variant}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await poster.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
await poster.waitForTimeout(4500);
const posterStage = selector ? poster.locator(selector).first() : null;
if (posterStage) await posterStage.scrollIntoViewIfNeeded().catch(() => {});
if (posterStage) await posterStage.screenshot({ path: path.join(framesDir, "poster.png") });
else await poster.screenshot({ path: path.join(framesDir, "poster.png") });
await browser.close();

const run = (args: string[]) => {
  const r = spawnSync(ffmpeg, args, { stdio: "pipe" });
  if (r.status !== 0) {
    console.error(r.stderr?.toString().slice(-800));
    process.exit(1);
  }
};
const previewPath = path.join(docsDir, `${slug}-preview.webp`);
run(["-y", "-framerate", String(fps), "-i", path.join(framesDir, "f-%03d.png"), "-c:v", "libwebp", "-q:v", "62", "-loop", "0", "-an", "-vsync", "0", previewPath]);
const posterPath = path.join(docsDir, `${slug}-poster.webp`);
run(["-y", "-i", path.join(framesDir, "poster.png"), "-c:v", "libwebp", "-q:v", "80", posterPath]);
fs.rmSync(framesDir, { recursive: true, force: true });

const kb = (p: string) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;
log.ok(`preview : ${path.relative(SOCIAL_ROOT, previewPath)} (${kb(previewPath)})`);
log.ok(`poster  : ${path.relative(SOCIAL_ROOT, posterPath)} (${kb(posterPath)})`);
