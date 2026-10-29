# A02 "I wish they'd just book"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:**
1. At character scale: her home photo studio by day, on an old phone with the cord wrapped around her, the wall calendar a mess of crossed-out dates. Hook on screen.
2. A swirl of lavender dust unwinds the cord and peels the sticky notes off the calendar like butterflies; she hangs up with a fist pump. Card: "New booking - Maya Chen" (`booking.created`, apps/snap/lib/repos/bookings.ts).
3. The camera pulls back to the studio as a cutaway dollhouse, her camera ready for the shoot, on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair). Kept seeds: a02studio 9203, a02diorama 9302.
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move from the first shot's cut frame to the diorama keyframe. Clip seeds are in `clips.json`.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
