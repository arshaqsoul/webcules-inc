# A09 "I wish rescheduling wasn't a thread"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:** On a windswept sunrise beach a stylized 3D animated photographer looks up at gathering clouds while her client holds up her phone. A glowing pale lavender calendar page flutters in on a ribbon of sparkle dust, flips over in the air and settles neatly onto a new date. The photographer smiles with relief, the clouds part, and the client gives a thumbs up.
Then the camera pulls back to a cutaway diorama on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.
Card: "Booking rescheduled - Maya Chen".

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair).
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
