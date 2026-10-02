# Launch video — "Meet Snap" (v0.5.0 launch)

Produced 2026-10-01 with the house video pipeline (`.learn-videos/meet-snap/`,
`tools/assemble_launch.py`, `tools/social_cuts.py`). All product footage is the
real staging app over the seeded "Willow & Pine Studio" demo workspace. Voice
is the approved arsha-f5 clone (same voice as `public/learn/media/intro-to-snap`).
Every claim comes from `docs/SNAP-30-DAY-LAUNCH-STRATEGY.md` §1 truth sheet —
no superlatives, no numbers outside the sheet.

## Files

| File | Size | Use |
|---|---|---|
| `meet-snap.mp4` | 1920×1080 · 0:57 · h264/aac · 7.9 MB | Landing page master (16:9) |
| `meet-snap.vtt` | sidecar captions | `<track>` for the landing player |
| `meet-snap-poster.jpg` | 1920×1080 | `poster=` before first play |
| `meet-snap-square.mp4` | 1080×1080 · 0:57 · 4.9 MB | LinkedIn/X/Instagram feed (captions burned in) |
| `meet-snap-vertical.mp4` | 1080×1920 · 0:57 · 5.4 MB | Reels/Shorts/TikTok (captions burned in) |

Structure: brand sting (0:00) → dashboard hook → booking link → leads →
pipeline → Template Studio → client gallery → your-Stripe money beat →
"Start free — snap.webcules.com" outro card. Chapters in
`.learn-videos/meet-snap/chapters.json`.

## Landing page embed

```tsx
<video
  poster="/launch/meet-snap-poster.jpg"
  controls
  preload="none"
  playsInline
>
  <source src="/launch/meet-snap.mp4" type="video/mp4" />
  <track
    kind="captions"
    src="/launch/meet-snap.vtt"
    srcLang="en"
    label="English"
    default
  />
</video>
```

For an autoplaying hero (muted, loop): add `autoPlay muted loop` and drop
`controls`; the burned-caption social cuts are not needed on the landing page —
the sidecar `.vtt` carries captions for sound-on viewers.

## Social

Upload the square/vertical files directly in each platform's composer — both
have captions burned in (most social viewing is muted). Suggested first
comment/copy anchors: "0% commission — ever", "20 GB free, no credit card",
"snap.webcules.com". Don't add claims outside the truth sheet.

## Regenerating

```
python tools/assemble_launch.py   # reassemble master from clips/ + vo/
python tools/social_cuts.py       # re-render social cuts + poster
```

Scenes are re-shot with ZCode's browser recorder per
`.learn-videos/meet-snap/script.json` (see docs/LEARN-VIDEO-PIPELINE.md).
Music is a synthesized ambient pad (`tools/assemble_launch.py` §5) —
license-clean and swappable for a Pixabay/YouTube Audio Library track at
assembly time.
