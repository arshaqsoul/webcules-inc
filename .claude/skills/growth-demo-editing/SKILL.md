---
name: growth-demo-editing
description: Procedure for turning raw.mp4 plus events.json into a 9:16 reel with zoom, highlight, ripple, captions, hook, speed ramps and end card using ffmpeg, then running automated QC. Use when the editor handles RECORDED or ENHANCED records.
---

# Demo editing

The full effect spec and QC thresholds are in `growth/DEMO-STANDARD.md`.

## Inputs

- `demo.raw`: the capture.
- `demo.events`: the timeline with steps, events, boxes and timestamps.
- `growth/storyboards/PP-###.md`: hook text, captions, claim line, end card.
- Brand colours and fonts from the Snap theme tokens in `apps/snap` (read them, do not invent).

## Method

Everything is computed from `events.json`.
Never position an effect by looking at the picture.

1. **Plan the timeline.**
   Convert events and steps into an edit decision list: zoom windows, highlight pulses, ripples, caption in and out times, speed-ramp segments, hook and end card.
2. **Zoom.**
   For each step with a focus box, ease in over 350 ms to 1.6x to 2.2x centred on the box, hold, ease out at the step end.
   One zoom at a time, none in the first 600 ms.
3. **Highlight and ripple.**
   At each click, draw a pulsing outline around the target box and a ripple ring from the click point.
4. **Captions.**
   Six words or fewer, top safe area, appear 150 ms before the action, leave at step end.
5. **Speed ramp.**
   Segments with no meaningful change for over 600 ms play at 4x.
6. **Framing.**
   1080x1920 output.
   Desktop captures sit in a rounded card with the caption area above, phone captures fill the frame.
7. **Hook and end card.**
   Hook text in the first 1.5 s, an end card of 1.5 to 2 s with the claim line and `snap.webcules.com`.
8. **Encode.**
   H.264 High, yuv420p, 30 fps, faststart, silent, under 50 MB.
   Extract the cover frame at the most legible moment.

## Output

`growth/out/PP-###/reel.mp4`, `cover.png`, and `edl.json` (the decision list, for repeatability).

## QC

Run the QC script.
It writes `growth/out/PP-###/qc.json` with `pass` and a `failures` list.
It checks freeze, blank frames, resolution and fps, duration, safe zones, events coverage, caption fit, size and claims.

## Routing

| QC result | Action |
|---|---|
| pass | `ledger.mjs transition PP-### QC_PASSED --by editor --set demo.qc=growth/out/PP-###/qc.json` |
| edit problem | fix the edit and rerun |
| footage problem | `ledger.mjs rework PP-### DEMO_SCRIPTED --by editor --note "what to retake"` |

## Rules

- Never alter product UI, numbers or results.
- Never add audio.
- Never relax a QC threshold to get a pass.
- Watch the full reel once at normal speed before reporting.
