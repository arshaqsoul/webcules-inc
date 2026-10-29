# A05 "I wish they'd just pay"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:** In a warm cafe a stylized 3D animated photographer sits at a small table holding a cappuccino, glancing worriedly at the rainy window. Outside, the client taps her phone and smiles. Suddenly a glowing pale lavender coin trails sparkle dust, flies in through the door and drops softly into the photographer's open palm. She gasps, her whole face lights up and she raises the coin in a happy toast, the client waving through the window.
Then the camera pulls back to a cutaway diorama on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.
Card: "Invoice 0042 paid".

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair).
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
