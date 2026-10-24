# Reel package: PP-012

This is what the founder posts.
The packager fills it in and checks every field.

## Files

- Reel: `growth/packages/PP-012/reel.mp4`
- Cover: `growth/packages/PP-012/cover.png`
- QC report: `growth/packages/PP-012/qc.json`

## Caption (paste as is)

Your RAWs deserve better than a Dropbox folder nobody trusts.
Snap's RAW Vault keeps every RAW hot for 6 months, then moves it to low-cost cold storage - downloadable anytime, back in one click, and nothing is ever deleted without two emailed warnings first. Your JPGs are never touched. The Free plan includes a 3 GB RAW trial.
Try the RAW Vault free at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #rawfiles #photographybusiness #photographerworkflow #backupstrategy #photostorage

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none (the trend log is empty, so no trend is claimed, and any sound you add is your own call).

No soundtrack version exists: the ComfyUI music server was unreachable from the recording runtime. It can be made later with `reel.mjs music PP-012 --style ethereal --sfx light`.

## When to post

Suggested: Friday 2026-11-13, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: backup-anxiety content does well at week's end when photographers cull and archive shoots; keeps the twice-weekly rhythm after PP-011.

## Posting order

Post AFTER PP-011 (Tue 2026-11-10), three days later.
Free-tier hook (RAW trial) right after the paid-tier store reel widens the funnel.
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-012
Pinned first comment: RAWs stay hot for 6 months, then cold storage - always restorable, never deleted without two emailed warnings. The Free plan includes a 3 GB RAW trial. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about backup fear: "My RAWs finally have a date and a warning before anything happens to them."
  - On a post about Dropbox chaos: "Cold storage with a one-click restore replaced my cobbled-together RAW archive."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each cited file was re-opened on 2026-10-24 and the claim confirmed; the take verified the vault cards, the dated Next cell and the "kept hot for 6 more months" payoff live on staging.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| RAW files stay hot for 6 months, then move to cold storage | app/dashboard/raw-vault/page.tsx | Page copy: "RAW files stay hot for 6 months, then move to low-cost cold storage". Confirmed. |
| Cold files are downloadable anytime, restorable in one click | components/raw-vault-panel.tsx | Cold storage card copy and the Restore / keep hot action. Confirmed on film. |
| Nothing deletes without two emailed warnings | components/raw-vault-panel.tsx | "Only after two emailed warnings. Restoring stops the clock." Confirmed. |
| JPGs are never touched | app/dashboard/raw-vault/page.tsx | "JPGs are never touched." Confirmed. |
| 3 GB RAW trial on Free | lib/tier-cards.ts | Free card: "20 GB storage (incl. 3 GB RAW trial)". Confirmed. |

Not claimed anywhere: client delivery of RAWs through links or codes (the vault is storage lifecycle, not delivery), unlimited RAW on Free (that is Lite: "Unlimited RAW Vault - no more 3 GB trial"), or that cold storage is free.

## Known blemishes

- The RAW files on film are two small synthetic .DNG uploads the fixture seeded through the app's own upload API and deleted again in teardown - real uploads, demo payload, so the "0.0GB" size reads small on screen.
- The filmed project row is titled "Nora Example - Wedding" (staging seed data); nothing private is shown.
- No soundtrack version (see Audio).
