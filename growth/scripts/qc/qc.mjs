#!/usr/bin/env node
// Automated QC for a finished reel. Writes growth/out/<PP>/qc.json; `pass` is true only if every check passes.
//
//   node growth/scripts/qc/qc.mjs --pp PP-001 [--meta growth/storyboards/PP-001.meta.json]
//   node growth/scripts/qc/qc.mjs --pp PP-001 --variant music [--label name] [--allow-standin]    checks reel.music[.name].mp4, writes qc.music[.name].json
//
// Thresholds are the ones in growth/DEMO-STANDARD.md. Do not loosen them to get a pass.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { ROOT } from "../record/lib.mjs";

const a = process.argv.slice(2);
const flag = (k) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : undefined);
const pp = flag("pp");
if (!pp || !/^PP-\d{3,}$/.test(pp)) {
  console.error("usage: qc.mjs --pp PP-### [--meta file]");
  process.exit(2);
}
const variant = flag("variant"); // undefined (the normal reel) or "music"
if (variant && variant !== "music") {
  console.error(`unknown --variant ${variant} (only "music")`);
  process.exit(2);
}
const label = flag("label"); // with --variant music: check reel.music.<label>.mp4
if (label && (variant !== "music" || !/^[a-z0-9-]+$/.test(label))) {
  console.error("--label is only for --variant music, lowercase letters, digits and dashes");
  process.exit(2);
}
const lab = label ? `.${label}` : "";
const outDir = path.join(ROOT, "growth", "out", pp);
const reel = path.join(outDir, variant === "music" ? `reel.music${lab}.mp4` : "reel.mp4");
const edlPath = path.join(outDir, "edl.json");
if (!fs.existsSync(reel) || !fs.existsSync(edlPath)) {
  console.error(`${path.basename(reel)} and edl.json are required (${variant === "music" ? "run music.mjs first" : "run edit.mjs first"})`);
  process.exit(1);
}
let edl = JSON.parse(fs.readFileSync(edlPath, "utf8"));
// a retimed music version has its own edit list: every time in it is on the timeline the music video really has
const musicEdlPath = path.join(outDir, `music${lab}.edl.json`);
if (variant === "music" && fs.existsSync(musicEdlPath)) edl = JSON.parse(fs.readFileSync(musicEdlPath, "utf8"));
const metaPath = path.resolve(ROOT, flag("meta") ?? path.join("growth", "storyboards", `${pp}.meta.json`));
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;

const T = { minS: 8, maxS: 45, maxMB: 50, freezeS: 0.8, blackS: 0.15, maxWords: 6, sfxPeakDb: [-12, -3], sfxClickDb: -45, safe: { top: 250, bottom: 340, right: 120, left: 60 } };
const checks = [];
const failures = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
};

// ---- probe
const probe = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate,codec_name,pix_fmt,codec_type,sample_rate,channels,duration:format=duration,size", "-of", "json", reel], { encoding: "utf8" }).stdout);
const v = probe.streams.find((s) => s.codec_type === "video");
const dur = Number(probe.format.duration);
const sizeMB = Number(probe.format.size) / 1e6;
check("resolution", v.width === 1080 && v.height === 1920, `${v.width}x${v.height}`);
check("fps", v.r_frame_rate === "30/1", v.r_frame_rate);
check("codec", v.codec_name === "h264" && v.pix_fmt === "yuv420p", `${v.codec_name} ${v.pix_fmt}`);
check("duration", dur >= T.minS && dur <= T.maxS, `${dur.toFixed(1)}s (allowed ${T.minS}-${T.maxS}s)`);
check("size", sizeMB <= T.maxMB, `${sizeMB.toFixed(1)} MB (max ${T.maxMB})`);

// ---- sound effects: a real AAC track at a sane level, the same length as the video, and audibly present at every click
const aud = probe.streams.find((s) => s.codec_type === "audio");
check("sfx track", !!aud && aud.codec_name === "aac" && Number(aud.sample_rate) === 48000, aud ? `${aud.codec_name} ${aud.sample_rate} Hz ${aud.channels} ch` : "no audio stream (run sfx.mjs)");
if (aud) {
  check("sfx length matches video", Math.abs(Number(aud.duration) - Number(v.duration)) <= 0.1, `audio ${Number(aud.duration).toFixed(2)}s, video ${Number(v.duration).toFixed(2)}s`);
  const vol = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", reel, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const maxDb = Number(vol.match(/max_volume: (-?[\d.]+) dB/)?.[1]);
  check("sfx level", maxDb >= T.sfxPeakDb[0] && maxDb <= T.sfxPeakDb[1], `peak ${maxDb} dB (allowed ${T.sfxPeakDb[0]} to ${T.sfxPeakDb[1]})`);
  // decode to mono floats and look for energy in the 80 ms after each click, so a track that drifted off the video fails
  const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", reel, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], { maxBuffer: 1 << 28 }).stdout;
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  const rmsDb = (ms) => {
    const i0 = Math.round((ms / 1000) * 48000);
    const n = Math.round(0.08 * 48000);
    let sum = 0;
    for (let i = i0; i < Math.min(samples.length, i0 + n); i++) sum += samples[i] * samples[i];
    return 10 * Math.log10(sum / n + 1e-12);
  };
  const quiet = (edl.highlights ?? []).filter((h) => rmsDb(h.out_ms) < T.sfxClickDb);
  check("sfx on every click", quiet.length === 0, quiet.length ? `silent at ${quiet.map((h) => `${(h.out_ms / 1000).toFixed(1)}s`).join(", ")}` : `${(edl.highlights ?? []).length} click(s) all audible`);
}

