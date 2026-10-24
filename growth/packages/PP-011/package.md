# Reel package: PP-011

This is what the founder posts.
The packager fills it in and checks every field.

## Files

- Reel: `growth/packages/PP-011/reel.mp4`
- Cover: `growth/packages/PP-011/cover.png`
- QC report: `growth/packages/PP-011/qc.json`

## Caption (paste as is)

Your gallery sells the album. You keep every dollar.
Snap's store puts Buy buttons right on your galleries. Price your prints, packages and albums once, flip the store open, and clients order from the gallery they already love. 0% commission - the money settles into your own Stripe account.
Set up your store in minutes at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #printsales #photographystore #gallerysales #photographerworkflow

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none (the trend log is empty, so no trend is claimed, and any sound you add is your own call).

No soundtrack version exists: the ComfyUI music server was unreachable from the recording runtime, so only the sound-effects reel is packaged. The ethereal music version can be made later with `reel.mjs music PP-011 --style ethereal --sfx light` once the server is back.

## When to post

Suggested: Tuesday 2026-11-10, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: store and sales content follows the delivery/portal arc that ends with PP-009 and PP-010; a Tuesday evening keeps the established twice-weekly rhythm.

## Posting order

Post AFTER PP-010 (Fri 2026-11-06). Suggested order for this batch: PP-011 (Tue 2026-11-10), PP-012 (Fri 2026-11-13), PP-013 (Tue 2026-11-17), PP-014 (Fri 2026-11-20).
PP-011 first because sales content converts warm followers from the delivery arc, and the store is the strongest paid-tier hook (Lite).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-011
Pinned first comment: The online store is on Lite and up, takes 0% commission, and deposits land in your own Stripe account. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about print sales: "Moving the store onto my gallery stopped the invoice-back-and-forth completely."
  - On a post about platform commissions: "0% was the reason I tried it - the money goes straight to my Stripe."
  - On a post about client galleries: "The Buy buttons show up right in the gallery clients already use."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each cited file was re-opened on 2026-10-24 and the claim confirmed; the take itself verified the store toggle, the priced product row and the "Store opened" toast live on staging.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Online store, 0% commission, Lite and up | lib/tier-cards.ts | Lite feature line "Online store - sell photos from your galleries, 0% commission - 1 price list". Confirmed. |
| Buy buttons live on galleries with an active price list | components/store-home.tsx | Status card copy and toggleStore toast ("Store opened - Buy buttons are live on your galleries."). Confirmed on film. |
| Prints priced per variant with cost, markup and price | components/commerce-price-list-editor.tsx | Editor renders Your cost / Price / Markup / Status per variant. Confirmed on film. |
| Payouts land in the studio's own Stripe account | components/payouts-panel.tsx | "Stripe Connect onboarding (the studio's own Stripe account)". Copy only - the reel never shows a connected payout. |
| You keep 100% of sales | lib/tier-cards.ts | Same 0% commission line backing the hook. |

Not claimed anywhere: that payouts are connected on the demo org, that Snap handles print fulfilment, or that the store is on the Free plan.

## Known blemishes

- The demo org holds two price lists named "Wedding" (one empty) from a fixture re-run; the filmed list is the populated one, and the store-home shot at the end shows two USD rows.
- The reel does not show the "Preview as client" store view (it opens a new tab the capture cannot follow); the payoff is the store-open toast instead.
- No soundtrack version (see Audio).
