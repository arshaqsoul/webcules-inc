import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { FORGE_ROOT, SOCIAL_ROOT, ensureDir, flagStr, log, readManifest, requireConfirmed, resolveFfmpeg, writeManifest, sleep, type Args } from "./util.ts";

// playwright + ffmpeg-static are dev-time tools; loaded lazily so the rest of the CLI works without them.
const require = createRequire(import.meta.url);

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

/** Any HTTP response counts — the render target may be the demo gallery or the landing app (which has no /api/health). */
async function healthy(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

/** Returns the demo server URL, spawning `astro dev` if none is running. */
async function ensureServer(flagUrl?: string): Promise<{ url: string; child?: ChildProcess }> {
  if (flagUrl || process.env.SOCIAL_FORGE_URL) {
    const url = (flagUrl ?? process.env.SOCIAL_FORGE_URL)!;
    if (!(await healthy(url))) {
      log.err(`server at ${url} is not responding`);
      process.exit(1);
    }
    return { url: url.replace(/\/$/, "") };
  }
  for (const port of [4322, 4323]) {
    const url = `http://127.0.0.1:${port}`;
    if (await healthy(url)) return { url };
  }
  log.info("no demo server found — starting astro dev on :4322 …");
  const child = spawn("pnpm", ["exec", "astro", "dev", "--port", "4322"], { cwd: FORGE_ROOT, shell: true, stdio: "ignore", detached: false });
  const url = "http://127.0.0.1:4322";
  for (let i = 0; i < 90; i++) {
    if (await healthy(url)) return { url, child };
    if (i === 5 && child.exitCode != null) {
      log.err("astro dev died immediately — run `pnpm --filter @webcules/social-forge dev` and read the error");
      process.exit(1);
    }
    await sleep(1000);
  }
  killTree(child);
  log.err("demo server did not become healthy within 90s");
  process.exit(1);
}

export async function cmdRender(args: Args) {
  const slug = flagStr(args, "project");
  if (!slug) log.err("usage: social render --project <slug> [--url http://…] [--seconds 8]") || process.exit(1);
  const m = readManifest(slug);
  requireConfirmed(m, "render");
  const variants = Object.keys(m.variants ?? {});
  if (!variants.length) {
    log.err("manifest has no variants — define at least one (e.g. \"neural\": { \"primary\": \"#f5b04c\", \"secondary\": \"#38bdf8\" })");
    process.exit(1);
  }

  let playwright: typeof import("playwright");
  try {
    playwright = require("playwright");
  } catch {
    log.err("playwright not installed — run: pnpm --filter @webcules/social-forge install && pnpm --filter @webcules/social-forge exec playwright install chromium");
    process.exit(1);
  }
  const ffmpegPath = resolveFfmpeg();

  const { url, child } = await ensureServer(flagStr(args, "url"));
  // --path retargets the recording at any page (e.g. the landing docs playground at
  // /components/<name>); unknown query params are simply ignored by such pages.
  const basePath = flagStr(args, "path") ?? `/demo/${slug}`;
  const seconds = Number(flagStr(args, "seconds") ?? "8");
  const warmupMs = 1800; // let the intro settle so the loop point looks intentional
  const rendersDir = path.join(SOCIAL_ROOT, slug, "social", "renders");
  const stillsDir = path.join(SOCIAL_ROOT, slug, "social", "renders", "stills");
  const tmpDir = path.join(rendersDir, ".tmp");
  ensureDir(rendersDir);
  ensureDir(stillsDir);
  ensureDir(tmpDir);

  const toMp4 = (webm: string, mp4: string) => {
    const r = spawnSync(ffmpegPath, ["-y", "-i", webm, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "pipe" });
    if (r.status !== 0) log.warn(`ffmpeg failed for ${path.basename(webm)} — keeping webm`);
    else fs.unlinkSync(webm);
  };

  const browser = await playwright.chromium.launch();
  try {
    // Pre-warm: a throwaway page triggers vite's cold compile OUTSIDE the recorded window
    // (a freshly restarted dev server otherwise bakes ~4s of black screen into every video).
    const warm = await browser.newPage();
    await warm.goto(`${url}${basePath}?variant=${variants[0]}`, { waitUntil: "networkidle", timeout: 120000 });
    await warm.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await warm.close();

    const shoot = async (name: string, viewport: { width: number; height: number }, query: string, secs: number) => {
      const ctx = await browser.newContext({ viewport, recordVideo: { dir: tmpDir, size: viewport } });
      const page = await ctx.newPage();
      await page.goto(`${url}${basePath}?${query}`, { waitUntil: "networkidle" });
      await page.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(warmupMs + secs * 1000);
      await ctx.close();
      const webm = fs.readdirSync(tmpDir).map((f) => path.join(tmpDir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]!;
      const mp4 = path.join(rendersDir, `${slug}-${name}.mp4`);
      fs.renameSync(webm, mp4 + ".webm");
      toMp4(mp4 + ".webm", mp4);
      log.ok(`${name}: ${path.relative(SOCIAL_ROOT, mp4)} (${secs}s @ ${viewport.width}×${viewport.height})`);
    };

    await shoot("wide", { width: 1920, height: 1080 }, `variant=${variants[0]}`, seconds);
    const hook = m.catchphrase || "";
    await shoot("reel", { width: 1080, height: 1920 }, `layout=vertical&variant=${variants[0]}&hook=${encodeURIComponent(hook)}`, seconds + 1);

    for (const v of variants) {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
      await page.goto(`${url}${basePath}?variant=${v}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(3200);
      const still = path.join(stillsDir, `${v}-1080x1350.png`);
      await page.screenshot({ path: still });
      await page.close();
      log.ok(`still: ${path.relative(SOCIAL_ROOT, still)}`);
    }
  } finally {
    await browser.close();
    if (child) killTree(child);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  m.status = "rendered";
  writeManifest(slug, m);
  log.ok(`done — renders in webcules/social/${slug}/social/renders/`);
}
