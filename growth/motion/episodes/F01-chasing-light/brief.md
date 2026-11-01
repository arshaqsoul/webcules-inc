# F01 Chasing Light - script (draft for the founder)

Register: Film (`growth/motion/FILM.md`). Vertical 1080x1920, about 30 s. Stylized 3D (`style_toon`), the recurring photographer `photographerToon` (her field trousers and hiking boots finally make sense).
Status: **script only, waiting for the founder to confirm the story.** No keyframes, no GPU time yet.

## Logline

One scenic photographer's day from first light to the Milky Way: a sunrise lake, a waterfall, a cliff-top elopement at golden hour, a night under the stars. While she chases the light, her clients book, sign, open their gallery and pay in Snap.

## Why this story

- Landscape and adventure photographers live outdoors and lose bookings to slow replies: the day is the pain made beautiful, never shown as suffering (SERIES.md).
- It follows the Airbnb Experiences film beat for beat (28.5 s, 11 shots, one spoken line per chapter, a crescendo, the app), from `hybrid/reference.mjs` on `airbnb-exp2.mp4`.
- Every card is a real Snap inbox event; nothing promises prints or automation Snap does not have.

## Beats

| # | Time | Shot(s) | What we see | Voice-over | Out |
|---|---|---|---|---|---|
| 1 Hook | 0.0-0.8 | `poster` | Her silhouette on a ridge, camera raised, a sea of mist below lit pink by first light. The cover frame. | - | cut |
| 2 Establish | 0.8-6.2 | `diorama` > `diorama_dawn` (grow) > `camper` | A tiny diorama on pale lavender: a mountain ledge, a little teal camper van with one warm window, a pine, stars above. Dawn grows: the sky blushes, mist pours over the ledge, the pine catches gold. The camera dives into the camper's window. Land full size: she steps out of the van into blue hour with a tripod over her shoulder, breath fogging, and grins at the sky. | 1.2 s: "Say you chase the light for a living." | dive in, land |
| 3 Sunrise | 6.2-11.4 | `lake`, `lake_close` | An alpine lake like glass, peaks on fire in the reflection. She crouches by the water, tripod low, and fires. Close: she checks the back of the camera, a quiet fist of joy. Card drops in. | 6.6 s: "Now your sunrise walk books while you're out shooting." | whip up |
| | | | **Card:** `New booking - Hannah Lee` / Sunrise photo walk | | |
| 4 Falls | 11.4-16.4 | `falls` | Midday in a fern gorge: a waterfall in sunbeams, rainbow in the spray. She guides a hiking couple in yellow and red rain jackets to stand on the wet rocks, shoots, they laugh as the spray hits them. Card. | 11.8 s: "Or you're behind a waterfall while their contract gets signed." | match: spray to sea spray |
| | | | **Card:** `Contract signed - Waterfall session` | | |
| 5 Golden hour | 16.4-22.0 | `cliff`, `tailgate` | Sea cliffs at golden hour: Ana and Leo eloping on the grass edge, her dress in the wind, she shoots from low in the grass. Then the van tailgate at sunset: laptop on her knees, she presses send, the sun touches the sea. Card. | 16.8 s: "You can even deliver their gallery before the sun goes down." | dissolve to night |
| | | | **Card:** `Gallery delivered - Ana & Leo` | | |
| 6 Crescendo | 22.0-26.0 | `stars`, `sofa`, `mug` (1.0-1.4 s each) | The music turns. The Milky Way wheels over the camper, a long exposure ticking. Cut: Ana and Leo on their sofa, faces lit by a tablet, hands over mouths. Cut: she raises a tin mug to the sky by the van's fairy lights. Cards stack fast. | - (music only) | bloom to white |
| | | | **Cards:** `Client opened their gallery for the first time`, `Invoice INV-0108 paid` | | |
| 7 App | 26.0-30.2 | end card (code) | The Snap app on a phone in the glass studio, the day's inbox filling in, then **Snap it.**, "*0%* commission. *Free* to start.", snaphq.app | 26.4 s: "Bookings. Contracts. Galleries. Payments." 28.9 s: "Snap it." | end |

## Voice-over (the whole read, about 13 s of speech)

1. Say you chase the light for a living.
2. Now your sunrise walk books while you're out shooting.
3. Or you're behind a waterfall while their contract gets signed.
4. You can even deliver their gallery before the sun goes down.
5. Bookings. Contracts. Galleries. Payments.
6. Just Snap it. (Piper cannot say "Snap it." on its own; see Production)

