# A06 "Did they even open it?"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:** At dusk a stylized 3D animated photographer is curled on her sofa hugging a cushion, nervously checking the street. Across the street a window lights up with a soft lavender glow, and a ribbon of glowing lavender sparkle dust drifts across and in through her window, curling around her phone. She gasps, jumps up with the cushion over her head, and cheers silently with a huge smile.
Then the camera pulls back to a cutaway diorama on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.
Card: "Client opened their gallery for the first time".

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair).
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
