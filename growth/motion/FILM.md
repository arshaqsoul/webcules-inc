# Films - the long-form register

A **Film** (`F##`) is Snap's version of Airbnb's Experiences films: a 30 to 60 second, voice-over-led montage that travels through several worlds with one photographer, with a little magic at every cut and the Snap app as the payoff.
It is the long sibling of the Snap it. spots (`A##`): the same stylized 3D animated look (`style_toon`, `photographerToon` in `hybrid/sheets.json`), the same rules (`SERIES.md`, `INSTAGRAM.md`, `growth/AGENTS.md`), more story.

The procedure is the `growth-motion-film` skill; the `growth-motion` agent runs it.
This file is the why and the craft.

## What a film is made of

The Airbnb Experiences film (`hybrid/reference.mjs` breakdown of `airbnb-exp2.mp4`, 28.5 s, 11 shots) is the model:

| Beat | Length | What happens | In the Airbnb film |
|---|---|---|---|
| Hook | 0.5-1 s | the most beautiful frame of the film, before anything moves | the beach, as a poster |
| Establish | 4-6 s | a diorama on a seamless backdrop comes alive and opens into a full-size world | the cottage island grows sand and sea, the camera dives in |
| Chapters | 3-4 x 4-6 s | one place, one moment of the work, one spoken line each, 1-2 shots per chapter | surf lesson, Mexico City tacos, Seoul at night |
| Crescendo | 2-3 s | quicker cuts (0.6-1.2 s), the music turns, the energy peaks | the K-pop stage |
| Flash | 0.3 s | the frame blooms to white | white |
| App | 3 s | the Snap app on a phone, built in code | the Experiences tab, then the phone |

Rules that fall out of it:

- **One line per chapter.** The narrator speaks a short sentence (about 2.5 s) that starts 0.3 to 0.5 s after the chapter's cut, then lets the picture breathe for a second. Never talk over the crescendo.
- **The words turn once.** The first chapters set a pattern ("Say you shoot a wedding... Now you can also..."), the last one escalates ("You can even..."), and the app line names what Snap does in three words.
- **Every cut is a transition, not a jump.** Pick one from the vocabulary below for each join, and never use the same one twice in a row.
- **The music changes with the story's turn**, not on a timer: a warm cue for the chapters, a second cue for the crescendo, the first one returning under the app.

## Transition vocabulary

| Transition | How | Use when |
|---|---|---|
| **Grow** | a first-last-frame move (`run-clips` move, `--last`) between a keyframe and a derived keyframe of the same place with something added (`@from`): sand and sea grow around an island, lights come on along an alley | the start and end frames share their layout |
| **Dive** | `camera.push` into a point on the outgoing shot, hard cut at the peak, `camera.land` on the incoming shot settling from a matching zoom | two very different images: a diorama into its full-size world, a phone screen into a place |
| **Whip** | `camera.whip: "out"` then `"in"` on the next shot | changing place at speed, sky to sky |
| **Match** | the same subject in the same frame position across the cut (a camera raised, a door opened) | between chapters with the photographer in both |
| **Flash** | the clip overlay `flash`, or the crescendo blooming to white | the shutter, and the cut to the app |

A first-last-frame move between two images that do not share a layout does **not** travel: Wan cross-dissolves at the end and holds still.
That failure cost a re-roll in the Airbnb test; use a dive or a whip instead.

## Consistency

The audience must believe it is one photographer's day.

- The photographer is `photographerToon`, pasted verbatim into every keyframe, and every client is a sheet in `sheets.json` before any keyframe is drawn.
- When a person or place returns, **derive** its keyframe instead of generating it from text: the keyframe file starts with `@from <shot>` and the rest is the edit instruction ("Keep her face, glasses, bun and clothes exactly the same. She now stands on a cliff at dawn..."). `hybrid/keyframes.mjs` restages the picked keyframe with Qwen-Image-Edit.
- Pick keyframes in story order, so each derived shot has its source picked first.

## Quality: what goes wrong and how to fix it

The QC in `render.mjs` checks size, frame rate, loudness and freezes; it cannot see the picture.
Every defect below reached a finished film once (F01) and was caught only by the founder, so the review in the skill looks for each one by name.

