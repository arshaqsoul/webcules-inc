# Webcules UI/UX & Motion Review

Live audit of `webcules.com` and `backgrounds.webcules.com` on 2026-09-09.
Screenshots referenced below are in `/tmp/shots/` (desktop 1440px, mobile 390px).

---

## 1. Executive summary

The site has a **strong, ownable visual identity** — deep-space purple, glassy
cards, a playful astronaut mascot, and a clear "web + design + data" story.
The biggest problems are **inconsistency and finish**, not direction:

1. **Content/UX defects that read as "broken"** — empty collections on
   backgrounds, a dead `/contact` link, an almost-unstyled blog page, and
   AI-generated mockups full of garbled pseudo-text.
2. **Two typographic voices fighting each other** — a condensed uppercase hero
   face vs. the rounded `Righteous` font used for *everything else*, including
   body copy.
3. **Heavy, unoptimized graphics** — a 21 MB SVG and 20 MB video shipped to
   the browser, which is also the main cause of slow first paint.
4. **Three animation systems** (framer-motion, GSAP, Lottie) with no shared
   motion language — plus no `prefers-reduced-motion` support.

Fixing the P0s and doing a typography/copy pass would move the site from
"clever prototype" to "professional agency" faster than any redesign.

---

## 2. P0 — looks broken (fix this week)

| # | Issue | Evidence | Fix |
|---|-------|----------|-----|
| 1 | **backgrounds.webcules.com Collections & Trending sections are empty** — headers + "See All" render with zero items; a lone orphan image pill floats under the hero | `bg-home.png` | Production DB has 0 `backgroundMedia` (fresh start). Re-upload the lumina set (source files exist in `apps/backgrounds/public/lumina-*.jpg`) via the CMS and create collections. Optionally hide sections when empty. |
| 2 | **Nav "Contact" → `/contact` returns 404.** The page doesn't exist; the only conversion path is the Cal.com modal on "Become a client" | `webcules-floating-navbar.tsx:13`, curl 404 | Add a contact page/section (Cal embed + email + form), or point the nav item at the Cal modal. |
| 3 | **`/posts` page is nearly unstyled** — tiny default `h1`, "Showing 1 - 3 of 3 Posts" plain text, three uncropped ~2000px-tall images stacked on white, no cards, hover, dates, or pagination styling. Jarring against the dark homepage. | `landing-posts.png` | Rebuild as a dark-theme card grid: 16:9 cropped covers, title + excerpt + reading time, hover lift, consistent pagination. |
| 4 | **AI-generated showcase mockups contain garbled pseudo-text** ("LAO O.I Boote", "$; 3", "Tosany Ber Bytan", "Perict Soyy") and a visible "DEBUG" ribbon; several cards are cream/beige and clash with the palette | `landing-home-4/5/6.png` | Replace with real product screenshots (the "Our work" grid already has 5 good ones), or regenerate mockups with legible text. Remove cream cards. |
| 5 | **Step-3 rocket overlaps its heading** ("Relea__e__ry 2 weeks" is covered) at common scroll positions | `landing-home-11.png` | Adjust pinned-section layering/margins so art never covers text. |
| 6 | Footer says **© 2024**, backgrounds says **© 2025** | `landing-home-15.png`, `bg-home.png` | Compute the year dynamically. |

---

## 3. Typography

**Current state**

- `Righteous` (rounded, playful) is imported in 12+ components and used for
  **headings, body copy, buttons, footer links, pricing rows and FAQ text**.
- Hero uses uppercase condensed styling of the same face; cards mix in
  GeistSans/Inter; backgrounds hero adds an italic serif word ("project").
- Result: three voices on one page, and long body text in Righteous is hard to
  read (single weight, wide, decorative).

**Recommendations**

1. **Restrict Righteous to hero + section headings only** — never body, nav, or
   footer links. Use GeistSans for all UI/body text.
2. Consider a more premium display face for headings (Space Grotesk, Clash
   Display, or General Sans); Righteous reads "startup playful" vs "agency
   professional".
3. Define a scale and stick to it (e.g. 12/14/16/20/28/40/64) with 2 weights
   per family. Kill the ad-hoc `text-[8vw]` sizing in `hero.tsx` in favor of
   named steps.
4. Sentence case for headings (the all-caps hero + Title Case body mix reads
   inconsistent).

**Copy pass (same-day win):** "figma-ians", "in a jiffy", "It's time to
upgrade…" (missing apostrophe), "PromtoShare" (typo), lowercase "paas", and
meta-copy like "Using vibrant gradients colors, 3d, dynamic typography"
(describes the design instead of the service). Professional agencies sell
outcomes, not vibes — rewrite card subtitles as client outcomes.

---

## 4. Color & graphics

**Working:** the indigo/purple dark theme, glassy bordered cards, glow CTA
button, and the space motif are distinctive and consistent on the homepage.

**Broken consistency**

| Issue | Where | Fix |
|---|---|---|
| Pure-white marquee band slams into the dark theme, text cut mid-word at edges | below hero (`landing-home-2.png`) | Restyle: dark band, brand-tinted text at low opacity, edge fade masks, slower speed, `aria-hidden` duplicates, pause on hover |
| Cream/beige + magenta/pink cards inside the showcase | About carousel | Re-generate in palette, or drop |
| Bright cyan bloom behind pricing headers kills contrast | `landing-home-13.png` | Dim bloom; keep headers ≥ 4.5:1 |
| Pre-footer/footer illustration is teal/pink flat-vector — a different world from the 3D purple hero | `landing-home-14/15.png` | Re-tint the illustration to the purple palette (fast: CSS filter/hue-rotate, better: re-export) |
| Service-card thumbnails are dark, tiny, unreadable dashboards | `landing-home-2/3.png` | Crop to a meaningful region, add a subtle zoom-on-hover, raise brightness |

