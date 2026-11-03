# Reel package: PP-013

This is what the founder posts once the reel exists.
The packager filled it in and checked every field.
Status: RECORDED 2026-11-03, QC PASS (24.3 s, 1080x1920, 3.9 MB, h264 + aac). Awaiting reel QC.

## Recorded take - deviations from the storyboard (disclosed for reel QC)

None of the six scripted steps changed; one fixture-level preparation was added and one product bug was found while recording:

- The invite endpoint failed on the first attempt with "Organization not found". Root cause: Better Auth's `inviteMember` resolves the org from the session's active organization, which only signup/onboarding/studio-switcher ever set - a session that signed in through the plain login form has none, and the UI passes no `organizationId` (components/settings-team.tsx). Reads never notice because lib/session.ts falls back to the user's first membership; this write does not. Filed as WEBC-466: any returning user on a fresh sign-in cannot invite until they switch studios once. The take's fixture now calls the same Better Auth `set-active` endpoint the studio switcher calls (against the demo org id, a staging fixture constant), then reloads - i.e. the take records the state a real post-signup session has. No step, copy or claim changed.
- The recording environment's `growth/.env.local` GROWTH_SAFE_EMAILS now carries `second@example.com` alongside `client@example.com`, as the take spec required. The inbox was never opened on screen; the proof beats are the "Invite sent to second@example.com - it expires in 7 days." notice and the pending row.
- The empty invite field shows the app's own placeholder, `shooter@example.com`, in the hook frame - that is the component's placeholder text (safe example.com address), not a typed value; the typed value on camera is `second@example.com`.
- Teardown ran as scripted: the pending invite was cancelled through the UI (verified: the invitation row is `canceled` in staging D1), and the org plan was never flipped (the demo org records on its existing Studio plan).

## Files

- Storyboard: `growth/storyboards/PP-013.md` (passed `reel.mjs check` on 2026-11-03)
- Take: `growth/storyboards/PP-013.take.mjs` (passed `reel.mjs check` on 2026-11-03)
- Reel: `growth/packages/PP-013/reel.mp4` - recorded 2026-11-03 (also pushed to the R2 sync bucket)
- Cover: `growth/packages/PP-013/cover.png` - cut by the editor from the payoff beat
- QC report: `growth/packages/PP-013/qc.json` - QC PASSED

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
