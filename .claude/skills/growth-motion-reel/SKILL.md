---
name: growth-motion-reel
description: Procedure for making a Snap Instagram or Facebook reel in the house hybrid style - tiny realistic figurines in a miniature world, generated as keyframes (Z-Image) and clips (Wan 2.2) on local ComfyUI, with every word, Snap inbox card, cover tile and the app end card drawn in code - then checked, rendered, QC'd and packaged. Two registers - Glass Studio (one feature, about 8 s, in the lavender poster world) and Out Here (a story across floating worlds, about 30 s). Use when asked for a new reel, ad, episode or motion piece for Snap that does not need a staging screen recording.
---

# Motion reel (hybrid)

Everything lives in `growth/motion/`. The model draws the picture; code draws every word and every Snap moment, so claims stay exact and renders repeat.

Read before you start:
1. `growth/motion/INSTAGRAM.md`: the grid rules, the two registers, the formats, the concept engine and the first twelve concepts (G01-G12).
2. `growth/AGENTS.md`: the rules that apply to every growth artefact.
3. The example closest to your job, end to end: `episodes/G02-just-pay/` (Glass Studio) or `episodes/S01-a-day-out-here/` (Out Here). Copy its files; do not invent a new layout.
4. `growth/motion/hybrid/sheets.json`: the house style, the recurring people and the locations.

## 0. Preflight (always)

```bash
export NODE_PATH=$(ls -d "$(git rev-parse --show-toplevel)"/node_modules/.pnpm/playwright@*/node_modules | tail -1)   # if playwright is not installed normally
node growth/motion/hybrid/preflight.mjs
```

It checks ComfyUI (`GROWTH_COMFY_URL` in `growth/.env.local`), the GPU, every model file and LoRA, ffmpeg with libx264, Playwright and the vendored Inter, and prints the fix for anything missing.
If it fails, report what it printed and stop: do not substitute other models, do not fall back to the code-only three.js world.

## 1. Pick the concept

- Take the next unmade row of the concept table in `INSTAGRAM.md`, or the one you were asked for. Glass Studio unless the brief is a story.
- Never the same feature as the last reel; rotate shoot types; match the season.
- Reuse people: the photographer always, and earlier clients where it helps the story (Priya and Sam inquire in G01 and marry in S01; the fall family pays in G02).

## 2. Ground every word in the code

- Every inbox card mirrors a real event: find it with `grep -rn 'eventType: "' apps/snap/lib` and copy its `title` wording (`New inquiry - {name}`, `Invoice {number} paid`, ...); where the code has an em dash, write a plain dash.
- Every claim in hook, card, caption or ad copy gets a `{ text, source, match }` entry that `render.mjs check` can find in `apps/snap`. Read the source; never quote a tier, limit or price from memory.
- Never imply automation Snap does not do. Captions end with the honest line ("It is not magic: you still ...").

## 3. Write the episode folder

`growth/motion/episodes/<ID>-<slug>/` (Glass Studio `G##`, Out Here `S##`):

| File | What |
|---|---|
| `brief.md` | the director's brief in plain language (who, where, what happens, which Snap moment, how it should feel), then a Production section with the seeds you kept |
| `<shot>.keyframe.txt` | one per shot: the first frame, written from the sheets (step 4) |
| `clips.json` | the shot list: `dir`, `w`/`h` (720x1280), `keyframes` (seeds), and `shots` with `name`, `seed`, `prompt`, optional `move`, `use`, `speed`, `overlay` |
| `episode.json` | `id`, `title`, `series`, `brand`, `painFrom` (or `pain`), `claims`, `caption`, `hashtags`, `ad`, `endcard.rows` |

`spec.json` and `package.md` are generated; never edit them by hand.

### Overlays (in `clips.json`, per shot)

- Glass Studio: `poster` (frame 0 is the grid tile: `{ brand, kicker, headline: [line, line], out: 1.6 }`, one `*accent*` word), `cardAt`, `toast: { title, sub }`, `lift: 200` (static camera only).
- Out Here: the first shot gets the hook `lines` (`out: -0.35` = 0.35 s before the shot ends); each world gets `chip: [time, what]`, `flash`, `cardAt`, `toast`, `index`; the closing wide gets the summary `lines`.
- Moves get no overlay; the builder adds the whoosh.

## 4. Keyframes

Write each `<shot>.keyframe.txt` from `sheets.json`, pasting the sheets verbatim (Kaye rule: specifics are what consistency is made of):

- Glass Studio: `Vertical frame. {locations.glassStudio} Composition: the scene sits in the vertical middle of the frame; calm empty lavender space above it and smooth empty lavender floor below it. {the glass object for the feature, see INSTAGRAM.md's vocabulary} Tiny figurines stand on the lavender floor: on the left, {characters.photographer}; on the right, {clients}. Scale lock: {numbers}. {style_glass}`
- Out Here: `Vertical frame, the whole island in view with sky around it. {location} {who does what}. Standing on the grass of the same island, at the same small figurine scale as everyone else, is {characters.photographer}, photographing {subject}. Everyone stands on the island; nothing stands in the air. Scale lock: {numbers}. {style}`
- New people and places go into `sheets.json` first, with exact ages, heights, weights, hair and every piece of clothing.

