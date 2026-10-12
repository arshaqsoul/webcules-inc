# Snap — Commerce W1: pricing section & plan table, commerce rows per tier

Owner: Pepper (CMO) · Issue: WEB-135 (Linear WEB-389) · Parent: Commerce C5 (WEB-350/WEB-12)
Status: DRAFT — copy only. Nothing here ships or is published without Board approval.

## What changes

When Snap's commerce module ships, the public pricing surfaces gain commerce rows so a
prospector can see what each tier can sell. Three surfaces, one source of truth:

1. `apps/snap/lib/tier-cards.ts` — the tier-card feature ladders (landing `/` pricing
   section, `/onboarding/plan`, Settings → Plan all render this data). Cumulative copy:
   each paid tier lists only deltas.
2. Settings → Plan dense grid (`apps/snap/components/plan-panel.tsx`) — the plan table
   proper: add commerce rows per tier.
3. `apps/snap/components/landing/pricing-section.tsx` — one footnote sentence covering
   store sales and Stripe fees.

AGENTS.md rule (still binding): every limit quoted in docs/copy must match the code —
plan caps come from `lib/plans-data.ts`; `lib/tier-cards.ts`, the landing grid and
`plans-data.ts` are kept in sync by `tests/unit/pricing-tiers.test.ts` + gate-matrix.

## Truth sources used (Snap only — no other product's claims)

- `docs/SNAP-COMMERCE-ANALYSIS.md` §1 item 4: "Snap earns on commerce through tier
  gating (store is Lite and above) and, later, a disclosed fee on print fulfillment (C4)."
- `docs/SNAP-FREE-TIER.md` §pricing table: "Future — digital-download store (commerce,
  P0): from Lite, 0% commission forever; free tier delivers galleries only."
- `packages/commerce/src/catalog.ts` (G3, merged): `PlanCommerceGates =
  { storeEnabled, maxPriceLists, packagesAllowed, customProductsAllowed }`.
- `packages/commerce/tests/catalog.test.ts` (G3, merged) — per-tier gate fixtures:
  - Free:  `{ storeEnabled: false, maxPriceLists: 0, packagesAllowed: false, customProductsAllowed: false }`
  - Lite:  `{ storeEnabled: true,  maxPriceLists: 1, packagesAllowed: false, customProductsAllowed: false }`
  - Studio:`{ storeEnabled: true,  maxPriceLists: 10, packagesAllowed: true,  customProductsAllowed: true }`
  - (fixture Studio cap 10 was superseded — see "Number reconciliation" below)
- `apps/snap/lib/plans-data.ts` (snap/WEB-180-commerce-catalog-foundation branch, in
  flight, checked 2026-10-12): Free `maxPriceLists: 0` · Lite `1` · Studio `5` ·
  Pro `null` (= unlimited; `lib/commerce.ts` maps null → -1 = no cap, and
  `tests/unit/gate-matrix.test.ts` renders Pro as ∞). This is the cap source of
  truth per launch hold #1 — the table below follows it.
- Story catalog (SNAP-COMMERCE-ANALYSIS §6): C2 5/7 abandoned-cart recovery is Studio+.
- Existing live claim we extend, not contradict (pricing-section.tsx): "Client payments
  run through your own Stripe account at Stripe's standard rate; that fee goes to Stripe,
  never to us." G1/G2 resolution (2026-10-08): direct charges, `fees.payer = account`,
  no application fee on commerce checkout (asserted by test in C2 3/7).

## Draft plan-table rows (Settings → Plan + any comparison table)

| Commerce row | Free | Lite | Studio | Pro (Teams) |
|---|---|---|---|---|
| Online store — sell photos & digital products from your galleries | — | ✓ | ✓ | ✓ |
| Price lists | — | 1 | 5 | Unlimited¹ |
| Packages (bundled products) | — | — | ✓ | ✓ |
| Custom products | — | — | ✓ | ✓ |
| Commission on store sales | — | 0% | 0% | 0% |

¹ Number reconciliation (2026-10-12, Pepper): Strange flagged that the in-flight
`plans-data.ts` on `snap/WEB-180-commerce-catalog-foundation` sets Studio
`maxPriceLists: 5` and Pro `null` (unlimited), diverging from the G3 test fixture's
Studio = 10. Verified in code; per launch hold #1 (code wins) the table now reads
Studio 5 / Pro Unlimited and the tier-card lines below are updated to match.
If Stark's C1 1/7 merge lands different numbers, the table follows the code again.
Pro is not self-serve purchasable (WEB-329) and won't get a public card either way.

Visual treatment of record: Strange's spec (WEB-248 comment f3c08a14, 2026-10-12) —
existing design system only; ✓ / numeral / "—" glyph semantics; "—" reserved
exclusively for "not on this tier"; unshipped rows never rendered in pricing
surfaces; no badges/locks/new pills; max one store line per card. Accepted by
Pepper as the visual baseline for W1. Final copy inside that treatment is
Coulson's pass (child issue WEB-247).

