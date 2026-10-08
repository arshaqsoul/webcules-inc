# Reel package: PP-003

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-003/reel.mp4`
- Cover: `growth/packages/PP-003/cover.png`
- QC report: `growth/packages/PP-003/qc.json`

## Caption (paste as is)

Your client forwarded the gallery link. Now what?

A forwarded Snap gallery link does not open for a stranger without a code that is emailed to your client.
You can set an expiry on the link, or replace it with a new one.
The old link stops working right away, and the new one goes to your client by email.
It is not magic. A client can still share a code or downloaded files, so you control the link, not what people do with it.

Try it free at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #clientgallery #galleryproofing #photographerworkflow #photographytips #smallbusinessowner

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Wednesday 2026-10-07, around 8:00 pm Eastern (5:00 pm Pacific), two days AFTER the launch reel PP-004 (suggested Monday 2026-10-05). The account is empty, so the launch reel should be the first impression.
Reasoning: wedding photographers shoot on weekends, so weekday evenings are when they sit down to edit and deliver galleries, which is when a forwarded-link worry is on their mind.
Evening Eastern is also late afternoon on the west coast, so the Canadian audience is mostly awake and off the clock.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-003
Pinned first comment: Free plan covers expiry and New link. The emailed code and the limits are as described in the caption, and I am happy to answer questions here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant wedding or gallery-delivery photographer accounts yourself and adapt the line to what they actually posted:
  - On a post about delivering a gallery: "Delivery day is the nervous part. Do you set an expiry on your gallery links, or leave them open?"
  - On a post about client gallery tools: "How do you handle a client forwarding the link on? I have been looking at how people deal with it."
  - On a post asking for workflow tips: "One thing that helped me think about this is separating who can open the link from what a client does with the files."
  - On a post about print sales or unpaid downloads: "Do you find clients share galleries more once the wedding is a few months old?"

## Claims check

Each file was re-opened on 2026-10-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Free plan covers expiry and New link | apps/snap/lib/plans-data.ts | The `free` plan exists at $0. The controls are not gated by plan in the project page or route handlers, which is how the mapper recorded the tier. |
| Expiry options No expiry, 7 days, 30 days, 90 days, 1 year on the select | apps/snap/components/project-galleries.tsx | Options list at lines 51 to 55 and the "Edit expiry" aria-label. Confirmed. |
| "New link" kills the old link immediately and emails the client | apps/snap/app/api/grants/[id]/regenerate/route.ts | Header says it mints a new token, kills the old grant immediately and emails the fresh link to the client. Confirmed. |
| Confirm text "The old link stops working immediately" | apps/snap/components/project-galleries.tsx | Line 264 confirm body. Confirmed. |
| A stranger needs a code emailed only to the client's email | apps/snap/app/g/[token]/otp/send/route.ts | Typed email must equal the grant's client email or no code is sent. Confirmed. |
| Expiry can be edited on an existing link | apps/snap/app/api/grants/[id]/route.ts | PATCH route calls `setShareGrantExpiry`. Confirmed. |

Not claimed anywhere: Revoke (not shown in the reel), that forwarding is impossible, or that the gallery is fully secure.
No plan names, prices or limits other than "free" appear in the caption.

## Notes for the founder

- The two inbox scenes in the reel were captured from an equivalent earlier run of the same flow (same email, same 7 day expiry text), not from the final recording run.
  The banner "Link emailed to the client." does appear in the final recording.
- The demo email address is your own test inbox, not a client.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-003 MEASURED --by analyst --set metrics.views=...`.
