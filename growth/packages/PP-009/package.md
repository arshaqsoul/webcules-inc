# Reel package: PP-009

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-009/reel.mp4`
- Cover: `growth/packages/PP-009/cover.png`
- QC report: `growth/packages/PP-009/qc.json`

## Caption (paste as is)

Your client tried three times to download the gallery and gave up.

One tap, "Everything, full resolution" - and the whole gallery is on its way, straight from the gallery itself.
No Drive links, no email attachment caps, no "can you resend it?"
It is not magic: download all is on every plan, and it never costs your client a thing.

Deliver the whole set at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #clientgallery #photodelivery #photographerworkflow #smallbusinessowner #gallerydelivery

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Tuesday 2026-11-03, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: delivery pain content lands when photographers are actually delivering fall weddings; a Tuesday evening keeps the established rhythm.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER PP-008 (Fri 2026-10-30), at least two days after it.
Suggested slot: ninth post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), PP-002 (Fri 2026-10-09), PP-001 (Tue 2026-10-13), PP-005 (Tue 2026-10-20), PP-006 (Fri 2026-10-23), PP-010 (Tue 2026-10-27), PP-008 (Fri 2026-10-30), then this one (Tue 2026-11-03).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-009
Pinned first comment: Download all works on every plan, full resolution included. Big galleries leave in parts so nothing times out. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about clients complaining about downloads: "Do your clients get the whole set in one go, or folder by folder? One-tap everything ended this for me."
  - On a post comparing gallery platforms: "Ask what the download actually feels like on the client's phone - that is the real test."
  - On a post about WeTransfer and Drive delivery: "Moved delivery into the gallery itself. The resend emails stopped."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-04 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| The download menu scopes everything or favorites | apps/snap/components/gallery-view.tsx | The menu offers "Everything · full resolution", optional web size, per-folder and "My favorites" scopes. Confirmed on film. |
| One tap starts the whole set (flash: 10 files, 7.1 MB) | apps/snap/components/gallery-view.tsx | `pullZip` fetches the manifest and starts the download at once; the flash names the file count and size. Confirmed on film. |
| Big galleries leave in parts, so nothing times out | apps/snap/app/api/g/[token]/zip/route.ts | The manifest splits into parts; multi-part galleries render the parts sheet with per-part and "Download all parts" actions. Code confirmed; the demo gallery is small enough to stay single-part, so the reel shows the one-tap path. |
| Download all on every plan (caption and end card) | apps/snap/lib/gallery-downloads.ts | WEB-267 gate table: download-all itself is on every plan; only PIN, web size and the approvals hub are tiered. Confirmed. |

Not claimed anywhere: that downloads are unlimited in size (parts bound each file set), that downloads work without the gallery link (they happen inside the grant), or that web-size and PIN controls are free (they are Lite+ and not shown).

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment.
- The demo data is seeded: studio "Amara & Oak Photography", wedding project "Daniel & Priya - Willow Creek Estate Wedding" with ten sample-pack photos, and the demo client "Nora Example" (client@example.com).
- The downloaded set is ten demo photos (7.1 MB); a real wedding gallery is larger, which is what the parts system is for - the flash beat is identical.
- The client email typed in the gallery gate is blurred by the privacy mask.
- The take starts the real browser download in the recording browser (headless, invisible on film); only the flash is shown.
- The reel runs 24.6 s: inside the 20-30 s target.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-009 MEASURED --by analyst --set metrics.views=...`.
