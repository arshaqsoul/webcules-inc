# Reel package: PP-002

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-002/reel.mp4`
- Cover: `growth/packages/PP-002/cover.png`
- QC report: `growth/packages/PP-002/qc.json`

## Caption (paste as is)

The album is designed and your client will not pick photos.

Share the gallery in selection mode: the client taps a check on the photos they want, sees their own counter against your limit, and sends the picks from the gallery itself. No chat screenshots, no filename lists.
The selection lands straight on the gallery row in your project, and View picks shows exactly what they chose. Set a deadline so the date is on screen while they browse.
It is not magic: selection mode is on every plan; the nudge button and favorites exports start on Lite and Studio.

Let them pick at snap.webcules.com

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #clientgallery #albumdesign #photographerworkflow #photographytips #proofing

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Friday 2026-10-09, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: album selection conversations happen on weekend-adjacent evenings, after delivery and before the weekend shoot; Friday evening catches photographers planning their Monday follow-ups.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER the launch reel PP-004 and PP-003, at least two days after either.
Suggested slot: third post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), then this one (Fri 2026-10-09); PP-001 follows (Tue 2026-10-13).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-002
Pinned first comment: Selection mode with limits and deadlines works on every plan. Nudges and favorites exports start on Lite. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about album delays: "How long do you give clients to pick album images before you design with your own picks?"
  - On a post about client communication overload: "Do your clients send picks by chat or in the gallery? Curious what people do."
  - On a post about galleries and delivery: "Setting a pick deadline inside the gallery changed this for me."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Clients pick right in the gallery | apps/snap/components/gallery-view.tsx | Pick controls with "Add <filename> to selection" aria-labels, the "N picked of X allowed" dock and the "Selection sent to your photographer" flash. Confirmed. |
| Selection mode with a pick limit and a deadline | apps/snap/components/project-galleries.tsx | "Client picks" select (favorites/selection/off), "Max picks" and "Pick deadline" inputs; the row reads "Awaiting selection (max N) . due <date>". Confirmed. |
| The selection lands in the project | apps/snap/app/api/g/[token]/selection/route.ts | POST validates grant, mode, deadline and limit, replaces the earlier submission, notifies the studio. Confirmed. |
| Selection status shows on the gallery row | apps/snap/components/project-galleries.tsx | "Selection in: N picked of X . <date>" plus the "View picks" button and the "Client picks" dialog. Confirmed. |
| Nudge gentle reminders on Lite (caption only) | apps/snap/app/dashboard/projects/[id]/page.tsx | canNudge and canView gate the nudge and activity surfaces to paid tiers. Confirmed. |
| Favorites lists and exports on paid tiers (caption only) | apps/snap/app/api/grants/[id]/favorites/export/route.ts | 403 `exports_require_studio` below Studio. Confirmed. |

Not claimed anywhere: that selection mode itself is paid (it is on every plan in code), watermarks, deterrents, or that picks can be forced.

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment.
- The demo data is seeded: studio "Amara & Oak Photography", client "Nora & Elias Example" (client@example.com), project "Autumn Winds Shoot" with licensed stock photos (two are moody lifestyle shots rather than wedding subjects).
- The gallery's email verification (OTP) was completed before capture, as a real client's first open is; the reel then opens the link directly, the way a returning client sees it.
- The "Selection sent" confirmation auto-dismisses after four seconds, so the camera moves to the dock's "Update selection" state for the last beat of that step.
- The picks panel payoff is a small dialog at 2.2x; readable on a phone, small on the cover.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-002 MEASURED --by analyst --set metrics.views=...`.
