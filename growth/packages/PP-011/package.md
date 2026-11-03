# Reel package: PP-011

This is what the founder posts once the reel exists.
The packager filled it in and checked every field.
Status: SCRIPTED, not yet recorded. Storyboard, take spec and claims are final; the record, edit, music and QC passes run through the standard pipeline (designer done, recorder next).

## Files

- Storyboard: `growth/storyboards/PP-011.md` (passed `reel.mjs check` on 2026-11-03)
- Take: `growth/storyboards/PP-011.take.mjs` (passed `reel.mjs check` on 2026-11-03)
- Reel: `growth/packages/PP-011/reel.mp4` - pending record
- Cover: `growth/packages/PP-011/cover.png` - pending edit
- QC report: `growth/packages/PP-011/qc.json` - pending QC

## Take spec

- Recording target: `https://staging.snaphq.app` with the staging lock held (`lock.mjs acquire staging --by designer-PP-011`).
- No email in this take, `sendsEmail = false`.
- Fixtures through the app UI only: demo org "Amara & Oak Photography" on Lite for the take (revert after), wedding gallery "Willow Creek Estate Wedding", a connected Stripe so no payouts banner crosses the frame.
- Constraints honored: only `client@example.com` / `GROWTH_SAFE_EMAILS` addresses ever appear; no founder gmail in any frame; no `snap-staging.webcules.com` URL on screen; watermark `snaphq.app`.
- Teardown: close the store, detach, archive the product and price list through the UI.

## Caption (paste as is)

Your clients keep asking for prints. The platform wants its cut.

Snap's store: build one print price list (prints, packages, digitals), attach it to the gallery, flip the store open. Buy buttons go live and every order checks out on your own Stripe.
Snap takes 0%. Ever.
It is not magic: the store starts on Lite ($15/mo) with one price list; Studio unlocks five, plus packages and custom products.

Open your print store at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #printsales #photographybusiness #sellingprints #photographerworkflow #clientgalleries #smallbusinessowner

## Audio

Pending the edit: the reel will carry synthesised sound effects (clicks, captions, the end chime) so it can be posted as is.
Captions carry every step for viewers who scroll with sound off.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## Tier tag

Lite and up (store starts on Lite, $15/mo, one price list; Studio unlocks five price lists, packages and custom products). Stated on screen in the end card note and in the caption's honesty line.

## When to post

Suggested: Tuesday 2026-11-10, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: print pricing questions cluster early in the week when photographers plan sales; this is the strongest differentiator of the four and leads the batch.
This is a judgment call, not measured data. You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post FIRST of PP-011..014, at least two days after the last already-scheduled reel (PP-009/PP-010 land Tue 2026-11-03 / Fri 2026-11-06).
Suggested slot: PP-011 (Tue 2026-11-10), then PP-012 (Thu 2026-11-13), PP-013 (Mon 2026-11-16), PP-014 (Wed 2026-11-18).
Do not post two reels from a young account on the same day; if the founder overrides toward a 2/day cadence, keep at least 8 hours between posts and expect the analyst to flag it.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-011
Pinned first comment: The online store starts on Lite ($15/mo) with one price list - 0% commission on every order, money straight to your own Stripe. Studio unlocks five price lists, packages and custom products. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about print pricing: "Do you add a markup on top of your lab cost or price flat? I have been testing both."
  - On a post complaining about platform commission: "Same. I moved my store to one where the money never touches the platform."
  - On a post about selling albums: "Do you sell albums from the gallery or after a reveal call?"

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each source file was re-opened on 2026-11-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Online store on Lite, 0% commission, 1 price list | apps/snap/lib/tier-cards.ts | Lite features: "Online store - sell photos from your galleries, 0% commission · 1 price list". Confirmed. |
| Studio: 5 price lists, packages and custom products | apps/snap/lib/tier-cards.ts | Studio features: "Store power - 5 price lists, packages & custom products". Confirmed. |
| Money to the studio's own Stripe, no application fee | apps/snap/lib/repos/checkout.ts, apps/snap/lib/db-schema.ts | checkout service: "NO APPLICATION FEE - DIRECT CHARGE ONLY... exactly like booking checkout (WEB-352)"; checkout_sessions table comment matches. Confirmed. |
| 0% commission, ever | apps/snap/components/landing/faq.tsx | FAQ: "Does Snap really take 0% commission?". Confirmed. |
| Product kinds: Digital, Print, Package, Custom; variants; bulk markup | apps/snap/components/commerce-price-list-editor.tsx | KIND_LABELS map and the editor's product/variant CRUD + markup. Confirmed. |
| Attach a price list to a gallery; Buy buttons follow the active list | apps/snap/components/store-home.tsx | attach flow with the "Attached" toast; the open/closed copy "Buy buttons are live on every gallery with an active price list". Confirmed as studio-side copy. |
| Client store preview in the studio's colors, ordering disabled | apps/snap/app/dashboard/store/preview/page.tsx, apps/snap/lib/store-preview.ts | WEB-277 preview session; preview_refused on cart/checkout writes. Confirmed. |

Not claimed anywhere: that a guest can complete a purchase today (see Known blemishes), that Snap prints or ships products, or that lab fulfilment is included.

## Known blemishes

- PRODUCT GAP (file this before recording): the guest-facing Buy button inside a shared gallery link (`/g/{token}`) is not rendered on master yet. The store toggle's own copy says Buy buttons go live, but a guest opening the gallery sees no buy surface - the carts and checkout services exist (WEB-170/WEB-168), the gallery-integrated buy UI does not. Per growth rule 6 this is a product bug to file, not to paper over: the reel stays studio-side plus the client preview, and the checkout leg needs a re-take once the guest store ships.
- The client preview shows "Preview only" buttons (ordering disabled by design, WEB-277); a paused frame can read them. The storyboard forbids framing them as live checkout.
- The competitor wound (free-plan commission up to 15% per docs/SNAP-COMMERCE-ANALYSIS.md) is paraphrased only - no platform name or percentage on screen.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-011 MEASURED --by analyst --set metrics.views=...`.
