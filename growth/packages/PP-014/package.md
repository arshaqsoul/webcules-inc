# Reel package: PP-014

This is what the founder posts once the reel exists.
The packager filled it in and checked every field.
Status: SCRIPTED, not yet recorded. Storyboard, take spec and claims are final; the record, edit, music and QC passes run through the standard pipeline (recorder next).

## Files

- Storyboard: `growth/storyboards/PP-014.md` (passed `reel.mjs check` on 2026-11-03)
- Take: `growth/storyboards/PP-014.take.mjs` (passed `reel.mjs check` on 2026-11-03)
- Reel: `growth/packages/PP-014/reel.mp4` - pending record
- Cover: `growth/packages/PP-014/cover.png` - pending edit
- QC report: `growth/packages/PP-014/qc.json` - pending QC

## Take spec

- Recording target: `https://staging.snaphq.app` with the staging lock held (`lock.mjs acquire staging --by designer-PP-014`).
- No email in this take, `sendsEmail = false`.
- Fixtures through the app UI only: demo org "Amara & Oak Photography" on Studio (white-label entitled), no logo uploaded before the take; a prepared demo logo (not a real client brand) staged in `growth/assets/PP-014/`.
- Constraints honored: founder's real gmail never in frames; no `snap-staging.webcules.com` URL on screen; watermark `snaphq.app` (the reel's own mark - the in-product gallery watermark is the demo logo).
- Teardown: white-label off, watermark mode off, demo logo removed through the UI; revert the plan if it was flipped.

## Caption (paste as is)

Your logo lives in one field while everything else ships generic?

Drop your logo into Settings - Brand once. Snap generates the favicon, email header, OG card and gallery watermark from that one file.
Then flip Remove Snap branding: galleries, emails and invoices carry your name only.
It is not magic: white-label and watermarks are Studio ($29/mo) and up.

Make it all yours at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #branding #photographerbrand #photographybusiness #whiteLabelPhotographer #photographerworkflow #clientgalleries

## Audio

Pending the edit: the reel will carry synthesised sound effects (clicks, captions, the end chime) so it can be posted as is.
Captions carry every step for viewers who scroll with sound off.
Suggested trend ids from `growth/trends/`: none.

## Tier tag

Studio ($29/mo) and up - white-label, generated brand assets and watermarks are Studio features. Stated in the end card note and the caption's honesty line.

## When to post

Suggested: Wednesday 2026-11-18, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: brand-aesthetic content closes the batch; sits two days after PP-013 and keeps the every-2-3-days rhythm.
This is a judgment call, not measured data.

## Posting order

Post FOURTH of PP-011..014: PP-011 (Tue 2026-11-10), PP-012 (Thu 2026-11-13), PP-013 (Mon 2026-11-16), then this one (Wed 2026-11-18).
Post at least two days after PP-008 (same Studio tier, badge-removal angle) if PP-008 is still circulating - this reel is the asset-generation angle, not the badge angle, and the two must not run adjacent.
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-014
Pinned first comment: White-label is part of Studio ($29/mo): one logo upload generates the favicon, email header, OG card and gallery watermark, and the Snap wordmark comes off your galleries, emails and invoices. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about rebranding: "How long did the full asset set take you - favicon to watermarks?"
  - On a post about client-facing polish: "Where does your brand actually show up for clients - gallery, invoices, emails, all three?"
  - On a post about platform watermarks: "Do you leave theirs on or overlay your own?"

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each source file was re-opened on 2026-11-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| One logo generates favicon, apple-touch icon, email header, OG card and watermark source | apps/snap/components/brand-asset-generator.ts | WEB-239 header: "one logo becomes favicon + apple-touch + email header + OG card + watermark source"; runs at logo save. Confirmed. |
| Bundle generates on demand and automatically after a logo upload | apps/snap/components/settings-brand.tsx | "Runs on demand (button) and automatically after a logo upload". Confirmed. |
| Watermark modes off, corner, tiled, text with a live preview | apps/snap/components/settings-brand.tsx, apps/snap/components/watermark-card.tsx | WatermarkCard state (mode/opacity/scale/margin/text) and the preview canvas. Confirmed. |
| Remove Snap branding from galleries, emails, invoices | apps/snap/components/white-label-card.tsx, apps/snap/lib/tier-cards.ts | WEB-244 card toggle "Remove Snap branding"; Studio card "Remove Snap branding - galleries, emails, invoices". Confirmed. |
| White-label and watermarks are Studio and up | apps/snap/lib/plans-data.ts | whiteLabel: false on Free/Lite, true on Studio/Pro. Confirmed. |

Not claimed anywhere: print packaging, lab product branding, or custom domains as part of the brand kit (domains are a separate Pro/add-on line).

## Known blemishes

- Overlap with PP-008: that reel already shows the platform badge disappearing on a Studio-tier gallery. This reel's on-camera beats are the generation and watermark (WEB-239/242), not the footer badge; keep PP-014 at least two days from PP-008 in the schedule.
- The generated-asset cards are small UI surfaces; the zoom in step 2 must land tight or a pause reads as a blank panel.
- The demo logo is a prepared stand-in, not a real brand; the storyboard forbids any real client brand on camera.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-014 MEASURED --by analyst --set metrics.views=...`.
