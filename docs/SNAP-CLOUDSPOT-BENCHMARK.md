# Snap · CloudSpot benchmark + tier-gated build plan (embeds & brand first)

Researched 2026-09-28. CloudSpot research via live web (cloudspot.io + help.cloudspot.io + Backblaze case study +
Reddit). Snap state re-audited from current code (commits through `b75da51`, working tree incl. WEB-223 share panel).
Companion to `SNAP-COMPETITIVE-ANALYSIS.md` (top-10) — this doc is the working benchmark for the next build cycle.

---

## 1. Why CloudSpot is the right benchmark

CloudSpot is snap's closest architectural cousin: photographer-founded (Gavin Wade, shot ~50 weddings to fund it),
fully bootstrapped, gallery-first with the business suite bolted on (Studio Manager, Aug 2023; scheduling,
Oct 2025). It proves the model snap is betting on — and it validates snap's storage economics: CloudSpot moved
700+ TB from S3 to Backblaze B2 saving ~$10–12k/mo (~$0.015/GB-mo cost basis), the same math behind snap's R2 +
$0.10/GB overage.

Scale reality check: 2.7M galleries delivered, 151k store orders ever, ~5.5k community members → low tens of
thousands of photographers. Niche — but beloved by its users ("cheap, easy, excellent customer service") and it
just shipped scheduling + contracts-at-booking, closing in on snap's lane.

**CloudSpot pricing (Sept 2026):**

| Plan | Price | Storage | Galleries | Commission | Studio suite |
|---|---|---|---|---|---|
| Free | $0 | 5 GB | 3, JPEG-only, 2048px downloads, 7-day links | **15%** | ✖ |
| Entry | $7/mo · $72/yr | 15 GB | 15, JPEG-only | **15%** | ✖ |
| Lite | $17/mo · $144/yr | 100 GB | Unlimited, all file types | 0% | ✔ full |
| Pro | $34/mo ($45 mo-to-mo) | 500 GB | Unlimited | 0% | ✔ |
| Unlimited | $50/mo (annual n/p) | Unlimited | Unlimited | 0% | ✔ |

Snags: **no custom domain on any tier** (galleries live on `*.client-gallery.com`), invoicing/payments **US-only**
with a 2.5% invoice fee, Stripe is CloudSpot-controlled (no BYO), Pro→Unlimited is a hard step (no overage),
teams = custom pricing, zero AI, no public API (Zapier only), PWA "apps" not real apps.

---

## 2. Where snap is already ahead (defend, don't rebuild)

| Dimension | Snap today | CloudSpot |
|---|---|---|
| Payments | 0% commission every tier, BYO Stripe Connect, payouts to studio, deposits/full at booking in-widget | 15% on Free/Entry; CloudSpot-controlled Stripe; 2.5% US-only invoice fee; 2–4 day payouts |
| Embeds | Contact + booking calendar + booking button widgets with token theming, SPA loader, origin allowlist; public `/b/{slug}` page; full platform docs | Embeddable lead form only; **no booking embed at all** — scheduling shared as a link |
| Security | OTP email-code + tokenized, expiring, revocable grants, audit logs, view budgets | Password + download PIN |
| RAW | RAW Vault with cold-tier lifecycle, .lrf support, 3GB trial pocket on Free | None |
| Pipeline | Kanban mirroring the shoot (Booked→…→Closed) + triage mode | Lead **list** only, no pipeline, no automations |
| Free tier | 20 GB, full-res downloads, unlimited bookings, full CRM | 5 GB, 3 galleries, 2048px cap, 15% commission |
| Multi-studio | Linked orgs, one bill, pooled quotas, tier-gated | Teams = custom pricing |
| Storage shape | Smooth $0.10/GB overage curve | Pro→Unlimited step function |

---

## 3. Where CloudSpot is ahead — the build list (every item tier-gated)

| # | CloudSpot capability | Snap status (code-verified) | Recommended snap gate |
|---|---|---|---|
| 1 | PWA client "mobile apps" (installable, evergreen-synced) | ✖ | **Studio** — flagship perk |
| 2 | Print store: WHCC + Miller's/Mpix labs, order review, at-cost ordering | ✖ | Pro (auto-fulfillment); Studio (self-fulfillment price lists) |
| 3 | Digital download products + packages + discount codes + abandoned cart | ✖ | Studio (digital/self-fulfill first) |
| 4 | Download PIN · download count/size limits · email-capture-before-download | ✖ (snap has stronger OTP, but PIN is the familiar UX) | PIN Free · limits + capture Lite |
| 5 | Watermarks (+ auto-remove on purchase) | ✖ | Studio |
| 6 | Proofing galleries / pre-release mode | ✖ (favorites/selection exist) | Studio |
| 7 | Questionnaires | ✖ | Lite |
| 8 | Calendar sync (Google/Apple) in scheduling | ✖ (snap publishes ICS feed only) | Lite (import busy-blocks) · Studio (2-way) |
| 9 | Contracts attached to booking (sign + pay in one flow) | ◑ (pay at booking ✔; contract at booking ✖) | Studio |
| 10 | Mini-sessions | ✖ | Studio |
| 11 | Lightroom publish plugin | ✖ | Lite (table stakes for pros) |
| 12 | Zapier | ✖ | Studio |
| 13 | Video sections in galleries (Vimeo/YouTube embeds) | ◑ (video uploads exist; no link sections) | Lite |
| 14 | Link-in-bio "Social Site" with analytics | ✖ | Lite |
| 15 | Gallery presets (apply design/settings across galleries) | ◑ (brand defaults exist; no per-gallery presets) | Studio |
| 16 | Custom gallery URLs (human-readable) | ✖ (`/g/{token}` only) | Lite (alias) |
| 17 | Dashboard To-Dos + notification center + email delivery-status log | ◑ (email_log exists; no to-dos/notification center UI) | all tiers (retention/UX) |
| 18 | White-glove migration service | ✖ | n/a (service, not code) |
| 19 | AI features | ✖ (CloudSpot also ✖ — market expects it anyway) | see §6 P1 |

