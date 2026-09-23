# social-forge — the Webcules motion-component forge

**Reference video → analysis → your confirmation → reusable React component installed in the
Webcules component library → shadcn registry + manual download → optional FB/IG post pack.**
See a hero effect you like (motionsites.ai is the usual hunting ground)? Ingest the clip, the
pipeline extracts the reusable pattern and — after you check and confirm the analysis — builds
it as a house-style component in `packages/ui` and installs it into `apps/landing`'s component
library, listed like `wildcode-field` and `neural-pathways`. Local-first; nothing auto-posts.

**Read [PLAYBOOK.md](./PLAYBOOK.md) before building anything** — it carries the pipeline law
(nothing builds before the user confirms the analysis; record the real component, never
AI-fake a UI), the component house rules, and the phase map.

## Run

```bash
# from webcules-inc/
pnpm --filter @webcules/social-forge social --help
```

## The pipeline

```bash
social ingest  ~/Downloads/some-hero.mp4 --name my-effect   # frames + manifest + analysis skeleton
#   … agent: write research/component-analysis.md, PRESENT it to you — the pipeline stops here
social confirm --project my-effect --notes "…"              # your approval + feedback, recorded in the manifest
#   … agent: build packages/ui/src/components/ui/<name>.tsx directly (no separate app)
social publish --project my-effect                          # installs into the landing component list + /r/<name>.json
social registry --project my-effect                         # shadcn registry JSON + manual-download zip
#   optional marketing extension:
social render --project my-effect [--path /components/my-effect]   # wide mp4 + reel + variant stills
social post   --project my-effect                           # FB/IG captions, hooks, hashtags — copy-paste, never auto-post
```

`publish` / `registry` / `render` / `post` all refuse to run before `confirm`.

## Where output lands

- Component (canonical): `packages/ui/src/components/ui/<name>.tsx`
- Component list + docs page: `apps/landing` `/components` + `/components/<name>`
  (`library.json` entry, generated docs, `/r/<name>.json`, preview webp)
- Project: `webcules/social/<slug>/` — manifest, research frames, `registry/*.json`,
  `downloads/*.zip`, `social/renders/*.mp4|png`, `social/posts/*.md`
- Demo gallery (optional render rig only): `/demo/<slug>` on the social-forge dev server

## Env

- `COMFY_URL` (default `http://127.0.0.1:8188`) — optional; textures/posters only, never the
  component itself
- `FFMPEG_PATH` — optional; falls back to ComfyUI's bundled imageio-ffmpeg binary, then
  ffmpeg-static
- `SOCIAL_FORGE_URL` / `--url` + `--path` — any running page server for `render` (the demo
  gallery is started automatically when no URL is given)
