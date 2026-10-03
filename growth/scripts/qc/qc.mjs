#!/usr/bin/env node
// Automated QC for a finished reel. Writes growth/out/<PP>/qc.json; `pass` is true only if every check passes.
//
//   node growth/scripts/qc/qc.mjs --pp PP-001 [--meta growth/storyboards/PP-001.meta.json]
//
// Thresholds are the ones in growth/DEMO-STANDARD.md. Do not loosen them to get a pass.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../record/lib.mjs";

const a = process.argv.slice(2);
const flag = (k) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : undefined);
const pp = flag("pp");
if (!pp || !/^PP-\d{3,}$/.test(pp)) {
  console.error("usage: qc.mjs --pp PP-### [--meta file]");
  process.exit(2);
}
const outDir = path.join(ROOT, "growth", "out", pp);
const reel = path.join(outDir, "reel.mp4");
const edlPath = path.join(outDir, "edl.json");
if (!fs.existsSync(reel) || !fs.existsSync(edlPath)) {
  console.error("reel.mp4 and edl.json are required (run edit.mjs first)");
  process.exit(1);
}
const edl = JSON.parse(fs.readFileSync(edlPath, "utf8"));
const metaPath = path.resolve(ROOT, flag("meta") ?? path.join("growth", "storyboards", `${pp}.meta.json`));
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;

const T = { minS: 8, maxS: 45, maxMB: 50, freezeS: 0.8, blackS: 0.15, maxWords: 6, safe: { top: 250, bottom: 340, right: 120, left: 60 } };
const checks = [];
const failures = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
};

// ---- probe
const probe = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate,codec_name,pix_fmt,codec_type:format=duration,size", "-of", "json", reel], { encoding: "utf8" }).stdout);
const v = probe.streams.find((s) => s.codec_type === "video");
const dur = Number(probe.format.duration);
const sizeMB = Number(probe.format.size) / 1e6;
check("resolution", v.width === 1080 && v.height === 1920, `${v.width}x${v.height}`);
check("fps", v.r_frame_rate === "30/1", v.r_frame_rate);
check("codec", v.codec_name === "h264" && v.pix_fmt === "yuv420p", `${v.codec_name} ${v.pix_fmt}`);
check("silent", !probe.streams.some((s) => s.codec_type === "audio"), "no audio stream");
check("duration", dur >= T.minS && dur <= T.maxS, `${dur.toFixed(1)}s (allowed ${T.minS}-${T.maxS}s)`);
check("size", sizeMB <= T.maxMB, `${sizeMB.toFixed(1)} MB (max ${T.maxMB})`);

// ---- freeze and black frames (the end card is intentionally still, so it is excluded)
const run = (vf) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", reel, "-vf", vf, "-an", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const freezeLog = run(`freezedetect=n=-55dB:d=${T.freezeS}`);
const starts = [...freezeLog.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
const durs = [...freezeLog.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
const endStart = edl.endcard_start_ms / 1000;
// the end card is intentionally still, so a stretch that runs into it only counts up to where the end card starts
const candidates = starts.map((s, i) => ({ start: s, dur: Math.min(durs[i] ?? dur - s, endStart - s) })).filter((f) => f.start < endStart - 0.05 && f.dur >= 0.8);
// The detector cannot see a small cursor crossing a big screen. Stillness is measured as time with neither a screen change
// nor visible cursor travel: remove the logged cursor travel from each flagged stretch, and it only counts as frozen if a
// piece of 0.8 s or more is left. A drifting 1px cursor is not travel, so a genuinely still shot still fails.
const travel = (edl.cursor_motion ?? []).map(([a, b]) => [a / 1000, b / 1000]);
const stillPieces = (f) => {
  let pieces = [[f.start, f.start + f.dur]];
  for (const [a, b] of travel) {
    pieces = pieces.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.max(s, a)], [Math.min(e, b), e]].filter(([x, y]) => y > x)));
  }
  return Math.max(0, ...pieces.map(([s, e]) => e - s));
};
const excused = candidates.filter((f) => stillPieces(f) < T.freezeS);
const freezes = candidates.filter((f) => !excused.includes(f));
check("no frozen frames", freezes.length === 0, freezes.length ? freezes.map((f) => `${f.start.toFixed(1)}s for ${f.dur.toFixed(1)}s`).join(", ") : excused.length ? `none (${excused.length} still-looking stretch${excused.length > 1 ? "es" : ""} excused because the cursor is visibly moving: ${excused.map((f) => `${f.start.toFixed(1)}s`).join(", ")})` : "none over 0.8s");
const blackLog = run(`blackdetect=d=${T.blackS}:pix_th=0.08`);
const blacks = [...blackLog.matchAll(/black_start:([\d.]+)/g)];
check("no black frames", blacks.length === 0, blacks.length ? `${blacks.length} run(s)` : "none");

