# Reel package: PP-012

This is what the founder posts once the reel exists.
The packager filled it in and checked every field.
Status: SCRIPTED, not yet recorded. Storyboard, take spec and claims are final; the record, edit, music and QC passes run through the standard pipeline (recorder next).

## Files

- Storyboard: `growth/storyboards/PP-012.md` (passed `reel.mjs check` on 2026-11-03)
- Take: `growth/storyboards/PP-012.take.mjs` (passed `reel.mjs check` on 2026-11-03)
- Reel: `growth/packages/PP-012/reel.mp4` - pending record
- Cover: `growth/packages/PP-012/cover.png` - pending edit
- QC report: `growth/packages/PP-012/qc.json` - pending QC

## Take spec

- Recording target: the local production-shape dev server (`GROWTH_STAGING_URL=http://localhost:5173`, same code as staging), PP-010 precedent - the gallery OTP email is captured to disk on the local target and never delivered. A staging record becomes possible only when staging gains an email capture.
- `sendsEmail = true`; the only recipient is `client@example.com` (in `GROWTH_SAFE_EMAILS`). The operator points the seeded client row at it before the take and restores it after.
- Fixtures through the app UI only: demo org "Amara & Oak Photography" on Free, wedding project "Willow Creek Estate Wedding", two or three small staged RAW files in `growth/assets/PP-012/`.
- Constraints honored: founder's real gmail never in frames; the OTP value is typed but never readable; no `snap-staging.webcules.com` URL on screen; watermark `snaphq.app`.
- Teardown: the operator restores the seeded client email; the session is the demo client's own; the RAWs stay or go through the UI.

## Caption (paste as is)

Sending client RAWs through a link that dies in 7 days?

Upload the RAWs with the rest of the wedding. Snap's RAW Vault keeps them hot for 6 months, then moves them to cold storage - restorable any time, never deleted without repeated emailed warnings.
Your client opens the gallery, verifies with their email and a 6-digit code, and pulls the full set themselves.
It is not magic: Free carries a 3 GB RAW trial; Lite ($15/mo) makes the vault unlimited.

Retire the file-transfer links at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #rawfiles #photographerworkflow #photographybusiness #clientdelivery #backupyourwork #smallbusinessowner

## Audio

Pending the edit: the reel will carry synthesised sound effects (clicks, captions, the end chime) so it can be posted as is.
Captions carry every step for viewers who scroll with sound off.
Suggested trend ids from `growth/trends/`: none.

## Tier tag

Free tier on camera (3 GB RAW trial), unlimited RAW Vault called out for Lite ($15/mo) in the end card note and the caption's honesty line.

## When to post

Suggested: Thursday 2026-11-13, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: backup and delivery anxiety content performs mid-week; this follows the print-store reel by three days.
This is a judgment call, not measured data.

## Posting order

Post SECOND of PP-011..014: PP-011 (Tue 2026-11-10), then this one (Thu 2026-11-13), then PP-013 (Mon 2026-11-16), PP-014 (Wed 2026-11-18).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-012
Pinned first comment: The RAW Vault ships with a 3 GB RAW trial on the free plan; Lite ($15/mo) makes it unlimited. Your clients verify with their email and a code - no more expiring links. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about culling on the road: "Do you offload RAWs nightly or trust one card until home?"
  - On a post about client RAW requests: "Do you hand those over, and how?"
  - On a post about backup fear: "What is your 3-2-1 actually looking like this season?"

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each source file was re-opened on 2026-11-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| RAW uploads (.cr2 .cr3 .nef .arw .dng .rwl) tracked in the vault | apps/snap/components/raw-vault-panel.tsx | Empty-state copy lists exactly those extensions. Confirmed. |
| Hot 6 months, then cold; restorable; never deleted without repeated emailed warnings | apps/snap/app/dashboard/raw-vault/page.tsx, apps/snap/lib/vault.ts | Page subtitle and the vault lifecycle (hotDeadline, archive/purge warning emails). Confirmed. |
| Free: 3 GB RAW trial; Lite: unlimited RAW | apps/snap/lib/tier-cards.ts, apps/snap/lib/plans-data.ts | Free card "20 GB storage (incl. 3 GB RAW trial)", Lite "Unlimited RAW Vault"; rawTrialBytes 3 GB on free, null (unlimited) on paid. Confirmed. |
| Client verifies by email + 6-digit code before the gallery opens | apps/snap/components/gallery-view.tsx, apps/snap/app/g/[token]/otp/verify/route.ts | GalleryGate "Verify it's you" flow; OTP verify mints the grant-scoped cookie. Confirmed. |
| Downloads gated by the studio's settings (PIN option) | apps/snap/lib/gallery-downloads.ts, apps/snap/app/api/g/[token]/download-request/verify/route.ts | WEB-261 PIN hash, capped attempts, remembered-per-client cookie. Confirmed. |
| One-click Download all, any gallery size | apps/snap/lib/tier-cards.ts | Free card: "One-click Download all for clients - any gallery size, starts instantly". Confirmed. |

Not claimed anywhere: that RAWs stay free of storage-quota pressure beyond the stated numbers, that Snap edits or culls RAWs, or any storage price beyond the tier cards.

## Known blemishes

- The OTP leg records against the local dev server, not staging (email capture does not exist on staging); nothing on screen shows an environment difference - same approach PP-010 shipped with, disclosed here for honesty.
- The uploaded RAW files are small staged stand-ins (a few MB), not real wedding cards; the 3 GB trial number on screen comes from the plan state, not the upload size.
- The demo client email row is flipped by the operator before the take (environment plumbing, PP-010 pattern); a staging re-record would use the studio's real client safe address.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-012 MEASURED --by analyst --set metrics.views=...`.
