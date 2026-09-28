# Snap · Free Tier — final spec (costed against Cloudflare economics)

Companion to `SNAP-COMPETITIVE-ANALYSIS.md` (§4 free-tier moat, §6.2.4 "nearly wasted", §8 pricing table).
Decisions here assume that doc's market read: **nobody in the field free-tiers a count of concurrent
bookings** — they gate feature sophistication or the whole feature — and snap's free tier is the #1
acquisition moat, so it must demo every differentiator while capping only what actually costs money.

---

## 1. The cost model — what a free photographer actually costs us

Verified Cloudflare allowances (2026):

| Resource | Free allowance | Overage price |
|---|---|---|
| R2 storage | 10 GB-month (account-wide) | $0.015 / GB-mo |
| R2 Class A (writes) | 1 M / month | $4.50 / M |
| R2 Class B (reads) | 10 M / month | $0.36 / M |
| R2 egress | **always $0** | — |
| Workers requests | 100 k / day | (paid plan: 10 M/mo incl., then $0.30/M) |
| Workers CPU | 10 ms / invocation | (paid plan: 30 M CPU-ms incl.) |
| D1 | 5 GB · 5 M rows read/day · 100 k rows written/day | (paid plan: 25 B reads + 50 M writes/mo incl.) |

**Snap's existing fenders (already shipped — this is why generosity is affordable):**

1. **Derivatives are client-side** (`repos/assets.ts` §WEB-116): thumbs/previews are canvas-encoded in
   the browser at upload. Zero Worker CPU per upload → the 10 ms free-plan CPU limit is never the issue.
2. **Dormancy purge**: free orgs idle 180 days get everything purged (notices at 150/170; `lib/dormancy.ts`).
   Abandoned free storage self-reclaims — the classic "dead 20 GB forever" leak is already closed.
3. **View-rate limiting** (`lib/limits.ts`): 30 image-views/min/IP + 5 M views/gallery/month. A single
   viral gallery is bounded at ≤ $1.80/mo in Class B reads — the flood cliff has a dollar ceiling.
4. **Hard locks**: upload refuses past 2× cap; monthly PUT bounded at 2× cap → adversarial churn
   (Class A) is bounded at ~$0.14/mo per org worst case.
5. **$0 egress** — delivery bandwidth never bills, no matter how hot a gallery gets.

**Worst-case math per fully-loaded free user (20 GB, maxed monthly churn, hot gallery):**