The pattern is Airbnb's ("Say... Now you can also... Or... You can even...") so it turns once, on line 4, then names what Snap does in four words.
Voice: Piper `en_US-ryan-high`, warm and unhurried.

## Music (ACE-Step, three sections)

- 0.0-22.0: warm cinematic folk-orchestral, fingerpicked acoustic guitar, soft felt piano, swelling strings, wide open spaces, 88 BPM, D major.
- 22.0-26.0: the turn: pulsing strings, a heartbeat kick and shimmering synth rising to a peak, 120 BPM.
- 26.0-end: the guitar motif returns, light and bright, one soft final chord.
- Effects from the engine: shutter on every fire, a soft chime under each card, a whoosh on the dive and the whip.

## People and places to add to sheets.json (toon)

- `hannahToon` (exists) for the booking card; she is not on screen.
- `hikersToon` (new): a hiking couple in their thirties, yellow and red rain jackets, wet hair, big laughs.
- `anaLeoToon` (exists) for the cliff elopement and the sofa.
- Places (new): `toonCamperDiorama` (the lavender diorama), `toonLakeSunrise`, `toonFalls`, `toonSeaCliffs`, `toonNightCamp`, `toonSofaNight`.
- Derived keyframes (`@from`): `camper` from `diorama_dawn` (same van), `lake_close` from `lake`, `tailgate` from `camper` (same van, sunset), `stars` from `camper` (same van, night), `sofa` from `cliff` (same Ana and Leo).

## Claims (all from `apps/snap`)

| Said or shown | Source |
|---|---|
| clients book from your booking page | `apps/snap/lib/plans-data.ts` (`maxSessionTypes`), `booking.created` in `apps/snap/lib/repos/bookings.ts` |
| contract signed | `contract.signed` in `apps/snap/lib/contracts.ts` |
| gallery delivered | `gallery.delivered` in `apps/snap/lib/shares/notify.ts` |
| client opened their gallery | `gallery.first_view` in `apps/snap/lib/shares/gallery-auth.ts` |
| invoice paid, into your own Stripe | `invoice.paid` in `apps/snap/lib/invoices.ts` |
| 0% commission, free to start | the end card, as in S01 |

Not said: prints (post-MVP in `plans-data.ts`), store orders in the inbox (the store does not emit inbox events), anything "automatic".

## Caption (draft)

Say you chase the light for a living.

Sunrise at the lake, a waterfall at noon, an elopement on the cliffs at golden hour, the Milky Way at night. While you shoot, clients book from your booking page, sign their contract in the browser, open the gallery you sent and pay into your own Stripe. It all lands in one Snap inbox.

It is not magic: you still send the contract, the invoice and the gallery. Snap just keeps every reply and payment in one place, with 0% commission.

Start free at snaphq.app

## Budget

About 12 keyframes (5 derived), 11 clips and 1 grow move: roughly 1.5 to 2 hours of GPU, plus 10 minutes for voice and music.

## After the founder confirms

Moodboard from Pinterest per chapter (`moodboard.md`): blue-hour camper vans, alpine lake reflections at sunrise, fern-gorge waterfalls with sunbeams, cliff-top elopements at golden hour, Milky Way over a van, warm stylized 3D lighting references.

## Production (made 2026-11-01)

- Keyframes: one text anchor (`camper`, seed 1001) and nine shots derived from it with `@from`; `sky` (5002) is text-only with no figures. All seeds are in `clips.json`.
- Re-rolled: the night wide (the edit copied the anchor's framing, then text takes made the van toy-sized and grew a badge), the sky (the toon style line added stray kids), and the mug steam (a cartoon cloud, now a thin wisp).
- Clips: 11 shots and 1 grow move at 720x1280, about 55 min of GPU; drafts at 480 another 20 min. RIFE 2x on every clip.
- Voice: Piper `en_US-ryan-high`. "Snap it." alone reads as "Snab it", so the last line is "Just Snap it."; the end line starts 0.7 s into the end card so it clears the whoosh and the music change. Every line was checked by transcribing the final mix.
- Music: ACE-Step, three sections at seed 2, music gain 0.45 under the voice.
- Result: `out/F01/reel.mp4`, 30.34 s, every QC line passes.
