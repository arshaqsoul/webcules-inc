#!/usr/bin/env node
// Make a music version of a finished reel: a continuous, trailer-style track whose beats land on the reel's step changes.
//
//   node growth/scripts/music/music.mjs --pp PP-004 [--engine comfy|standin] [--style trailer|upbeat|calm]
//                                       [--tags "..."] [--seed N] [--tries N] [--bpm N] [--no-hits] [--no-sweep]
//
// Reads  : growth/out/<PP>/{reel.mp4, edl.json}      (reel.mp4 is never modified)
// Writes : growth/out/<PP>/reel.music.mp4 and growth/out/<PP>/music.json
// Then   : node growth/scripts/qc/qc.mjs --pp <PP> --variant music
//
// Engines: "comfy" generates the bed with ACE-Step 1.5 on the ComfyUI server (GROWTH_COMFY_URL). If the model is not installed it
// stops and says exactly what to install, it never silently substitutes. "standin" is a deterministic synthesised bed for
// testing the pipeline or an offline run, and it is always labelled as such in music.json.
// Spec: growth/DEMO-STANDARD.md (Music version)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT } from "../record/lib.mjs";
import { SR } from "../edit/sfx.mjs";
import { keyEvents, planGrid, alignToBeats, alignmentScore } from "./sync.mjs";
import { analyzeFile } from "./beats.mjs";
import { readBed, mixMusic, muxMix, wavStereo } from "./mix.mjs";
import { standinBed } from "./standin.mjs";
import { preflight, generate } from "./comfy.mjs";

const STYLES = {
  trailer: {
    key: "A minor",
    tags: "Epic cinematic movie-trailer score, instrumental only, no vocals. A driving heartbeat kick on every beat, deep sub bass pulse, tense staccato strings ostinato, taiko and braam hits, steadily building intensity, modern hybrid orchestral, dark and confident, tight clean mix, ends cleanly",
  },
  upbeat: {
    key: "C major",
    tags: "Modern upbeat tech product-launch instrumental, no vocals. Tight punchy drums, bright plucked synth arpeggio, warm bass, optimistic and energetic, clean polished mix, ends cleanly",
  },
  calm: {
    key: "D major",
    tags: "Warm minimal cinematic instrumental, no vocals. A soft steady pulse, evolving pads, a gentle piano motif, calm and confident, clean mix, ends cleanly",
  },
};

const a = process.argv.slice(2);
const flag = (k) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : undefined);
const has = (k) => a.includes(`--${k}`);
const pp = flag("pp");
if (!pp || !/^PP-\d{3,}$/.test(pp)) {
  console.error("usage: music.mjs --pp PP-### [--engine comfy|standin] [--style trailer|upbeat|calm] [--tags ...] [--seed N] [--tries N] [--bpm N]");
  process.exit(2);
}
const engine = flag("engine") ?? "comfy";
const style = flag("style") ?? "trailer";
if (!["comfy", "standin"].includes(engine)) {
  console.error(`unknown engine ${engine}`);
  process.exit(2);
}
if (!STYLES[style]) {
  console.error(`unknown style ${style} (trailer, upbeat, calm)`);
  process.exit(2);
}

const outDir = path.join(ROOT, "growth", "out", pp);
const reel = path.join(outDir, "reel.mp4");
const edlPath = path.join(outDir, "edl.json");
for (const f of [reel, edlPath]) {
  if (!fs.existsSync(f)) {
    console.error(`missing ${path.relative(ROOT, f)}: make the reel first (reel.mjs make ${pp})`);
    process.exit(1);
  }
}
const edlRaw = fs.readFileSync(edlPath, "utf8");
const edl = JSON.parse(edlRaw);
const events = keyEvents(edl);

// ---- 1. plan: the tempo whose beat grid fits this reel's moments best
const plan = has("bpm") ? { bpm: Number(flag("bpm")), cost: null, offset_s: null } : planGrid(events);
const reelS = edl.duration_ms / 1000;
// generate longer than the reel: the alignment trims up to one bar off the front and may slow the track by up to 8 percent
const seconds = Math.ceil(reelS * 1.1 + 4 * (60 / plan.bpm) + 3);
const seedBase = Number(pp.slice(3)) * 1000 + Number(flag("seed") ?? 0);
const tries = Number(flag("tries") ?? (engine === "comfy" ? 2 : 1));
const tags = `${flag("tags") ?? STYLES[style].tags}. ${plan.bpm} BPM, ${STYLES[style].key}.`;
console.log(`[music] ${pp}: ${engine}/${style}, plan ${plan.bpm} BPM (grid fit cost ${plan.cost?.toFixed?.(3) ?? "n/a"}), ${seconds} s bed, ${tries} try/tries`);

