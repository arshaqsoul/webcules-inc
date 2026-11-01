#!/usr/bin/env node
// Code-only reel renderer.
//
//   node growth/motion/render.mjs check  E001     lint the spec: claims cite real files, timing fits, copy rules
//   node growth/motion/render.mjs stills E001     key frames + a contact sheet, fast, for review
//   node growth/motion/render.mjs render E001     every frame -> reel.mp4 with the synthesised score, plus cover.png
//   node growth/motion/render.mjs qc     E001     probe the rendered reel against the delivery spec
//   node growth/motion/render.mjs package E001    write the founder's package.md next to the spec
//   node growth/motion/render.mjs new    E002 The Deposit Chaser   scaffold a new episode spec
//
// Frames come from headless Chromium stepping window.__reel.seek(t), so every
// render of a spec is identical. Output goes to growth/motion/out/<id>/ (gitignored).

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { synthesize } from "./audio.mjs";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

function findEpisode(id) {
  const dir = join(HERE, "episodes");
  const hit = readdirSync(dir).find((d) => d === id || d.startsWith(`${id}-`));
  if (!hit) throw new Error(`no episode ${id} in growth/motion/episodes`);
  return { dir: join(dir, hit), spec: JSON.parse(readFileSync(join(dir, hit, "spec.json"), "utf8")), rel: `growth/motion/episodes/${hit}/spec.json` };
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

function serve() {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = resolve(ROOT, "." + p);
      if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => ok(server));
  });
}

async function openReel(ep) {
  const { chromium } = require("playwright");
  const server = await serve();
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--font-render-hinting=none"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/growth/motion/engine/index.html?spec=/${ep.rel}`);
  await page.waitForFunction(() => window.__ready === true || false, null, { timeout: 30000 }).catch(() => {});
  if (errors.length) throw new Error("page errors:\n" + errors.join("\n"));
  const info = await page.evaluate(() => ({ duration: window.__reel.duration, fps: window.__reel.fps, cues: window.__reel.cues }));
  const close = async () => { await browser.close(); server.close(); };
  return { page, info, errors, close };
}

const outDir = (id) => { const d = join(HERE, "out", id); mkdirSync(d, { recursive: true }); return d; };

async function stills(id, times) {
  const ep = findEpisode(id);
  const r = await openReel(ep);
  const d = outDir(ep.spec.id);
  const at = times ?? ep.spec.stills ?? Array.from({ length: 12 }, (_, i) => +(i * (r.info.duration / 12) + 0.5).toFixed(2));
  const files = [];
  for (const t of at) {
    await r.page.evaluate((tt) => window.__reel.seek(tt), t);
    const f = join(d, `still-${String(t.toFixed(2)).padStart(6, "0")}.png`);
    await r.page.screenshot({ path: f });
    files.push(f);
  }
  if (r.errors.length) console.error(r.errors.join("\n"));
  await r.close();
  // Contact sheet: 4 across at quarter size.
  const sheet = join(d, "contact.png");
  const cols = 4;
  const inputs = files.flatMap((f) => ["-i", f]);
  const filter = files.map((_, i) => `[${i}:v]scale=270:480[s${i}]`).join(";") + ";" + files.map((_, i) => `[s${i}]`).join("") + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * 270}_${Math.floor(i / cols) * 480}`).join("|")}:fill=black`;
  if (files.length > 1) spawnSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-frames:v", "1", sheet], { stdio: "inherit" });
  else spawnSync("ffmpeg", ["-y", "-v", "error", "-i", files[0], "-vf", "scale=270:480", sheet], { stdio: "inherit" });
  console.log(`stills: ${files.length} frames + ${sheet}`);
}

