#!/usr/bin/env node
// Make a music version of a finished reel: a continuous, trailer-style track whose beats land on the reel's step changes.
//
//   node growth/scripts/music/music.mjs --pp PP-004 [--engine comfy|standin] [--style trailer|upbeat|calm]
//                                       [--tags "..."] [--seed N] [--tries N] [--bpm N] [--no-hits] [--no-sweep] [--label name]
//   --ref <audio file>     steer tempo and key by a reference track you supply (only two measured numbers are used, never the audio)
//   --sfx tonal|classic    tonal (default): the effects are notes in the track's measured key, snapped to its groove. classic: the noise effects.
//   --quantize off         keep every cue at its exact time (tonal mode otherwise nudges cues onto sixteenth-note slots, see sync.mjs snapCues)
//   styles: heroic, techintro, funk, indie, tropical, caper, chiptune, sunny, synthpop (all bright accents), orchestral, thriller, action, trailer (default), upbeat, calm.
//   --label keeps several versions side by side.
//
// Reads  : growth/out/<PP>/{reel.mp4, edl.json}      (reel.mp4 is never modified)
// Writes : growth/out/<PP>/reel.music[.label].mp4 and growth/out/<PP>/music[.label].json
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
import { keyEvents, planGrid, alignToBeats, alignmentScore, snapCues } from "./sync.mjs";
import { analyzeFile, decodeMono } from "./beats.mjs";
import { estimateKey, parseKey, keyName } from "./keys.mjs";
import { cuesFromEdl } from "../edit/sfx.mjs";
import { readBed, mixMusic, muxMix, wavStereo } from "./mix.mjs";
import { standinBed } from "./standin.mjs";
import { preflight, generate } from "./comfy.mjs";