| Cost driver | Worst case / month |
|---|---|
| Storage (20 GB × $0.015) | $0.30 |
| Class A churn (40 GB PUT cap ≈ 30 k ops × $4.50/M) | $0.14 |
| Class B reads (view-budget ceiling 5 M × $0.36/M) | ≤ $1.80 (realistic: <$0.05 — galleries aren't viral) |
| D1 rows | ~$0 (rows are effectively free on paid; writes bounded by view limiter) |
| **Total, fully loaded** | **≈ $0.50–2.20; typical active free user ≈ $0.05–0.15** |

**≈ 2 Lite subscribers ($30) fund ~100 maxed-out free users, or ~500 typical ones.** The free tier is
CAC (the badge below), not COGS.

**The one real constraint is shared, not per-user:** on the *free* Workers plan, gallery browsing eats
the daily ceilings (each image view ≈ 1 Worker request + 2 D1 writes from the rate limiter) — roughly
700 gallery sessions/day account-wide before the 100 k/day request wall. This is a platform-level
ceiling, not a free-tier-user problem. **Decision: move to Workers Paid ($5/mo) at launch** — one
Lite subscriber covers it; it also lifts CPU to 30 s and raises D1 to effectively-free row pricing.

### Design consequences
- **Count-based things are free to give away** (leads, bookings, contracts, invoices — a few D1 rows each).
- **Volume-based things stay capped** (storage bytes, RAW bytes) — that's where real money lives.
- **Never wall the end client** — the booking-cap lesson. Walls face the photographer (upgrade prompts
  in the dashboard), never the photographer's customers (widget errors).

---

## 2. Design principles

1. **Gate value, not usage counts** — the Calendly/Cal.com lesson from the booking analysis. Sophistication
   and volume-of-money gate; the transactional spine doesn't.
2. **The free tier must demo every moat** (§6.2.4 of the competitive doc): OTP galleries, embeddable
   widgets, contracts+e-sign, RAW vault — a prospect should *feel* all five differentiators before paying.
3. **The badge is the growth engine**: every free delivery says "Delivered by Snap" (already live in
   `gallery-view.tsx:298,587`). Free users' clients are the ad audience — that's what the R2 pennies buy.
4. **Honest limits only**: a limit that never releases (expired galleries still occupying slots) is a lie
   that converts into support tickets, not upgrades.
5. **No commission traps, ever** — the anti-Pixieset/Zenfolio banner. Free means free; when commerce
   ships it starts at Lite with 0% commission, never a free-tier percentage.

---

## 3. The Free tier — feature list

### Unlimited on Free (costs ~nothing; wins every comparison table)

| Capability | Market comparison |
|---|---|
| **Leads & client CRM** — unlimited | HoneyBook $36/mo; Dubsado $35/mo |
| **Projects & pipeline** (kanban) | Dubsado/Zenfolio/Studio Ninja have none at all |
| **Contracts + e-sign** — unlimited | Dubsado $35/mo; ShootProof bundles it paid |
| **Invoices + payments (their own Stripe, 0% commission)** — unlimited | Zenfolio 7% + fees; HoneyBook ~3% markup mandatory |
| **Bookings — unlimited** *(was 1; changed per decision)* + embeddable booking calendar & contact-form widgets | ShootProof charges $4.99/mo for booking; Studio Ninja's is link-only by policy; Pixieset/Zenfolio/Dubsado/Pic-Time have nothing comparable |
| **Project folders + folder-level gallery delivery** (WEB-216) | Cloudspot's most-praised feature — delivery craft is not a tier lever |
| Booking confirmation emails + ICS feed | — |
| **OTP-secured client galleries — 5 concurrently active** (full feature set inside them: favorites, selections, downloads, expiry, revoke, audit log) | Pixieset/Zenfolio/ShootProof free = 3 GB ≈ fits zero weddings |
| **Storage: 20 GB JPG** | best in market (see above) |
| **RAW trial pocket: 3 GB of the 20 GB may be RAW** *(new — §8 of the competitive doc: let the vault demo itself)* | RAW elsewhere: Pixieset $24+; SmugMug $10/TB; most others: none |

### Gated — the honest upgrade ladder

| Wall | Where it moves | The photographer's reason to pay |
|---|---|---|
| 6th+ active gallery | Lite $15 | delivery volume |
| RAW beyond 3 GB + full vault lifecycle | Lite $15 | real shoots are RAW |
| 150 GB storage; 500 GB + overage program | Lite / Studio | library growth |
| White-label — remove "Delivered by Snap" badge, full brand control across galleries + widgets | Studio $29 | their brand, not ours (the badge is the price of free) |
| Multi-studio: linked orgs under one bill, quotas pooled (WEB-217) | Lite ≤ 3 studios · Studio+ unlimited | the "stop paying 4 subscriptions" pitch (Zenfolio multi-genre refugees) — quotas MUST pool or Lite ×3 ×150 GB cannibalizes Studio |
| Future — **digital-download store (commerce, P0)**: from **Lite**, 0% commission forever; free tier delivers galleries only | Lite $15 | selling is the revenue engine — the strongest rung we will ever have |
| Future — automations/workflows, booking reminder sequences, questionnaires | Lite+ (recommend Lite for reminders — they're cheap; Studio for the rules engine) | time |
| Future — AI drafting/culling assist, custom domain | paid (rung set when shipped; doc §8 suggests domain as $5 add-on or Pro) | polish |

Booking reminder emails: **included on Free** (Calendly precedent; cost ≈ $0.0005/email — bounded by
the existing per-org OTP cap pattern; margin monitoring WEB-161 will flag if it ever shows up).

### Explicitly rejected
- **Active-booking caps** — no competitor does this on free; it walls the *client*, and combined with the
  lifecycle bug it was "1 booking per lifetime." Dead.
- **Commission on free-tier sales** — the Pixieset 15%-trap is the most-resented thing in the category;
  our banner is "0%, always."
- **Watermark/download-PIN gating on Free** — those ship as gallery polish (P1); recommend Lite+, not a
  free-tier punishment, since they're conversion features for *their* clients.
- **Unlimited free galleries** — 5 active is the one count-cap worth keeping: delivery *is* the product,
  the slot frees when a gallery expires (once §5.4 lands), and 5 × full weddings still beats every
  competitor's 3 GB.

---

## 4. Two lifecycle bugs found while auditing (fix with this change)

1. **Expired grants still count as active slots.** `plans.ts` counts `share_grants.status='active'`
   rows; nothing ever flips `status` when `expires_at` passes (`grantLive()` in `lib/shares/grants.ts:80`
   knows the truth, the counter doesn't). A free photographer's expired galleries occupy slots forever
   until manually revoked — the same "active means never" dishonesty the booking cap had.
2. **Confirmed bookings stay active past their event date** — moot once the cap is gone (it only fed the
   wall), but the `activeBookings` stat shown in Settings → Plan stays inflated; auto-flip to
   `completed` when the event date passes in the daily cron.

---

## 5. Ship checklist

1. `lib/plans.ts` — `free.maxActiveBookings: 1 → null`; add `rawTrialBytes: 3 * GB` to the free def
   (`asset.kind = 'raw'` exists — the budget is one `SUM(bytes)` per org).
2. `app/api/embed/bookings/route.ts:55-58` — delete the `studio_booking_limit` 403 wall.
3. `app/embed/calendar/route.ts:479-480` — delete the "This studio can't take more bookings" client copy
   branch (widget falls through to the generic error).
4. `lib/uploads.ts:262` — `jpgOnly` check becomes tier-aware: RAW accepted while org RAW bytes ≤ 3 GB
   (counted inside the same 20 GB cap); video stays paid (as today).
5. `lib/plans.ts` gallery count — count only live grants:
   `status='active' AND (expires_at IS NULL OR expires_at > now)` (fixes §4.1 without a migration).
6. Daily cron — flip past-event `confirmed` bookings to `completed` (fixes §4.2; one UPDATE).
7. Verify the white-label override at `components/gallery-view.tsx:114` (`const whiteLabel = false`)
   is still the intended "badge stays until brand verification" state, and that widget embeds render
   snap branding on free orgs too.
8. Copy pass — landing pricing table, `plan-panel.tsx`, `/onboarding/plan`: Free row reads
   "Unlimited bookings, leads, contracts & invoices · 5 OTP galleries · 20 GB (incl. 3 GB RAW trial)";
   remove "1 active booking" everywhere (plans.ts header comment included).
9. Linear: ticket the tier rework under WEB-142 launch prep; note the Workers Paid ($5/mo) launch
   decision so it's not forgotten on launch day.

---

## 6. Sources

- Cloudflare pricing (official): developers.cloudflare.com — Workers platform / R2 / D1 pricing pages
- Allowance cross-check: [flarelog.dev Cloudflare pricing 2026](https://flarelog.dev),
  [saas4that.com D1 review](https://www.saas4that.com), [cloudstorageprices.com](https://cloudstorageprices.com)
- Snap internals: `lib/plans.ts`, `lib/limits.ts`, `lib/dormancy.ts`, `lib/uploads.ts`,
  `lib/shares/grants.ts`, `repos/assets.ts` (client-side derivatives), `app/api/embed/bookings/route.ts`,
  `app/embed/calendar/route.ts`, `components/gallery-view.tsx`
