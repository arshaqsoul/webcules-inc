# Motion reels

Reels for Snap's Instagram and Facebook with no screen recording and no staging session.
The house style is hybrid: keyframes and clips generated on local ComfyUI (Z-Image, Wan 2.2), played under code that draws every word, Snap inbox card, cover tile and the app end card, with a DSP-synthesised score, rendered frame by frame in headless Chromium and ffmpeg.

Read `INSTAGRAM.md` first (the playbook), then follow the `growth-motion-reel` skill; the `growth-motion` agent runs it.

## Make a hybrid episode (G## Glass Studio, S## Out Here)

```bash
node growth/motion/hybrid/preflight.mjs                          # ComfyUI, models, ffmpeg, Playwright
node growth/motion/hybrid/keyframes.mjs episodes/G03-x            # candidates from <shot>.keyframe.txt; look; --pick=shot:seed
node growth/motion/hybrid/run-clips.mjs episodes/G03-x --draft    # 480 drafts; look; then without --draft for the 720 keeps
node growth/motion/hybrid/frames.mjs    episodes/G03-x            # trim, retime, interpolate to 30 fps
node growth/motion/hybrid/spec.mjs      episodes/G03-x            # spec.json from clips.json + episode.json
node growth/motion/render.mjs check|stills|render|package G03
```

## Make a film (F##, long-form with voice-over and score)

Read `FILM.md`, then follow the `growth-motion-film` skill. On top of the hybrid steps:

```bash
node growth/motion/hybrid/preflight.mjs --film                    # adds Qwen-Image-Edit, RIFE, ACE-Step, Piper
node growth/motion/hybrid/reference.mjs <video> --name=x          # shots, stills, transcript, tempo of a reference film
# brief.md (the script, founder approves), moodboard.md, keyframes (@from <shot> derives one), clips.json with camera moves
node growth/motion/hybrid/frames.mjs    episodes/F01-x            # with "interp": "rife" and per-shot "camera"
node growth/motion/hybrid/vo.mjs        episodes/F01-x            # voice-over -> out/F01/vo.wav
node growth/motion/hybrid/score.mjs     episodes/F01-x            # music -> out/F01/music.wav
node growth/motion/hybrid/spec.mjs      episodes/F01-x            # render.mjs mixes both under the effects
```

