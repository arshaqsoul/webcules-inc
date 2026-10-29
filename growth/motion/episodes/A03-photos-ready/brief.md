# A03 "Are the photos ready yet?"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:**
1. At character scale: her editing desk at night, eager clients pressed against the dark window behind her. Hook on screen.
2. She taps one key; a ribbon of lavender dust streams out of the monitor and through the window to the clients, who light up and wave. Card: "Gallery delivered - Hannah Reyes", 64 photos (`gallery.delivered`, apps/snap/lib/shares/notify.ts).
3. The camera pulls back to the editing nook as a cutaway dollhouse, her leaning back in the chair, on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair). Kept seeds: a03desk 9402, a03diorama 9502.
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move from the first shot's cut frame to the diorama keyframe. Clip seeds are in `clips.json`.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
