# Reel package: PP-006

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-006/reel.mp4`
- Cover: `growth/packages/PP-006/cover.png`
- QC report: `growth/packages/PP-006/qc.json`

## Caption (paste as is)

Still chasing wedding clients for a signature?

Build the agreement once from a template, send it from the project, and your client signs it in their browser. The signature is timestamped with their IP, archived as a PDF and mailed to both of you.
No printing, no "just checking in" emails, no lost attachments.
It is not magic: contracts work on the Free plan (two templates); Studio lifts the template limit.

Send your next contract at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #photographercontracts #clientcontracts #photographerworkflow #smallbusinessowner #photographycrm

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Friday 2026-10-23, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: contract and paperwork content lands when photographers are sending agreements for upcoming bookings; a Friday evening keeps the established twice-weekly rhythm.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER PP-005 (Tue 2026-10-20), at least two days after it.
Suggested slot: sixth post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), PP-002 (Fri 2026-10-09), PP-001 (Tue 2026-10-13), PP-005 (Tue 2026-10-20), then this one (Fri 2026-10-23).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-006
Pinned first comment: Contracts and e-signature work on the free plan (two templates). Studio removes the template cap. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about clients ghosting before booking: "Do you send the contract before or after the retainer? I stopped chasing signatures by putting them online."
  - On a post about paperwork admin: "Typed-name e-sign with a timestamp and an automatic PDF killed my printing days."
  - On a post about DocuSign costs: "Curious what people pay for e-sign. I moved mine into the studio tool I already use."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-04 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Contracts build from reusable templates | apps/snap/components/project-contracts.tsx | The editor offers "Start from a template…" and WEB-251 copies the template text into the draft, so later template edits never reach a sent contract. Confirmed. |
| Merge fields fill at send time | apps/snap/lib/merge.ts | `CONTRACT_MERGE_FIELDS` and `renderMergeFrom` replace `{{client_name}}`-style fields from the project/client when the contract is sent; the stored body keeps the merged text. Confirmed. |
| Signing records name, time and IP | apps/snap/lib/contracts.ts | WEB-158: token-gated public signing records the typed name, signer IP, user agent and timestamp; the signing page states it to the client. Confirmed. |
| A signed PDF is archived and emailed | apps/snap/lib/contracts.ts | On sign, `renderContractPdf` archives the signed PDF to R2 and `contractSignedEmail` mails it to both parties. Confirmed. |
| Contracts work on the Free plan (caption only) | apps/snap/lib/plans-data.ts | Free `maxContractTemplates: 2`, Lite 2, Studio and above unlimited (`tier-cards.ts` advertises the lift). Confirmed. |

Not claimed anywhere: that an e-signature is legal advice, that Snap notarizes anything, that voided contracts keep working (the signing link stops), or that deposits are collected inside this flow (invoices are PP-001's reel).

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment.
- The demo data is seeded: studio "Amara & Oak Photography", project "Daniel & Priya - Willow Creek Estate Wedding", and the demo client "Nora Example" (client@example.com); the seeded signed agreement by "Priya Fernando" is demo history.
- Session and collection prices never appear in this reel; the template body text shown is the seeded wedding template.
- The client email typed in the editor is blurred by the privacy mask; on the signing page the same address stays readable inside the "Prepared for" line (it is the allowlisted demo address).
- The signing page ran without a visible Turnstile challenge on this target (the local server runs without the Turnstile secret); a staging re-record may show a verification widget.
- The reel runs 41.0 s: above the 20-30 s aim (two page navigations), safely under the 45 s hard cap.
- The take leaves its signed contract row on the demo project as history (signed rows cannot be voided by design); a re-record adds another "Nora Example" signed row.
- The template picker resets to its placeholder after a pick (by design), so the zoom shows the picker rather than the chosen name; the filled title and body carry the beat.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-006 MEASURED --by analyst --set metrics.views=...`.
