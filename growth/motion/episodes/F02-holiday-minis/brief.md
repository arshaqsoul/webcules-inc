# F02 Mini Season - script (draft for the founder)

Register: Film (`growth/motion/FILM.md`). Vertical 1080x1920, about 30 s. Stylized 3D (`style_toon`), the recurring photographer `photographerToon`.
Status: **made** (2026-11-02). Story confirmed by the founder; see Production at the end for what changed from this script.

## Logline

One photographer's holiday-minis Saturday, from a snowy tree farm at 9 to a string-lit square at dusk to a warm editing desk at night, while the bookings for next weekend fill up behind her.

## Why this story

- It is the season now (1 Nov): holiday minis are what family photographers are selling this month, and the pain (a dozen back-and-forth DMs per slot) is the thing Snap's booking page replaces.
- A different look from F01: warm cold-weather palette (cranberry, pine, cream, lantern gold) against F01's blue-hour and teal.
- Same Airbnb beat structure (hook, diorama establish, three chapters, crescendo, flash, app) so the film reads as a series.
- Every card is a real Snap inbox event.

## Beats

| # | Time | Shot(s) | What we see | Voice-over | Out |
|---|---|---|---|---|---|
| 1 Hook | 0.0-0.8 | `poster` | Her back to us in a red scarf, camera raised, a lantern-lit tree farm in falling snow, a family in matching knits laughing in the distance. The cover frame. | - | cut |
| 2 Establish | 0.8-6.0 | `diorama` > `diorama_lit` (grow) > `farm` | A tiny diorama on pale lavender: a snowy tree-farm clearing, a small red barn, a hand-painted "minis" sign (no readable text, just a star), rows of little pines, unlit. The lanterns come on one by one and the snow starts. The camera dives toward the barn door. Land full size: she walks between the rows of trees with her camera in both hands, grinning, boots crunching. | 1.2 s: "Say it's mini session season." | dive in, land |
| 3 Morning | 6.0-11.2 | `farm_family`, `farm_close` | A family of four in matching cream and cranberry knits laughing by a tree, tiny kid on dad's shoulders (dad stands, kid sits on a stump beside him: no lifts). She kneels in the snow and shoots. Close: the little one throws a snowball at the lens, she laughs. Card drops in. | 6.5 s: "Now next weekend's slots book while you're shooting this one." | whip left |
| | | | **Card:** `New booking - Priya Nair` | | |
| 4 Square | 11.2-16.4 | `square` | Midday-to-dusk in a small-town square: a big tree with warm string lights coming on, a carousel in the background, a couple in coats and a dog (the dog is on a lead, sitting). She shoots from across the square. Card. | 11.8 s: "Or the contract is signed before the lights come on." | match: light to window light |
| | | | **Card:** `Contract signed - Holiday mini` | | |
| 5 Desk | 16.4-22.0 | `desk`, `tablet` | Night. Her warm editing desk, a monitor showing a row of family portraits (colour blocks, no faces), a mug that stays still, a window with snow. She taps send. Cut: the family from the farm on their sofa, the tablet lighting their faces, hands over mouths. Card. | 16.8 s: "You can even deliver the gallery before they've warmed up." | dissolve to white |
| | | | **Card:** `Gallery delivered - Priya Nair` | | |
| 6 Crescendo | 22.0-26.0 | `tree`, `gallery_open`, `invoice` (1.0-1.4 s each) | The music turns. The big town tree lights fully, snow wheels in the lanterns. Cut: a kid points at the tablet. Cut: her phone on the desk, a card. Cards stack fast. | - (music only) | bloom to white |
| | | | **Cards:** `Client opened their gallery for the first time`, `Invoice INV-0112 paid` | | |
| 7 App | 26.0-30.2 | end card (code) | The Snap app on a phone in the glass studio, the day's inbox filling in, then **Snap it.**, "*0%* commission. *Free* to start.", snaphq.app | 26.4 s: "Bookings. Contracts. Galleries. Payments." 28.9 s: "Just Snap it." | end |

## Voice-over (about 13 s of speech)

1. Say it's mini session season.
2. Now next weekend's slots book while you're shooting this one.
3. Or the contract is signed before the lights come on.
4. You can even deliver the gallery before they've warmed up.
5. Bookings. Contracts. Galleries. Payments.
6. Just Snap it.

The pattern turns once, on line 4, then names what Snap does in four words (as F01).
Voice: Piper `en_US-ryan-high`.

## Music (ACE-Step, three sections)

- 0.0-22.0: warm cinematic holiday folk, music box and glockenspiel over soft felt piano and fingerpicked guitar, gentle sleigh-bell shimmer, 84 BPM, F major. No lyrics, no known carol melodies.
- 22.0-26.0: the turn: swelling strings, a heartbeat kick and bright bells rising to a peak, 116 BPM.
- 26.0-end: the music-box motif returns, light and bright, one soft final chord.
- Effects from the engine: shutter on every fire, a chime under each card, a whoosh on the dive and the whip.

## People and places to add to sheets.json (toon)

