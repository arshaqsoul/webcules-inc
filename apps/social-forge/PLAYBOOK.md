# social-forge PLAYBOOK — the motion-component forge

Turn any motion reference (a video or webp of a hero/effect you saw — motionsites.ai is the
usual source) into a **reusable React component**, packaged for the **shadcn CLI and manual
download**, then turn that component into a **Facebook/Instagram post pack**. This is the
lighter cousin of `forge-redesign`: same local-ComfyUI philosophy, no research/outreach/deploy
phases, no client project — the output is a component and content, not a website.

- **CLI**: `pnpm --filter @webcules/social-forge social <cmd>` from `webcules-inc/`, or
  `node src/cli.ts <cmd>` from the app dir.
- **Machine**: RTX 5070 Ti 16 GB. Rendering is browser-recording, not AI video — minutes per
  render, fully deterministic.
- **Projects**: `webcules/social/<slug>/` (same level as site-forge's generated sites).
- **Components**: canonical home is `packages/ui/src/components/ui/<name>.tsx` — the same
  library as `sparkles`, `background-boxes`, `typewriter-effect`. Nothing lives only inside
  social-forge.

## The law of this pipeline

1. **Record the real component. Never AI-generate a video of a UI.** The renders are headless
   Chromium recordings of the actual demo page — what the viewer sees is what ships to
   customers. ComfyUI stays in the loop for what it's good at: textures, backdrops, posters
   (`qwen-image` for anything with text, `z-image-turbo` for abstract stills). It never fakes
   the component itself.
2. **Nothing auto-posts.** The post pack is markdown for copy-paste. Posting is manual,
   always (same standing rule as the dashboard's publishers).
3. **The CLI is the toolkit; judgment is yours.** Two phases are agent work, not commands:
   the analysis (phase 2) and the component build (phase 3). The commands move files, package,
   record, and render.

## Phase 1 — Ingest

```bash
social ingest <video|webp|gif> --name <slug> [--component <name>] [--source "…"] [--hook "…"]
```

Copies the reference into `research/reference/`, extracts frames at 2 fps (ffmpeg resolves via
`FFFMPEG_PATH` → ComfyUI's bundled imageio-ffmpeg → ffmpeg-static), writes
`social.project.json` (the manifest — source of truth for variants, catchphrase, hashtags,
status) and an empty `research/component-analysis.md`.

## Phase 2 — Analyze (agent)

Read the frames (`research/frames/*.png`) and the full video, then write
`research/component-analysis.md`: what the motion is, the table of reusable components
identify-everything-then-pick, and the flagship spec — physical description, props, variants,
performance budget. Then set the manifest: `component.name`, `component.file`
(`packages/ui/src/components/ui/<name>.tsx`), `component.description`, `variants`
(palette or prop overrides, carousel order = object order), `catchphrase`, status `analyzed`.

**Pick components, not sites.** The output must be generic (props, no hard-coded copy) —
"stacking cards on scroll", "eyes that follow the cursor" — not a clone of the reference.
Steal patterns, not pixels, same as site-forge.

## Phase 3 — Build the component (agent)

Write `packages/ui/src/components/ui/<name>.tsx` + the demo
`apps/social-forge/src/demos/<slug>.tsx`, then:

```bash
social sync --project <slug>   # regenerates src/demos/registry.ts (the gallery route map)
```

**House rules for components** (these are what make the registry artifact trustworthy):

- `"use client"`, `cn` from `@webcules/ui/lib/utils`, forwardRef, className passthrough.
- **Zero runtime deps** beyond React. Canvas 2D over WebGL unless the effect truly needs it.
- One `requestAnimationFrame` loop; cancel on unmount; pause on `visibilitychange`.
- DPR capped at 2; geometry rebuilt only via `ResizeObserver`.
- `prefers-reduced-motion` → draw one settled static frame, no loop.
- Decorative: `aria-hidden`, no content inside, safe behind any copy.
- Deterministic "randomness" (sin-hash), so every mount renders identically — recordings and
  stills must be reproducible.

**Demo rules:** the demo page is the ad. Wide layout = a Webcules-flavored hero using the
component (real copy, never lorem); `?layout=vertical` = 1080×1920 reel framing with the hook
headlined top and brand bottom; `?variant=` switches manifest palettes. Content fades up in
the first ~1.3s so recordings start settled. Dark scrim behind copy where it crosses the glow.

**Live controls are mandatory.** Every demo must accept `?panel=1` and expose its **complete
prop surface** through `src/components/TweakPanel.tsx` (schema-driven sliders/colors/toggles,
grouped) plus a layout switcher, variant presets, a seed re-roll, and a **copy config JSON**
button — tuned configs get pasted into `social.project.json` or handed straight back. The
panel renders only when `?panel=1` is present, so recordings and normal views are never
affected. A demo without a full panel is not done.

**Island gotcha:** Astro cannot hydrate a component passed as a dynamic variable — demos must
render through `src/demos/loader.tsx` (static import + `React.lazy`), and the route uses
`client:only="react"`. Don't fight this, it's already wired.

## Phase 4 — Package (shadcn CLI + manual download)

Before packaging, generate the **preview assets + documentation** (mandatory for a
library-ready component): `node scripts/preview.ts <slug>` captures an animated WebP + poster
into the project's `docs/`, and you write `docs/README.md` — full props table, install (CLI +
manual), usage examples, behavior/a11y notes. The registry command bundles docs + previews
into the zip and enriches the item's `docs` field automatically. Finish with
`social publish --project <slug>` — it publishes the component into the **Webcules landing
library** (`apps/landing`): copies the preview WebP to `public/components/`, injects the
`library.json` entry (docsMode generated), regenerates the manifest, rebuilds `/r/<name>.json`,
and prints the live URLs. Preview capture → docs → publish is the library-ready order.

```bash
social registry --project <slug> [--url https://components.webcules.com/r/<name>.json]
```

Emits `registry/<name>.json` (registry-item schema — the URL `npx shadcn@latest add <url>`
consumes), `registry/registry.json` (collection), and `downloads/<name>.zip` (component +
README + registry JSON). The emitter rewrites the monorepo import `@webcules/ui/lib/utils` →
`@/lib/utils` inside the packaged copy — check the rewrite if the component ever grows new
intra-package imports. Hosting the JSON anywhere static (GitHub Pages, R2, the backgrounds
storefront) makes the CLI URL live; the manifest's `component.registryUrl` records it.

## Phase 5 — Render

```bash
social render --project <slug> [--url http://127.0.0.1:4322] [--seconds 8]
```

Starts `astro dev` if no healthy server answers (or uses `--url` / `SOCIAL_FORGE_URL`), then
records the **real demo page** in headless Chromium:

| Asset | Spec | For |
|---|---|---|
| `<slug>-wide.mp4` | 1920×1080, `--seconds` + 1.8s warmup | Facebook feed post |
| `<slug>-reel.mp4` | 1080×1920, hook baked in via `?layout=vertical&hook=…` | FB + IG Reels |
| `stills/<variant>-1080x1350.png` | one per manifest variant, 3.2s settle | IG carousel |

webm → mp4 via libx264 (`-crf 20 -pix_fmt yuv420p -movflags +faststart`). Port note: if 4322
is taken Astro shifts to 4323 — pass `--url` explicitly. Always **Read a frame of each render
before shipping** (ffmpeg `-ss 6 -frames:v 1`); the recording gate is visual, not exit codes.

## Phase 6 — Post pack

```bash
social post --project <slug>
```

Writes `social/posts/`: `facebook.md` (feed + reel captions), `instagram.md` (carousel slide
plan + captions), `hooks.md` (catchphrase options — never repeat one within a week), and a
posting checklist. Voice: proof over promises, local-first, "see your redesign before you
pay" CTA. Then post manually, in the checklist's order, and reply to every comment within the
hour.

## Where things live

```
apps/social-forge/src/cli.ts         dispatcher (ingest/sync/registry/render/post)
apps/social-forge/src/social/        one file per command + util (paths, ffmpeg, log)
apps/social-forge/src/demos/         <slug>.tsx demos + registry.ts (generated) + loader.tsx
apps/social-forge/src/pages/demo/[slug].astro   gallery route (?layout ?variant ?hook)
packages/ui/src/components/ui/       canonical component home (also the registry source)
webcules/social/<slug>/              project: manifest, research/, registry/, downloads/, social/
```
