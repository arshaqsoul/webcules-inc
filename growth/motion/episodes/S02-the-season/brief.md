# S02 The Season - director's brief

Out Here register, the season format (E005 in growth/motion/SERIES.md): a photographer's year as four floating worlds, each ending in a real Snap moment, in order: New inquiry, New booking, Contract signed, Invoice paid. See growth/motion/INSTAGRAM.md.

A bright morning sky with four small floating islands, one per season. The hook: "Spend the year *out here.*"
The camera glides to each world in turn, and in each the same recurring photographer is at work.

- April, spring blossom park (`springBlossom`): Priya and Sam's engagement session under the cherry trees, petals drifting. Shutter. The card: "New inquiry - Ana & Leo", from your contact form. They are the next season's couple.
- July, summer beach (`summerBeach`): Ana and Leo (`anaLeo`) elope barefoot under a driftwood arch, the waves lapping. Shutter. The card: "New booking - Hannah Reyes", from your booking page. Hannah is the mother of the fall family.
- October, fall park (`fallPark`): the Reyes family (`familyFall`, the S01 and G02 family) laughing on the gingham blanket, leaves falling. Shutter. The card: "Contract signed - Cabin session", signed in their browser. That is Noor's session.
- December, winter cabin (`winterCabin`): Noor and her Bernese mountain dog (`noorDog`) in the snow by a glowing cabin. Shutter. The card: "Invoice INV-0058 paid", into your own Stripe.

The camera pulls back to all four islands glowing at twilight: "Your clients inquire, book, sign and pay in *Snap.*" Then the standard end card with the year's inbox.

Feels like a whole year well spent: fresh, sunny, warm, cosy. Every client is already on the way to the next one, and the admin never pulls her off the island.
The honest line lives in the caption: you still reply to the inquiry and send the contract and the invoice.

## Production

- Keyframes: Z-Image Turbo, 768x1344, prompts `<shot>.keyframe.txt` pasted from `hybrid/sheets.json` (seasonOpeningWide, springBlossom + priyaSam, summerBeach + anaLeo, fallPark + familyFall, winterCabin + noorDog, seasonFinaleWide, the photographer in every world). Kept seeds: s02open 2002, s02spring 2103, s02summer 2202, s02fall 1011 (the same image as S01's fallpark), s02winter 2411, s02finale 2413.
- Clips: `hybrid/run-clips.mjs`, Wan 2.2 14B i2v with the lightx2v 4-step LoRAs, drafted at 480x832, kept at 720x1280; moves are first-last-frame, 33 frames, played at speed 1.4. Kept seeds: s02open 21, s02m1 3, s02spring 32, s02m2 19, s02summer 7, s02m3 3, s02fall 7, s02m4 7, s02winter 24, s02m5 3, s02finale 25.
- Moves between two centred islands (m2, m4) cross-dissolve or morph one island into the other with the stock "lifts up and away ... glides down" prompt; the kept m2 and m4 prompts instead say the first island slides up out of frame, a beat of open sky, the second rises from below, "one above the other". m4 is clean; m2 still fades the spring island's rock into the beach for about 3 frames, the cleanest of ten seeds.
- The finale prompt avoids "stars appear" and "twinkling": both turned into falling streaks across the sky where the summary line sits.
- Shot names carry the `s02` prefix so their ComfyUI uploads (`growth-<name>.png`) never collide with another episode running on the same server.
- Build: `hybrid/frames.mjs`, then `hybrid/spec.mjs` (overlays in `clips.json`, copy in `episode.json`; the end card list header says THIS YEAR via `endcard.section`).