---

## 4. Embeds & brand — current state (code-verified) and what "done" looks like

### 4.1 What's shipped (strong foundation)
- **Loader v2** (~2KB): declarative `data-snap-widget` placeholders, token attributes, `data-snap-theme="auto"`
  (host color-scheme), `data-snap-inherit="auto"` (samples host font/color/bg), `window.Snap.mount/destroy` for
  SPAs, Stripe checkout forwarding via postMessage, auto-height.
- **Three widgets + booking page**: contact form (name/email/phone/event-date/type/message, honeypot, Turnstile),
  Cal-style two-pane booking calendar (server-rendered first month, deposit/full Stripe checkout in-widget,
  concurrency-guarded), branded modal booking button (accent from `/embed/brand` dot), public `/b/{slug}` page
  (OG tags, logo, height-synced iframe).
- **Brand config**: accent, font stack, light/dark/auto, advanced token JSON (8 tokens, sanitized) with live
  preview, logo upload, origin allowlist + CSP frame-ancestors, key rotation. Token layering: brand presets →
  snippet overrides → host auto-inherit.
- **Docs**: plain HTML, Next.js, Astro, React, WordPress, Squarespace/Wix/Framer + live React demo.
- **Plan gating on embeds**: none (all tiers) — correct as a growth lever; CloudSpot has no comparable embed.

### 4.2 Half-wired / broken promises in the brand layer (fix first — days, not weeks)
1. **Gallery white-label is hardcoded off** — `gallery-view.tsx:116`: `const whiteLabel = false; // gate footer
   stays Snap-branded until verified`. Studio/Pro pay for white-label and still see "Delivered by Snap".
   → Wire `entitlements.whiteLabel` through (Studio+), extend to the `/b/{slug}` footer ("via Snap" line), portal,
   and email templates. This is the brand-definition epic's first, cheapest win.
2. **Booking-page + portal footers** always say "via Snap" regardless of plan.
3. **Emails** are functional but not brand-themed (logo/accent from studio profile → inject into templates;
   deliverability is already solved via the reply-address threading `hello+slug@snap.webcules.com`).
4. **Housekeeping**: `apps/snap` contains research artifacts (`bing.html`, `ddg.html`, `help.html`, `play.html`,
   `pp*.json`, `reddit.json`) — delete or move out of the app; they must not ship.

### 4.3 Embeds — what "done" looks like (v2 of each widget)

**Contact form v2**
- Custom fields (text/select/checkbox/date) — Free: fixed set + 2 custom; Studio: unlimited + required/optional
  + conditional show. (Studio Ninja shipped custom fields Apr 2026 — table stakes.)
- Editable event-type options + intro copy + success message + optional redirect URL.
- File upload on inquiry (references/briefs) — Lite+.
- Multiple named forms with per-form tokens (website vs Instagram vs wedding-fair QR) — Studio; lead source
  captured per form (source tracking already exists as `lead.source`/`embed_origin`).
- Auto-reply customization (subject + body with variables) — Lite+.

**Booking calendar v2**
- Self-serve reschedule/cancel links (tokenized, like grants) from the confirmation email — Free. (Code already
  notes "a reschedule API… none exists yet" in `notify-client.ts`.)
- Reminder email T-24h (and optional T-1h) via the existing daily cron — Free.
- ICS attachment on confirmations (feed already exists) — Free.
- Booking questions (custom fields answered at booking, stored on project) — Studio.
- Mini-sessions (date windows × slots, urgency counts) — Studio.
- Import busy-blocks from Google Calendar / ICS URL — Lite; 2-way sync — Studio.
- Contract-at-booking toggle (attach a contract template; sign before pay in the same flow) — Studio.

**Brand definition v2 (the system)**
- **Watermark engine** (Studio+): tiled or corner, opacity/size, auto-strip on paid downloads (when commerce
  lands); applies to previews in galleries. This is also CloudSpot/Pixieset's most-requested protection feature.