Explicitly NOT in the table (do not claim until the story ships):
- Abandoned-cart recovery emails — Studio+ per C2 5/7, still backlog. Add the row only
  when that story lands.
- Included credits / free downloads per package (G6), offline orders (G5), print
  fulfillment fee (C4, TBD founder decision) — all backlog/undecided; no copy.
- Print products row: catalog supports the kind, but C4 (lab adapters) is unbuilt —
  do not imply labs/printing until C4 ships.

## Draft tier-card copy deltas (cumulative ladder, tier-cards.ts)

- Free card: add nothing (free tier delivers galleries only — SNAP-FREE-TIER.md).
  No store upsell line inside the card; the upgrade CTA pattern handles it.
- Lite card, append: `Online store — sell photos from your galleries, 0% commission · 1 price list`
- Studio card, append: `Store power: 5 price lists · packages & custom products`
- Landing pricing-section footnote, append one sentence:
  `Store sales too: 0% commission, always — they run through your own Stripe account at Stripe's standard rate.`

Copy above is my draft; Coulson polishes wording (child issue), Strange proposes the
row/badge visual treatment for the table and cards (child issue).

## Launch holds — this copy MUST NOT ship until all four clear

1. C1 1/7 merges commerce plan gates into `apps/snap/lib/plans-data.ts` (cap source of
   truth). If Stark's final numbers differ from the fixtures above, the table changes
   to match the code — code wins, copy follows.
2. Commerce C1–C3 + G4 ship to production (no selling features announced before they exist).
3. G11 commerce launch gate verifies pricing surfaces vs code (pricing-tiers.test.ts +
   gate-matrix extended to commerce rows).
4. Board approval of the final copy (standing rule: draft only without it).

## Handoffs

- Coulson (Content Writer): copy pass on rows + card lines + footnote — child issue WEB-247 (delivered 2026-10-12, approved by Pepper same day).
- Strange (Marketing Creative): visual treatment for commerce rows/badges — child issue WEB-248 (done, accepted baseline).
- Implementation of the tsx/plans-data changes: Snap dev (Parker/Banner) under W1 once
  copy is approved and gates land — Pepper does not touch code.

## Final board-ready copy block (2026-10-12 — supersedes the drafts above)

Assembled by Pepper from Coulson's approved WEB-247 pass (comment 2faf28b5 +
`copy-draft` doc @ 5ed0a815; review confirmation 78590e6f accepted) inside
Strange's accepted visual baseline (WEB-248). Numbers verified against
`apps/snap/lib/plans-data.ts` @ 8c63e89 (PR #21) and the aligned fixtures
@ b960317. This is the exact copy submitted for Board approval — launch hold #4.

**1. Plan-table rows (Settings → Plan dense grid; any comparison table)**

| Commerce row | Free | Lite | Studio | Pro |
|---|---|---|---|---|
| Online store - sell photos from your galleries | — | ✓ | ✓ | ✓ |
| Price lists | — | 1 | 5 | Unlimited |
| Packages - bundled products | — | — | ✓ | ✓ |
| Custom products | — | — | ✓ | ✓ |
| Commission on store sales | — | 0% | 0% | 0% |

**2. Tier-card lines (cumulative ladder, tier-cards.ts)**

- Free: add nothing.
- Lite, append: `Online store - sell photos from your galleries, 0% commission · 1 price list`
- Studio, append: `Store power - 5 price lists, packages & custom products`
- Pro: no public card (not self-serve purchasable, WEB-329); "Unlimited" price
  lists lives in the dense grid only.
- Style call (Coulson, accepted by Pepper): plain dash, not colon — matches
  existing tier-cards.ts voice ("One-click Download all for clients - any
  gallery size…").

**3. Landing footnote (pricing-section.tsx), append one sentence**

`Gallery stores start on Lite - 0% commission on every sale; the only fee is Stripe's standard rate.`

**Truth notes for the Board packet**

- Every number above is enforced in `lib/commerce.ts` and pinned by
  `tests/unit/gate-matrix.test.ts`; `tests/unit/pricing-tiers.test.ts` keeps
  tier-cards.ts in sync. The table cannot silently drift from code.
- Store quotas pool across a multi-studio family (same rule as gallery slots,
  WEB-64). Deliberately NOT in W1 public copy — terse surfaces don't call out
  pooling today; available truth for the W3 FAQ (WEB-133) if wanted.
- Still excluded (no claims until shipped): abandoned-cart recovery (C2 5/7),
  credits (G6), offline orders (G5), print/labs (C4).

**Launch-hold status at time of submission**

1. C1 1/7 gates in `plans-data.ts` — values final in PR #21 (8c63e89 + b960317);
   cleared once PR #21 merges.
2. Commerce C1–C3 + G4 shipped to production — open (WEB-179 onward).
3. G11 launch-gate verification of pricing surfaces vs code — open (WEB-139).
4. Board approval of this copy block — **this request**.
