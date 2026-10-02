# meet-snap — launch video plan (v1, 2026-10-01)

Marketing launch video for snap.webcules (v0.5.0 era): landing-page master +
social cuts. Follows the house pipeline (docs/LEARN-VIDEO-PIPELINE.md) and the
shipped intro-to-snap look (tools/assemble_intro.py is the reference).

- Target: 60–90s (SNAP-MARKETING-PLAYBOOK "demo proof"); landed at 0:57.
- Register: marketing, not tutorial. Hook = 0%-commission one-liner; beats =
  booking link → leads → pipeline → Template Studio → client gallery → your
  Stripe → CTA. Presenter = shutter mascot PiP; intro/outro sting cards.
- Copy: ONLY docs/SNAP-30-DAY-LAUNCH-STRATEGY.md §1 truth sheet ("0% commission
  — ever", "20 GB free, no credit card", "that fee goes to Stripe, never to us",
  six-digit code). Tagline "Your studio, in focus."
- VO: arsha-f5 (F5-TTS v1 Base, cfg 2.0, speed 0.95) from the shipped
  intro-to-snap vo/s01.wav reference + its known transcript (voice-sample dir
  was cleaned up; the shipped clip is the approved voice identity). 8 clips,
  padded 250/400ms, loudnorm −16 LUFS. 44.0s total.
- Capture: staging (snap-staging.webcules.com), smoke account, seeded Willow &
  Pine workspace, 1920×1080@30, showCursor. s03 was re-shot on /dashboard/leads
  because the staging inbox thread contains QA residue (WEB-307 test text,
  "DELIVERY FAILED" badges). Booking-page calendar lives in an iframe →
  coordinate click (680,307), no pre-scroll.
- Assembly: VO-locked (GAP 0.8s, intro 2.8s, outro 3.5s) → 56.87s master.
  Music = synthesized ambient pad (numpy; Cmaj9–Em7–Fmaj9–G6), bed-only
  ≈ −31 dB mean, ducked ~62% under the narration envelope. License-clean;
  swap for a curated free-license track any time.
- Captions: sidecar meet-snap.vtt (scene-level) for the landing player;
  burned-in short marketing captions on both social cuts (muted autoplay).
- Deliverables copied to apps/snap/public/launch/ (see README there).
  out/ intermediates stay untracked per .learn-videos/.gitignore.