- **Custom domain mapping** for galleries + booking page (e.g. `gallery.studio.com`, `book.studio.com`) —
  **Pro**, or a $5/mo add-on on Studio. CloudSpot has *no* custom domain on any tier — this is a headline
  differentiator waiting to be claimed; the embed/CSP + asset-proxy plumbing already exists.
- Human-readable gallery aliases (`/g/wedding-smith-2026` → token; token still authoritative) — Lite.
- Per-gallery OG/favicon defaults + preview image — Lite.
- Brand kit coherence: apply accent/font/radius consistently across gallery view, portal, invoices PDF, emails —
  all tiers basic; the "remove Snap mentions" full white-label — Studio+.
- Presets: gallery design + booking + form presets — Studio.

---

## 5. Pricing-tier implications surfaced by the benchmark

1. **Active-gallery caps (Free 5 / Lite 15) are now the outlier.** Pixieset, CloudSpot (Lite+), and ShootProof all
   offer unlimited galleries; galleries are just token rows — storage is the real meter. Recommendation:
   Free stays 5 (creates upgrade pressure honestly), **Lite → 50 or unlimited** (else CloudSpot Lite at $17 with
   unlimited galleries undercuts the comparison table).
2. **Custom domain** as the Studio→Pro bridge: included on Pro, $5/mo add-on on Studio — mirrors Pixieset's
   $8 custom-domain tier while keeping a reason to reach Pro.
3. **Annual billing** still absent (every competitor discounts 17–30%; CloudSpot Entry is 14% off annual — the
   weakest discount in market, and still everyone advertises one). Ship "2 months free" annual.
4. Keep the overage curve — CloudSpot's Pro→Unlimited step is its worst pricing trait; never copy it.
5. Keep embeds unmetered at every tier — it's the wedge Studio Ninja refuses to build and ShootProof charges
   $4.99 for.

---

## 6. The prioritized build queue (tier-gated, embeds & brand first)

### P0 — this cycle (2–4 weeks)
1. **Ship white-label truthfully** — wire `ent.whiteLabel` into gallery footer, `/b/{slug}`, portal, emails
   (Studio+). Remove the hardcoded `false`. *(days; highest credibility-per-line-of-code)*
2. **Booking completion basics** — self-serve reschedule/cancel (Free), T-24h reminder (Free), ICS attachment
   (Free). Closes the "scheduler is 80%" gap; all plumbing exists.
3. **Contact form v2 core** — custom fields (Free 2 / Studio ∞), editable event types + copy + success
   message/redirect, per-form source labels (Studio).
4. **Brand layer v2a** — watermark engine (Studio+); brand theming for emails + invoice PDF + portal (all tiers
   basic theming, Studio+ unbranded).
5. Housekeeping — remove research artifacts; landing-page truth pass (Pro tier: contracts shipped, teams exist).

### P1 — next 60–90 days
6. Custom fields at booking + mini-sessions (Studio); busy-block calendar import (Lite).
7. Download controls: PIN (Free), email-capture + count/size limits (Lite).
8. Questionnaires (Lite) — reuses the forms engine from #3.
9. Client PWA gallery app (Studio) — installable, evergreen, CloudSpot-style but done better (offline preview).
10. Custom domain mapping (Pro / $5 add-on) + gallery aliases (Lite).
11. Video link sections in galleries (Lite); gallery presets (Studio).
12. Lightroom publish plugin (Lite) + Zapier (Studio).
13. Commerce phase 1: digital download sales, 0% commission via studio Stripe (Studio) — carried from the
    top-10 analysis; CloudSpot's lab store follows in P2 (Pro).

### P2 — later
14. Lab auto-fulfillment + abandoned cart + packages (Pro); link-in-bio Social Site (Lite); 2-way calendar sync
    (Studio); notification center + to-dos; public API; AI assist layer (drafting/summaries — both snap and
    CloudSpot are at zero, first mover here wins the narrative).

---

## 7. Sources

CloudSpot: cloudspot.io (/, /about-us, /pricing), help.cloudspot.io (plan comparison 13287496; galleries 52655;
selling 52695; studio 4379657; integrations 2545773; subdomains 114529; mobile-app FAQ 3217029; roadmap 1600543),
Backblaze case study (Nov 2024), daveyandkrista.com (Gavin Wade interview), r/photography (1fley7r),
r/WeddingPhotography (1vp9ulu), sourceforge.net/product/CloudSpot.
Snap state: `apps/snap` — `lib/plans.ts`, `lib/embed.ts`, `lib/embed-tokens.ts`, `app/embed/{loader.js,calendar,
contact,brand}`, `components/{embed-hub,settings-form,gallery-view,share-panel,studio-switcher}.tsx`,
`app/b/[slug]/page.tsx`, `app/docs/embeds/page.tsx`, `lib/notify-client.ts`, git log (WEB-152/163/164/165/168/
209/216/217/222/223).
