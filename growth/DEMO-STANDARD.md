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
| Desktop flows | viewport 1440x900, device scale factor 2 |
| Phone flows (client gallery, widgets) | 390x844, device scale factor 3, mobile emulation |
| Frame rate | 30 fps minimum, constant |
| Browser chrome | hidden, no address bar, no extensions, no scrollbars |
| Theme | the product default, no dark-mode flicker |
| Account | the demo org from the env file, seeded by the fixture step |
| Lock | holds `staging` for the whole session |

Capture uses a frame-accurate screencast (Chrome DevTools Protocol screencast piped into ffmpeg) or a headed window capture.
Playwright's built-in `recordVideo` is not used for final output because its fixed low bitrate and 25 fps are visible on a phone.

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

- A visible cursor is injected into the page (DOM overlay) so it appears in the capture.
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

## events.json

Validated by `growth/schemas/demo-events.schema.json`.
It holds the viewport, scale factor, fps, duration, a list of **steps** (id, caption, start, end, focus box) and a list of **events** (move, hover, click, type, scroll, navigate, wait, annotate) with timestamps and element boxes.
The ledger refuses `RECORDED` unless this file validates.

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
| Speed ramp | Any segment with no meaningful change for over 600 ms plays at 4x with a subtle indicator. |
| Framing | 1080x1920. Desktop captures sit in a rounded card with the caption area above. Phone captures fill the frame. |
| End card | 1.5 to 2 seconds: the Snap name, the one claim from the storyboard, and the link text. Claims cite code. |
| Safe zones | Keep text out of the top 250 px, bottom 340 px and right 120 px, where Instagram overlays its UI. |
| Audio | None. |

## Output format

H.264 High profile, yuv420p, 30 fps, 1080x1920, faststart, under 50 MB, AAC silent track omitted.
Also export a cover frame (PNG, 1080x1920) chosen at the most legible moment.

## Automated QC

`qc.json` is written next to the reel and the ledger reads it.
`pass` is true only if every check passes.

| Check | Fails if |
|---|---|
| Freeze | `freezedetect` finds a static run over 0.8 s outside a speed-ramped segment |
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

The recording tooling is accepted when one real flow, recorded end to end, passes QC and the founder agrees it looks human.
Until then the pool does not start.
