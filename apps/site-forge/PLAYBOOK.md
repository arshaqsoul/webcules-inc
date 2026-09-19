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

### Revamp mode (from an existing URL) — `/forge-revamp`

When the prompt is an existing site's URL instead of a fresh brief:

1. **Capture the before** — scaffold first (name derived from the domain: `acme.com` → `acme`), then screenshot the original at desktop (1440×900) and mobile (390×844) into `research/before/` (plus 2–3 key subpages if useful) and WebFetch its pages for content: offering, headings, nav, CTAs, contact, footer. Download the logo if usable.
2. **Write `research/revamp-analysis.md`** — business & audience, content inventory worth preserving, a concrete visual critique of the "before" (type, layout, color, motion, hierarchy), and the redesign direction.
3. **Run phases 1–4 as normal**, driven by that analysis: research query = industry + desired vibe; reuse the original logo only if genuinely good, else typographic wordmark; **preserve the business substance but rewrite all copy** to the $10k standard.
4. **Review gate shows before/after** — same viewport sizes as the "before" shots, side by side, plus what changed and why.

Never touch, proxy, or deploy over the original site — the revamp is a standalone project in `webcules/<name>/`.

**Content parity — nothing gets dropped (revamp standing rule):**

- WebFetch **every** source page (each service, about, FAQs, colour/product pages, quote) before writing copy. Inventory the substance in `revamp-analysis.md` and map every item to a destination: home section, dedicated service page (`services/[slug]`), or FAQ accordion. Service FAQs belong on their service pages, not buried in one home accordion.
- WebFetch's markdown strips iframes — to inventory embedded videos, grep the **raw HTML** for `youtube_url|youtu\.be|vimeo\.com`, verify each ID via YouTube oEmbed, and surface real embeds as click-to-load facades (nothing from YouTube loads until play). Same for forms: note how the original captures leads.
- **Honesty standard (non-negotiable):** every claim traces to the source site. Never invent facts, years, warranty terms, response-time promises, review counts, or people. Real photos may be relit/restyled to the theme (image-edit model) but identity is preserved — never generate fake staff or customers. Reviews are real, quoted with attribution. If the source doesn't say it, the site doesn't say it.
- **People get carried over (standing rule, user-mandated after go2guysinc):** if the source shows owners/staff/team photos, they MUST appear in the redesign's About page. Extract them from the raw HTML when possible — but check the rendered DOM too: source sites often ship broken placeholders (go2guysinc's team cards were literally `Image-empty-state.jpg` over Facebook embeds) — in that case crop the portraits from the rendered-page screenshot into `public/assets/brand/`. Never generate fake staff, and don't ship an About without faces if the original had them.
- **Map embed is mandatory (standing rule, user-mandated after go2guysinc):** every redesign ships a map on the contact page — carry over the source's embed if it has one (mirror its provider), and add one even if it doesn't. Reliable recipe: OSM `export/embed.html?bbox=<lon,lat,lon,lat>&layer=mapnik&marker=<lat>,<lon>` — geocode the NAP address with Nominatim (`nominatim.openstreetmap.org/search?q=…&format=json`, send a UA header) so coordinates are sourced, never guessed; Google's keyless `output=embed` iframe is a fallback but rendered blank under headless verification. `loading="lazy"`, card styling, and link it from LocalBusiness JSON-LD via `hasMap`. NAP + map is local-SEO/AI-readiness table stakes.

### Redesign mode (go-to-market) — `/forge-redesign` + `/forge-outreach`

Revamp mode **plus the sales layer** — this is the Webcules client-acquisition engine (see `docs/GTM-PLAYBOOK.md` and `docs/PRICING.md`):

1. Same intake as revamp mode, plus capture the **AI surface**: view-source for schema.org markup, meta/OG tags, semantic HTML, machine-readable hours/services/NAP.
2. **Design-expert audit** → `research/expert-review.md`. Review the "before" through three lenses in order — senior UI/UX designer, conversion strategist, **AI-readiness auditor** (can ChatGPT / AI Overviews / voice parse this business?). 5–8 findings, each: evidence → business cost → fix in the redesign; graded scorecard (A–F per lens); client-friendly summary. The audit is written to be **shown to the client** — specific and honest, that's the sales asset.
3. **Quote** from the PRICING.md model; every CRITICAL/MAJOR finding must map to a visible change in the build (the AI-readiness fixes — LocalBusiness JSON-LD, semantic HTML, meta/OG, llms.txt — are implemented for real, not claimed).
4. Review gate shows **before/after + findings→fixes table + price**.
5. After approval: `forge deploy` (the `*.workers.dev` URL is the client-facing sales preview), then write **`research/gtm.json`** (business, grades, top findings, quote with market comparison, previewUrl) — `/forge-outreach` generates the email/WhatsApp pitch from it and the dashboard imports it.

Never touch the client's domain — it switches only after they've paid and asked.

