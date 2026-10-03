# Demo capture and enhancement standard

A demo must look like a calm, competent person using real software.
It must never look automated, frozen, or teleporting.
This standard is the contract between the designer, recorder, editor and QC.

## Principles

1. **Record the real product.** Real staging, real data, real UI.
   Never mock up a screen, never composite a fake result.
2. **Motion is continuous.** The viewer should never see a dead frame or a value that appears from nowhere.
3. **Every enhancement is derived from the events timeline.**
   The editor zooms and highlights where the recorder says an action happened, not where it guesses.
4. **Repeatable.** Same seed, same fixtures, same motion.
5. **Silent output.** Trending audio is added by the founder inside Instagram at post time.

## Pipeline

```
storyboard.md  ->  recorder  ->  raw.mp4 + events.json  ->  editor  ->  reel.mp4  ->  qc.json  ->  package/
 (designer)       (performer)                               (ffmpeg)               (automated)  (packager)
```

## Capture setup (recorder)

| Setting | Value |
|---|---|
| Target | `https://snap-staging.webcules.com` only |
| Desktop flows | viewport 1360x1020 (4:3), device scale factor 2 |
| Phone flows (client gallery, widgets) | 390x844, device scale factor 3, mobile emulation |
| Frame rate | output 30 fps constant, source captured at about 15 fps with the cursor composited at 30 fps |
| Browser chrome | hidden, no address bar, no extensions, no scrollbars |
| Theme | the product default, no dark-mode flicker |
| Account | the demo org from the env file, seeded by the fixture step |
| Lock | holds `staging` for the whole session |

Capture is a loop of full-resolution Chrome DevTools Protocol screenshots (`Page.captureScreenshot` with `clip.scale` equal to the device scale factor), each stamped with its exact capture time.
This was chosen after measuring the alternatives: the CDP screencast API is capped at 1x resolution (soft text once zoomed), and Playwright's `recordVideo` has a fixed low bitrate and 25 fps.
The capture rate is about 15 fps at 2x.
That is fine because the cursor is not part of the captured pixels.
The performer logs the cursor path at high rate to `cursor.json`, and the editor draws the cursor at 30 fps over the frames, so the pointer is smooth and stays crisp at any zoom.
Page content changes (a new screen, typed characters) land within one capture interval of when they happened.

### Fixtures

Every demo starts from a known state.
The recorder runs the fixture seed for the pain point before recording and verifies the starting screen.
Fixture photos are licensed or generated, never client work, and never faces of real private individuals.
Names, emails and prices on screen must be obviously demo data.

## The performer layer

All interaction goes through one library, never through raw Playwright calls.
It provides `performer.moveTo`, `hover`, `click`, `type`, `scroll`, `navigate` and `narrate`.
Each action appends to `events.json`.

### Cursor

- The cursor is logged to `cursor.json` as it moves and is drawn by the editor, so it is smooth and crisp at any zoom.
  Over a clickable element it grows 15 percent, over a text field it becomes an I-beam, and on a phone format it is drawn as a touch dot.
- It starts from a believable resting point, never the top-left corner.
- Movement follows a curved path (cubic Bezier with a gentle bow), eased in and out.
- Duration scales with distance: 350 ms for short hops up to 900 ms for a full-screen travel.
- Small overshoot of at most 6 px and a settle, for long moves only.
- 120 to 300 ms of hover dwell on a target before every click.
- The cursor changes to a pointer over clickable elements, as the real one would.
- Between actions it never teleports and never freezes dead still for more than 700 ms, so it drifts by 1 to 2 px.

### Typing

- Text is typed key by key, never set by a fill.
- Per-key delay is 45 to 110 ms with seeded jitter, a slightly longer beat (150 to 300 ms) after spaces and punctuation.
- The caret is visible.
- No typos, and no instant paste of long strings.
- Form fields are focused with a real click first.

### Native select controls

A native `<select>` popup is drawn by the operating system and does not appear in captured frames.
`performer.select` clicks the control for real, logs each option step with its timing, and commits the value (keyboard first, then the real change event if the headless popup ignores keys).
The editor draws the dropdown from those logged steps, so the viewer sees it open, the highlight move, and the value change.
The performer verifies the control really shows the chosen value and fails the take if it does not.

### Scrolling and navigation

- Scrolling is eased over 400 to 800 ms in small wheel steps, never a jump.
- After navigation, wait for real content, then pause 400 to 700 ms so the viewer can read the screen.
- Loading states are shown honestly.
  If the app is genuinely slow, the editor speed-ramps that segment, the recorder does not hide it.

### Pacing

- A viewer needs about 700 ms to read a new screen.
- Never act before the screen has settled.
- The longest allowed run with no visible motion is 800 ms.
- Total raw take is under 90 seconds.
  The finished reel targets 12 to 35 seconds.

