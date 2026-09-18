# site-forge PLAYBOOK — how to build a $10k website

This is the **operating manual**. When the user says "build me a site for X", run these phases in order. The CLI (`forge …`) is the toolkit; judgment about design is yours. Everything below is a standard, not a suggestion.

- **CLI**: `pnpm --filter @webcules/site-forge forge <cmd>` from `webcules-inc/`, or `node src/cli.ts <cmd>` from the app dir. All `--project` refs are names under `webcules/`.
- **Env**: `COMFY_URL` (default `http://127.0.0.1:8188`), `GITHUB_TOKEN` (repo creation).
- **Machine**: RTX 5070 Ti 16 GB — one generation job at a time; video jobs are minutes, not seconds.

---

## Phase 0 — Intake

Turn the user's prompt into a creative brief before touching anything:

1. **Positioning**: what is it, who is it for, what's the one feeling the site must produce?
2. **Sections**: hero, proof, features, showcase, stats, CTA is the default skeleton — add/remove per product.
3. **Asset list**: hero (video? image?), section stills, textures, OG card. Every visual should exist in this list.
4. **Name**: if the user didn't name it, propose one; `forge new` needs a slug.

Write the brief into the project's `research/design-brief.md` as you go (Phase 1 creates the skeleton).

## Phase 1 — UI research (references)

```bash
forge new <name> --title "..." --desc "..."          # scaffold first — research lives in the project
forge research "<style query>" --project <name>      # pulls refs from motionsites.ai, refero.design, recent.design
```

- The fetcher works on static HTML; if a source is JS-rendered it will say so — then **browse it yourself** (WebFetch / image search) and save 5–10 screenshots into `research/refs/` manually. Minimum 8 references before building.
- Fill every section of `research/design-brief.md`: layout patterns, typography, color, motion vocabulary, what to steal, what to avoid, chosen direction.
- **Steal patterns, not pixels.** References define structure and energy; the build must feel bespoke.

## Phase 2 — Asset generation (local ComfyUI, no external APIs)

Pick models per job (`forge workflows` for the live list):

| Need | Workflow | Notes |
|---|---|---|
| Hero image / anything with **text in image** | `qwen-image` | posters, signs, mockups — ~30–60 s |
| Photoreal / textures / product | `z-image-turbo` | 8 steps, ~5–10 s |
| Fast art-direction exploration | `flux-schnell` | 4 steps — iterate before spending Qwen time |
| Iterate on an existing asset | `qwen-image-edit` | `forge edit --image … --prompt "…"` |
| Hero background loop (fast draft) | `ltxv-video` | ~20–60 s, abstract motion |
| Hero loop from the hero image | `wan22-ti2v` | the signature move: generate still → animate it |

Workflow:

1. Write every job into the project's `forge.assets.json` (name, workflow, out, vars). **Every prompt should name palette, lighting, camera, and mood** — pulled from the design brief, so assets and site share one art direction.
2. Draft cheap first: `flux-schnell`/`z-image` at 1024² to lock direction, then final at hero resolution (`1664x928` wide / `1328²` square).
3. Refine losers with `forge edit` instead of re-rolling seeds.
4. Animate the winner: `wan22-ti2v` draft `832x480 length 65` → verify motion → final `1280x704 length 121`.
5. `forge generate --project <name> --manifest` runs the list; outputs land in `public/assets/`, every run is logged to `forge.assets.json` → assets are reproducible and the manifest is committed with the repo.

New reusable pipelines: build the graph once in the ComfyUI UI → **Save (API format)** → drop the JSON into `workflows/`, replace hard-coded values with `{{vars}}`, add an entry to `workflows/manifest.json` (title, defaults, models, use_for). That's how the library grows project over project.

## Phase 3 — Build the site

The scaffold (`webcules/<name>/`) is Astro 5 + React islands + Tailwind 4, Cloudflare-ready. Starting points:

- `src/data/site.ts` — all copy & structure. Rewrite it to the brief, don't template-dance around it.
- `src/styles/global.css` — tokens. Restyle the whole site by touching: two colors, one accent, font pairing, easing.
- Sections: Hero, LogoMarquee, BentoFeatures, StickyShowcase, Stats, CTA. Add project-specific ones as new `.astro` files.
- Islands: `Reveal`, `Marquee`, `Parallax`, `Magnetic`, `Counter` (+ `ScrollProgress`). `client:visible` everywhere except hero (`client:load`).

**The $10k bar — a site ships only when all are true:**

- [ ] Typography: display font with real character, `clamp()` scale, tight tracking, ≥9rem hero
- [ ] One accent color used with discipline + one secondary; nothing default-blue
- [ ] Motion: choreographed reveals (one easing!), at least one signature moment (video hero, sticky story, or magnetic CTA)
- [ ] Generated art everywhere a stock photo would've been
- [ ] Mobile flawless (type scale, touch targets, no horizontal scroll)
- [ ] `prefers-reduced-motion` respected; semantic HTML; real meta/OG tags
- [ ] No template smell: if a section could be on any site, rewrite or delete it

## Phase 4 — Local review (gate before deploy)

```bash
forge preview --project <name>       # http://localhost:4321
```

- Open it in a browser (desktop + mobile viewport). Screenshot hero, features, CTA.
- Fix, rebuild, re-look. Only then show the user the local URL + screenshots.
- **Deploy only after the user approves** (they may want copy/asset changes first).

## Phase 5 — Publish (private repo)

```bash
forge publish --project <name>       # git init + commit + private GitHub repo + push
```

- Repo name defaults to the project name; `--repo` overrides, `--public` if ever needed.
- Requires `gh` (authed) or `GITHUB_TOKEN`; otherwise the command prints exact manual steps.
- Asset manifest + research brief get committed with the code — the project is self-contained.

## Phase 6 — Deploy (Cloudflare)

```bash
forge deploy --project <name>        # pnpm build + wrangler deploy
```

- One-time: `npx wrangler login` inside the project.
- Workers static assets, zero-config, free tier. Report the `*.workers.dev` URL.
- If the product needs SSR/API later: `export const prerender = false` on a route (adapter preconfigured).

---

## Failure modes

| Symptom | Fix |
|---|---|
| ComfyUI unreachable | start `ComfyUI\start_comfyui_server.bat`; `COMFY_URL` if non-default port |
| OOM / crawl during video | close other VRAM hogs; lower width/height/length; video is heavy by design |
| workflow var error | `forge workflows` → pass `--set key=value`; defaults live in `workflows/manifest.json` |
| refero/recent fetch 0 images | JS-rendered — browse & screenshot manually into `research/refs/` |
| push rejected | repo exists remotely → `git remote set-url origin <url>` then `git push -u origin main` |