## Phase 1 — UI research (references)

```bash
forge new <name> --title "..." --desc "..."          # scaffold first — research lives in the project
forge research "<style query>" --project <name>      # filtered pull from all six sources
```

The fetcher uses each source's real filter (verified working, server-side):

| Source | Filter used |
|---|---|
| awwwards.com | `?text=<full query>` full-text search |
| minimal.gallery | `/tag/<word>/` — tag auto-derived from the query against the site's real tag vocabulary |
| recent.design | `?category=<word>` — auto-derived, falls back to the plain feed on a miss |
| darkmodedesign.com | homepage list (its `?s=` search is client-side only) |
| motionsites.ai | homepage (gallery is JS-rendered) |
| refero.design | recorded as a browse-link (`/search?q=` is client-side rendered) |

- Tag/category words are picked by intersecting the query with each site's vocabulary (stopwords like "landing", "dark", "modern" never count). Force one with `--tag <word>`.
- If a source still returns nothing (JS-rendered, offline), **browse it yourself** (WebFetch / image search) and save screenshots into `research/refs/` manually. Minimum 8 references before building.
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
- [ ] Generated art everywhere a stock photo would've been — **except photographic hero slots**: user preference (go2guysinc review) is the client's own real photography first, then a quality free photo (Unsplash/Pexels); AI-generated images read "off" at hero scale and get rejected. AI art stays for abstract/decorative/OG-card work.
- [ ] Mobile flawless (type scale, touch targets, no horizontal scroll)
- [ ] `prefers-reduced-motion` respected; semantic HTML; real meta/OG tags
- [ ] No template smell: if a section could be on any site, rewrite or delete it
- [ ] **Forms actually deliver** — mailto-only loses every webmail lead. Wire to an email relay (e.g. FormSubmit AJAX: no backend, honeypot for bots, mailto fallback if the relay is unreachable) and confirm the one-time inbox activation with the owner
- [ ] **Share meta is scrape-proof** — `og:image` as an **absolute** URL (relative = no preview on Facebook/WhatsApp/X), `og:url`/canonical on the **real deploy domain** (never the scaffold default), plus `og:site_name`, `og:locale`, `og:image:width/height/alt`, `twitter:card/title/description/image`; per-page share images
- [ ] **Revamps: source content parity** — every content item from the original site is mapped somewhere (section, service page, FAQ, video embed); nothing dropped, nothing invented
- [ ] **Map embed on the contact page** — carried over from the source or added fresh (standing rule above), plus `hasMap` in the LocalBusiness JSON-LD

## Phase 3b — Immersive scroll experiences ("ultra" tier)

For briefs like "rebuild this recording" or any award-tier scroll-driven site, the default
sections/islands are not enough. This is the pattern that ships them (built & verified on
`webcules/reverie` — a portal-flythrough clone of a reference recording).

**Reference-recording intake (replaces Phase 1 when the design is fully specified by a video):**

- No ffmpeg in PATH — use ComfyUI's venv: `pip install imageio-ffmpeg` once, then
  `ComfyUI\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-*.exe -i rec.mp4 -vf fps=8 frames/f_%03d.png`.
- Extract at 8fps, save the key frames into `research/refs/`, then crop-and-3-6x-upscale small UI
  regions (nav, cards, captions) with Pillow so the copy becomes readable. Tiny text is where
  clones go wrong.
- Record every occluded/ambiguous element in the brief with your reconstruction flagged
  (e.g. brand cut off by recorder chrome → pick a thematically-correct stand-in). Recorder
  overlays (back-arrow circles, cursors) are NOT site UI — don't rebuild them.

**Architecture — fixed stage + scrub, never scroll-jacked pinning:**

- `.stage { position: fixed; inset: 0; overflow: hidden }` holds every scene as absolutely
  stacked layers (background plates → content); a plain `.track { height: 560vh }` div supplies
  scroll length. GSAP ScrollTrigger: `trigger: track, start: "top top", end: "bottom bottom",
  scrub: 0.8`. One timeline, positions in absolute seconds (they become fractions of the track).
- Animate **only** `transform` and `opacity`. Ken Burns / shimmer / star-spin live on *inner*
  elements so their CSS animations compose with GSAP transforms on wrappers.
- **The portal move** (zoom-through): measure the hole's center on the generated plate
  (a grid-overlay screenshot beats pixel heuristics) → `transform-origin: <x>% <y>%`, scale the
  plate 1 → ~4.4 with `power2.in` (accelerating camera), and crossfade to the destination plate
  (which sits behind at `scale 1.25 → 1.02`) around progress 0.5–0.7. The destination plate is
  also scene 2's background, so the world never jumps.
