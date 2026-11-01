#!/usr/bin/env node
// Write an episode's spec.json from its shot list and copy, after frames.mjs has run.
// One builder for every hybrid reel, Glass Studio and Out Here alike.
//
//   node growth/motion/hybrid/spec.mjs <episode dir>
//
// Reads, from the episode folder:
//   clips.json    the shots in order (see run-clips.mjs); a shot's "overlay" goes straight into its
//                 clip-scene props (engine/scenes/clip.js): poster, lines, chip, flash, cardAt, toast,
//                 lift, index. lines.out below 0 counts back from the shot's end.
//   episode.json  id, title, series, brand, caption, hashtags, ad, claims; pain (or painFrom: another
//                 episode folder to borrow its evidence); endcard { rows: [{ title, sub, time, color }],
//                 dur, backdrop, section (the inbox list header, default "TODAY") }.
// and out/<ID>/frames/counts.json from frames.mjs for the timing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOTION = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const epDir = path.resolve(process.argv[2] ?? "");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const clips = read(path.join(epDir, "clips.json"));
const ep = read(path.join(epDir, "episode.json"));
const countsFile = path.join(MOTION, clips.dir, "frames", "counts.json");
if (!fs.existsSync(countsFile)) throw new Error(`no ${path.relative(MOTION, countsFile)}: run hybrid/frames.mjs first`);
const counts = read(countsFile);
const LOGO = "marketing/brands/snap-logo.png";
const r3 = (x) => Math.round(x * 1000) / 1000;

const scenes = [];
let t = 0;
for (const [i, s] of clips.shots.entries()) {
  const n = counts[s.name];
  if (!n) throw new Error(`no frames for shot "${s.name}": run hybrid/frames.mjs`);
  const dur = r3(n / 30);
  const p = { frames: `growth/motion/${clips.dir}/frames/${s.name}/%04d.jpg`, count: n, fps: 30, ...(s.overlay ?? {}) };
  if (i > 0) p.pad = false;
  if (s.move) p.whoosh = true;
  if (p.toast && !p.logo) p.logo = LOGO;
  if (p.lines?.out < 0) p.lines = { ...p.lines, out: r3(dur + p.lines.out) };
  scenes.push({ type: "clip", at: r3(t), dur, props: p });
  t += dur;
}

// The end card: the Snap app on a phone in the glass studio, the day's inbox filling in.
// "endcard": false for a Snap it. spot, which ends on its own diorama with a wordmark overlay instead.
const ec = ep.endcard ?? {};
const endDur = ec === false ? 0 : ec.dur ?? 3.3;
if (ec !== false) scenes.push({
  type: "phone", at: r3(t), dur: endDur,
  props: {
    tagline: "Snap it.", offer: "*0%* commission. *Free* to start.", url: "snaphq.app", logo: LOGO, title: "Inbox",
    backdrop: ec.backdrop ?? "growth/motion/assets/endcard/glass.jpg", tagAt: ec.tagAt ?? 0.85,
    ...(ec.section ? { section: ec.section } : {}),
    rows: (ec.rows ?? []).map((row, k) => ({ at: r3(0.3 + 0.12 * k), ...row })),
  },
});
// Rounded up, so the last scene (at and dur kept to the millisecond) always ends inside the reel.
const total = Math.ceil((t + endDur) * 100 - 1e-6) / 100;
scenes[0].props.padFor = total;

// Stills to look at: the cover, each shot after its moment lands, the end card.
const stills = [0];
for (const sc of scenes.filter((x) => x.type === "clip")) if (!clips.shots.find((s) => sc.props.frames.includes(`/frames/${s.name}/`)).move) stills.push(r3(sc.at + Math.min(2.4, sc.dur - 0.2)));
if (endDur) stills.push(r3(t + 1.2));
stills.push(r3(total - 0.2));

const pain = ep.pain ?? read(path.join(MOTION, "episodes", ep.painFrom, "spec.json")).pain;
const spec = { id: ep.id, title: ep.title, series: ep.series, brand: ep.brand ?? "snap", fps: 30, duration: total, cover: ep.cover ?? 0, stills, pain, claims: ep.claims, scenes, caption: ep.caption, hashtags: ep.hashtags, ad: ep.ad };

// Films (FILM.md) carry a voice-over and a generated score made by hybrid/vo.mjs and hybrid/score.mjs;
// render.mjs mixes them under the synthesised effects. The spoken words go into the spec so check()
// holds them to the same copy and claim rules as on-screen text.
if (ep.format === "film") {
  spec.format = "film";
  const rel = (f) => `growth/motion/${clips.dir}/${f}`;
  spec.soundtrack = {
    ...(ep.vo ? { vo: rel("vo.wav") } : {}),
    ...(ep.score ? { music: rel("music.wav"), musicGain: ep.musicGain ?? 0.55 } : {}),
    sfxGain: ep.sfxGain ?? 0.6,
  };
  if (ep.vo) spec.vo = ep.vo.lines.map((l) => l.text);
}
fs.writeFileSync(path.join(epDir, "spec.json"), JSON.stringify(spec, null, 2) + "\n");
console.log(`${ep.id}: ${total} s, ${scenes.length} scenes -> ${path.relative(MOTION, path.join(epDir, "spec.json"))}`);
