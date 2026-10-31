# A04 "I wish I never missed an inquiry"

A Snap it. spot in the style of Airbnb's "airbnb it." films; built exactly like `episodes/A01-just-sign/` (read its brief).

**Who:** the recurring photographer as a stylized animated character (`characters.photographerToon`).

**What happens:**
1. At character scale: a golden clifftop meadow, shooting Ana and Leo, while a paper airplane (the next inquiry) drifts past behind her. Hook on screen.
2. A ribbon of lavender dust catches the airplane before the cliff edge and lands it on her shoulder. Card: "New inquiry - Ana & Leo", from the contact form (`lead.created`, apps/snap/lib/repos/leads.ts). Only the contact form is claimed: never imply DMs or texts arrive in Snap.
3. The camera pulls back to the meadow as a small slice of land on lavender, the airplane circling above, on the pale lavender of the grid, with "Snap it.", the offer and snaphq.app above.

**Feel:** warm, playful, a weight lifted. About 10 s.

## Production

- Keyframes: Z-Image Turbo 768x1344 from `sheets.json` (style_toon, photographerToon and the toon location pair). Kept seeds: a04cliff 9604, a04diorama 9701.
- Clips: Wan 2.2 14B i2v with the lightx2v 4-step LoRAs at 720x1280; the pull-out is a first-last-frame move from the first shot's cut frame to the diorama keyframe. Clip seeds are in `clips.json`.
- `episode.json` sets `"endcard": false`; the diorama clip carries the `wordmark` overlay.
