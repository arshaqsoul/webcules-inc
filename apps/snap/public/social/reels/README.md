# Social reels — vertical cuts for composer upload

Cut from `public/learn/media/intro-to-snap.mp4` (WEBC-469) for the 2/day Snap
posting cadence. All 1080×1920 (9:16) with captions burned in and a
"Start free — snaphq.app" end card. Upload directly in the IG Reels / FB
composer; claims stay inside docs/SNAP-30-DAY-LAUNCH-STRATEGY.md §1 truth sheet.

| File | Length | Covers |
|---|---|---|
| `intro-to-snap-reel-1-getting-started.mp4` | 0:42 | Intro + Bookings (one link → booked) |
| `intro-to-snap-reel-2-pipeline-galleries.mp4` | 0:58 | Leads → Projects pipeline → Galleries |
| `intro-to-snap-reel-3-money-wrapup.mp4` | 0:36 | Money (your own Stripe, 0% commission) + wrap-up |

Regenerating: the cuts are re-derivable from the master with the same recipe as
`tools/social_cuts.py` (blurred bg + sharp 16:9 band at y=560, captions at
y=1260, Inter 600 captions, 3.5s end card). Chapter boundaries:
Introduction 2.5 · Bookings 19.07 · Pipeline 41.25 · Galleries 68.53 ·
Money 96.1 · Wrap-up 113.15 (from `.learn-videos/intro-to-snap/chapters.json`).