- `priyaToon` (exists) for Priya Nair's family on the farm and on the sofa; add two kids in knits if the sheet has none.
- `squareCoupleToon` (new): a couple in their late twenties in long wool coats, one scarf each, a small terrier on a lead.
- Places (new): `toonTreeFarmDiorama`, `toonTreeFarm`, `toonTownSquare`, `toonSnowDesk` (reuse `toonDesk` with a snowy window), `toonSofaSnow` (reuse `toonLiving`).
- Derived keyframes (`@from`): `diorama_lit` from `diorama`, `farm_family` and `farm_close` from `farm`, `tablet` from `farm_family` (same family indoors), `tree` from `square`, `gallery_open` from `tablet`.

## Defect watch (FILM.md "Quality", from F01)

- No lifts, piggybacks or hugs off the ground: the kid sits on a stump, the dog sits.
- No breath fog, no steam, no cocoa: the mug on the desk is empty and still.
- Falling snow only as many small flakes, never a puff near the camera or mouths.
- The barn and the tree must hold still: per-shot `neg` without "static frame" naming "barn swaying, tree rocking".

## Claims (all from `apps/snap`)

| Said or shown | Source |
|---|---|
| clients book from your booking page | `apps/snap/lib/plans-data.ts` (`maxSessionTypes`), `booking.created` in `apps/snap/lib/repos/bookings.ts` |
| contract signed | `contract.signed` in `apps/snap/lib/contracts.ts` |
| gallery delivered | `gallery.delivered` in `apps/snap/lib/shares/notify.ts` |
| client opened their gallery | `gallery.first_view` in `apps/snap/lib/shares/gallery-auth.ts` |
| invoice paid | `invoice.paid` in `apps/snap/lib/invoices.ts` |
| 0% commission, free to start | the end card, as in S01 |

Not said: automatic reminders, a mini-session template, prints, store orders, "automatic" anything.

## Caption (draft)

Say it's mini session season.

A snowy tree farm in the morning, the town square when the lights come on, a warm desk at night. While you shoot, next weekend's clients book from your booking page, sign their contract in the browser, open the gallery you sent and pay. It all lands in one Snap inbox.

It is not magic: you still send the contract, the invoice and the gallery. Snap just keeps every reply and payment in one place, with 0% commission.

Start free at snaphq.app

## Budget

About 11 keyframes (6 derived), 10 clips and 1 grow move: roughly 1.5 to 2 hours of GPU, plus 10 minutes for voice and music.

## After the founder confirms

Moodboard from Pinterest per chapter (`moodboard.md`): snowy Christmas tree farms with lanterns, matching-knit family minis, small-town square tree lighting at dusk, cosy night editing desks, stylized 3D winter lighting references.

## Production (made 2026-11-02)

- Keyframes: one text anchor (`farm`, seed 1003); `poster`, `farm_family`, `square` and `desk` derived from it with `@from`; `tablet` from `farm_family`; `diorama_lit` and `tree` re-picked in the clay toon look. All seeds are in `clips.json`.
- Changed from the script: `farm_close` and `invoice` were dropped (the edit model swapped in different people every time), so the close-up beat is a slow drift on `farm_family`; `gallery_open` re-uses the `tablet` keyframe through `key`; the crescendo is two shots, not three. The unlit `diorama` is derived from `diorama_lit` so the grow shares one layout.
- Re-rolled: the edit model drifted the photographer's outfit and grew steam puffs when prompts named steam, even as a negative (prompts now say "the air is clear and still" and restate her full outfit); the first `square` take had a sparkle burst over the tree; the first `farm_family` take smeared the girl's waving hands in about one frame in three (a Wan artefact, not RIFE), so it was re-rolled at seed 36 with a locked camera and calm motion.
- Voice: Piper `en_US-ryan-high`. "Or their contract" was heard as "Weather contract" and a lone "Bookings." as "Willkings", so the lines are "And the contract gets signed before the lights come on." and "Bookings, contracts, galleries, payments.". Every line was checked by transcribing the final mix.
- Music: ACE-Step, three sections at seed 2, music gain 0.45.
- Result: `out/F02/reel.mp4`, 29.37 s, every QC line passes.
- Render environment: run through WSL, with `GROWTH_COMFY_URL` pointing at the Windows host's ComfyUI.

## Redo (2026-11-06, founder direction)

- The voice-over is dropped: the founder does not want it and the reels do well music-led. `episode.json` no longer carries `vo`; `musicGain` rises 0.45 to 0.7 since nothing ducks under anymore, and the three score sections get fuller arrangements (string bed in the folk cue, wider euphoric peak, a warm string pad under the outro motif).
- Re-rendered from the recorded seeds on a machine that had lost the original media. Keyframes reproduce the original picks exactly except two deviations: `diorama_lit` is regenerated as the text anchor (the committed `@from diorama` / `@from diorama_lit` pair was circular), and the unlit `diorama` pick moved 5004 to 5005 because 5004 kept a cyan pre-glow in the lantern tops that read wrong against the "lights come on" grow.
- Everything else (shots, camera moves, cards, timings, caption, claims) is unchanged.

