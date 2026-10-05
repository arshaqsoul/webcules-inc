# Reel package: PP-005

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-005/reel.mp4`
- Cover: `growth/packages/PP-005/cover.png`
- QC report: `growth/packages/PP-005/qc.json`

## Caption (paste as is)

Still booking clients by email tag?

Put your booking page link in your bio. The client picks a session, sees your real openings and books a time that is actually free, in their own timezone.
The booking lands straight on your Snap calendar with a reminder email on the way, so nobody no-shows by accident.
It is not magic: booking works on the Free plan (one session type); Lite raises it to three, and every plan above that is unlimited.

Send the link at snap.webcules.com

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #bookingclients #photographerworkflow #portraitphotographer #smallbusinessowner #photographycrm

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Tuesday 2026-10-20, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: booking and scheduling content lands when photographers plan their week and untangle their inbox; a weekday evening keeps the established Tuesday/Friday rhythm.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER PP-001 (Tue 2026-10-13), at least two days after it.
Suggested slot: fifth post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), PP-002 (Fri 2026-10-09), PP-001 (Tue 2026-10-13), then this one (Tue 2026-10-20).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-005
Pinned first comment: Booking pages work on the free plan (one session type). Lite gives you three. Happy to answer questions here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about ghosted inquiries: "Do you send availability by email or point people at a booking link? Curious what people do."
  - On a post about double bookings or calendar chaos: "Putting my availability on a page clients can book ended this for me."
  - On a post about no-shows: "Reminder emails cut my no-shows roughly in half. Was a settings toggle for me."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-04 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Session types carry duration and price | apps/snap/lib/db-schema.ts | `sessionTypes` table: `slotMinutes`, `priceMinor`, `depositKind`, `depositMinor`. The page renders "60 min · $250" and "480 min · $2,800" from those columns. Confirmed. |
| The booking page shows live availability | apps/snap/app/embed/calendar/route.ts | The widget computes a month of slots per session type (`/api/embed/availability`, `computeDateSlots`), re-validates server-side on submit and guards the slot with a partial unique index (WEB-165). Confirmed. |
| Times convert to the client timezone | apps/snap/app/embed/calendar/route.ts | Slot labels read "9:00 AM · 7:00 AM your time" using the visitor's `Intl` timezone against the studio's; the header reads "times in America/New_York" when they differ. Confirmed. |
| Reminder emails go out on their own | apps/snap/lib/booking-reminders.ts | Daily sweep claims each (booking, offset) pair exactly once (`booking_reminders` dedupe), re-checks the booking is live and sends the branded reminder with an ICS attachment; defaults on at 24 h before start. Confirmed. |
| Booking works on the Free plan (caption only) | apps/snap/lib/plans-data.ts | Free `maxSessionTypes: 1`, Lite 3, above that unlimited; `tier-cards.ts` advertises "Unlimited bookings" on Free. Confirmed. |

Not claimed anywhere: that reminders prevent no-shows (they reduce them), that Snap handles the session payment here (session payment settings exist but are not this reel), or that the booking page hides your calendar from other clients.

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment.
- The demo data is seeded: studio "Amara & Oak Photography", fictional booking clients (Debra Ochoa, Sandra Glenn, David White), and the demo client "Nora Example" (client@example.com).
- Session-type prices on the booking page ($250, $2,800) are seed values, not real pricing; they back the duration-and-price claim, not a price claim.
- The demo contact email on the booking page footer and the client email in the confirmation note are blurred by the privacy mask.
- The booking widget runs in an iframe, so the recorded cursor stays an arrow over widget buttons (pointer detection does not cross frames) and the widget's Turnstile never rendered on this target; a staging re-record may show a challenge box.
- The reel runs 40.3 s: above the 20-30 s aim (navigation-heavy flow), safely under the 45 s hard cap.
- The take's fixture cancels stale demo-client bookings through the API; canceling leaves a struck "canceled" row on the calendar day, so purge canceled `client@example.com` rows locally before a re-record (`DELETE FROM booking WHERE client_email='client@example.com' AND status='canceled'`, local D1 only).

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-005 MEASURED --by analyst --set metrics.views=...`.
