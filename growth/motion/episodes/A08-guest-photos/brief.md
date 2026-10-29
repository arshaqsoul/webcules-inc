# A08 "I wish guests would just send me their photos"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:** At a lantern-lit wedding garden at dusk, the stylized 3D animated photographer lowers her camera and smiles while three guests laugh over their phones. Glowing pale lavender photo cards lift out of the guests' phones and float in a soft ribbon of sparkle dust across the dance floor to a small lavender box in her hands. She peeks inside, delighted, and the guests wave.
Then the camera pulls back to a cutaway diorama on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.
Card: "New client upload - Wedding guest photos".

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair).
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
