# A07 "I wish minis booked themselves"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:** In a cosy holiday mini-session studio a stylized 3D animated photographer shoots a laughing family under the tree. Behind her, glowing pale lavender paper tags drift in on ribbons of sparkle dust, one after another, and pin themselves to the wall board. She glances back, sees the board filling up, and grins at the family, who laugh and give a thumbs up.
Then the camera pulls back to a cutaway diorama on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.
Card: "New booking - Patel family".

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair).
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