const STYLES = {
  heroic: {
    key: "C major",
    bpm: [96, 124],
    accent: "trailer",
    tags: "Heroic epic superhero-movie orchestral score, instrumental only, no vocals. A triumphant brass fanfare theme with powerful French horns and trumpets, a steady marching snare and pounding timpani, soaring strings playing an uplifting rising melody, big heroic crescendos, hopeful and courageous, full cinematic orchestra recorded in a large hall, major key, ends with one huge triumphant final hit",
  },
  techintro: {
    key: "E minor",
    bpm: [118, 134],
    accent: "pop",
    tags: "Modern tech-conference YouTube channel intro, instrumental only, no vocals. Punchy clean electronic production, a tight four-on-the-floor kick, rhythmic plucked synth arpeggios, a confident bright synth lead hook, subtle glitchy percussion and quick risers, forward-looking and energetic, short and slick, ends with one clean final hit",
  },
  funk: {
    key: "E minor",
    bpm: [100, 118],
    accent: "pop",
    tags: "Fun upbeat disco-funk groove, instrumental only, no vocals. A tight funky drum beat, a slapped and popping electric bass line, a wah-wah rhythm guitar playing choppy 16th-note chords, punchy brass section stabs, bright electric piano, a playful strut, feel-good and confident, clean live-band production, ends with one bright final hit",
  },
  indie: {
    key: "G major",
    bpm: [108, 124],
    accent: "pop",
    tags: "Happy feel-good indie-folk pop, instrumental only, no vocals. Stomping kick and tambourine, lots of handclaps, a bright strummed acoustic guitar, a bouncy ukulele, glockenspiel and a cheerful whistled melody, warm upright bass, a sing-along energy, sunny and carefree, organic live recording, ends with one bright final hit",
  },
  tropical: {
    key: "D major",
    bpm: [100, 118],
    accent: "pop",
    tags: "Fun tropical summer groove, instrumental only, no vocals. A relaxed dancehall-style rhythm with congas, shakers and a woodblock, a bubbly marimba and steel drum melody, plucked nylon guitar, a warm round bass, bright sunny beach-party mood, light and playful, clean polished production, ends with one bright final hit",
  },
  caper: {
    key: "F major",
    bpm: [112, 132],
    accent: "pop",
    tags: "Playful quirky jazz caper, instrumental only, no vocals. A light swinging drum groove with brushes, a walking upright bass, sneaky pizzicato strings, a cheeky muted trumpet and bouncy piano, whimsical heist-comedy energy, mischievous and fun, tight vintage film-score recording, ends with one bright final hit",
  },
  chiptune: {
    key: "C major",
    bpm: [120, 140],
    accent: "pop",
    tags: "Fun upbeat 8-bit chiptune video-game music, instrumental only, no vocals. Square-wave and pulse-wave lead melody, a bouncing triangle-wave bass, fast arpeggios, crisp noise-channel drums, retro arcade energy, cheerful and playful, ends with one bright final hit",
  },
  sunny: {
    key: "A major",
    bpm: [108, 126],
    accent: "pop",
    tags: "Fun, sunny, feel-good dance-pop, instrumental only, no vocals. A bright four-on-the-floor beat with a punchy kick and handclaps on 2 and 4, bouncy pulsing analog synth bass, sparkling bright arpeggios, a catchy singable synth lead hook, warm lush pads, joyful summer energy that makes you want to dance, bright major key, clean polished modern pop production, light and playful, ends with one bright final hit",
  },
  synthpop: {
    key: "F# minor",
    bpm: [112, 124],
    accent: "pop",
    tags: "Euphoric synth-pop dance anthem, instrumental only, no vocals. Driving four-on-the-floor kick, pulsing analog synth bass, shimmering arpeggiated synths, big soaring synth lead melody, handclaps and open hi-hats, warm lush pads, uplifting and emotional but full of energy, dancing-alone-on-the-dance-floor feeling, clean polished modern pop production, ends with one bright final hit",
  },
  orchestral: {
    key: "D minor",
    bpm: [90, 118],
    tags: "Epic orchestral film score, instrumental only, no vocals. A full symphony orchestra: pounding timpani and taiko ostinato, relentless staccato low strings (cellos and double basses) driving the rhythm, powerful brass stabs and braams, soaring violins, steadily rising tension building to a huge dramatic crescendo, cinematic live orchestra recording, no electronic drums, no synthesizers, no pop beat, ends with one big final hit",
  },
  thriller: {
    key: "C minor",
    bpm: [96, 124],
    tags: "Dark tense action-thriller film score, instrumental only, no vocals. Pulsing low string ostinato, ticking percussion and suspenseful staccato strings, deep brass hits, a menacing sub-bass drone underneath, spy-chase urgency, tension that keeps building, cinematic orchestral with subtle hybrid sound design, no pop drums, no melody-heavy synth, ends with one big final hit",
  },
  action: {
    key: "E minor",
    bpm: [118, 140],
    tags: "High-energy action movie score, instrumental only, no vocals. Fast driving orchestral ostinato strings, heavy epic percussion and taiko, aggressive brass, big dramatic hits and risers, relentless forward momentum like a car chase, powerful and heroic, cinematic orchestral with modern hybrid power, ends with one big final hit",
  },
  trailer: {
    key: "A minor",
    bpm: [88, 132],
    tags: "Epic cinematic movie-trailer score, instrumental only, no vocals. A driving heartbeat kick on every beat, deep sub bass pulse, tense staccato strings ostinato, taiko and braam hits, steadily building intensity, modern hybrid orchestral, dark and confident, tight clean mix, ends cleanly",
  },
  upbeat: {
    key: "C major",
    bpm: [96, 128],
    tags: "Modern upbeat tech product-launch instrumental, no vocals. Tight punchy drums, bright plucked synth arpeggio, warm bass, optimistic and energetic, clean polished mix, ends cleanly",
  },
  calm: {
    key: "D major",
    bpm: [70, 100],
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
const label = flag("label"); // keep several versions side by side: reel.music.<label>.mp4
if (label && !/^[a-z0-9-]+$/.test(label)) {
  console.error("--label must be lowercase letters, digits and dashes");
  process.exit(2);
}
const sfxLabel = label ? `.${label}` : "";
if (!["comfy", "standin"].includes(engine)) {
  console.error(`unknown engine ${engine}`);
  process.exit(2);
}
if (!STYLES[style]) {
  console.error(`unknown style ${style} (${Object.keys(STYLES).join(", ")})`);
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
const [bpmMin, bpmMax] = STYLES[style].bpm;

// --ref <audio file>: take only the TEMPO and KEY of a reference track the founder supplies, and steer the generation with those two
// numbers. The audio itself is never copied, uploaded, mixed or kept: the generator is not given it and nothing here stores it.
let reference = null;
if (flag("ref")) {
  const refPath = path.resolve(flag("ref"));
  if (!fs.existsSync(refPath)) {
    console.error(`--ref file not found: ${refPath}`);
    process.exit(2);
  }
  const an = analyzeFile(refPath, { seconds: 90 });
  const k = estimateKey(decodeMono(refPath, { seconds: 90 }));
  reference = { name: path.basename(refPath), bpm: Math.round(an.bpm * 10) / 10, beat_confidence: Math.round(an.confidence * 10) / 10, key: keyName(k), key_margin: Math.round(k.margin * 1000) / 1000 };
  console.log(`[music] reference ${reference.name}: ${reference.bpm} BPM (confidence ${reference.beat_confidence}), key ${reference.key} (margin ${reference.key_margin}). Only these numbers are used.`);
  if (reference.beat_confidence < 2) console.warn("[music] WARNING the reference has no clear beat, so its tempo may be wrong: pass --bpm to set it yourself");
}
const KEY = reference && reference.key_margin >= 0.04 ? reference.key : STYLES[style].key;
const plan = has("bpm") ? { bpm: Number(flag("bpm")), cost: null, offset_s: null } : reference ? { bpm: Math.max(60, Math.min(180, Math.round(reference.bpm))), cost: null, offset_s: null } : planGrid(events, { bpmMin, bpmMax, prior: Math.round((bpmMin + bpmMax) / 2) });
const reelS = edl.duration_ms / 1000;
// generate longer than the reel: the alignment trims up to one bar off the front and may slow the track by up to 8 percent
const seconds = Math.ceil(reelS * 1.1 + 4 * (60 / plan.bpm) + 3);
const seedBase = Number(pp.slice(3)) * 1000 + Number(flag("seed") ?? 0);
const tries = Number(flag("tries") ?? (engine === "comfy" ? 2 : 1));
const tags = `${flag("tags") ?? STYLES[style].tags}. ${plan.bpm} BPM, ${KEY}.`;
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
    const g = await generate({ tags, seed, bpm: plan.bpm, seconds, keyscale: KEY, prefix: `growth/${pp}` }, { variant, onStatus: (m) => console.log(`[music]   ${m}`) });
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
// the effects are retuned to the key the generated track is REALLY in (the model does not reliably obey the key it is asked for)
const sfxMode = flag("sfx") ?? "tonal";
if (!["tonal", "classic"].includes(sfxMode)) {
  console.error('--sfx must be "tonal" or "classic"');
  process.exit(2);
}
const requestedKey = parseKey(KEY);
const measuredKey = estimateKey(decodeMono(best.file, { seconds }));
const key = measuredKey.margin >= 0.04 ? { tonic: measuredKey.tonic, mode: measuredKey.mode } : requestedKey;
const keySource = measuredKey.margin >= 0.04 ? "measured" : "requested (the measurement was not clear enough)";
const baseCues = cuesFromEdl(edl);
const snapped = sfxMode === "tonal" && flag("quantize") !== "off" ? snapCues(baseCues, { phase_s: best.al.phase_s, period_s: best.al.period_s }) : baseCues;
const moved = snapped.filter((c) => c.snapped_ms !== undefined);
console.log(`[music] key ${keyName(key)} (${keySource}); effects: ${sfxMode}${sfxMode === "tonal" ? `, ${moved.length}/${baseCues.length} cues snapped to the groove` : ""}`);
const mixed = mixMusic({ bed, edl, hits: !has("no-hits"), sweep: !has("no-sweep"), accent: STYLES[style].accent ?? "trailer", sfx: sfxMode === "tonal" ? { mode: "tonal", key, cues: snapped } : null });
const outFile = path.join(outDir, `reel.music${sfxLabel}.mp4`);
muxMix({ reel, L: mixed.L, R: mixed.R, out: outFile });

const info = {
  version: 1,
  pain_point: pp,
  label: label ?? null,
  reference, // tempo and key measured from a supplied reference file, or null. The audio is never stored.
  engine,
  engine_note: engine === "standin" ? "a synthesised stand-in bed, NOT generated music" : `ACE-Step 1.5 via ComfyUI (${variant})`,
  style,
  accent: STYLES[style].accent ?? "trailer",
  tags,
  seed: best.seed,
  bpm_planned: plan.bpm,
  bpm_measured: Math.round(best.an.bpm * 10) / 10,
  beat_confidence: Math.round(best.an.confidence * 10) / 10,
  stretch_rate: Math.round(best.al.rate * 1000) / 1000,
  trim_s: Math.round(best.al.trim_s * 1000) / 1000,
  bpm_final: Math.round(best.al.bpm_final * 10) / 10,
  alignment: { ...best.score, deviations: best.al.deviations },
  sfx: {
    mode: sfxMode,
    key: keyName(key),
    key_source: keySource,
    key_requested: KEY,
    key_margin: Math.round(measuredKey.margin * 1000) / 1000,
    cues_snapped: moved.length,
    cues_total: baseCues.length,
    snap_shift_ms: moved.map((c) => ({ kind: c.kind, from_ms: c.t_orig_ms, to_ms: c.t_ms, shift_ms: c.snapped_ms })),
  },
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
fs.writeFileSync(path.join(outDir, `music${sfxLabel}.json`), JSON.stringify(info, null, 2));
for (const w of mixed.warnings) console.warn(`[music] WARNING ${w}`);
console.log(JSON.stringify({ ok: true, reel: path.relative(ROOT, outFile), engine, bpm_final: info.bpm_final, within_70ms: `${best.score.within}/${best.score.total}`, size_mb: Math.round((fs.statSync(outFile).size / 1e6) * 10) / 10 }));
console.log(`next: node growth/scripts/qc/qc.mjs --pp ${pp} --variant music${label ? ` --label ${label}` : ""}`);
