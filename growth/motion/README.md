# Motion reels - ads made purely in code

Reels for Snap's Instagram and Facebook built from code alone: SVG and three.js in headless Chromium, a DSP-synthesised score, ffmpeg.
No screen recording, no staging session, no AI video generation.
A spec file in, a postable 1080x1920 reel out, identical on every render.

Read `SERIES.md` first: it is the concept, the ad anatomy and the episode backlog.

## Make an episode

```bash
node growth/motion/render.mjs new     E002 The Deposit Chaser   # scaffold episodes/E002-the-deposit-chaser/spec.json
# edit the spec: pain + evidence, stations, captions, proof rows, claims, caption, ad copy
node growth/motion/render.mjs check   E002    # claims cite real code, evidence rules, no em dashes, timing fits
node growth/motion/render.mjs stills  E002    # key frames + out/E002/contact.png in ~20 s: look at them
node growth/motion/render.mjs render  E002    # every frame + score -> out/E002/reel.mp4, cover.png, then QC
node growth/motion/render.mjs package E002    # writes episodes/E002-*/package.md for the founder
```

Then hand `out/E002/reel.mp4`, `cover.png` and `package.md` to the founder.
The founder posts (growth/AGENTS.md rule 1).

Requirements: Node 20+, ffmpeg, and Playwright with Chromium (resolved through `NODE_PATH` or a local install).
A render of a 24 s reel takes 3-7 minutes on 4 cores.

## The quality bar, every episode

1. `check` passes.
2. You have looked at `contact.png` and at least four full-size stills, including one mid-transition.
   QC passing is necessary, not sufficient (growth/LESSONS.md lesson 22).
3. Every word on screen reads at phone size: nothing under 26 px, captions 52 px or larger.
4. Critical text stays inside `SAFE` (`engine/runtime.js`): Instagram covers the top bar, the right rail and the caption at the bottom.
5. `render` ends with every QC line PASS: 1080x1920, h264 yuv420p, 30 fps, AAC, duration, size, -14 LUFS, no freeze over 1.5 s.
6. Every station is a real chore, every proof row is a real Snap feature, every number has a claim.

## How it works

```
episodes/E001-*/spec.json      what to show: scenes with props, claims, pain evidence, caption, ad copy
engine/index.html, main.js     loads the spec; three layers (back SVG, WebGL canvas, front SVG); window.__reel.seek(t)
engine/runtime.js              time helpers, easing, seeded random, kinetic text, safe area
engine/iso.js                  isometric solids after the anatomy skill: boxes, cylinders, lines, text on faces
engine/stations.js             the station library: one device per chore (inbox, calendar, contract, invoice, payment, gallery)
engine/figure.js               the tiny photographer who walks the machine
engine/scenes/*.js             scene types: machine, checklist, cta
audio.mjs                      cue list -> 48 kHz stereo WAV (every sound is a few lines of DSP)
render.mjs                     the CLI above
vendor/three.module.min.js     three.js 0.170.0, pinned and vendored (MIT)
out/                           renders, gitignored
```

**Determinism.** A scene is a pure function of its local time: `render(t, dur, props, ctx)` returns `{ back, front, gl }` strings.
Nothing animates on its own clock; `render.mjs` seeks every frame and screenshots it.
Random-looking motion comes from `wobble()` or `rng(seed)`, never `Math.random()`.

**Sound follows picture.** Each scene type has `cues(props, dur)` returning `{ t, kind, ... }`.
`main.js` offsets them by the scene's start and `audio.mjs` synthesises them, so moving a beat in the spec moves its sound with it.

## Extend it

- **A new station** (most new episodes need one or two): add an object to `STATIONS` in `engine/stations.js` with a `label` and `draw(cam, T, x0, st)`.
  Build it on its own base plate (x0..x0+200, y 0..124), the device in y 6..60, at least 8 parts: a body with a bevel, a part that moves while `st.active`, a screen or paper that shows the chore, and a `lamp` that blinks once `st.visited`.
  Add its sound as a `station:<kind>` case in `audio.mjs`.
  Follow `.claude/skills/anatomy/references/craft.md`: solids not wireframes, one lit accent, parts that sit on parts, lines that end on something.
- **A new scene type**: add `engine/scenes/<type>.js` exporting `render` and `cues` (and `init` plus `usesGL: true` if it draws with three.js).
- **Another look**: `TONE.dusk` (default, the BUCK-inspired clay diorama) and `TONE.dark` (anatomy line-art) ship today; set `theme` on the machine scene.
- **Another brand (Webcules)**: add a palette to `TONE` in `engine/iso.js`, put the brand's colours and logo in `marketing/brands/`, and give the scenes a `theme` prop.
  The machine and proof scenes take colours from the palette and the logo from props.

## Relation to the rest of the growth system

The demo-reel pipeline (`growth/RUNBOOK.md`) records real Snap screens on staging.
This pipeline is the other half: concept ads that make a pain felt, with no staging dependency, so they can ship while a demo is blocked.
Episodes can point at a ledger record with `pain.ledger`, and the claim rules are the same.