- Ambient life: animate the winning still with `wan22-ti2v` (subtle motion verbs, "no camera
  movement"), `<video autoplay muted loop playsinline>` over the still. If the video wobbles,
  ship the still + Ken Burns (same rule as the main playbook).

**Gotchas that cost real debugging time (all hit on reverie):**

- *Cue/anchor landing:* scroll targets are `(trackH − viewportH) × f`, **not** `trackH × f` — the
  scrub's progress 1 is "track bottom at viewport bottom". Landing on the raw fraction leaves a
  staggered reveal half-finished at rest.
- *CSS animations beat GSAP inline styles:* if a keyframe animates `opacity`, a scrubbed
  `autoAlpha: 0` on the same element silently loses. CSS owns transform there, GSAP owns opacity
  — never both on one property.
- *Hidden-scene FOUC:* scenes revealed mid-timeline start `opacity:0; visibility:hidden` via a
  `html.js` CSS rule; on init `gsap.set(children, { autoAlpha: 0 })` then
  `gsap.set(container, { autoAlpha: 1 })` — otherwise the container rule keeps children
  `visibility: inherit` = hidden forever (GSAP tweens the children in vain).
- *Fixed stage + anchors:* `#section` links can't reach a fixed stage — intercept anchors and
  `scrollTo` fractions of the scrub range; in reduced-motion mode, fall through to native anchors
  (the static fallback has real sections).
- *Reduced motion:* media-query collapse — stage becomes static flow, scenes get their own
  `background` plates, GSAP timeline is never created. The page must read as a normal site.
- *Mobile:* fixed stages need explicit small-screen layouts per scene (hero stacks; a
  wider-than-viewport card row becomes a 2×2 grid with softened tilts); verify
  `document.scrollWidth <= innerWidth`.
- The Astro dev toolbar floats bottom-center in dev screenshots — don't mistake it for site UI.

## Phase 4 — Local review (gate before deploy)

```bash
forge preview --project <name>       # http://localhost:4321
```

- Open it in a browser (desktop + mobile viewport). Screenshot hero, features, CTA.
- Fix, rebuild, re-look. Only then show the user the local URL + screenshots.
- Also verify the invisible stuff in the **built HTML**: `curl` a page and check OG/Twitter tags are present and absolute, and (revamps) every service page exists. Submit the live form once after deploy — that both tests it end-to-end and triggers the relay's one-time inbox activation. Check link-preview caches: Facebook Sharing Debugger "Scrape Again", WhatsApp needs a `?v=2`-style cache-buster.
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
| refero/recent fetch 0 images | recent.design falls back to the plain feed automatically; refero/motionsites are partly JS-rendered — browse & screenshot manually into `research/refs/` |
| push rejected | repo exists remotely → `git remote set-url origin <url>` then `git push -u origin main` |
| full-page screenshot repeats the hero | source site scroll-jacks with fixed/sticky layers that re-pin under Chromium's `captureBeyondViewport` — `tab.screenshot({ fullPage: true })` renders the hero once per tile no matter what CSS you inject. **Working recipe (verified on go2guysinc.com):** (1) scroll through the page in fast steps to trigger lazyload/scrollspy; (2) inject CSS: `background-attachment:scroll`, `animation/transition:none`, `.uk-sticky/[class*="sticky"]{position:static}`, parallax `transform:none`; (3) take **viewport** screenshots at scrollY = i·viewportH (loop `while (y < H)` with `yy = min(y, H-VH)` — a `for` with `y = min(...)` never terminates); (4) stitch with `scripts/fullpage-stitch.py` on ComfyUI's venv (`C:/Users/arsha/Documents/projects/ComfyUI/.venv/Scripts/python.exe` — has Pillow; sharp is NOT installed in the workspace). Same recipe for mobile. Bare `fullPage:true` is fine on plain static pages, wrong on YOOtheme/Elementor/parallax ones — default to the recipe for client "before" captures. |
| no preview when sharing (FB/WhatsApp/X) | `og:image` was relative or `og:url`/canonical on the scaffold-default domain → absolute URLs + `astro.config.mjs` `site:` set to the real deploy domain, full tag set; then Scrape Again / `?v=2` cache-buster |
| quote form "works" but no leads | mailto-only forms open nothing for webmail users → wire an email relay (FormSubmit AJAX), test a real submission, confirm the one-time inbox activation email |
| hero video looks wobbly / AI-generated | Wan 2.2 drafts can read wobbly on architectural stills — a bad video is worse than a good still. Ship the still with a slow CSS Ken Burns zoom (`animate-kenburns`, 28s alternate) and mark the video job `enabled:false` with the reason (user rejected exactly this on go2guysinc). Retry video only when you can judge the final at full res. |
| wrangler deploy: "Pages _worker.js directory as an asset" | the Astro cloudflare adapter emits `_worker.js` even for fully static sites → add `.assetsignore` (in `public/`, so rebuilds keep it) containing `_worker.js` and `_routes.json` for pure-static deploys |
| `astro preview` fails with cloudflare adapter | unsupported by design — serve `dist/` with a tiny static server (see `mexroofing/static-preview.mjs`) and review that |
