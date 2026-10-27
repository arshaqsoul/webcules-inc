---
name: growth-motion-reel
description: Procedure for making a code-only motion graphics ad reel for Snap (the "Not Photography" series) from a spec file - isometric machine, proof card, 3D end card and synthesised score - rendered deterministically with headless Chromium and ffmpeg, then checked and packaged. Use when asked for a new reel, ad, episode or motion graphic for Snap's Instagram or Facebook that does not need a staging recording.
---

# Motion reel (code-only)

Everything lives in `growth/motion/`.
Read `growth/motion/SERIES.md` (concept, ad anatomy, backlog) and `growth/motion/README.md` (engine) before you start.

## Procedure

1. **Pick the episode.**
   Take the first `ready` row in the backlog in `SERIES.md`, or the one you were asked for.
   If its stations column names kinds that do not exist yet in `engine/stations.js`, build those first (step 3).
2. **Ground the pain.**
   At least 3 real sources on 2 or more hosts (growth/AGENTS.md rule 9).
   Reuse a validated ledger record's evidence when one fits and put its id in `pain.ledger`.
   Paraphrase; never name an individual.
3. **Build missing stations** in `engine/stations.js`, following the anatomy skill's craft rules (`.claude/skills/anatomy/references/craft.md`): solid parts on a base plate, a moving part while active, a red lamp once visited, one engraved label.
   Add a `station:<kind>` sound in `audio.mjs`.
4. **Write the spec**: `node growth/motion/render.mjs new E0NN <Title>`, then replace every TODO.
   Hook in the "ONE" pattern, captions in the photographer's words, slam ending in *photography.*, proof rows that are real Snap features.
5. **Back every claim** with `{ text, source, match }` pointing into `apps/snap`.
   Read the source; never quote a tier, limit or price from memory.
6. **Check and look**: `render.mjs check`, then `render.mjs stills` and read `out/<id>/contact.png` plus full-size stills, including the transitions.
   Fix anything clipped, overlapping, too small to read at phone size, or outside `SAFE`.
7. **Render**: `render.mjs render <id>`.
   Every QC line must say PASS.
   Then pull frames from `reel.mp4` across the transitions and look at them.
8. **Package**: `render.mjs package <id>`, then hand `out/<id>/reel.mp4`, `cover.png` and `episodes/<id>-*/package.md` to the founder.
   Mark the backlog row `made`.

## Never

- Never post, schedule or upload to Instagram or Facebook; the founder does.
- Never use AI video or image generation for these reels; the point is that every pixel comes from code.
- Never use `Math.random()` or wall-clock time in a scene; use `wobble()` and `rng(seed)` so renders repeat exactly.
- Never loosen a QC threshold to pass; fix the reel.
