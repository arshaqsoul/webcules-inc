# social-forge — the Webcules motion-component forge

**Reference video → reusable React component → shadcn registry + manual download → FB/IG post
pack.** See a hero effect you like (motionsites.ai is the usual hunting ground)? Ingest the
clip, and the pipeline extracts the reusable pattern, builds it as a house-style component in
`packages/ui`, packages it for `npx shadcn add`, records the real component in headless
Chromium, and writes the post pack. Local-first; nothing auto-posts.

**Read [PLAYBOOK.md](./PLAYBOOK.md) before building anything** — it carries the pipeline law
(record the real component, never AI-fake a UI), the component house rules, and the phase map.

## Run

```bash
# from webcules-inc/
pnpm --filter @webcules/social-forge dev      # demo gallery → http://127.0.0.1:4322 (shifts to 4323 if busy)
pnpm --filter @webcules/social-forge social --help
```

## The pipeline

```bash
social ingest  ~/Downloads/some-hero.mp4 --name my-effect   # frames + manifest + analysis skeleton
#   … agent: write research/component-analysis.md, build the component + demo (see PLAYBOOK)
social sync    --project my-effect       # wire the demo into the gallery
social registry --project my-effect      # shadcn registry JSON + manual-download zip
social render  --project my-effect       # wide mp4 + 1080×1920 reel + variant stills (playwright)
social post    --project my-effect       # FB/IG captions, hooks, hashtags → copy-paste, never auto-post
```

## Where output lands

- Component (canonical): `packages/ui/src/components/ui/<name>.tsx`
- Project: `webcules/social/<slug>/` — manifest, research frames, `registry/*.json`,
  `downloads/*.zip`, `social/renders/*.mp4|png`, `social/posts/*.md`
- Demo gallery: `/demo/<slug>` (`?layout=vertical&hook=…`, `?variant=…`)

## Env

- `COMFY_URL` (default `http://127.0.0.1:8188`) — optional; textures/posters only, never the
  component itself
- `FFMPEG_PATH` — optional; falls back to ComfyUI's bundled imageio-ffmpeg binary, then
  ffmpeg-static
- `SOCIAL_FORGE_URL` / `--url` — a running gallery for `render`
