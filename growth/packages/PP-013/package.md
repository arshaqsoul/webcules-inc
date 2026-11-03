# Reel package: PP-013

This is what the founder posts once the reel exists.
The packager filled it in and checked every field.
Status: SCRIPTED, not yet recorded. Storyboard, take spec and claims are final; the record, edit, music and QC passes run through the standard pipeline (recorder next).

## Files

- Storyboard: `growth/storyboards/PP-013.md` (passed `reel.mjs check` on 2026-11-03)
- Take: `growth/storyboards/PP-013.take.mjs` (passed `reel.mjs check` on 2026-11-03)
- Reel: `growth/packages/PP-013/reel.mp4` - pending record
- Cover: `growth/packages/PP-013/cover.png` - pending edit
- QC report: `growth/packages/PP-013/qc.json` - pending QC

## Take spec

- Recording target: `https://staging.snaphq.app` with the staging lock held (`lock.mjs acquire staging --by designer-PP-013`).
- `sendsEmail = true`; the only recipient is `second@example.com` (add it to the recording environment's `GROWTH_SAFE_EMAILS` before the take). The inbox is never opened on screen - the proof is the "Invite sent" notice and the pending row.
- Fixtures through the app UI only: demo org "Amara & Oak Photography" on Studio (3 seats), owner session, no pending invites before the take.
- Constraints honored: founder's real gmail never typed or shown; no `snap-staging.webcules.com` URL on screen; watermark `snaphq.app`.
- Teardown: cancel the pending invite through the UI; revert the plan if it was flipped.

## Caption (paste as is)

Run a two-photographer studio out of one shared login?

Snap has a real team page: invite your second shooter with an email, give them a role, and every membership change is audited. Nobody shares a password.
Seats are honest: three on Studio ($29/mo), ten on Pro - bigger teams and permissions are priced to fit.

Bring your studio to snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #secondshooter #photographystudio #photographybusiness #photographerworkflow #teamwork #smallbusinessowner

## Audio

Pending the edit: the reel will carry synthesised sound effects (clicks, captions, the end chime) so it can be posted as is.
Captions carry every step for viewers who scroll with sound off.
Suggested trend ids from `growth/trends/`: none.

## Tier tag

Studio ($29/mo, 3 seats) on camera; Pro (10 seats, Teams & permissions, priced to fit) in the end card note and the caption.

## When to post

Suggested: Monday 2026-11-16, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: studio-ops content lands early in the week when owners plan the shooting week; sits three days after PP-012.
This is a judgment call, not measured data.

## Posting order

Post THIRD of PP-011..014: PP-011 (Tue 2026-11-10), PP-012 (Thu 2026-11-13), then this one (Mon 2026-11-16), then PP-014 (Wed 2026-11-18).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-013
Pinned first comment: Team seats ship with Studio ($29/mo, 3 seats); Pro gets 10 seats plus Teams & permissions, priced to fit. Roles are Owner, Admin, Member and changes are audited. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about second shooters: "Do you bring them onto your CRM or just share the gallery folder?"
  - On a post about studio admin: "How do you handle logins when someone joins or leaves?"
  - On a post about hiring an associate: "What does their access look like on day one?"

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each source file was re-opened on 2026-11-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Member list, invites, role changes; owner/admin-gated, seat-gated, audited | apps/snap/components/settings-team.tsx | WEB-275 header: "member list, invites, role changes... owner/admin-gated, seat-gated, audited". Confirmed. |
| Roles: Owner, Admin, Member with plain-language scope | apps/snap/components/settings-team.tsx | ROLE_COPY lines rendered on the card. Confirmed. |
| Seats: Free/Lite 1, Studio 3, Pro 10 | apps/snap/lib/plans-data.ts | maxTeamSeats per tier (1/1/3/10). Confirmed. |
| Teams & permissions on Pro, priced to fit | apps/snap/lib/tier-cards.ts | Pro card "Teams & permissions"; TEAMS_CTA "Teams, multiple photographers or 1 TB+?... priced to fit". Confirmed. |
| Members can be granted RAW Vault access per studio | apps/snap/components/settings-team.tsx, apps/snap/app/dashboard/raw-vault/page.tsx | "Members can open the RAW Vault" toggle; canAccessRawVault gate (WEB-275). Confirmed. |

Not claimed anywhere: per-shoot assignment, shoot-level permissions, or time tracking (the UI shows Owner/Admin/Member roles only).

## Known blemishes

- WEBC-110's audit note said "multi-photographer studios supported on the Pro tier"; the code is more generous - seats exist on Studio (3) and Pro (10), and only the Pro card advertises "Teams & permissions". The packages follow the code (growth rule 6); the caption says three on Studio, ten on Pro.
- The invited second shooter never appears as a member on camera (accepting the invite is off-screen); the payoff is the pending row with its role and expiry. Honest, but a pause shows the team at one member plus one invite.
- `second@example.com` must be added to `GROWTH_SAFE_EMAILS` in the recording environment before the take, or `reel.mjs check` and the recorder will refuse the take.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-013 MEASURED --by analyst --set metrics.views=...`.
