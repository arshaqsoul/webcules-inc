# arshaq.webcules.com — personal portfolio

A dependency-free static site served by a Cloudflare Worker (Workers Static Assets, no
build step). Showcases Arshaq Hisham's experience, projects and skills, plus an
interactive knowledge-graph view generated from the personal Obsidian KB.

| Page | Source | Notes |
| --- | --- | --- |
| `/` | `public/index.html` | Home: hero, "where I fit", timeline, experience, projects, skills, contact |
| `/graph` | `public/graph/index.html` | Canvas force graph + note reader; data from `public/graph-data.json` |
| `/404` | `public/404.html` | Custom not-found page |

## Deploy

```bash
pnpm install          # once, from the repo root
cd apps/portfolio && pnpm deploy
```

`wrangler.jsonc` attaches the custom domain `arshaq.webcules.com` automatically
(assets-only worker `arshaq-portfolio`, no `main` script).

## Updating the knowledge graph

The graph data is generated from the Obsidian vault at `~/Documents/CVs/Arshaq KB`
(override with `--kb <path>` or `ARSHAQ_KB_PATH`). Regenerate after editing notes:

```bash
cd apps/portfolio && pnpm graph   # rewrites public/graph-data.json
pnpm deploy
```

The generator keeps the vault public-safe:

- excludes the private `Positioning` folder (job-search system) entirely;
- drops lines linking to private notes, mentioning resumes, or exposing phone numbers;
- drops internal sections ("Do not claim", "Sources", "Navigate the graph",
  "Framing decisions");
- applies targeted per-note patches (`PATCHES` in `scripts/generate-graph.mjs`) where
  a line would otherwise be lost to the generic filters — extend that list when new
  notes need bespoke public wording.

## Local development

```bash
cd apps/portfolio && pnpm dev     # wrangler dev on http://localhost:8787
```

Any change to `public/` is served directly; `graph-data.json` is committed, so deploys
never depend on the vault being present on the deploy machine.
