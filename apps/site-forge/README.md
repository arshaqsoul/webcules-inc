# site-forge — $10k-website generator

Turns a prompt into a shipped website, fully locally:

```
prompt ──▶ UI research ──▶ asset generation ──▶ Astro site ──▶ local review ──▶ private GitHub repo ──▶ Cloudflare
            (reference            (ComfyUI on this           (React islands,     (user gate)          (gh CLI)         (Workers
             galleries)           machine, no APIs)           Tailwind 4)                                                   static assets)
```

**Read [PLAYBOOK.md](./PLAYBOOK.md) first** — it's the operating manual for the full pipeline and the quality bar.

## Quickstart

**The whole pipeline in one command** — a ZCode slash command is installed at `~/.zcode/commands/forge.md`:

```
/forge premium coffee roaster, dark editorial, cinematic motion
```

It runs PLAYBOOK phases 0–4 end-to-end and stops at the local preview for your approval before publishing/deploying.

Manual, per-phase:

```bash
# from webcules-inc/
pnpm install
pnpm --filter @webcules/site-forge forge doctor        # ComfyUI, models, gh, wrangler
pnpm --filter @webcules/site-forge forge new my-site
pnpm --filter @webcules/site-forge forge research "dark fintech luxury" --project my-site
pnpm --filter @webcules/site-forge forge generate --project my-site --manifest
pnpm --filter @webcules/site-forge forge preview --project my-site
pnpm --filter @webcules/site-forge forge publish --project my-site
pnpm --filter @webcules/site-forge forge deploy --project my-site
```

(`forge` = `node src/cli.ts`; alias it if you like: `alias forge="node C:/Users/arsha/Documents/projects/webcules/webcules-inc/apps/site-forge/src/cli.ts"`)

## Layout

| Path | Purpose |
|---|---|
| `src/cli.ts` | Command dispatch (zero deps, Node 22+ runs the TS directly) |
| `src/comfy.ts` | ComfyUI API client — queue/poll/download/upload + graph var interpolation |
| `src/research.ts` | Reference puller (motionsites.ai, refero.design, recent.design) + design-brief skeleton |
| `src/scaffold.ts` | Project scaffolder — copies `template/` into `webcules/<name>` with tokens applied |
| `src/assets.ts` | `generate` / `edit` — runs workflow jobs from `forge.assets.json` manifests |
| `src/preview.ts` `src/publish.ts` | Dev server, build, Cloudflare deploy, private-repo publish |
| `workflows/` | **Reusable ComfyUI workflows** (API format, `{{var}}` placeholders) + `manifest.json` registry |
| `template/` | Astro 5 + React + Tailwind 4 site starter (Cloudflare Workers-ready) |

## Reusable workflow library

| Workflow | Use for |
|---|---|
| `qwen-image` | Flagship images, text-in-image (posters, mockups) |
| `z-image-turbo` | Fast photoreal, textures |
| `flux-schnell` | 4-step art-direction exploration |
| `sdxl` | LoRA-ecosystem compatibility |
| `qwen-image-edit` | Instruction-based editing of an existing asset |
| `ltxv-video` | Fast text→video drafts/loops |
| `wan22-ti2v` | Image→video — the hero-animation move |

All were captured from verified runs on this machine (see `workflows/manifest.json` for defaults and usage notes). Add new ones by exporting **API-format JSON** from the ComfyUI UI, templatizing with `{{vars}}`, and registering in the manifest — they then work for every future project.

## Environment

- **ComfyUI** at `http://127.0.0.1:8188` (override `COMFY_URL`)
- **GitHub**: `gh` CLI authed, or `GITHUB_TOKEN` in env — for private repo creation
- **Cloudflare**: one-time `npx wrangler login` per machine (each project carries wrangler)
- Node 22+, pnpm