async function render(id) {
  const ep = findEpisode(id);
  const r = await openReel(ep);
  const d = outDir(ep.spec.id);
  const { duration, fps, cues } = r.info;
  const frames = Math.round(duration * fps);
  const silent = join(d, "video.mp4");
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await r.page.evaluate((tt) => window.__reel.seek(tt), i / fps);
    const png = await r.page.screenshot({ type: "png" });
    if (!ff.stdin.write(png)) await new Promise((ok) => ff.stdin.once("drain", ok));
    if (i % fps === 0) process.stdout.write(`\rframe ${i}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((ok, no) => ff.on("close", (c) => (c === 0 ? ok() : no(new Error(`ffmpeg exited ${c}`)))));
  // Cover: the frame the spec names, full size.
  await r.page.evaluate((tt) => window.__reel.seek(tt), ep.spec.cover ?? 1.5);
  await r.page.screenshot({ path: join(d, "cover.png") });
  await r.close();
  process.stdout.write("\n");

  // Score: synthesised from the scenes' cues, then muxed and loudness-normalised for Instagram (-14 LUFS).
  const wav = join(d, "score.wav");
  writeFileSync(wav, synthesize(cues, duration, { seed: ep.spec.id, ...(ep.spec.audio ?? {}) }));
  writeFileSync(join(d, "cues.json"), JSON.stringify(cues, null, 1));
  const reel = join(d, "reel.mp4");
  const mux = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", silent, "-i", wav, ...soundtrack(ep.spec, duration), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", reel], { stdio: "inherit" });
  if (mux.status !== 0) throw new Error("mux failed");
  console.log(`render: ${reel} (${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)}s)`);
  qc(id);
}

// The audio arguments for the mux. A reel gets its synthesised score (input 1) alone. A film (FILM.md)
// adds its generated music, ducked under the voice-over, and the voice-over itself on top.
function soundtrack(spec, duration) {
  const st = spec.soundtrack;
  if (!st) return ["-filter:a", "loudnorm=I=-14:TP=-1.5:LRA=11"];
  const ins = [], chains = [`[1:a]volume=${st.sfxGain ?? 0.6}[sfx]`], mix = ["[sfx]"];
  let k = 2;
  const vo = st.vo ? k++ : null, music = st.music ? k++ : null;
  if (vo) ins.push("-i", join(ROOT, st.vo));
  if (music) ins.push("-i", join(ROOT, st.music));
  if (vo) chains.push(`[${vo}:a]asplit=2[vo][key]`);
  if (music) {
    chains.push(`[${music}:a]volume=${st.musicGain ?? 0.55}[mus]`);
    if (vo) { chains.push("[mus][key]sidechaincompress=threshold=0.04:ratio=6:attack=15:release=350[duck]"); mix.push("[duck]"); }
    else mix.push("[mus]");
  }
  if (vo) mix.push("[vo]");
  chains.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0,atrim=0:${duration},loudnorm=I=-14:TP=-1.5:LRA=11[a]`);
  return [...ins, "-filter_complex", chains.join(";"), "-map", "0:v", "-map", "[a]"];
}

function check(id) {
  const ep = findEpisode(id);
  const s = ep.spec;
  const problems = [];
  for (const k of ["id", "title", "series", "pain", "duration", "fps", "scenes", "claims", "caption"]) if (!(k in s)) problems.push(`spec is missing "${k}"`);
  for (const c of s.claims ?? []) {
    if (!c.source || !existsSync(join(ROOT, c.source))) problems.push(`claim "${c.text}" cites a missing file: ${c.source}`);
    else if (c.match && !readFileSync(join(ROOT, c.source), "utf8").includes(c.match)) problems.push(`claim "${c.text}": "${c.match}" not found in ${c.source}`);
  }
  if ((s.pain?.evidence ?? []).length < 3) problems.push("pain.evidence needs at least 3 sources (growth/AGENTS.md rule 9)");
  if (new Set((s.pain?.evidence ?? []).map((e) => new URL(e.url).host)).size < 2) problems.push("pain.evidence needs 2 or more hosts");
  for (const sc of s.scenes ?? []) {
    if (!existsSync(join(HERE, "engine/scenes", `${sc.type}.js`))) problems.push(`unknown scene type ${sc.type}`);
    if (sc.at + sc.dur > s.duration + 0.001) problems.push(`scene ${sc.type} ends after the reel`);
  }
  const maxDur = s.format === "film" ? 90 : 60;
  if (s.duration < 6 || s.duration > maxDur) problems.push(`duration should be 6-${maxDur} s for a ${s.format === "film" ? "film" : "reel ad"}`);
  for (const [k, f] of Object.entries(s.soundtrack ?? {})) if (typeof f === "string" && !existsSync(join(ROOT, f))) problems.push(`soundtrack ${k} is missing: ${f} (run hybrid/${k === "vo" ? "vo" : "score"}.mjs)`);
  // Founder's copy rules: no em dashes anywhere in on-screen copy, the voice-over or the caption.
  const copy = JSON.stringify(s.scenes) + JSON.stringify(s.vo ?? []) + (s.caption ?? "");
  if (copy.includes("\u2014")) problems.push("em dash found: use a plain dash (founder rule)");
  // Price, percentage and tier words on screen or spoken must be backed by a claim.
  const onScreen = JSON.stringify(s.scenes) + JSON.stringify(s.vo ?? []);
  for (const m of onScreen.match(/\$\d+|\d+\s?%|\d+\s?GB|\bfree\b|\bFree\b/g) ?? []) {
    if (!(s.claims ?? []).some((c) => c.text.toLowerCase().includes(m.toLowerCase().replace(/\s/g, "")) || c.text.toLowerCase().includes(m.toLowerCase()))) problems.push(`on-screen "${m}" has no claim backing it`);
  }
  if (problems.length) { console.error(`check ${s.id}: ${problems.length} problem(s)\n - ` + problems.join("\n - ")); process.exitCode = 1; }
  else console.log(`check ${s.id}: ok (${s.claims.length} claims, ${s.pain.evidence.length} sources, ${s.scenes.length} scenes, ${s.duration}s)`);
}