// ---- 2. get a bed per try, measure its real beats, align, keep the best
let variant = null;
if (engine === "comfy") {
  const pf = await preflight();
  if (!pf.ok) {
    console.error(`\n[music] ComfyUI is not ready: ${pf.error ?? ""}`);
    if (pf.reachable) {
      console.error(`  server ${pf.url} (ComfyUI ${pf.version}, ${pf.gpu}) is up`);
      if (pf.missing_nodes.length) console.error(`  missing nodes: ${pf.missing_nodes.join(", ")} (update ComfyUI)`);
      if (!pf.variant) console.error(`  ACE-Step 1.5 model files are not installed.\n\n${pf.help}`);
    }
    console.error("\nNothing was generated and no music version was written. Use --engine standin to test the pipeline with a synthesised stand-in bed.");
    process.exit(3);
  }
  variant = pf.variant;
  console.log(`[music] ComfyUI ${pf.version} on ${pf.gpu}, model layout: ${variant}`);
}

const attempts = [];
for (let t = 0; t < tries; t++) {
  const seed = seedBase + t;
  let file;
  let meta = {};
  if (engine === "comfy") {
    const g = await generate({ tags, seed, bpm: plan.bpm, seconds, keyscale: STYLES[style].key, prefix: `growth/${pp}` }, { variant, onStatus: (m) => console.log(`[music]   ${m}`) });
    file = g.file;
    meta = { cached: g.cached, took_s: g.took_s ?? null, cache_key: g.key };
  } else {
    const skew = Number(flag("standin-skew") ?? 0); // percent; lets tests simulate a generator that drifts off the requested tempo
    const phase = 0.1 + (seed % 9) * 0.04;
    file = path.join(ROOT, "growth", "assets", "music", `standin-${plan.bpm}-${seconds}-${seed}-${skew}.wav`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      const bed = standinBed({ bpm: plan.bpm * (1 + skew / 100), seconds, seed, phase_s: phase });
      fs.writeFileSync(file, wavStereo(bed, bed));
    }
    meta = { phase_requested_s: phase, skew_percent: skew };
  }
  const an = analyzeFile(file, { seconds });
  const al = alignToBeats(events, { bpm0: an.bpm, phase0: an.phase_s, target_bpm: plan.bpm });
  const score = alignmentScore(al.deviations, 70);
  console.log(`[music]   try ${t + 1}: measured ${an.bpm.toFixed(1)} BPM (confidence ${an.confidence.toFixed(1)}), stretch ${(al.rate * 100 - 100).toFixed(1)}%, ${score.within}/${score.total} moments within 70 ms`);
  attempts.push({ seed, file, an, al, score, meta });
}
attempts.sort((x, y) => y.score.ratio - x.score.ratio || x.al.cost - y.al.cost);
const best = attempts[0];

// ---- 3. mix, mux, record
const bed = readBed(best.file, { trim_s: best.al.trim_s, rate: best.al.rate, seconds: reelS + 0.5 });
const mixed = mixMusic({ bed, edl, hits: !has("no-hits"), sweep: !has("no-sweep") });
const outFile = path.join(outDir, "reel.music.mp4");
muxMix({ reel, L: mixed.L, R: mixed.R, out: outFile });

const info = {
  version: 1,
  pain_point: pp,
  engine,
  engine_note: engine === "standin" ? "a synthesised stand-in bed, NOT generated music" : `ACE-Step 1.5 via ComfyUI (${variant})`,
  style,
  tags,
  seed: best.seed,
  bpm_planned: plan.bpm,
  bpm_measured: Math.round(best.an.bpm * 10) / 10,
  beat_confidence: Math.round(best.an.confidence * 10) / 10,
  stretch_rate: Math.round(best.al.rate * 1000) / 1000,
  trim_s: Math.round(best.al.trim_s * 1000) / 1000,
  bpm_final: Math.round(best.al.bpm_final * 10) / 10,
  alignment: { ...best.score, deviations: best.al.deviations },
  hits: !has("no-hits"),
  sweep: !has("no-sweep"),
  bed: path.relative(ROOT, best.file),
  bed_meta: best.meta,
  tries: attempts.map((t) => ({ seed: t.seed, bpm: Math.round(t.an.bpm * 10) / 10, ratio: Math.round(t.score.ratio * 100) / 100 })),
  edl_sha: crypto.createHash("sha1").update(edlRaw).digest("hex"),
  warnings: mixed.warnings,
  duration_ms: edl.duration_ms,
  sample_rate: SR,
};
fs.writeFileSync(path.join(outDir, "music.json"), JSON.stringify(info, null, 2));
for (const w of mixed.warnings) console.warn(`[music] WARNING ${w}`);
console.log(JSON.stringify({ ok: true, reel: path.relative(ROOT, outFile), engine, bpm_final: info.bpm_final, within_70ms: `${best.score.within}/${best.score.total}`, size_mb: Math.round((fs.statSync(outFile).size / 1e6) * 10) / 10 }));
console.log(`next: node growth/scripts/qc/qc.mjs --pp ${pp} --variant music`);
