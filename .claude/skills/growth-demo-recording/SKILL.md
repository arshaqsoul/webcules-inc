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
3. The recording scripts exist in `growth/scripts/record/`.
   If not, block the record (the tooling is phase 2).
4. Acquire the staging lock:
   `node growth/scripts/lock.mjs acquire staging --by recorder-PP-### --ttl 45 --wait 600`.

## Take

1. Seed the fixture for this storyboard, then verify the starting screen matches the storyboard.
2. Launch the capture: viewport and scale factor from the storyboard (desktop 1440x900 at 2x, phone 390x844 at 3x), 30 fps screencast, chrome UI hidden.
3. Authenticate programmatically from the env file, before recording starts, and reuse the session.
   The login screen is never in the take unless the storyboard is about login.
4. Run the steps through the performer API only.
   Seed the jitter from the PP number.
5. Let the performer write `events.json` as it goes: a step entry for each storyboard step with its focus box, and an event for each move, hover, click, type, scroll and navigate.

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
2. Run a quick freeze check on the raw file.
   Any static run over 800 ms means the take needs fixing or a speed ramp in the edit.
3. The payoff shot is clean and held at least 1.2 seconds.
4. No credentials, real client data or personal emails are visible on screen.
5. `events.json` validates against `growth/schemas/demo-events.schema.json`.

## Finish

1. Release the lock: `node growth/scripts/lock.mjs release staging --by recorder-PP-###`.
   Do this on failure too.
2. Transition:
   `node growth/scripts/ledger.mjs transition PP-### RECORDED --by recorder --set demo.raw=growth/recordings/PP-###/raw.mp4 --set demo.events=growth/recordings/PP-###/events.json`.

## If a take is bad

Fix the storyboard or the performer parameters and re-record with the same seed.
Do not hand-trim footage to hide a problem.