function qc(id) {
  const ep = findEpisode(id);
  const reel = join(HERE, "out", ep.spec.id, "reel.mp4");
  const probe = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", reel], { encoding: "utf8" }).stdout);
  const v = probe.streams.find((x) => x.codec_type === "video");
  const a = probe.streams.find((x) => x.codec_type === "audio");
  const dur = +probe.format.duration;
  const checks = [
    ["1080x1920", v && v.width === 1080 && v.height === 1920],
    ["h264 yuv420p", v && v.codec_name === "h264" && v.pix_fmt === "yuv420p"],
    ["30 fps", v && v.r_frame_rate === `${ep.spec.fps}/1`],
    ["has aac audio", a && a.codec_name === "aac"],
    [`duration ~${ep.spec.duration}s`, Math.abs(dur - ep.spec.duration) < 0.25],
    ["under 100 MB", +probe.format.size < 100e6],
  ];
  // Loudness, measured.
  const ln = spawnSync("ffmpeg", ["-i", reel, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const lufs = +(ln.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold[\s\S]*$/)?.[1] ?? ln.match(/Integrated loudness:\s*\n\s*I:\s+(-?[\d.]+)/)?.[1] ?? NaN);
  checks.push([`loudness -14 +/-2 LUFS (got ${lufs})`, Math.abs(lufs + 14) <= 2]);
  // Frozen stretches longer than 1.5 s read as a stalled video in the feed.
  const fr = spawnSync("ffmpeg", ["-i", reel, "-vf", "freezedetect=n=0.0008:d=1.5", "-map", "0:v", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const freezes = (fr.match(/freeze_start: ([\d.]+)/g) ?? []).map((x) => +x.split(": ")[1]).filter((x) => x < ep.spec.duration - 2);
  checks.push([`no freeze over 1.5 s before the end card (${freezes.join(", ") || "none"})`, freezes.length === 0]);
  const report = { id: ep.spec.id, at: new Date().toISOString(), duration: dur, lufs, checks: checks.map(([name, pass]) => ({ name, pass: !!pass })) };
  writeFileSync(join(HERE, "out", ep.spec.id, "qc.json"), JSON.stringify(report, null, 2));
  for (const c of report.checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
  if (report.checks.some((c) => !c.pass)) process.exitCode = 1;
}

function scaffold(id, title) {
  if (!/^E\d{3}$/.test(id)) throw new Error("episode ids look like E002");
  const dir = join(HERE, "episodes", `${id}-${(title ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`);
  if (readdirSync(join(HERE, "episodes")).some((d) => d.startsWith(`${id}-`))) throw new Error(`${id} already exists`);
  // E003 is the house template: the 3D world journey with an app end card.
  const base = findEpisode("E003").spec;
  base.id = id;
  base.title = title ?? "Untitled";
  base.pain = { statement: "TODO: one sentence, in the photographer's words", persona: "wedding", ledger: null, evidence: [] };
  base.caption = "TODO";
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "spec.json"), JSON.stringify(base, null, 2) + "\n");
  console.log(`new: ${dir}/spec.json (copied from E003; replace every TODO, the worlds, the inbox cards and the claims)`);
}

function packageEpisode(id) {
  const ep = findEpisode(id);
  const s = ep.spec;
  const d = join(HERE, "out", s.id);
  const qcFile = join(d, "qc.json");
  if (!existsSync(join(d, "reel.mp4")) || !existsSync(qcFile)) throw new Error("render first: node growth/motion/render.mjs render " + s.id);
  const q = JSON.parse(readFileSync(qcFile, "utf8"));
  if (q.checks.some((c) => !c.pass)) throw new Error("qc failed; fix before packaging");
  // Hybrid reels (clip scenes) carry generated footage; the founder must turn on the platform's AI label.
  const hybrid = s.scenes.some((sc) => sc.type === "clip");
  const made = hybrid
    ? `Hybrid: keyframes and clips generated on local ComfyUI (Z-Image, ${s.format === "film" ? "Qwen-Image-Edit, Wan 2.2, RIFE; voice-over by Piper TTS and music by ACE-Step, both generated" : "Wan 2.2"}); every word, inbox card and the end card drawn in code (growth/motion), no recording.\n\n**Turn on Instagram's and Facebook's AI label when posting (generated footage${s.format === "film" ? ", synthetic voice and music" : ""}).**`
    : "Made entirely in code (growth/motion), no recording and no generated video.";
  const md = `# Reel package: ${s.id} - ${s.title}

Series: ${s.series}. ${made}

## Files

- Reel: \`growth/motion/out/${s.id}/reel.mp4\` (1080x1920, ${s.duration}s, ${s.fps} fps, -14 LUFS)
- Cover: \`growth/motion/out/${s.id}/cover.png\`
- QC: \`growth/motion/out/${s.id}/qc.json\` (${q.checks.length}/${q.checks.length} pass)

## Organic post (Instagram and Facebook)

Caption (paste as is):

${s.caption}

Hashtags (first comment):

${s.hashtags.join(" ")}

## Paid ad (Meta Ads Manager)

- Primary text: ${s.ad.primary_text}
- Headline: ${s.ad.headline}
- Description: ${s.ad.description}
- Call to action button: ${s.ad.cta_button}
- Placements: ${s.ad.placements.join(", ")}
- Destination: https://snaphq.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=not_photography&utm_content=${s.id.toLowerCase()}

## Claims on screen and in the caption

${s.claims.map((c) => `- ${c.text} - \`${c.source}\``).join("\n")}

## The pain point

${s.pain.statement}

${s.pain.evidence.map((e) => `- ${e.url} - ${e.summary}`).join("\n")}

## Posting notes

- The reel carries its own synthesised score and sound effects; it works muted too, since every beat is on screen.
- Keep the in-app "original audio" on. If you add a trending sound, keep it low.
- Cover: pick ${s.cover}s or upload cover.png.
`;
  writeFileSync(join(ep.dir, "package.md"), md);
  console.log(`package: ${join(ep.dir, "package.md")}`);
}

const [cmd, id, ...rest] = process.argv.slice(2);
const at = rest.find((x) => x.startsWith("--at="))?.slice(5).split(",").map(Number);
if (!cmd || !id) {
  console.log("usage: render.mjs <new|check|stills|render|qc|package> <episode id> [--at=1,2.5,4] [title for new]");
  process.exit(2);
}
if (cmd === "check") check(id);
else if (cmd === "stills") await stills(id, at);
else if (cmd === "render") { check(id); if (!process.exitCode) await render(id); }
else if (cmd === "qc") qc(id);
else if (cmd === "package") packageEpisode(id);
else if (cmd === "new") scaffold(id, rest.join(" ") || undefined);
else { console.error(`unknown command ${cmd}`); process.exit(2); }