// ---- music version: continuous, real, fresh, and on the beat
if (variant === "music") {
  const musicPath = path.join(outDir, `music${lab}.json`);
  const music = fs.existsSync(musicPath) ? JSON.parse(fs.readFileSync(musicPath, "utf8")) : null;
  check("music record", !!music, music ? `${music.engine}, ${music.bpm_final} BPM` : "music.json missing (run music.mjs)");
  if (music) {
    const sha = crypto.createHash("sha1").update(fs.readFileSync(edlPath)).digest("hex");
    check("music matches this edit", music.edl_sha === sha, music.edl_sha === sha ? "built from the current edl.json" : "edl.json changed after the music was made: rerun music.mjs");
    const real = music.engine !== "standin" || a.includes("--allow-standin");
    check("music is generated", real, music.engine === "standin" ? (real ? "STAND-IN allowed by flag, not for posting" : "this is a synthesised stand-in, not generated music: generate with ComfyUI before packaging") : music.engine_note);
    const al = music.alignment ?? { ratio: 0, deviations: [] };
    check("moments on the beat", al.ratio >= 0.8, `${al.within}/${al.total} step changes, hook and end card within ${al.tol_ms ?? 70} ms of a beat (${Math.round(al.ratio * 100)} percent weighted, need 80)`);
    const end = (al.deviations ?? []).find((d) => d.kind === "end");
    check("end card hit on the beat", !!end && end.dev_ms <= 70, end ? `${end.dev_ms} ms off a beat` : "no end card moment recorded");
    if (music.retime?.on) {
      check("picture retimed gently", music.retime.max_factor_dev <= 0.15 && (music.retime.max_short_change_ms ?? 0) <= 150, `the biggest speed change over any stretch of 600 ms or more is ${(music.retime.max_factor_dev * 100).toFixed(1)}% (allowed 15), shorter stretches change by at most ${music.retime.max_short_change_ms ?? 0} ms (allowed 150), cues moved up to ${music.retime.max_shift_ms} ms`);
      check("effects on the groove", music.retime.on_groove_ratio >= 0.8, `${Math.round(music.retime.on_groove_ratio * 100)}% of the cues sit within ${music.retime.tol_ms} ms of a groove slot (need 80)`);
    }
    check("music not over-stretched", music.stretch_rate >= 0.92 && music.stretch_rate <= 1.08, `rate ${music.stretch_rate} (allowed 0.92 to 1.08)`);
    check("music tempo is steady", music.beat_confidence >= 2, `beat confidence ${music.beat_confidence} (need 2 or more: below that the generated track has no clear beat to sync to)`);
  }
  // continuous: no gap in the sound until the final fade
  const sil = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", reel, "-vn", "-af", "silencedetect=noise=-50dB:d=0.35", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const gaps = [...sil.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1])).filter((s) => s < dur - 0.7);
  check("music is continuous", gaps.length === 0, gaps.length ? `silent from ${gaps.map((g) => g.toFixed(1) + "s").join(", ")}` : "no gap in the sound before the final fade");
}

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
const views = edl.click_view ?? [];
const cut = views.filter((c) => c.box_visible < 0.98 || !c.point_visible);
const viewOk = views.length === edl.clicks_total && cut.length === 0;
check("every click is inside the frame", viewOk, cut.length ? cut.map((c) => `${(c.out_ms / 1000).toFixed(1)}s (${Math.round(c.box_visible * 100)}% of the target visible${c.point_visible ? "" : ", click point off screen"})`).join(", ") : views.length !== edl.clicks_total ? `visibility recorded for ${views.length} of ${edl.clicks_total} clicks (re-run edit.mjs)` : `${views.length} click target(s) fully on screen`);
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

const report = { pass: failures.length === 0, variant: variant ?? "reel", pain_point: pp, checked_at: new Date().toISOString(), reel: path.relative(ROOT, reel), duration_s: Math.round(dur * 10) / 10, size_mb: Math.round(sizeMB * 10) / 10, failures, checks };
fs.writeFileSync(path.join(outDir, variant === "music" ? `qc.music${lab}.json` : "qc.json"), JSON.stringify(report, null, 2));
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} - ${c.detail}`);
console.log(report.pass ? "\nQC PASSED" : `\nQC FAILED (${failures.length})`);
process.exit(report.pass ? 0 : 1);