| Defect | Where it comes from | Fix |
|---|---|---|
| Extra or missing limbs (a third leg, a fused hand) | poses where bodies overlap: a lift, a hug, a piggyback, crossed legs; often already in the keyframe | stage people side by side with both feet on the ground; repair the keyframe with `@from` and animate it through `key` |
| A still object rocks, sways or slides (a parked van on a diorama) | Wan animates anything that could move, and the shared negative's "static frame" pushes every shot toward motion | a per-shot `neg` without "static frame" that names the motion ("van rocking, van swaying, objects sliding"), a still-life prompt ("locked-off tripod camera", "parked and never moves"), and no character-animation line |
| Steam, smoke or a puff where none belongs (breath fog drawn as smoke from the camera) | asking for breath, steam or vapour in a keyframe or clip prompt | leave breath and steam out; repair the keyframe with `@from` and add "smoke, steam, breath fog" to the shot's `neg` |
| A take comes out hazy: lifted blacks, about half the colour of its keyframe | seed to seed variance in Wan, worst in misty or spray-filled shots | re-roll, or add a `grade` that brings the levels back; compare the keyframe and frame 40 side by side |
| A grow move dissolves instead of travelling | first and last frames that do not share a layout | use a dive or a whip instead (see the vocabulary) |
| A voice-over word is clipped or misread ("Snab it") | trimming too tight, or a short line Piper cannot say alone | `vo.mjs` keeps a little silence; reword the line and transcribe the mix to check |

**A defect in the keyframe survives every re-roll of its clip.**
Before re-rolling a bad clip, look at its keyframe at full size: if the defect is there, repair the keyframe first.

Three per-shot options in `clips.json` make repairs without breaking the timeline:

- `"neg"`: replaces the shared video negative (`sheets.json` `negative_video`) for this shot.
- `"key"`: animates another picked keyframe (`"key": "falls_fix"` animates `out/<ID>/falls_fix.png`), so the shot keeps its name, its voice-over anchors and its frame counts.
- `"grade"`: an ffmpeg colour filter `frames.mjs` applies after scaling, for example `colorlevels=rimin=0.13:gimin=0.13:bimin=0.13,eq=saturation=1.6:contrast=1.06`.

A repaired keyframe is its own file (`<shot>_fix.keyframe.txt`, first line `@from <shot>`, then "Keep this exact image... change only...") so the original pick, which other shots were derived from, stays reproducible.

## Sound

- **Voice-over**: `episode.json` `vo.lines`, each anchored to a shot (`{ "shot": "dawn", "at": 0.4, "text": "...", "fit": 2.5 }`). `hybrid/vo.mjs` reads them with Piper (`en_US-ryan-high` is a warm male narrator; `en_GB-alan-medium` and `en_US-joe-medium` are installed too), stretches each toward its `fit` within 0.85-1.2x, and refuses lines that collide.
- **Music**: `episode.json` `score`, two or three sections anchored to shots, generated by ACE-Step (`hybrid/score.mjs`) and crossfaded. Instrumental tags only; describe the instruments, the tempo and the feeling.
- **Effects**: the engine's own cues (shutter, card, whoosh) still play, under the music.
- `render.mjs` ducks the music under the voice and normalises to -14 LUFS. A film must still work muted: every spoken claim is also on screen or in the caption.

## Study the reference, collect the mood

- `node growth/motion/hybrid/reference.mjs <video>` breaks any reference film down into shots, stills, a word-timed transcript, tempo and loudness (`out/refs/<name>/breakdown.md`). Copy the structure and the timing, never the content.
- **Moodboard from Pinterest**: browse in Chrome read-only (no saves, no follows, no comments: `growth/AGENTS.md` rule 1). For each pin you use, write its URL and what it gives the film (palette, light, composition, a prop, a gesture) into the episode's `moodboard.md`. Images may be downloaded to `out/<ID>/refs/` for looking only: they are never committed and never fed to a model. Keyframe prompts are written in our own words from the sheets.

## Budget on a 16 GB card (RTX 5070 Ti)

| Step | Time |
|---|---|
| keyframe candidate (Z-Image) | 15 s |
| derived keyframe candidate (Qwen-Image-Edit) | 20 s |
| Wan 2.2 clip, 49 frames at 720x1280 | about 3 min (about 95 s at 1024x576) |
| RIFE 2x per clip | under 1 min |
| voice-over, all lines (Piper, CPU) | 10 s |
| music section (ACE-Step) | about 1 min |
| a 30 s film end to end, one take of everything | about 1.5 hours of GPU |

Draft at 480, keep at 720, and re-roll only what fails.

## Files of a film episode

| File | What |
|---|---|
| `brief.md` | the script: logline, the beat table with times, every spoken line, every transition, then a Production section with the seeds you kept |
| `moodboard.md` | the Pinterest pins and references, with what each one gives the film |
| `<shot>.keyframe.txt` | one per shot; `@from <shot>` on the first line for a derived keyframe |
| `clips.json` | the shot list as in every hybrid episode, plus `"interp": "rife"` and per shot `camera` (`push`, `land`, `drift`, `whip`) and, for repairs, `neg`, `key` and `grade` |
| `episode.json` | as in every hybrid episode, plus `"format": "film"`, `vo`, `score` and optionally `musicGain`, `sfxGain` |

`spec.json` and `package.md` are generated.
