# Reel package: PP-010

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-010/reel.mp4`
- Cover: `growth/packages/PP-010/cover.png`
- QC report: `growth/packages/PP-010/qc.json`

## Caption (paste as is)

"Can you resend the gallery link?" - three months after the wedding.

Your clients get one login. They sign in with their email and a six-digit code, and everything you have ever delivered is right there: galleries, invoices, contracts.
No expired links, no re-sending files, no support emails at 11pm.
It is not magic: the client portal is free, and studios only ever see their own clients.

Give clients one place at snap.webcules.com

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #clientportal #clientgallery #photographerworkflow #smallbusinessowner #clientexperience

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Tuesday 2026-11-03, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: portal and client-experience content pairs with the delivery reels that precede it; a Tuesday evening keeps the established rhythm.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER PP-009 (Tue 2026-11-03) only if PP-009 moves, otherwise next slot after it.
Suggested slot: ninth or tenth post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), PP-002 (Fri 2026-10-09), PP-001 (Tue 2026-10-13), PP-005 (Tue 2026-10-20), PP-006 (Fri 2026-10-23), PP-010 (Tue 2026-10-27), PP-008 (Fri 2026-10-30), then PP-009 and this one on the next two slots (Tue 2026-11-03 and Fri 2026-11-06, in either order).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-010
Pinned first comment: The client portal is free and every studio only sees its own clients. Your clients sign in with their email and a code we email them. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about resend requests: "Mine stopped when clients got one login instead of five links."
  - On a post about client experience: "The portal became my brand moment - my logo, my gallery, my invoice, one place."
  - On a post about Dropbox delivery: "What do you do when the link expires mid-planning? A portal took that worry away."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-04 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Clients sign in with a magic code | apps/snap/components/portal-login.tsx | WEB-131: email step, 6-digit code step, "Open my portal"; the code is emailed and expires (10 minutes on screen). Confirmed on film. |
| The portal lists every studio the client uses | apps/snap/app/portal/page.tsx | "Your studios" renders one section per client record for the session email, with per-studio stats and project links. Confirmed on film. |
| Studios only see their own clients | apps/snap/lib/portal.ts | `getClientRows` starts from client rows for the session email; WEB-130 cross-studio isolation comment. Confirmed. |
| The client portal is free | apps/snap/lib/plans-data.ts | No portal gate in the plan entitlements; the Free tier card advertises the unified client experience. Confirmed. |

Not claimed anywhere: that galleries live forever in the portal (grants follow the expiry the studio sets), that Snap answers client messages automatically, or that the portal replaces the photographer's own website.

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment.
- The demo data is seeded: studio "Amara & Oak Photography" with the wedding project "Daniel & Priya - Willow Creek Estate Wedding", and the demo client "Nora Example" (client@example.com) as the portal identity.
- Environment prep: the portal matches client records by email, so the operator points the seeded wedding client row at the demo client address before the take and restores it after (local database only). On a staging re-record, use the real client's safe address.
- The portal section shows "0 Active galleries" because the takes revoke their demo grants at teardown; a gallery live for the client would count there.
- The signed-in email line is partially covered by the resting cursor at the payoff.
- The reel runs 22.8 s: inside the 20-30 s target.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-010 MEASURED --by analyst --set metrics.views=...`.