## Files and commands

| File | Written by | What |
|---|---|---|
| `growth/storyboards/PP-###.md` | designer | the human-readable storyboard |
| `growth/storyboards/PP-###.meta.json` | designer | hook text, end card, claims table, mark (see `growth/templates/meta.example.json`) |
| `growth/storyboards/PP-###.take.mjs` | recorder | the take script: exports `format`, optional `fixture()`, `run({ p, page })` using only the performer API, and optional `teardown()` that restores any staging data the take changed |
| `growth/recordings/PP-###/` | `record.mjs` | `frames/`, `frames.json`, `cursor.json`, `raw.mp4`, `events.json` (gitignored) |
| `growth/out/PP-###/` | `edit.mjs`, `qc.mjs` | `reel.mp4`, `cover.png`, `edl.json`, `qc.json` (gitignored) |

```bash
node growth/scripts/record/record.mjs --pp PP-001 --take growth/storyboards/PP-001.take.mjs
node growth/scripts/edit/edit.mjs     --pp PP-001            # add --fast while iterating on the look
node growth/scripts/qc/qc.mjs         --pp PP-001
```

`record.mjs` takes and releases the staging lock itself and refuses any host except staging or a local dev server.
Playwright and Chrome for Testing come from `apps/snap` and the local Playwright cache.

## events.json

Validated by `growth/schemas/demo-events.schema.json`.
It holds the viewport, scale factor, fps, duration, a list of **steps** (id, caption, start, end, focus box) and a list of **events** (move, hover, click, type, scroll, navigate, wait, annotate) with timestamps and element boxes.
The ledger refuses `RECORDED` unless this file validates.
A step's zoom target is the box of its first click, type or hover event, so every zoom lands on a real action.

## Enhancement (editor)

All with ffmpeg, driven by `events.json`.
Brand colours and fonts come from the Snap theme tokens in `apps/snap`, never invented.

| Effect | Rule |
|---|---|
| Zoom | On a click or focus box, ease to 1.6x to 2.2x centred on the box over 350 ms, hold until the step ends, ease out. One zoom at a time. No zoom in the first 600 ms. |
| Highlight | A rounded outline in the brand colour around the target, pulsing twice at the click, fading in 150 ms. |
| Click ripple | A ring expanding from the click point over 450 ms. |
| Cursor | Scaled to 1.15x over interactive elements. |
| Step captions | In the top safe area, 54 to 64 px bold, six words at most, appear 150 ms before the action, stay until the step ends. |
| Hook | Large text in the first 1.5 seconds that states the pain, for example "Client forwarded your gallery link?". |
| Speed ramp | Any segment where the screen and the cursor are both still for over 700 ms plays at 4x (the first and last 250 ms stay at 1x) with a "4x" indicator. Segments containing an action, or a hold labelled `payoff`, are never ramped. |
| Framing | 1080x1920. Desktop captures sit in a rounded card with the caption area above. Phone captures fill the frame. |
| End card | 1.5 to 2 seconds: the Snap name, the one claim from the storyboard, and the link text. Claims cite code. |
| Safe zones | Keep text out of the top 250 px, bottom 340 px and right 120 px, where Instagram overlays its UI. |
| Audio | None. |

## Output format

H.264 High profile, yuv420p limited range, 30 fps, 1080x1920, faststart, under 50 MB, no audio stream.
A very slow push-in ("breathing", 3 percent over 5 seconds) runs under the whole reel, so held moments never read as frozen.
Also export a cover frame (PNG, 1080x1920) chosen at the most legible moment.

## Automated QC

`qc.json` is written next to the reel and the ledger reads it.
`pass` is true only if every check passes.

| Check | Fails if |
|---|---|
| Freeze | `freezedetect` (-55 dB) finds a static run over 0.8 s before the end card |
| Black or blank frames | any run over 0.15 s |
| Resolution and fps | not 1080x1920 at 30 fps |
| Duration | under 8 s or over 45 s |
| Safe zones | caption pixels outside the allowed area |
| Events coverage | any click in `events.json` without a zoom or highlight |
| Caption fit | any caption over six words or clipped |
| Size | over 50 MB |
| Claim check | any on-screen price, limit or tier not found in `storyboard.md` claims, and every claim must cite a file |

A human preview always follows QC.
The packager does not run until the founder or orchestrator has approved the look of the first three reels, after which QC alone gates.

## Pilot acceptance

The tooling is accepted when one real flow, recorded end to end, passes QC and the founder agrees it looks human.
Until then the pool does not start.
QC itself is tested: `node --test growth/scripts/qc/qc.test.mjs` proves it fails a frozen reel.
