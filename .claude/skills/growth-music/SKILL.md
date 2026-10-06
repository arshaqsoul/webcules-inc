---
name: growth-music
description: Procedure for making a music version of a finished reel - a continuous trailer-style soundtrack generated with ACE-Step in ComfyUI, with its beats synced to the step changes, clicks and end card - and for keeping reels in sync across PCs through R2. Use when an editor or packager is asked for a music version or when media must move between machines.
---

# Music version and media sync

Spec: `growth/DEMO-STANDARD.md` (Music version).
Code: `growth/scripts/music/` and `growth/scripts/sync.mjs`.

## Make the music version

Prerequisite: the reel passed QC (`reel.mp4`, `edl.json` in `growth/out/PP-###/`).

```bash
node growth/scripts/reel.mjs music PP-###                 # trailer style, ComfyUI
node growth/scripts/reel.mjs music PP-### --seed 3        # a different take of the same idea
```

Styles (`--style`), each with its own prompt, key and tempo range:

| Style | Sound | BPM planned within |
|---|---|---|
| `trailer` (default) | hybrid trailer pulse: heartbeat kick, sub bass, strings | 88-132 |
| `orchestral` | live symphony orchestra: timpani, driving cellos and basses, brass, no electronic drums | 90-118 |
| `thriller` | dark tense action-thriller: low string ostinato, ticking percussion, sub drone | 96-124 |
| `action` | fast heroic action-movie score: relentless strings, taiko, aggressive brass | 118-140 |
| `upbeat`, `calm` | product-launch and ambient styles | 96-128, 70-100 |

To compare several versions of one reel, give each a label: `--label orchestral` writes `reel.music.orchestral.mp4`, `music.orchestral.json` and `qc.music.orchestral.json` and leaves the other versions alone.
Check one with `qc.mjs --pp PP-### --variant music --label orchestral`.
`--tries 3` generates three takes and keeps the best-aligned one.

It plans a BPM from the reel's own cut points, generates a bed, measures its real beats, stretches and trims it so the step changes and end card land on beats, adds trailer impacts, a riser and ducking, and writes `reel.music.mp4` and `music.json`.
Then it runs `qc.mjs --variant music`.
The original `reel.mp4` is never touched.

## If ComfyUI is not ready

`music.mjs` exits with code 3 and prints what is missing.
Do not work around it and do not use the stand-in for something that will be posted.

- Unreachable: check `GROWTH_COMFY_URL` in `growth/.env.local` and that the rig is on.
- ACE-Step not installed: ask the founder to put `ace_step_1.5_turbo_aio.safetensors` in `ComfyUI/models/checkpoints` (or the four split files, listed in the message), then refresh ComfyUI.
  A server cannot install its own models without the Manager add-on, and you must not reach into the machine another way.

`--engine standin` exists to test the pipeline.
Its output carries `engine: standin` and QC fails it unless `--allow-standin`.

## Judge the result, do not just trust QC

QC proves the structure (beats within 70 ms, a continuous track, a sane level).
It cannot hear.
Before you hand a music version over:

1. Read `music.json`: planned BPM, measured BPM, stretch (a few percent is natural, near 8 percent is a smell), beat confidence, and each moment's deviation.
2. Check the stretch AND the final tempo. The aligner may pick a faster or slower tempo (up to 8 percent) when that fits the cut points better: if `bpm_final` is far from `bpm_planned` (for a thriller, 124 planned and 132 final), the track will feel rushed. Rerun with `--seed` or `--tries 3`, or pass `--bpm` to pin the tempo.
3. Say plainly in your handoff that you could not listen to it, and ask the founder to play it.
4. A track with vocals or a drifting tempo is a bad take even if QC passes: try another seed.

## Package it

The music version is an extra file, not a replacement.
In `package.md` list both files, say which one has the soundtrack, and note the engine and seed.
Instagram also offers licensed trending audio inside the app: tell the founder the generated track is original, so there is no licence to track.

## Sync across PCs

```bash
node growth/scripts/sync.mjs status
node growth/scripts/sync.mjs push     # after making or changing a reel or a music version
node growth/scripts/sync.mjs pull     # on another PC
```

Only finished media moves.
Mailbox screenshots, raw footage, secrets, the ledger and stand-in music never do.
