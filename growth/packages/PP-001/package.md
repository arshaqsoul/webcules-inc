# Reel package: PP-001

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-001/reel.mp4`
- Cover: `growth/packages/PP-001/cover.png`
- QC report: `growth/packages/PP-001/qc.json`

## Caption (paste as is)

Still chasing a deposit through email? There is a shorter way.

Snap invoices carry a secure link for your client. Pick your package preset, create the draft, hit send - the branded PDF is archived and the link is in their inbox. When the money lands, one tap marks it settled.
Payments go through your own Stripe, straight to your account. Snap takes 0% of it, ever.
It is not magic: package presets start on the Lite plan, and invoicing itself is on every plan.

Send your next invoice from snap.webcules.com

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #photographerworkflow #gettingpaid #smallbusinessowner #photographytips #clientmanagement

## Audio

Add a trending sound inside Instagram at the lowest volume that still counts, or keep it silent.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed.
Reel is silent by design, so no sound will clash with the captions.

## When to post

Suggested: Tuesday 2026-10-13, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: wedding photographers sit down with their books on weekday evenings; a "getting paid" reel lands best early in the week when invoices are going out.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER the launch reel PP-004 and PP-003, at least two days after either.
Suggested slot: fourth post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), PP-002 (Fri 2026-10-09), then this one (Tue 2026-10-13).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-001
Pinned first comment: Presets and invoices: presets start on Lite ($15/mo), invoicing works on the free plan. Happy to answer questions here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about clients paying late: "Do you invoice deposits up front or at delivery? I have been testing what gets paid faster."
  - On a post about wedding pricing and packages: "How do you split the package across deposits and the final balance?"
  - On a post about admin/workflow tools: "The invoice step was the one I kept putting off. Curious what everyone else uses."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Secure invoice links on send | apps/snap/components/project-invoices.tsx | "Numbered per studio. Sending archives a branded PDF and emails a secure link." and the send notice text. Confirmed. |
| 0% commission on client payments | apps/snap/lib/invoices.ts | WEB-174: payment link on the studio's connected account, direct charge with no platform fee. Confirmed. |
| 0% commission, ever | apps/snap/components/landing/faq.tsx | FAQ: "Does Snap really take 0% commission?". Confirmed. |
| Available on Lite | apps/snap/lib/tier-cards.ts | Lite card: "Booking page designer + invoice presets". Confirmed. |
| Package presets start on Lite | apps/snap/components/invoice-preset-editor.tsx | 403 `presets_require_lite` handled as an upsell. Confirmed. |
| Mark paid settles an invoice (caption only) | apps/snap/components/project-invoices.tsx | `act(id, "paid")` with the "Mark paid?" confirm. Confirmed. |

Not claimed anywhere: that Snap collects or holds client money (it never does; direct charge), the Stripe checkout page, or payment automations (Studio).

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment. Staging runs OTP mode on; nothing in the reel shows an environment difference.
- The demo data is seeded: studio "Amara & Oak Photography", client "Nora & Elias Example" (client@example.com), project "Autumn Winds Shoot" with licensed stock photos.
- Older demo invoice rows (one sent, two paid) from earlier takes are visible in the list during the wide shots; the reel acts only on its own invoice (0008).
- The paid chip payoff zooms on a small green chip; a pause on a phone screen is readable but small.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-001 MEASURED --by analyst --set metrics.views=...`.
