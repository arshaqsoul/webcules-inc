# A01 "I wish they'd just sign"

The first Snap it. spot in the style of Airbnb's "airbnb it." films (the founder's reference recordings: `C:\Users\arsha\Videos\Screen Recordings\airbnb*.mp4`): stylized 3D animated characters acting at character scale, one comic beat with a little magic, then a pull-out to the whole room as a cutaway diorama on a seamless backdrop with the wordmark. No phone end card: the diorama is the end card.

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`, the same hair, glasses and clothes as `photographer`).

**What happens:**
1. Night, her kitchen table, buried behind stacks of paper contracts and sticky notes. Hook: "I wish they'd just *sign*."
2. She sighs. A swirl of lavender sparkle dust lifts the papers off the table and they fly away like a flock of birds. She laughs. The Snap card drops: "Contract signed - Wedding agreement", signed by Priya Shah (`contract.signed`, apps/snap/lib/contracts.ts).
3. The camera pulls back: the kitchen becomes a dollhouse cutaway on the pale lavender of the grid. "Snap it.", the offer and snaphq.app land above it.

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon, toonKitchen, toonKitchenDiorama). Kept seeds: a01kitchen 9002, a01diorama 9101.
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs, drafted at 480x832, kept at 720x1280. The pull-out (a01m1) is a first-last-frame move from the kitchen's cut frame to the diorama keyframe. Kept seeds: a01kitchen 11, a01m1 3, a01diorama 21.
- `episode.json` sets `"endcard": false`; the closing clip carries the `wordmark` overlay instead.
