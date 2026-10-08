# Snap · Commerce Analysis - epic completeness, commission decision, filing backlog

Written 2026-10-08.
Companion to `SNAP-COMPETITIVE-ANALYSIS.md`, `SNAP-FREE-TIER.md` and `SNAP-CLOUDSPOT-BENCHMARK.md`.
Covers Linear epics WEB-280 (C1), WEB-281 (C2), WEB-282 (C3) and WEB-283 (C4).

---

## 1. Decisions

1. **Commerce commission is 0%.**
   No competitor charges commission on paid-plan store sales.
   ShootProof, Pixpa and Zno are 0% on every plan.
   Pixieset and CloudSpot charge 15% only on free or entry tiers, and Pic-Time is 0% when the studio self-collects.
   Only Zenfolio (7%) and SmugMug (15%) take a cut, and they are the platforms Snap markets against.
2. `application_fee_amount` is never sent on commerce checkouts, and a test asserts it.
3. "0% commission, ever" extends to the store.
4. Snap earns on commerce through tier gating (store is Lite and above) and, later, a disclosed fee on print fulfillment (C4).

### Why a 0.05% commission was rejected
- 0.05% on a $100 sale is 5 cents.
- A studio selling $50k a year would pay Snap about $25 a year.
- Stripe's Connect fee for one active account is about $24 a year.
- On a $25 digital sale the fee rounds to about 1 cent.
- It would need a fee ledger, refund-fee reversals, dispute handling and disclosure, for no real revenue.
- It would make "0% commission, ever" false in about 14 places (listed in section 5).

## 2. How a commerce sale works

The booking payment pays for the session and the photographer's time.
The store sells what comes after, and the buyer is often not the booked client.
- Wedding guests and relatives buy photos.
- Parents buy at school, sports and event shoots.
- Mini-session photographers earn mainly from digital sales.
- A client who got 30 edited images can buy more images, the full gallery, or a larger size.

Two common models:
1. Low session fee, income from digital sales.
2. Digitals included in the package, with extras and prints sold.

Model 2 needs **included credits** (a gap in the current epics, see G6).

## 3. Epic completeness review

### 3.1 What is strong
- The catalog shape matches every competitor: price lists, four product archetypes, cost and price per variant.
- Stripe-hosted Checkout, server-side carts, webhook dedupe and idempotency keys are the right design.
- The order state machine, entitlements that outlive gallery expiry, review hold, refunds and disputes are covered.
- The `LabAdapter` design for WHCC and Prodigi is Workers-shaped.

### 3.2 Problems found
1. **No child stories existed.**
   All four epics only had "story breakdown (when started)" text.
2. **Charge type contradiction.**
   C2 assumes direct charges.
   Shipped booking checkout (WEB-155) uses destination charges (`transfer_data`, no application fee).
   Invoices use direct charges (Payment Links with a `stripeAccount` header).
   Per Stripe docs, on destination charges the platform's balance pays the Stripe processing fee.
   Snap may be paying about 2.9% + 30 cents on every booking payment today.
   The FAQ says that fee "goes to Stripe, never to us".
   Not verified in a live account: this needs a spike (G1).
3. **Connect fees.**
   Stripe lists $2 per monthly active account and 0.25% + 25 cents per payout for platforms that handle pricing.
   Resolved 2026-10-08: with `fees.payer = account` (what Snap now creates) Stripe collects its fees from the studio's own account and charges no Connect fees to the platform, so the per-studio platform cost is $0.
4. **No reusable module.**
   Everything is scoped inside `apps/snap`.
5. **No cross-epic launch gate.**
   Other epics have one (WEB-267, WEB-309, WEB-316).
6. **Missing features** (stories G4 to G10 below).

### 3.3 Spike result (WEB-351, run 2026-10-08, Stripe test mode, Snap's own account)

Script: `apps/snap/scripts/spike-stripe-fees.mjs`.
Connected account: a test-mode Custom account in Canada (Express onboarding cannot be completed headlessly).
Destination-charge fee payer does not depend on the connected account type, per Stripe's docs.

| Charge | Result |
|---|---|
| A) Destination charge, 100.00 CAD, no application fee (booking checkout today) | **The platform was debited a 4.00 CAD Stripe fee.** The connected account received the full 100.00 CAD with a 0.00 fee. |
| B) Direct charge on the connected account | **Rejected by Stripe:** "Creating direct charges with type=express or type=custom is not supported for new platforms." |