## Make a code-only episode (E001-E003, the retired three.js look)

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
A 24 s flat reel renders in 3-7 minutes on 4 cores; a 28 s 3D world reel takes longer (software WebGL), so run it in the background.

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
engine/decor.js                clouds, potted plants and the daylight sky
engine/scenes/*.js             scene types: clip (generated frames under code overlays, the house style), world (the code-only 3D journey), phone (app end card), and the retired machine, checklist, cta
engine/world/kit.js            the 3D world kit: clay materials, floating islands, trees, people and poses, animals, props, particles, clouds
engine/world/islands.js        one builder per world: studio, fallPark, lakeWedding, nightParty
audio.mjs                      cue list -> 48 kHz stereo WAV (every sound is a few lines of DSP)
render.mjs                     the CLI above
vendor/three.module.min.js     three.js 0.170.0, pinned and vendored (MIT), loaded through an import map
vendor/jsm/                    the three.js add-ons we use (rounded boxes, EffectComposer passes), same version
out/                           renders, gitignored
```

**Determinism.** A scene is a pure function of its local time: `render(t, dur, props, ctx)` returns `{ back, front, gl }` strings.
Nothing animates on its own clock; `render.mjs` seeks every frame and screenshots it.
Random-looking motion comes from `wobble()` or `rng(seed)`, never `Math.random()`.

**Sound follows picture.** Each scene type has `cues(props, dur)` returning `{ t, kind, ... }`.
`main.js` offsets them by the scene's start and `audio.mjs` synthesises them, so moving a beat in the spec moves its sound with it.

## Extend it

- **A new world** (most new episodes need one or two): add a builder to `engine/world/islands.js` returning `{ group, subject, photographer }`.
  Start from `island(r, biome)`, dress it with the kit (trees, `flowers`, props, `fall()` particles, `sparkles`), add 2-6 people with `actor(look, pose)`, and place the photographer with `shooter(x, z, target)` so the flash fires from their camera.
  Keep the action inside about 3 units of the subject so the 3/4 camera frames it; set the camera per island in the spec (`cam: { dist, el, az0, az1 }`) so the photographer never blocks the subject.
  Look at stills of every world before a render.
- **A new station** (retired machine format only): add an object to `STATIONS` in `engine/stations.js` with a `label` and `draw(cam, T, x0, st)`.
  Build it on its own base plate (x0..x0+200, y 0..124), the device in y 6..60, at least 8 parts: a body with a bevel, a part that moves while `st.active`, a screen or paper that shows the chore, and a `lamp` that blinks once `st.visited`.
  Add its sound as a `station:<kind>` case in `audio.mjs`.
  Follow `.claude/skills/anatomy/references/craft.md`: solids not wireframes, one lit accent, parts that sit on parts, lines that end on something.
- **A new scene type**: add `engine/scenes/<type>.js` exporting `render` and `cues` (and `init` plus `usesGL: true` if it draws with three.js).
- **Another look**: `TONE.sunny` (full colour, the house style from E002), `TONE.dusk` (E001) and `TONE.dark` (anatomy line-art) ship today; set `theme` on the machine scene and `sky: true` on checklist and cta for the daylight Snap world.
- **Another brand (Webcules)**: add a palette to `TONE` in `engine/iso.js`, put the brand's colours and logo in `marketing/brands/`, and give the scenes a `theme` prop.
  The machine and proof scenes take colours from the palette and the logo from props.

## Relation to the rest of the growth system

The demo-reel pipeline (`growth/RUNBOOK.md`) records real Snap screens on staging.
This pipeline is the other half: concept ads that make a pain felt, with no staging dependency, so they can ship while a demo is blocked.
Episodes can point at a ledger record with `pain.ledger`, and the claim rules are the same.

## Hybrid files

```
INSTAGRAM.md                   the playbook: grid rules, registers, formats, concept engine, posting rhythm
hybrid/sheets.json             Kaye-system sheets: house style, recurring people, locations (numeric locks)
hybrid/preflight.mjs           can this machine make a reel, and how to fix it if not
hybrid/comfy-image.mjs         text-to-image graphs (Z-Image Turbo, Flux Schnell), shared with assets.mjs
hybrid/keyframes.mjs           keyframe candidates per shot, contact sheets, --pick
hybrid/wan.mjs                 one Wan 2.2 14B image-to-video clip (or a first-last-frame move)
hybrid/run-clips.mjs           every shot and move of an episode in order, resumable, --draft
hybrid/frames.mjs              clips -> 1080x1920 30 fps frames (trim, retime, interpolate, film camera moves)
hybrid/spec.mjs                clips.json + episode.json + frame counts -> spec.json
FILM.md                        the Film register: beats, transitions, consistency, sound, budget
hybrid/film.mjs (+ .test)      pure film helpers: timeline, voice-over and score placement, the editorial camera
hybrid/rife.mjs                RIFE 2x frame interpolation on ComfyUI (clips.json "interp": "rife")
hybrid/vo.mjs                  episode.json "vo" -> Piper voice-over placed on the timeline (vo.wav)
hybrid/score.mjs               episode.json "score" -> ACE-Step sections crossfaded into music.wav
hybrid/reference.mjs           breakdown of a reference video: shots, stills, transcript, tempo, loudness
engine/scenes/clip.js          plays the frames under the poster cover, chips, flash, inbox card, headlines
engine/overlays.js             the poster cover, time chip and inbox card, shared by clip and world scenes
episodes/G01, G02, S01         worked examples
```