// ---- text: safe zones, clipping, word counts (measured in the composer while rendering)
const inSafe = (b) => b.x >= T.safe.left && b.x + b.w <= 1080 - T.safe.right && b.y >= T.safe.top && b.y + b.h <= 1920 - T.safe.bottom;
const bad = edl.layout.filter((l) => l.clipped || !inSafe(l));
check("text inside safe zones", bad.length === 0, bad.length ? bad.map((l) => `${l.kind} "${l.text}" at ${l.x},${l.y} ${l.w}x${l.h}`).join("; ") : `${edl.layout.length} text blocks checked`);
const longCaps = edl.captions.filter((c) => c.words > T.maxWords);
check("captions are short", longCaps.length === 0, longCaps.length ? longCaps.map((c) => `"${c.text}" (${c.words} words)`).join("; ") : `all <= ${T.maxWords} words`);
check("hook is short", !edl.hook || edl.hook.trim().split(/\s+/).length <= T.maxWords, edl.hook ?? "none");

// ---- events coverage
check("every click has an effect", edl.clicks_covered === edl.clicks_total, `${edl.clicks_covered}/${edl.clicks_total} clicks highlighted`);

// ---- claims: anything that looks like a price, size or tier on screen must be in the claims table, and each claim must cite a real file
const claims = meta?.claims ?? edl.claims ?? [];
const onScreen = [edl.hook ?? "", ...edl.captions.map((c) => c.text), edl.end?.claim ?? "", edl.end?.note ?? ""].join(" \n ");
const tokens = [...onScreen.matchAll(/\$\d+(?:\.\d+)?|\b\d+\s?(?:GB|TB|MB)\b|\b\d+\s?%|\b(?:Free|Lite|Studio|Pro)\b/gi)].map((m) => m[0].toLowerCase());
const claimText = claims.map((c) => c.text.toLowerCase()).join(" \n ");
const unbacked = [...new Set(tokens)].filter((t) => !claimText.includes(t));
check("claims backed", unbacked.length === 0, unbacked.length ? `on screen but not in claims: ${unbacked.join(", ")}` : `${tokens.length} price/limit/tier mentions all in the claims table`);
const missingSrc = claims.filter((c) => !c.source || !fs.existsSync(path.join(ROOT, c.source)));
check("claims cite real files", missingSrc.length === 0, missingSrc.length ? missingSrc.map((c) => `"${c.text}" -> ${c.source ?? "no source"}`).join("; ") : `${claims.length} claim(s) cite existing files`);

const report = { pass: failures.length === 0, pain_point: pp, checked_at: new Date().toISOString(), reel: path.relative(ROOT, reel), duration_s: Math.round(dur * 10) / 10, size_mb: Math.round(sizeMB * 10) / 10, failures, checks };
fs.writeFileSync(path.join(outDir, "qc.json"), JSON.stringify(report, null, 2));
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} - ${c.detail}`);
console.log(report.pass ? "\nQC PASSED" : `\nQC FAILED (${failures.length})`);
process.exit(report.pass ? 0 : 1);
