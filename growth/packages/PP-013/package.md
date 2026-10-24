# Reel package: PP-013

This is what the founder posts.
The packager fills it in and checks every field.

## Files

- Reel: `growth/packages/PP-013/reel.mp4`
- Cover: `growth/packages/PP-013/cover.png`
- QC report: `growth/packages/PP-013/qc.json`

## Caption (paste as is)

Your second shooter should not have your password.
Snap studios run on real roles: owners handle billing, admins run the studio, members shoot and deliver - no settings, no money, no shared login. Invites expire in 7 days, and members stay out of the RAW Vault unless you say otherwise. Teams come with Pro.
Running a multi-photographer studio? Talk to us at snaphq.app

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #secondshooter #photographystudio #photographybusiness #photographerworkflow #studiolife

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none (the trend log is empty, so no trend is claimed, and any sound you add is your own call).

No soundtrack version exists: the ComfyUI music server was unreachable from the recording runtime. It can be made later with `reel.mjs music PP-013 --style ethereal --sfx light`.

## When to post

Suggested: Tuesday 2026-11-17, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: studio-owner content (hiring, roles) performs early in the week; follows PP-012 by four days.

## Posting order

Post AFTER PP-012 (Fri 2026-11-13), next slot Tue 2026-11-17.
PP-014 follows on Fri 2026-11-20.
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snaphq.app/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-013
Pinned first comment: Roles are real: members get shoots and galleries, never settings or money. Invites expire in 7 days. Teams come with Pro - talk to us. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about second shooters: "My second shooter gets their own login now - the shared password era is over."
  - On a post about studio admin: "Admin vs member roles meant I stopped screenshotting invoices for my team."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each cited file was re-opened on 2026-10-24 and the claim confirmed; the take verified the invite notice, the pending invite row and the RAW-vault toggle live on staging.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Roles: Owner, Admin, Member with real limits | components/settings-team.tsx | ROLE_COPY: "Member - shoots, galleries, no settings or money". Confirmed on film. |
| Invites expire in 7 days | components/settings-team.tsx | Invite notice copy. Confirmed on film. |
| Members cannot open the RAW Vault unless the owner opts them in | components/settings-team.tsx and app/dashboard/raw-vault/page.tsx | WEB-275 gate: canAccessRawVault(role, memberRawAccess), toggle "Off by default". Confirmed. |
| Teams and permissions are on the Pro tier | lib/tier-cards.ts | Pro card: "Teams & permissions". Confirmed. |
| Pro is priced by arrangement, not self-serve | lib/tier-cards.ts | WEB-329: Pro is sales-assigned, "Talk to us" CTA. The reel quotes no price. |
| The Studio plan already includes team seats (shown on screen) | app/dashboard/settings/team/page.tsx | seatsTotal comes from plan entitlements; the demo org shows "2 of 3 seats - Studio plan". |

Not claimed anywhere: a price for Pro, unlimited seats on any tier, or that members can be billed per seat.

## Known blemishes

- The demo org is on the Studio plan, so the header reads "Studio plan" while the end card sells Teams on Pro; the caption and claims cover this honestly (Studio already includes seats, Pro is the full teams package).
- The invited address is the safe demo address (client@example.com); every other email on screen is blurred.
- The invite email itself is real but lands at example.com; nobody reads it.
- No soundtrack version (see Audio).
