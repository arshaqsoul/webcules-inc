# Webcules Component Forge

Spec-driven component factory for the Webcules component library
(live at `webcules.com/components`). Give it a reference image or video,
break the design down into a spec, and the forge handles scaffolding,
recording, approval, premium gating, the shadcn registry and deployment.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm forge:new <name> [--phrase "…"] [--title "…"] [--premium]` | Scaffold a draft: `spec.json` + canvas component skeleton + draft library entry |
| `pnpm forge:analyze <name> <reference-image-or-video>` | Stage the reference; videos get keyframe extraction (headless chromium scrub) + an `ANALYSIS.md` checklist |
| `pnpm forge:record <name>` | Record the live component through its animation cycle → animated `public/components/<name>.webp` (card preview; the only visual for premium) |
| `pnpm forge:approve <name> [--premium] [--allow-todo]` | Validate + publish: regenerates the landing manifest; standard components also get a shadcn registry file (`public/r/<name>.json`); **premium components get their registry file deleted — code + CLI are blocked** |
| `pnpm forge:list` | Table of all library components (phase / premium / docs mode) |
| `pnpm forge:deploy` | Guarded production deploy: refuses to ship if a standard component is missing its registry file or a premium one has one; then runs the landing deploy (build → manifest fix → wrangler) |

## The workflow

```
pnpm forge:new aurora-hero --phrase "Ship faster"
pnpm forge:analyze aurora-hero ./reference.mp4     # keyframes + checklist
#   → fill library/aurora-hero/spec.json (layers/animation/scroll/ux/scrub)
#   → implement packages/ui/src/components/aurora-hero.tsx
pnpm forge:record aurora-hero                      # → public/components/aurora-hero.webp
pnpm forge:approve aurora-hero                     # → manifest + registry + docs
pnpm forge:deploy                                  # → webcules.com
```

For a Claude-session workflow: hand the agent the reference + the
`.forge/<name>/ANALYSIS.md` checklist and ask it to fill `spec.json` and
implement the component drawing — the forge handles everything else.

## Premium gating

Tagged premium (`--premium` or `"premium": true` in the spec):

- NO registry JSON is generated or deployed → `shadcn add` is impossible
- The docs page renders **only** the recorded webp + title + description + a
  "Book a demo" CTA — no source, no playground, no install tabs
- `forge:deploy` hard-fails if a premium component ever has a registry file
  (code-leak guard)

## Files

| Path | Role |
| --- | --- |
| `apps/landing/components/library/<name>/spec.json` | The breakdown contract (layers, animation, scroll, images, video, scrub, ux) |
| `apps/landing/components/library/library.json` | Editable library manifest (source of truth) |
| `apps/landing/components/library/manifest.gen.ts` | Generated — consumed by the landing pages |
| `packages/ui/src/components/<name>.tsx` | The component (client canvas) |
| `apps/landing/public/components/<name>.webp` | Animated preview / premium visual |
| `apps/landing/public/r/<name>.json` | shadcn registry item (standard components only) |

## Requirements

- Landing dev server running for `forge:record` (`pnpm -F landing dev`)
- Playwright chromium for recording/analysis (`pnpm exec playwright install chromium`
  inside `apps/landing` — auto-hinted on first failure)
- Pillow for webp assembly (already present)
