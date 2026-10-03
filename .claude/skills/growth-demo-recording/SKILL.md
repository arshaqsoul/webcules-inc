---
name: growth-demo-recording
description: Procedure for recording a Snap demo on staging with human-like cursor, typing and scrolling, producing raw.mp4 and a validated events.json. Use when the recorder handles a DEMO_SCRIPTED record.
---

# Demo recording

The full contract is `growth/DEMO-STANDARD.md`.
This skill is the order of operations.

## Preflight

1. The record's storyboard exists and lists a fixture, steps and performer actions.
2. `growth/.env.local` has `GROWTH_STAGING_URL`, `GROWTH_STAGING_EMAIL` and `GROWTH_STAGING_PASSWORD`.
   Read them in code, never print them.
3. Write the take script `growth/storyboards/PP-###.take.mjs` (exports `format`, optional `fixture`, and `run({ p, page })`).
   Use only the performer API.
4. The recorder script takes and releases the staging lock itself.

## Take

1. Run `node growth/scripts/record/record.mjs --pp PP-### --take growth/storyboards/PP-###.take.mjs [--format phone]`.
2. The script launches Chrome for Testing (desktop 1360x1020 at 2x, or phone 390x693 at 3x), logs in programmatically from `growth/.env.local`, and runs your `fixture()` before capture starts.
   The login screen is never in the take.
3. It captures full-resolution frames, runs your steps through the performer (seeded from the PP number), and writes `raw.mp4`, `frames.json`, `cursor.json` and `events.json`.
4. If the take changes data (revoking a link, deleting something), export `teardown()` that restores it, so the take can be repeated.
   A failed teardown makes the run exit non-zero and prints a warning.
5. Mark each storyboard step with `p.step(id, caption)` so the editor knows where captions, dots and zooms go.

## Motion rules (from the standard)

| Action | Rule |
|---|---|
| move | curved eased path, 350 to 900 ms by distance, tiny overshoot on long moves |
| hover before click | 120 to 300 ms dwell |
| type | key by key, 45 to 110 ms with jitter, longer beat after spaces and punctuation |
| scroll | eased over 400 to 800 ms in small steps |
| after a new screen | 400 to 700 ms pause |
| idle | never more than 800 ms of no visible motion |

## Self-check before releasing the lock

1. Play the take.
   Every storyboard step happened, in order.
2. Static stretches are fine if the cursor is also still (the editor ramps them), but a long hold you want kept must be labelled `p.hold(ms, { label: "payoff" })`.
3. The payoff shot is clean and held at least 1.2 seconds.
4. No credentials, real client data or personal emails are visible on screen.
5. `events.json` validates against `growth/schemas/demo-events.schema.json`.

## Finish

1. Transition:
   `node growth/scripts/ledger.mjs transition PP-### RECORDED --by recorder --set demo.raw=growth/recordings/PP-###/raw.mp4 --set demo.events=growth/recordings/PP-###/events.json`.

## If a take is bad

Fix the storyboard or the performer parameters and re-record with the same seed.
Do not hand-trim footage to hide a problem.
