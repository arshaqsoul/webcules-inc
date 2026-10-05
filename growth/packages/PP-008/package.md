# Reel package: PP-008

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-008/reel.mp4`
- Cover: `growth/packages/PP-008/cover.png`
- QC report: `growth/packages/PP-008/qc.json`

## Caption (paste as is)

Your client lands on the gallery and sees someone else's logo.

One toggle and every client surface is yours: the badge becomes your copyright line, emails send from your name, the wordmark is gone.
White-label is part of Studio and Pro, and the card walks you through it step by step.
It is not magic: Free and Lite keep the badge; Studio and Pro remove it everywhere.

Make it yours at snap.webcules.com

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #clientgallery #photographerbrand #photographerworkflow #smallbusinessowner #studio branding

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Friday 2026-10-30, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: brand and positioning content lands late week when photographers review their stack; this is also the reel that shows what a paid tier buys, so it follows the free-tier reels that built trust.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER PP-010 (Tue 2026-10-27), at least two days after it.
Suggested slot: eighth post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), PP-002 (Fri 2026-10-09), PP-001 (Tue 2026-10-13), PP-005 (Tue 2026-10-20), PP-006 (Fri 2026-10-23), PP-010 (Tue 2026-10-27), then this one (Fri 2026-10-30).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-008
Pinned first comment: White-label is part of Studio and Pro. Free and Lite keep the badge - everything else you saw works on free. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about Pixieset/Pic-Time branding: "Do your clients ever mention the platform name? Mine did - that is why mine is invisible now."
  - On a post about custom domains: "Connected domain plus no badge - clients assume I built the whole thing myself."
  - On a post comparing gallery platforms: "What sold me was the client side having zero trace of the tool."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-04 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| The gallery badge swaps for the studio name | apps/snap/components/gallery-view.tsx | The footer renders the studio copyright line when white-label is on, and the "Delivered by Snap" SnapBadge otherwise. Confirmed on film both ways. |
| White-label needs the plan and the toggle | apps/snap/lib/branding.ts | `isWhiteLabeled` = plan entitlement (`whiteLabel` true on Studio/Pro only in plans-data.ts) AND the studio's own `removeBranding` toggle. Confirmed. |
| The setup card walks the flip | apps/snap/components/white-label-card.tsx | The white-label card shows the before/after table and a "Flip Remove Snap branding" step with the live toggle. Confirmed on film. |
| White-label is Studio and Pro | apps/snap/lib/plans-data.ts | `whiteLabel: false` on Free and Lite, `true` on Studio and Pro. Confirmed. |

Not claimed anywhere: that white-label hides Snap from the studio's own dashboard, that it includes a custom domain (domains are their own surface), or that Free and Lite can remove the badge (they cannot).

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment.
- The demo data is seeded: studio "Amara & Oak Photography" (on Studio), wedding project "Daniel & Priya - Willow Creek Estate Wedding" with its designed gallery, and the demo client "Nora Example" (client@example.com).
- The fixture mints a fresh favorites-mode grant and completes the gallery email verification before capture, so the reel starts on the client side exactly as a returning client sees it.
- The client email typed in the gallery gate is blurred by the privacy mask.
- The reel runs 31.0 s: inside the 20-30 s aim at the hard-cap edge (30 s), well under the 45 s limit.
- Teardown flips the white-label toggle back off and revokes the run's grant, so a re-record starts from the same before state.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-008 MEASURED --by analyst --set metrics.views=...`.
