# LEARN-VIDEO-PIPELINE — how Snap produces Linear-style guide videos

Status: pipeline scaffolded (agents exist), awaiting 5 user decisions (§7).
Created: 2026-09-30. Reference material: linear.app/learn + the three shared
Linear videos (welcome / projects / daily workflows).

## 1. What Linear actually does (dissected from the shared videos)

| Video | Length | Format |
|---|---|---|
| Intro to Linear (welcome) | ~4:00 | Real presenter on camera (warm home-office, shallow DOF) alternating with screen recordings; logo sting in/out; customer-logo wall; cursor with click ripples |
| Projects | ~2:54 | ~10s talking-head open, then all screen recording of the demo workspace; logo sting out |
| Daily workflows | ~3:08 | All screen recording, no face |

The authenticity formula (what makes them not feel AI):

1. **A rich, months-deep demo workspace** ("RideShare": teams, dozens of
   projects in mixed states, members with avatars, SLA statuses, activity
   history). Fake data, but *lived-in* data. This matters more than anything
   else in the frame.
2. **Rehearsed-feeling cursor**: eased moves, hover dwell, click ripples
   (Screen Studio signature), macOS window chrome, light theme, one action
   visible at a time.
3. **Script-first editing**: every narration sentence is one screen beat;
   cuts land on words; nothing happens on screen that isn't being said.
4. **A real human voice** (and a real face only for the intro video).
5. Consistent branding: sting cards, single accent color, quiet music bed.

## 2. Pipeline (agents created, in ~/.agents/skills/)

```
snap-learn-lead      orchestrator: plan → dispatch → gates → staging deploy
 ├─ snap-learn-script    narration + script.json shotlist (spoken register,
 │                       one sentence = one beat, action choreography rules)
 ├─ snap-learn-shooter   drives staging in ZCode's built-in browser recorder,
 │                       per-scene WebM → ffmpeg → clips/*.mp4
 ├─ snap-learn-voice     VO per scene: human kit (A, recommended) /
 │                       ElevenLabs clone (B) / frozen stock voice (C)
 ├─ snap-learn-assemble  VO-locked timeline, scripted zooms, click ripples,
 │                       Snap intro/outro cards, music bed, .vtt, chapters.json
 └─ snap-learn-page      /learn/<slug>: player + chapter jump sidebar +
                         transcript + related docs, mirroring lib/docs architecture
```

