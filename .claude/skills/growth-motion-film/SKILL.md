---
name: growth-motion-film
description: Procedure for making a Snap Film (F##) - a 30 to 60 second voice-over-led montage in the style of Airbnb's Experiences films, with the stylized 3D photographer travelling through several worlds - from a reference breakdown and Pinterest moodboard through script, derived keyframes, Wan 2.2 clips with RIFE, editorial camera moves, Piper voice-over, ACE-Step score, render, QC and the founder package. Use when asked for a film, a long-form motion ad, a "day in the life" story, or to reproduce or study a reference video.
---

# Film (long-form hybrid)

Everything lives in `growth/motion/`. A film is a hybrid episode with a voice-over, a generated score and editorial transitions; every rule of the `growth-motion-reel` skill still applies (claims from code, no model-drawn text or UI, the founder posts).

Read before you start:
1. `growth/motion/FILM.md`: the beats, the transition vocabulary, consistency, sound, the budget.
2. `growth/motion/SERIES.md` and `growth/motion/INSTAGRAM.md`: the universe and the grid.
3. `.claude/skills/growth-motion-reel/SKILL.md`: keyframe, clip and render rules shared by every hybrid episode.
4. `growth/motion/hybrid/sheets.json`: `style_toon`, `photographerToon` and the toon clients and places.

## 0. Preflight

```bash
export NODE_PATH=$(ls -d "$(git rev-parse --show-toplevel)"/node_modules/.pnpm/playwright@*/node_modules | tail -1)   # if playwright is not installed normally
node growth/motion/hybrid/preflight.mjs --film
```

It adds Qwen-Image-Edit, RIFE, ACE-Step, the video loader nodes, Piper and its voices to the reel checks. If anything is missing, report the printed fix and stop.

## 1. Study the reference (when there is one)

```bash
node growth/motion/hybrid/reference.mjs "<video>" --name=<short-name>
```

Read `out/refs/<name>/breakdown.md` and look at `sheet.jpg` and every `shot-NN.jpg`. Write down the beat table (FILM.md) with this reference's real times: how long the establish runs, how many chapters, where the voice starts after each cut, where the music turns.

## 2. Write the script (founder approves before any GPU time)

Create `growth/motion/episodes/F##-<slug>/brief.md`:

- **Logline**: one sentence, the photographer's day and the turn.
- **Beat table**: beat, time, shot(s), what we see, the spoken line, the transition out, the Snap moment (a real inbox card, `grep -rn 'eventType: "' apps/snap/lib`).
- **Voice-over**: every line, one sentence a chapter, the pattern that turns once, the three-word app line.
- **Music**: the sections and where they change.
- **Claims**: every spoken or on-screen promise with its `apps/snap` source.

Show the founder the brief and stop until they confirm the story.

## 3. Moodboard (after the story is confirmed)

Browse Pinterest in Chrome, read-only: search the places, the light and the moments in the script. For every pin you take something from, add its URL and what it gives (palette, light, composition, prop, gesture) to `episodes/F##-*/moodboard.md`, grouped by chapter. Download images only to `out/F##/refs/` for looking; never commit them and never give them to a model. Show the founder the moodboard and let them strike pins before keyframes.

## 4. Sheets and keyframes

- Add every new client and place to `sheets.json` first (toon versions: ages, heights, hair, every piece of clothing; places with a lighting plan and a camera).
- Write `<shot>.keyframe.txt` from the sheets and the moodboard notes: `{style_toon} {location} {who does what} {photographerToon} ...`.
- A returning person or place is **derived**: first line `@from <shot>`, then the edit ("Keep her face, glasses, bun and clothes exactly the same. Now she ...").

```bash
node growth/motion/hybrid/keyframes.mjs episodes/F##-<slug> --only=<source shots>   # look, then --pick
node growth/motion/hybrid/keyframes.mjs episodes/F##-<slug> --only=<derived shots>  # after their sources are picked
```

Reject candidates with an off-model photographer, text or logos, broken hands, or a character at the wrong scale.

## 5. Shot list and clips

`clips.json` as in every hybrid episode, plus:

- `"interp": "rife"` at the top.
- **Grow** joins as moves (`"move": true, "to": "<shot>"`), only between frames that share a layout.
- **Dive** joins as `"camera": { "push": { "zoom": 4, "from": 0.6, "at": [fx, fy] } }` on the outgoing shot and `"camera": { "land": { "zoom": 1.6, "dur": 0.7, "at": [fx, fy] } }` on the incoming one; measure `at` on the shot's last frame with a grid, do not guess.
- **Whip** joins as `"camera": { "whip": "out" }` and `{ "whip": "in" }`.
- A slow `"drift": { "zoom": [1, 1.06] }` on shots whose clip barely moves.

```bash
node growth/motion/hybrid/run-clips.mjs episodes/F##-<slug> --draft   # look at every draft frame by frame
node growth/motion/hybrid/run-clips.mjs episodes/F##-<slug>           # keeps, in the background
```

## 6. Frames, voice, music

```bash
node growth/motion/hybrid/frames.mjs episodes/F##-<slug>   # RIFE, trim, retime, camera moves -> frames/ and counts.json
node growth/motion/hybrid/vo.mjs     episodes/F##-<slug>   # vo.wav; read the printed table: every line inside its slot
node growth/motion/hybrid/score.mjs  episodes/F##-<slug>   # music.wav from the score sections
```

Check the joins: put the last frame of each shot beside the first frame of the next (`out/F##/frames/<shot>/`). A dive must read as one move, a grow must not dissolve.
If a line overlaps the next, shorten the words before raising `fit`.

## 7. Build, render, package

```bash
node growth/motion/hybrid/spec.mjs  episodes/F##-<slug>
node growth/motion/render.mjs check  F##     # also lints the spoken words and the soundtrack files
node growth/motion/render.mjs stills F##     # look
node growth/motion/render.mjs render F##     # every QC line PASS
node growth/motion/render.mjs package F##
```

Watch the film once at full speed with sound. Hand the founder `out/F##/reel.mp4`, `cover.png` and `package.md`, and say: turn on the AI label (generated footage, synthetic voice and music).
Clean up as in the reel skill, plus `*.rife.mp4` you did not keep and `growth/rife` and `growth/film` outputs in ComfyUI.

## Never

- Never start GPU work before the founder confirms the script.
- Never copy a reference's content, characters, words or brand: take structure, timing and feeling only.
- Never commit or generate from Pinterest or reference images.
- Never let the voice-over promise what the code does not do; spoken claims need sources like on-screen ones.
- Never post, schedule or upload; the founder does.
