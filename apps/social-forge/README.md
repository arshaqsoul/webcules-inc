# social-forge — the Webcules marketing system ("10,000 posts")

Local-first campaign factory: **swipe research → ComfyUI asset generation (100% on your GPU) →
platform post packs (Facebook / Instagram / TikTok / LinkedIn / WhatsApp) → content calendar →
export**. Every campaign is its own git repo under `webcules/projects/<name>/`. No external AI
APIs anywhere in the pipeline.

## Run

```bash
# from webcules-inc/
pnpm --filter @webcules/social-forge dev     # → http://127.0.0.1:4322
```

Requires ComfyUI running on `http://127.0.0.1:8188` (override with `COMFY_URL`) for asset
generation. Everything else (projects, swipe files, posts, calendar, export) works offline.

## The three phases

| Phase | Where | What happens |
|---|---|---|
| 1 — Research | Research tab | Curated source links (Meta Ad Library, TikTok Creative Center, LinkedIn Ad Library, WhatsApp case studies, Dribbble/Behance). Winning references get captured into per-platform swipe files (`swipe/<platform>.json`) with hooks, formats and why-it-works notes. Thumbnails auto-fetch when the source allows. Reused across future campaigns. |
| 2 — Assets | Generate tab | Reusable ComfyUI workflow library (`workflows/*.json` + `manifest.json`, same convention as site-forge). Queue runs with vars; outputs land in `assets/images|videos/` with a `.meta.json` sidecar (workflow + vars + seed) so every asset is reproducible. Every run auto-commits. |
| 3 — Copy & assembly | Posts tab | Formula-driven copy engine (offline) writes the per-platform pack: hooks, captions, hashtags, TikTok script (0–3s hook), WhatsApp broadcast, LinkedIn doc outline. The renderer composes platform-spec creatives (canvas typography over generated art) + LinkedIn PDF. |

## Project layout (each campaign = its own repo)

```
webcules/projects/<slug>/
  marketing.json      # manifest: brand, offer, tone, platforms
  brief.md
  swipe/              # phase 1 — per-platform swipe files (JSON)
  workflows/runs.json # phase 2 — full run history (vars + outputs)
  assets/images|videos|swipe/
  posts/<id>/         # phase 3 — post.json + exports/ (platform-ready files)
  schedule.csv|.ics   # generated on export
```

## Workflow library

Proven graphs shared with site-forge plus vertical (9:16) variants for social:
`z-image-turbo(-vertical)`, `flux-schnell(-vertical)`, `qwen-image`, `ltxv-video(-vertical)`,
`wan22-ti2v(-vertical)`. The reel pipeline: render the composed 1080×1920 creative in the Posts
tab → animate it with `wan22-ti2v-vertical` (text bakes into the motion; no ffmpeg needed).

Add new pipelines by dropping an API-format JSON into `workflows/` with `{{vars}}` and an entry
in `workflows/manifest.json` (title, defaults, use_for) — the Generate tab picks it up.

## Status flow

`draft → (approve | request changes) → approved → scheduled → exported`. Export renders final
files and writes `schedule.csv` + `schedule.ics` into the project root. Nothing ever posts
anywhere automatically.

## Publishing (dormant until keys are provided)

Connectors are wired for Meta Graph (FB+IG), TikTok Content Posting, LinkedIn, and WhatsApp
Cloud API. Add keys to `.env.local` here (or `app-config/publishers.json`) and they flip to
"ready" in the Export tab:

```
META_APP_ID= META_APP_SECRET= META_PAGE_ID= IG_USER_ID= META_ACCESS_TOKEN=
TIKTOK_CLIENT_KEY= TIKTOK_CLIENT_SECRET=
LINKEDIN_CLIENT_ID= LINKEDIN_CLIENT_SECRET= LINKEDIN_ACCESS_TOKEN= LINKEDIN_ORG_URN=
WHATSAPP_TOKEN= WHATSAPP_PHONE_ID= WHATSAPP_WABA_ID=
```

## Env

- `COMFY_URL` — ComfyUI base URL (default `http://127.0.0.1:8188`)
- `SOCIAL_FORGE_ROOT` — override app-root resolution if ever needed