What this means:
1. **The fee leak is confirmed.**
   Every booking deposit or payment made through the connected-studio path costs Snap about 4% of the payment.
   On a 500.00 deposit that is 20.00 out of Snap's pocket, against a 15.00 Lite subscription.
   The FAQ claim ("that fee goes to Stripe, never to us") is wrong for these payments.
2. **C2's direct-charge plan does not work with the account type Snap uses.**
   `app/api/studio/payouts/connect/route.ts` creates studio accounts with `type: "express"`.
   Snap's Stripe account is new (since 2026-10-06), so legacy Express and Custom direct charges are blocked.
3. **Invoices are probably affected too.**
   `lib/invoices.ts` mints a payment link on the studio account and, on any error, silently falls back to the platform account.
   If the connected path fails for the same reason, the client would pay Snap's platform account instead of the studio.
   Not yet reproduced: verify before relying on it.
4. **There is a free window to fix this.**
   Stripe's docs say new platforms should use controller-based accounts (dashboard type, `fees.payer`, `losses.payments`) or Accounts v2.
   Direct charges are supported there, with the connected account paying fees and Stripe holding negative-balance liability.
   Snap has no studio accounts yet on the new Stripe account, so there is nothing to migrate if this is done before launch.
5. **Not yet tested.**
   A controller-based Express-dashboard account (the closest match to today's Express onboarding) needs a browser-completed test onboarding.
   Stripe notes that fee behavior for direct charges on Express accounts varies between Stripe features, so the exact fee split must be confirmed on that account type before committing C2.

Update 2026-10-08: the fix shipped. Studio accounts use a full dashboard, `fees.payer = account`, `losses.payments = stripe`; client payments are direct charges.
Stripe's fee-behavior docs put processing, dispute, Radar, Stripe Tax and currency-conversion fees on the studio's account, and no Connect fees on Snap.

Original decision framing: use controller-based accounts with direct charges (studio pays Stripe fees, Snap earns no fee, matches the 0% brand), or keep destination charges and accept or recover the fee.
Recommendation: controller-based accounts, `fees.payer = account`, `losses.payments = stripe`, direct charges.

## 4. Filing status

Filed in Linear on 2026-10-08 (all under C1, WEB-280):
WEB-336, WEB-337, WEB-338, WEB-339, WEB-340, WEB-341, WEB-342.

Linear then hit its free issue limit.
After Done issues were deleted, everything in section 6 was filed on 2026-10-08:
- C2 stories WEB-354 to WEB-360 under WEB-281.
- C3 stories WEB-361 to WEB-368 under WEB-282.
- C4 stories WEB-369 to WEB-377 under WEB-283.
- New epic WEB-350 (Commerce C5, cross-cutting) with G1 to G3 as WEB-351 to WEB-353 and G4 to G11, D1 to D3, W1 to W4 as WEB-378 to WEB-392.

Each epic (WEB-280 to WEB-283, WEB-350) holds a full "Story catalog" section, so child issues can be deleted to stay under the 250 issue cap without losing context.

## 5. "0% commission" surfaces to keep true (extend, do not remove)

`apps/snap`:
- `app/page.tsx` (meta description and hero copy)
- `components/landing/hero.tsx`
- `components/landing/final-cta.tsx`
- `components/landing/personas.tsx`
- `components/landing/product-tour.tsx`
- `components/landing/stack-math.tsx`
- `components/landing/pricing-section.tsx`
- `components/landing/trust-strip.tsx`
- `components/landing/faq.tsx`
- `components/landing/screens.tsx` (the "Snap commission $0.00" mock)
- `lib/docs/content/payouts.tsx`

Repo docs: `SNAP-COMPETITIVE-ANALYSIS.md`, `SNAP-FREE-TIER.md`, `SNAP-CLOUDSPOT-BENCHMARK.md`.

All of these currently talk about payments and bookings.
After commerce ships, each should say the store is 0% too.

## 6. Filing backlog (drafted, not yet in Linear)

Conventions: team Webcules, project Snap, status Backlog.
Title format follows the filed C1 stories.
Labels shown in brackets.

### C2 (parent WEB-281)
1. **C2 1/7 - carts schema, repo, guest-grant keying, merge** [Payments, Feature] High.
   D1 `carts` and `cart_items`; guest carts keyed to the gallery grant plus anonymous cookie; merge on re-entry; monotonic states; tenant and grant-scope tests.
   Depends on C1 1/7.
2. **C2 2/7 - cart drawer UX, min-order enforcement, coupon field** [Payments, Feature] High.
   Add, edit, remove; greyed finalize below minimum; coupon validated against studio Stripe promotion codes; older-cart price note; cross-device resume; mobile pixel review.
3. **C2 3/7 - checkout session service** [Payments, Feature] Urgent.
   Blocked by G1.
   Live repricing at creation; inline `price_data`; metadata and `client_reference_id`; idempotency key `csess_{cart_id}_{items_hash}`; resume open sessions; **no application fee, asserted by test**; `charges_enabled` guard.
4. **C2 4/7 - webhook endpoint, dedupe, handlers, retry sweep** [Payments, Feature, Infra] Urgent.
   `constructEventAsync` on the raw body; `stripe_webhook_events` dedupe; handlers for completed, async success and failure, expired, payment intent, refunded, dispute, `account.updated`.
   Added: a cron or Queue sweep that re-fetches sessions stuck in `awaiting_payment`, so a dropped webhook never strands a paid customer.
5. **C2 5/7 - abandoned-cart recovery and settings (Studio+)** [Payments, Feature] Medium.
   One branded email per cart (WEB-240 shell), own re-priced link, copy override (WEB-253), respects suppression, logged in `email_log`.
6. **C2 6/7 - receipts, invoice branding, Stripe Tax opt-in, manual tax fallback** [Payments, Feature] Medium.
   Connected-account branding on receipts; optional hosted invoices; `receipt_url` on the order; `tax_settings.status` guard; GST/PST/HST tested for Canadian studios; copy states tax filing is the studio's job.
7. **C2 7/7 - failure-edge test matrix and QA** [Payments, Quality] High.
   Price change, unpublished product, declined card, 3DS, async payment, expiry, duplicate and out-of-order webhooks, currency mismatch, Stripe outage, mid-cart disconnect; guest purchase browser run on mobile and desktop with pixel review.

### C3 (parent WEB-282)
1. **C3 1/8 - orders schema, state machine, webhook handlers** [Payments, Feature] High.
   `orders`, `order_items`, `order_events`; transitions created, paid, review, approved, fulfilled, delivered, completed, plus refunded, dispute, cancelled, expired; idempotent upserts by Stripe ID; event log is append-only.
2. **C3 2/8 - digital entitlements, delivery emails, resend** [Payments, Feature] High.
   Entitlement per purchased item, independent of gallery expiry (studio-set window, default 12 months); watermarks stripped; expiring link; ZIP via the WEB-261 builder; resend from dashboard and client page; download-opened telemetry.
3. **C3 3/8 - order dashboard, financial block, CSV** [Payments, Feature] High.
   Project Orders tab and studio-wide page; client paid, Stripe fee estimate, cost, studio profit (Snap's take shown as $0); per-item states; line-per-item CSV; clients page lite.
4. **C3 4/8 - client order status page and terms acceptance** [Payments, Feature] High.
   `/orders/{token}` with timeline, downloads, resend, studio contact; Terms of Sale and license checkbox at checkout, frozen into the order and the confirmation email.
5. **C3 5/8 - review hold and auto-approve cron (Studio+)** [Payments, Feature] Medium.
   Optional hold window; swap image, fix crop or cancel with automatic Stripe refund; auto-approve after N days.
6. **C3 6/8 - refunds and disputes** [Payments, Feature] High.
   Partial and full refunds via the API with idempotency; pending-refund state; dispute lifecycle with `due_by` banner and immediate email; refund blocked while a dispute is open; downloads stay granted.
7. **C3 7/8 - notifications inventory** [Payments, Feature] Medium.
   Order received, payment confirmed, delivered, refund issued, dispute alert; WEB-240 shell; `email_log` template names.
8. **C3 8/8 - state machine and edge QA matrix** [Payments, Quality] High.

### C4 (parent WEB-283), priority Medium
1. **C4 1/9 - LabAdapter interface, normalized events, lab-order state** [Payments, Feature].
2. **C4 2/9 - WHCC adapter** [Payments, Feature].
3. **C4 3/9 - Prodigi adapter** [Payments, Feature].
4. **C4 4/9 - approval gate, fulfillment flow, tracking surfacing** [Payments, Feature].
5. **C4 5/9 - print-file prep and crop pipeline** [Payments, Feature].
6. **C4 6/9 - shipping quotes at checkout** [Payments, Feature].
7. **C4 7/9 - lab cost recovery plus disclosed fulfillment fee** [Payments, Feature].
   Founder decision gates this: pick the cost-recovery option and the exact fulfillment fee before any lab order ships.
8. **C4 8/9 - Labs settings, catalog sync, pricing-update alerts** [Payments, Feature].
9. **C4 9/9 - sandbox to staging QA with reprint and cancel drills** [Payments, Quality].

### Gap stories (new)
- **G1 - Spike: Stripe fee economics and charge type** [Payments, Research] Urgent.
  In a test-mode account, run a booking-style destination charge and a direct charge on an Express account, and record who pays processing fees, Connect account fees and payout fees.
  Output: a one-page decision on charge type for commerce and a margin figure per $100 of studio sales.
  Blocks C2 3/7.
- **G2 - Align booking and invoice checkout charge type; fix any fee leak** [Payments, Bug] High.
  Depends on G1.
  Also corrects the FAQ and `payouts.tsx` wording if the finding confirms the leak.
- **G3 - Extract `packages/commerce` reusable core** [Infra, Feature] High.
  Catalog, cart, order state machine, entitlements, `LabAdapter` and fee ledger as a host-agnostic package with Snap as the first host.
  Define the host interface (org lookup, storage, email, payments), publish tests that run without Snap.
  Do before C1 1/7 merges.
- **G4 - Checkout abuse protection** [Payments, Compliance] High.
  Turnstile (`lib/turnstile.ts`) and rate limits on cart and session creation to stop card testing on studios' Stripe accounts; guidance for Radar rules; alert on decline spikes.
- **G5 - Manual and offline orders** [Payments, Feature] Medium.
  Photographer creates a comp, cash or e-transfer order; delivered through the same entitlement path; marked paid offline; shown in the financial block.
- **G6 - Included credits (digital allowances)** [Payments, Feature] High.
  Package or session includes N free downloads; the rest are paid; credits are tracked per client and grant.
- **G7 - Gift cards and store credit** [Payments, Feature] Low.
- **G8 - Sales campaigns** [Payments, Feature] Medium.
  Early-bird, expiring offers and anniversary emails built on the existing cron and email shell.
- **G9 - Store settings and sharing** [Payments, Feature] Medium.
  Per-gallery store toggle, open and close dates, shareable store link and QR, "free downloads then paid" mode.
- **G10 - Sales reports and accounting export** [Payments, Feature] Medium.
  Revenue by gallery, top photos, payouts reconciliation, CSV and QuickBooks-friendly export.
- **G11 - Commerce launch gate (cross-epic)** [Payments, Quality] High.
  Tier gates for all four tiers, pricing surfaces, security review (cross-tenant, price tampering, entitlement bypass), Cloudflare cost audit (D1 rows, Worker CPU on ZIPs, R2 operations per sale), and a performance budget for galleries with the store on.

### Docs stories
- **D1 - In-app docs for commerce** [Improvement, Feature] Medium.
  New `lib/docs/content` guides: store setup, orders and delivery, refunds and disputes, and print fulfillment when C4 lands.
- **D2 - Update payouts and payments docs** [Improvement] Medium.
  `payouts.tsx` and the FAQ wording on who pays Stripe's fee, once G1 is resolved.
- **D3 - Update repo docs** [Improvement] Low.
  Add the 0% store decision to `SNAP-COMPETITIVE-ANALYSIS.md` (section 8 pricing table), `SNAP-FREE-TIER.md` and `SNAP-CLOUDSPOT-BENCHMARK.md`.

### Website stories (landing, on snaphq.app per WEB-330)
- **W1 - Pricing section and plan table commerce rows per tier** [Improvement, Feature] Medium.
- **W2 - Commerce feature section and product tour with real store screens** [Improvement, Feature] Medium.
- **W3 - FAQ, stack-math and trust strip: "0% on store sales too", with competitor commission math** [Improvement] Medium.
  Zenfolio 7% and SmugMug 15% on a $50k year.
- **W4 - Comparison and migration pages: commerce rows** [Improvement] Low.

## 7. Sources

- Stripe docs: destination charges and fees, Connect pricing, `fees_collector` (docs.stripe.com/connect/destination-charges, docs.stripe.com/connect/integration-recommendations).
- Competitor commission rates: `SNAP-COMPETITIVE-ANALYSIS.md` sections 2 and 3, cross-checked with 2026 comparison articles (Pixpa, Zno, ShootProof).
- Snap code: `apps/snap/lib/connect.ts`, `lib/invoices.ts`, `app/api/embed/bookings/route.ts`, `app/api/booking-manage/[token]/reschedule/route.ts`, `components/landing/*`, `lib/docs/content/payouts.tsx`.