Inter-agent contract: `script.json` (shotlist: scenes with narration,
startUrl, action DSL, focus-zoom, chapter, estSeconds). Working dir:
`.learn-videos/<slug>/`. State: `.learn-agent-state.json`. ffmpeg:
`C:\Users\arsha\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\`.

Recording mechanism: ZCode's built-in Browser Use recorder
(`tab.recording.start` — action DSL with eased `move`/`click`/`type`,
`showCursor`, ≤90s per clip, one clip per scene). This is the Windows-native
equivalent of what Linear gets from Screen Studio; zooms and ripples are added
in assembly, not at capture.

## 3. Where AI helps vs. where it must not go

- Helps: script drafting (human-edited), captions, chapter timestamps,
  thumbnails, optional ComfyUI b-roll behind intro cards (§5), translation.
- Must stay real: the product UI on screen (always the live staging app), the
  voice (human or consented clone), any face (real footage or nothing).

## 4. First-batch guide plan (proposal, mirrors linear.app/learn)

Getting started series:
1. **Intro to Snap** (~3 min, the welcome video; needs the on-camera open)
2. **Daily workflows for photographers** (morning triage → today's shoots →
   deliveries → payouts)
3. **Project planning** (projects, galleries, contracts as the source of truth)
Then one feature video per docs category: booking page, calendar, gallery
delivery, payments, client portal, brand/embeds.

## 5. ComfyUI — honest verdict

**Yes, but only as a b-roll/thumbnail side-channel; it is not the core and
cannot fake the product or the presenter.**

Good fits (optional):
- Wan 2.2 (5B TI2V / 14B I2V, runs natively in ComfyUI) for abstract brand
  loops behind intro cards, mood shots of cameras/weddings for thumbnails.
- SDXL/img2img for cleaning up webcam backgrounds in a talking-head open.
- First-last-frame workflows for seamless b-roll loops.

Bad fits:
- Generating the product UI (must be real; generated UI hallucinates text).
- Lip-synced presenter (ComfyUI's LatentSync/HunyuanVideo-Avatar/MultiTalk
  nodes are far behind HeyGen-style pipelines and still read as AI).
- Upscaling screen recordings (SD models redraw UI text — corrupts it).

Verdict: skip ComfyUI for v1. The Linear look needs zero generated pixels.

## 6. Industry practice summary

- Screen capture with auto-zoom/cursor physics: Screen Studio (macOS de-facto
  standard), Matte/CursorClip/AutoZoom (alternatives). Our equivalent is fully
  automated browser-driven capture + ffmpeg zoom/ripple post.
- Voice: real human > consented ElevenLabs clone > frozen premium stock voice.
  "Doesn't sound like AI" is 80% script quality + 20% voice provenance.
- Edit: Descript/Premiere for humans; for us, the assemble agent's
  VO-locked timeline does the same job deterministically.
- Page format (linear.app/learn): series index of cards → guide page with a
  self-hosted player, timestamped chapter list under it, "Next:" footer.

## 7. Decisions — RESOLVED by Arsha (2026-09-30)

1. **Voice**: open-source clone of Arsha. **F5-TTS (MIT)** is the model —
   zero-shot from a 10–15s reference, runs locally on the RTX 5070 Ti (16GB,
   Blackwell → PyTorch cu128+). Sample script to read:
   `docs/LEARN-VOICE-SAMPLE-SCRIPT.md` → record into
   `.learn-videos/voice-sample/` (2 takes). Fallbacks: GPT-SoVITS fine-tune,
   then real-VO kit. (XTTS-v2 rejected: CPML license is non-commercial.)
2. **Presenter — FINAL (2026-09-30 evening): the shutter mascot.** The
   SnapMark aperture tile as a bottom-right PiP whose six blades open/close
   with the narration envelope (fast attack / slow release, deterministic, no
   AI in the loop). Rig: `C:\Users\arsha\tools\shutter_frames.py`. This
   REPLACED the earlier plan of Arsha's face + LatentSync lip-sync: that
   pipeline was fully built (3 renders) but produced noise in the mask region
   on this stack (denoise loop verified healthy → likely fp16 VAE decode on
   sm_120; a fix would upcast decode to fp32). The face clip, lip-sync test
   renders, and LatentSync model cache were deleted with Arsha's approval.
   ComfyUI + SDXL remain installed for optional art (thumbnails, b-roll).
3. **Demo workspace**: "Willow & Pine Studio" — Maya & Jonah Carter, wedding
   + portrait photographers, Austin TX; 6 clients in mixed pipeline states,
   3 months of booking history + 2 months upcoming, payment plans, contracts.
   Seeded via the real product only.
4. **Music**: free-license — Pixabay Audio Library (commercial, no
   attribution) or YouTube Audio Library; exact track recorded per video.
5. **Hosting**: **R2**, decided over Cloudflare Stream — zero egress fees and
   snap already streams R2 with range requests; Stream's $/min pricing buys
   nothing at docs traffic levels. Path `learn/<slug>/<slug>.mp4|.vtt|poster`.

This is now ComfyUI's established role: local runtime for LatentSync lip-sync
(+ optional Wan 2.2 intro b-roll). It still never generates the product UI.

## 8. Tooling inventory on this machine

- GPU: NVIDIA RTX 5070 Ti, 16GB VRAM (sm_120 → PyTorch cu128/nightly builds)
- ffmpeg 9.0.2 essentials: C:\Users\arsha\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin
- ZCode built-in browser recorder (action DSL, showCursor, 30–60fps, ≤90s/clip)
- Playwright (existing capture-docs-shots.mjs pattern) for stills if needed
- Local ComfyUI: LatentSync (lip-sync) + F5-TTS voice nodes; Remotion optional
  if assembly later needs finer cursor choreography
