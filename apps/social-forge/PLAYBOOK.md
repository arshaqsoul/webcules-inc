# social-forge PLAYBOOK — the motion-component forge

Turn any motion reference (a video or webp of a hero/effect you saw — motionsites.ai is the
usual source) into a **reusable React component** that is **installed directly in the Webcules
component library** (`apps/landing`), listed exactly like `wildcode-field` and
`neural-pathways`, packaged for the **shadcn CLI and manual download** — and, if wanted, turned
into a **Facebook/Instagram post pack**. There is no separate app to build for: the component's
home is `packages/ui`, and `social publish` installs it into the landing library. The
social-forge demo gallery survives only as an optional recording rig for the marketing pack.

- **CLI**: `pnpm --filter @webcules/social-forge social <cmd>` from `webcules-inc/`, or
  `node src/cli.ts <cmd>` from the app dir.
- **Machine**: RTX 5070 Ti 16 GB. Rendering is browser-recording, not AI video — minutes per
  render, fully deterministic.
- **Projects**: `webcules/social/<slug>/` (same level as site-forge's generated sites).
- **Components**: canonical home is `packages/ui/src/components/ui/<name>.tsx` — the same
  library as `sparkles`, `background-boxes`, `typewriter-effect`. Nothing lives only inside
  social-forge.

## The law of this pipeline

1. **Nothing is built before the user confirms the analysis.** After analyzing the reference,
   the identified components, the flagship spec and the variants are presented to the user.
   They check it and confirm — with feedback — and only then does development continue. The
   gate is mechanical: `registry`, `publish`, `render` and `post` all refuse to run until
   `social confirm` has recorded the approval.
2. **The component is developed directly in webcules-inc and lands in the component list.**
   Write `packages/ui/src/components/ui/<name>.tsx`, publish it into `apps/landing`'s library —
   the docs page, `/r/<name>.json` and the grid listing are generated for it, same as
   `wildcode-field` and `neural-pathways`. No demo app in the mainline.
3. **Record the real component. Never AI-generate a video of a UI.** The renders are headless
   Chromium recordings of a real page running the actual component — what the viewer sees is
   what ships to customers. ComfyUI stays in the loop for what it's good at: textures,
   backdrops, posters (`qwen-image` for anything with text, `z-image-turbo` for abstract
   stills). It never fakes the component itself.
4. **Nothing auto-posts.** The post pack is markdown for copy-paste. Posting is manual,
   always (same standing rule as the dashboard's publishers).
5. **The CLI is the toolkit; judgment is yours.** Two phases are agent work, not commands:
   the analysis (phase 2) and the component build (phase 4). The commands move files, package,
   record, and render.

## Phase 1 — Ingest

```bash
social ingest <video|webp|gif> --name <slug> [--component <name>] [--source "…"] [--hook "…"]
```

Copies the reference into `research/reference/`, extracts frames at 2 fps (ffmpeg resolves via
`FFFMPEG_PATH` → ComfyUI's bundled imageio-ffmpeg → ffmpeg-static), writes
`social.project.json` (the manifest — source of truth for variants, catchphrase, hashtags,
status) and an empty `research/component-analysis.md`.

## Phase 2 — Analyze, then STOP for user review (agent)

Read the frames (`research/frames/*.png`) and the full video, then write
`research/component-analysis.md`: what the motion is, the table of reusable components
identify-everything-then-pick, the flagship spec — physical description, props, variants,
performance budget — and the library placement (title, tagline, tags, docs highlights, usage
snippet for the landing docs page).

**Pick components, not sites.** The output must be generic (props, no hard-coded copy) —
"stacking cards on scroll", "eyes that follow the cursor" — not a clone of the reference.
Steal patterns, not pixels, same as site-forge.

Then **present the analysis to the user** — the candidate components, what you picked, the
spec, the variants — and **wait**. The user checks it and either confirms or corrects. Do not
write a single line of the component yet.

## Phase 3 — Confirm (the user gate)

Fold the user's feedback back into `research/component-analysis.md`, then set the manifest:
`component.name`, `component.file` (`packages/ui/src/components/ui/<name>.tsx`),
`component.title`, `component.description`, `variants` (palette or prop overrides, carousel
order = object order), `catchphrase`. Then:

```bash
social confirm --project <slug> [--notes "the user's feedback"]
```

This records `status: "confirmed"` + the feedback in the manifest and unblocks everything
downstream. If the user rejects, revise the analysis and go through the gate again — `confirm`
is re-runnable and just overwrites the recorded feedback. From here on the component is
developed **directly in webcules-inc**: no separate app, no demo detour required.

## Phase 4 — Build the component (agent)

Write `packages/ui/src/components/ui/<name>.tsx` — that file is the whole deliverable. Then
export it from the ui package the same way the other components are exported, and move
straight to phase 5.

**House rules for components** (these are what make the library artifact trustworthy):

- `"use client"`, `cn` from `@webcules/ui/lib/utils`, forwardRef, className passthrough.
- **Zero runtime deps** beyond React. Canvas 2D over WebGL unless the effect truly needs it — and when the motion is true 3D (perspective depth, 3D particle fields, volumetric glow, shader backgrounds, camera moves) it does: use **raw three.js**, the single allowed dep. Never react-three-fiber, never a hand-rolled canvas-2D pseudo-3D engine (fake perspective/depth sorting — the #1 quality failure). Recipes and the build-tech classification live in `/forge-social`'s analyze + build steps and the `video2code-3d` skill.
- One `requestAnimationFrame` loop; cancel on unmount; pause on `visibilitychange`.
- DPR capped at 2; geometry rebuilt only via `ResizeObserver`.
- `prefers-reduced-motion` → draw one settled static frame, no loop.
- Decorative: `aria-hidden`, no content inside, safe behind any copy.
- Deterministic "randomness" (sin-hash), so every mount renders identically — recordings and
  stills must be reproducible.

## Phase 5 — Package + install into the library

The destination: the component **listed in the Webcules component library**
(`apps/landing` `/components`) with a docs page and a working `npx shadcn add` URL — same
list, same mechanics as `wildcode-field` and `neural-pathways`.

1. **Preview + docs** (mandatory for a library-ready component):
   `node scripts/preview.ts <slug>` captures an animated WebP + poster into the project's
   `docs/` (records the demo gallery by default — pass `--url http://localhost:3000
   --path /components/<name>` to record the landing docs page itself instead), and you write
   `docs/README.md` — full props table, install (CLI + manual), usage examples,
   behavior/a11y notes.
2. **Install into the library**:

   ```bash
   social publish --project <slug>
   ```

   Copies the preview WebP to `apps/landing/public/components/`, injects the `library.json`
   entry (`docsMode: "generated"` — the `/components/<name>` docs page, grid listing and
   sidebar come from it automatically), regenerates the manifest, rebuilds `/r/<name>.json`,
   and prints the live URLs. That's the component installed like the others; `next dev` in
   `apps/landing` shows it in the list.
3. **Registry + manual download**:

   ```bash
   social registry --project <slug> [--url https://components.webcules.com/r/<name>.json]
   ```

   Emits `registry/<name>.json` (registry-item schema — the URL `npx shadcn@latest add <url>`
   consumes), `registry/registry.json` (collection), and `downloads/<name>.zip` (component +
   README + registry JSON), bundling docs + previews. The emitter rewrites the monorepo
   import `@webcules/ui/lib/utils` → `@/lib/utils` inside the packaged copy — check the
   rewrite if the component ever grows new intra-package imports. Hosting the JSON anywhere
   static (GitHub Pages, R2, the backgrounds storefront) makes the CLI URL live; the
   manifest's `component.registryUrl` records it.

Preview capture → docs → publish → registry is the library-ready order.

## Phase 6 — Optional: render + post pack (marketing extension)

Only when the FB/IG post pack is wanted. This is the one phase that uses a page to record:
either the demo gallery (build `<slug>.tsx` under `apps/social-forge/src/demos/`, run
`social sync --project <slug>`), or any already-running page — e.g. the landing docs page —
via `--url` / `--path`.

```bash
social render --project <slug> [--url http://127.0.0.1:4322] [--path /demo/<slug>] [--seconds 8]
```

Starts `astro dev` if no healthy server answers (or uses `--url` / `SOCIAL_FORGE_URL`), then
records the **real page** in headless Chromium:

| Asset | Spec | For |
|---|---|---|
| `<slug>-wide.mp4` | 1920×1080, `--seconds` + 1.8s warmup | Facebook feed post |
| `<slug>-reel.mp4` | 1080×1920, hook baked in via `?layout=vertical&hook=…` | FB + IG Reels |
| `stills/<variant>-1080x1350.png` | one per manifest variant, 3.2s settle | IG carousel |

webm → mp4 via libx264 (`-crf 20 -pix_fmt yuv420p -movflags +faststart`). Port note: if 4322
is taken Astro shifts to 4323 — pass `--url` explicitly. Always **Read a frame of each render
before shipping** (ffmpeg `-ss 6 -frames:v 1`); the recording gate is visual, not exit codes.

```bash
social post --project <slug>
```

Writes `social/posts/`: `facebook.md` (feed + reel captions), `instagram.md` (carousel slide
plan + captions), `hooks.md` (catchphrase options — never repeat one within a week), and a
posting checklist. Voice: proof over promises, local-first, "see your redesign before you
pay" CTA. Then post manually, in the checklist's order, and reply to every comment within the
hour.

**Only if you build a demo page**, these rules apply to it (the demo page is the ad):
wide layout = a Webcules-flavored hero using the component (real copy, never lorem);
`?layout=vertical` = 1080×1920 reel framing with the hook headlined top and brand bottom;
`?variant=` switches manifest palettes; content fades up in the first ~1.3s so recordings
start settled; dark scrim behind copy where it crosses the glow. **Live controls are
mandatory**: every demo accepts `?panel=1` and exposes its complete prop surface through
`src/components/TweakPanel.tsx` (schema-driven sliders/colors/toggles, grouped) plus a layout
switcher, variant presets, a seed re-roll, and a **copy config JSON** button — tuned configs
get pasted into `social.project.json`. The panel renders only when `?panel=1` is present.
**Island gotcha:** Astro cannot hydrate a component passed as a dynamic variable — demos must
render through `src/demos/loader.tsx` (static import + `React.lazy`), and the route uses
`client:only="react"`. Don't fight this, it's already wired.

## Where things live

```
apps/social-forge/src/cli.ts         dispatcher (ingest/confirm/sync/registry/render/post/publish)
apps/social-forge/src/social/        one file per command + util (paths, ffmpeg, log)
apps/social-forge/src/demos/         optional render rig: <slug>.tsx demos + registry.ts (generated) + loader.tsx
apps/social-forge/src/pages/demo/[slug].astro   gallery route (?layout ?variant ?hook ?panel)
packages/ui/src/components/ui/       canonical component home (also the registry source)
apps/landing/components/library/library.json    the component list social publish installs into
webcules/social/<slug>/              project: manifest, research/, registry/, downloads/, docs/, social/
```