**Graphics direction:** keep the astronaut/space mascot — it's memorable. But
pick **one** illustration language (recommend the 3D purple space world) and
re-render or re-grade everything else to match.

---

## 5. Animation & motion UX

**Inventory:** framer-motion (nav, background boxes, mascot), GSAP +
ScrollTrigger (work, dev-scroll, process, CTA), Lottie (logo), typewriter,
infinite marquee, scroll-indicator. Three systems on one page.

**Findings**

1. **No shared motion language.** Durations/easings differ per component.
   Define tokens (e.g. `fast 150ms / base 250ms / slow 500ms`, `ease-out
   [0.22, 1, 0.36, 1]`) and shared framer-motion `variants` for
   fade-up-on-scroll used by every section.
2. **No `prefers-reduced-motion` support** anywhere — the pinned GSAP process
   section, typewriter, marquees and parallax all run regardless. Add a global
   reduced-motion fallback (framer-motion `MotionConfig reducedMotion="user"`,
   `gsap.matchMedia()`).
3. **Hero is oversubscribed:** galaxy.png (1.4 MB) + planets.png stacked
   full-screen + a 900-cell `Boxes` grid + typewriter + Lottie astronaut.
   The astronaut renders as a **black silhouette blob** against the dark bg —
   give it a rim-light/outline or use a lighter variant. Drop one background
   layer (planets.png adds little) and reduce grid density.
4. **Marquee:** mid-word clipping and harsh white — see §4; also slow it down.
5. **Showcase carousel:** cards clip at viewport edges with no fade mask, no
   pause-on-hover, no keyboard support. Add gradient masks, hover-pause,
   `role="region"` + arrow-key scrolling.
6. **Process pin-scroll** feels heavy on trackpads; the rocket overlap (P0-5).
   Consider simple staggered reveals instead of pinning — communicates the
   same thing with less risk.
7. **Micro-interactions are thin:** buttons only scale on the pricing CTA.
   Add consistent hover (lift + glow ring), `focus-visible` rings, card hover
   states on portfolio (image zoom + arrow slide), and staggered reveals for
   grids.

---

## 6. Performance (graphics weight)

| Asset | Size | Used in | Action |
|---|---|---|---|
| `imgs/design-skeleton.svg` | **21 MB** | services card | Rec-export through SVGO / convert to WebP (~100 KB) |
| `imgs/video.mp4` | **20 MB** | dev-scroll | Re-encode 720p H.264/WebM (< 3 MB), add poster + lazy load |
| `imgs/web-skeleton.svg` | **7 MB** | services card (×2) | Same as above |
| `imgs/footer/*` + `footerbg.png` | ~6 MB | footer illustration | Compress to WebP, consider CSS gradient replacement |
| `imgs/grid/*` | 4.1 MB | backgrounds | Compress / generate with CSS |
| `imgs/galaxy.png` | 1.4 MB | hero | Convert to WebP (~200 KB) |

The homepage ships ~60 MB of static art before JS. This is the single biggest
"professional feel" win after the P0s: fast paint = perceived quality.
Also lazy-load the Cal.com embed (`@calcom/embed-react`) on first CTA click
instead of page load.

---

## 7. Page-by-page notes

- **Hero** — strong concept; fix silhouette mascot, layered assets, add the
  tagline marquee polish; mobile: "WEB, DESIGN AND DATA" shrinks to ~14px and
  the logo-pill wraps awkwardly (`mobile-landing-top.png`).
- **Services** — good structure; unreadable thumbnails + meta copy; cards need
  hover depth.
- **About/showcase carousel** — weakest section; see P0-4. Consider replacing
  entirely with a second row of the (real) work grid.
- **Our work grid** — strongest section; real screenshots. Promote it higher on
  the page, standardize crops, add hover zoom + per-project links.
- **Process/pricing** — pattern is fine; fix rocket overlap, pricing bloom,
  "Particle/Fixed" header misalignment, and "$1250 /bi weekly" formatting.
- **Footer** — giant scattered WEBCULES letters are fun but semi-illegible over
  the illustration; either raise letter contrast or reduce. Body links in
  Righteous → GeistSans.
- **backgrounds home** — hero + notify strip are fine; P0-1 empty sections;
  the floating lone image pill under the hero needs a home or removal.
- **backgrounds FAQ** — serviceable; add expand-icons spacing, category
  grouping, and first-item-open default to avoid the wall of collapsed rows.
- **Blog (/posts)** — full rebuild per P0-3.

---

## 8. Prioritized plan

**P0 — this week (correctness & credibility)**
1. Upload backgrounds content / hide empty sections
2. Fix `/contact` 404
3. Rebuild `/posts` as styled dark card grid
4. Replace garbled AI mockups + remove cream cards
5. Fix rocket/heading overlap; dynamic © year

**P1 — next 1–2 weeks (perceived quality)**
6. Type system: Righteous headings-only + GeistSans body, type scale
7. Copy pass (all sections)
8. Asset diet: SVGO/WebP/video re-encode (~60 MB → < 8 MB)
9. Marquee restyle + edge fades; hero layer diet + mascot rim-light
10. Portfolio section promoted & polished (hover zoom, links, crops)

**P2 — next month (design system)**
11. Motion tokens + shared variants + reduced-motion support
12. Micro-interaction pass (buttons, cards, focus rings)
13. Mobile hero + carousel a11y
14. Consider ISR/R2 incremental cache for Core Web Vitals

---

*Screenshots: `/tmp/shots/landing-home-{1..15}.png`, `landing-posts.png`,
`bg-home.png`, `bg-faq.png`, `mobile-landing-top.png`, `mobile-landing-mid.png`,
`mobile-bg-top.png`.*
