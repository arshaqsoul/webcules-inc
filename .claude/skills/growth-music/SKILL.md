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
| `funk` | disco-funk groove: slap bass, wah guitar, brass stabs; bright accents | 100-118 |
| `indie` | handclap, stomp, ukulele, glockenspiel and whistle feel-good pop; bright accents | 108-124 |
| `tropical` | summer groove: congas, marimba, steel drum; bright accents | 100-118 |
| `caper` | playful jazz heist-comedy: brushes, walking bass, pizzicato, muted trumpet; bright accents | 112-132 |
| `chiptune` | 8-bit arcade: pulse-wave lead, bouncing bass, fast arpeggios; bright accents | 120-140 |
| `ethereal` | dreamy, spacious, emotional electronic pop that slowly builds: soft pulse, airy pads, piano arpeggios; bright accents | 88-108 |
| `heroic` | triumphant superhero-style orchestral fanfare: horns, marching snare, timpani, soaring strings; cinematic impacts | 96-124 |
| `techintro` | slick tech-channel intro: punchy electronic, plucked arpeggios, bright synth hook; bright accents | 118-134 |
| `sunny` | fun, feel-good dance-pop: four-on-the-floor, handclaps, bouncy synth bass, catchy lead; bright accents, not dark booms | 108-126 |
| `synthpop` | euphoric driving synth-pop dance anthem; bright accents | 112-124 |
| `upbeat`, `calm` | product-launch and ambient styles | 96-128, 70-100 |

The prompts describe a sound with instruments and energy.
Never put an artist or song name in a prompt: it asks the model to imitate, and the founder would be posting something that may sound like someone else's work.
`sunny` and `synthpop` use bright accents (chord stabs with handclaps, a short riser, a cymbal-swell finish) instead of the dark impacts the other styles use.

To compare several versions of one reel, give each a label: `--label orchestral` writes `reel.music.orchestral.mp4`, `music.orchestral.json` and `qc.music.orchestral.json` and leaves the other versions alone.
Check one with `qc.mjs --pp PP-### --variant music --label orchestral`.
`--tries 3` generates three takes and keeps the best-aligned one.

It plans a BPM from the reel's own cut points, generates a bed, measures its real beats, stretches and trims it so the step changes and end card land on beats, adds trailer impacts, a riser and ducking, and writes `reel.music.mp4` and `music.json`.
Then it runs `qc.mjs --variant music`.
The original `reel.mp4` is never touched.

## Matching the feel of a track the founder likes

If the founder wants "a beat like this song", do NOT download the song (from YouTube or anywhere): that breaks the site's terms, the recording is someone else's work, and "AI-generated" does not tell you who owns it or whether it imitates a real artist.
Instead, ask for the founder's own file, or for the tempo and a description in words, and use one of:

```bash
node growth/scripts/reel.mjs music PP-### --ref path/to/their-file.wav --style indie --label like-this
node growth/scripts/reel.mjs music PP-### --bpm 117 --style synthpop --label pinned
```

`--ref` measures ONLY the reference's tempo and key and steers the generation with those two numbers.
The audio is never copied, uploaded, stored or mixed, and `music.json` records only its file name, tempo and key.
The result is a new, original track in the chosen style.
Never put an artist or song name in a style prompt.

## Sound effects that match the tune

By default (`--sfx tonal`) the sound effects are retuned to the track:

- **Key.** The generated track's key is MEASURED (the model does not reliably obey the key it is asked for: a "C major" prompt came back in G major).
  If the measurement is unclear, the requested key is used and `music.json` says so.
- **Notes, not ticks.** Each click plays the next note of the key's pentatonic scale, climbing within a step so a run of clicks is a small melody that cannot be wrong.
  Each step change is a chord stab on I, V, vi, IV.
  The fast-forward is a rising pentatonic run.
  The hook is a bell chord, and the end card lands on the key's tonic chord.
- **Groove, by moving the PICTURE.** A sound effect must play at the exact moment of what you see, so the sounds never move.
  Instead the video is retimed: each stretch between cues speeds up or slows down by a few percent so every click, step change and fast-forward lands on a groove slot.
  The end card lands on a beat, step changes and the hook on a beat or an eighth, clicks and fast-forwards on any sixteenth.
  Long stretches stay within about 7 percent of normal speed (QC allows 15); a short stretch between cues that sit close together is judged by milliseconds, since 14 percent over 130 ms moves the picture by under 20 ms.
  The video is re-encoded once (CRF 17) and the retimed edit list is written to `music.<label>.edl.json`, which QC uses.

`--sfx light` is soft bells and tiny plucks with the music barely dipping, and the step change a further 12 dB below the tonal one.
`--sfx whisper` is one quiet note per step change, no dip, about 20 dB below the tonal step change.
Both are levelled by RMS, not peak, and the step change gets its own level after that, so it is never normalised back up.
Judge effect loudness against the music in the same window, not by overall LUFS, which stays equal across styles.
`--sfx classic` keeps the old noise effects.
To rebuild a version on the same bed, repeat its `--seed` and `--tries` exactly (seed is the PP number times 1000, plus --seed, plus the try index).
`--retime off` keeps the picture untouched and the effects at their exact times, with no groove lock.
`--quantize snap` (only with `--retime off`) is the old approach of nudging the SOUNDS onto the groove up to 60 ms late: do not use it, it puts the sound out of step with the picture.
What the retime did is in `music.json` under `retime`: every cue's original and new time, the biggest speed change, and the share of cues on the groove.

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
2. Read `retime` too: a biggest speed change near the 15 percent limit, or cues moved by more than about 120 ms, means the cue pattern fights the tempo. Try another `--seed`.
   Check the stretch AND the final tempo. The aligner may pick a faster or slower tempo (up to 8 percent) when that fits the cut points better: if `bpm_final` is far from `bpm_planned` (for a thriller, 124 planned and 132 final), the track will feel rushed. Rerun with `--seed` or `--tries 3`, or pass `--bpm` to pin the tempo.
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