```bash
node growth/motion/hybrid/keyframes.mjs episodes/<ID>-<slug> [--only=shot] [--n=4] [--seed=N]
```

Read each contact sheet `out/<ID>/kf/<shot>.jpg` (seeds left to right) and reject any candidate with: a person off the island or floating; anyone out of scale (a baby bigger than a forearm, guests smaller than the couple, a giant photographer); the photographer off-model; text or logos; for Glass Studio, anything in the top third or a visible lamp or orb. Then:

```bash
node growth/motion/hybrid/keyframes.mjs episodes/<ID>-<slug> --pick=shot:seed[,shot:seed]
```

## 5. Clips

Motion prompts start with the camera rule and say what must not happen:
- Glass Studio: `Static camera. The camera does not move at all: no push-in, no zoom, no pan, no tilt, no cuts.` (needed for `lift`).
- Out Here worlds: `Very slow, very slight push-in; the whole island stays in frame the entire time; no zoom, no cuts.`
- Moves: `... The tiny figurines stay exactly where they are on their islands, frozen in place: nobody walks, runs, jumps, floats or leaves an island, nobody grows or shrinks. Only the camera moves. No cuts, no fades, no morphing.`
- Then the action with physics, the light, `Same faces, same clothes, nothing drifts.`, and the feeling. Write the Snap moment as something visible (cards rising out of the envelope, a coin landing in her hand), never as text.

```bash
node growth/motion/hybrid/run-clips.mjs episodes/<ID>-<slug> --draft   # 480x832 drafts, about 100 s each, as out/<ID>/<shot>.draft.mp4
# look, fix prompts or seeds (delete a draft to remake it), then keep at 720x1280:
node growth/motion/hybrid/run-clips.mjs episodes/<ID>-<slug>                     # about 320 s a shot, 90 s a move; resumable
```

A 480 draft and a 720 keep with the same seed are different takes, so judge the 720 clip too. Long runs go in the background.
Look at every clip, not just the first frame:

```bash
ffmpeg -v error -y -i out/<ID>/<shot>.mp4 -vf "select='not(mod(n,16))',scale=240:-1,tile=6x1" -frames:v 1 /tmp/<shot>.jpg
```

| Failure | Fix |
|---|---|
| the clip washes into milky haze after frame 0 | new seed, add `Crisp, vivid colours and clear contrast throughout, no haze, no fog, no fade, no mist.` |
| the push-in drifts a person out of frame | `use: [0, s]` to cut before it, or re-roll with the very slight push-in line |
| a move animates people instead of the camera | the frozen-figurines line (above); never remove it |
| a move cross-dissolves one island through another | two or three more seeds (a one-off `hybrid/wan.mjs` run with `--last=`), keep the cleanest, set its seed in `clips.json` |
| people grow, shrink or morph | a stronger scale lock in the keyframe, then re-roll |

Deleting a shot's mp4 makes `run-clips` remake it and every move that starts from it; delete those moves too.

## 6. Build, check, look, render

```bash
node growth/motion/hybrid/frames.mjs episodes/<ID>-<slug>     # trim, retime moves (speed 1.4), interpolate to 30 fps
node growth/motion/hybrid/spec.mjs   episodes/<ID>-<slug>     # writes spec.json
node growth/motion/render.mjs check  <ID>                      # claims cite real code, no em dashes, timing
node growth/motion/render.mjs stills <ID>                      # then read the stills
```

Look at the cover crop (`crop=1080:1440:0:240`: it must read like the posters, figurines clear of the pill), every card moment, and the end card. For Out Here, also put the last frame of each shot beside the first frame of the next (`out/<ID>/frames/<shot>/`); they must match.

```bash
node growth/motion/render.mjs render  <ID>    # every QC line must say PASS (about 45 s for 8 s, 4 min for 30 s)
node growth/motion/render.mjs package <ID>    # episodes/<ID>-*/package.md for the founder
```

## 7. Hand off and clean up

- Hand the founder `out/<ID>/reel.mp4`, `cover.png` and `package.md`. Say: turn on Instagram's AI label (generated footage).
- Delete what you did not keep: `out/<ID>/kf/`, drafts, rejected seeds, `still-*`, `contact.png`, `video.mp4`, `score.wav`, and your `growth/motion*` and `growth/wan*` files in ComfyUI's `output/` and `growth-*` uploads in its `input/`. Keep keyframes, kept clips and `frames/`.
- Commit the episode folder and any sheet changes (`out/` is gitignored), no em dashes, no agent co-author line. Mark the concept made in `INSTAGRAM.md`.

## Never

- Never post, schedule or upload to Instagram or Facebook; the founder does (growth/AGENTS.md rule 1).
- Never let a model draw words, numbers, prices, logos or app UI; they are code.
- Never generate whole reels or the end card with a model; shots and moves only.
- Never change a person's look between reels; edit `sheets.json` deliberately if the founder asks.
- Never loosen a QC threshold or `check` rule to pass; fix the reel.
- Never quote a claim you did not find in `apps/snap`.

The code-only three.js world (E001-E003, `engine/scenes/world.js`) is the retired look; keep it working, do not make new episodes in it unless asked.
