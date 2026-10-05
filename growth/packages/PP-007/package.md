# Reel package: PP-007

This is what the founder posts.
The packager filled it in and checked every field.

## Files

- Reel: `growth/packages/PP-007/reel.mp4`
- Cover: `growth/packages/PP-007/cover.png`
- QC report: `growth/packages/PP-007/qc.json`

## Caption (paste as is)

Your inquiries live in five inboxes and one of them always wins.

Every inquiry lands in one Leads list: contact form, booking page, or typed in by hand. The record keeps the conversation, the shoot type and the date, and one dialog turns the winner into a booked project.
No spreadsheet, no lost DMs, no "sorry, I never saw this".
It is not magic: leads and the unified inbox are on the Free plan.

Gather your inquiries at snap.webcules.com

## Hashtags (paste as the first comment or at the end)

#weddingphotographer #photographybusiness #photographycrm #leadmanagement #photographerworkflow #smallbusinessowner #clientmanagement

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Suggested: Tuesday 2026-10-27, around 8:00 pm Eastern (5:00 pm Pacific).
Reasoning: CRM content lands when photographers sit down to chase inquiries at the start of the week; Tuesday keeps the established rhythm.
This is a judgment call, not measured data, because the account has no history yet.
You can override it, and the analyst will compare results after 48 hours.

## Posting order

Post AFTER PP-006 (Fri 2026-10-23), at least two days after it.
Suggested slot: seventh post - PP-004 (Mon 2026-10-05), PP-003 (Wed 2026-10-07), PP-002 (Fri 2026-10-09), PP-001 (Tue 2026-10-13), PP-005 (Tue 2026-10-20), PP-006 (Fri 2026-10-23), then this one (Tue 2026-10-27).
Do not post two reels from a young account on the same day.

## Link and call to action

Link in bio points to: https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-007
Pinned first comment: Leads and the unified inbox are on the free plan. One contact form embed included; more on paid tiers. Questions welcome here.

## Engagement plan (human actions only)

- Reply to every comment in the first hour.
- Photographer accounts worth commenting on genuinely (drafted, not sent).
  No private individuals are named.
  Pick relevant accounts yourself and adapt the line to what they actually posted:
  - On a post about losing track of DMs: "Do you move inquiries into one list at the end of the day, or answer where they landed? One list changed this for me."
  - On a post about spreadsheets for tracking clients: "My spreadsheet days ended when an inquiry could become a project in one click."
  - On a post about slow replies costing bookings: "Curious how fast everyone replies to inquiries. A single list is what got mine under an hour."

## Comment disclosure rule

Every drafted comment on another account that mentions, or could imply, a product the founder makes starts with an honest disclosure ("I build Snap, ...").
A comment that does not mention the product still should not pretend to be neutral about it.
Never send any of them, never drop them under unrelated posts, never send in bulk.

## Claims check

Each file was re-opened on 2026-10-04 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| Contact form inquiries land in Leads | apps/snap/lib/repos/leads.ts | `createLead` ingests inquiries from the embedded contact form (`/api/embed/leads`), the booking page and manual entry into the same leads table; the page subtitle states the sources. Confirmed. |
| Manual leads and CSV import included | apps/snap/app/api/leads/route.ts | WEB-167: POST `/api/leads` creates manual leads ("walk-in / phone enquiries enter the same inbox with source manual"); the page carries the Import CSV button (`leads-import.tsx`). Confirmed. |
| Conversations stay attached to the lead | apps/snap/components/lead-conversation.tsx | WEB-308: the lead record's conversation card deep-links into the unified Inbox thread and previews recent messages. Confirmed. |
| Conversion creates a Booked project | apps/snap/components/lead-conversation.tsx | The prefilled dialog posts to `/api/leads/{id}` and `convertLeadToProject` creates the project in Booked and adds the client; the panel reads "Converted to a project". Confirmed. |
| Leads and inbox on the Free plan (caption only) | apps/snap/lib/tier-cards.ts | Free card: "Unified inbox - every conversation & event, free"; `plans-data.ts` has no lead count gate. Confirmed. |

Not claimed anywhere: that Snap answers inquiries automatically (organizing is the product; replies are human), that leads from Instagram DMs sync into Snap (they are typed or imported by hand), or any paid-tier feature in the reel itself.

## Known blemishes

- Recorded against a LOCAL production-shape dev server (http://localhost:5173, same code as staging), because staging login credentials were not configured in this environment.
- The demo data is seeded: studio "Amara & Oak Photography" with fictional leads (Julie Freeman, David White, Cassie Maldonado and others); this take's lead is the demo client "Nora Example" (client@example.com) created through the manual-lead API.
- Other leads' email addresses on the table are blurred by the privacy mask; the demo client's address stays readable.
- The manual lead has no inbox thread yet, so the record shows the inquiry details without a message preview; email-sourced leads show a conversation preview.
- Each take's conversion leaves a "Nora Example - Wedding" card in the board's Booked column as demo history; a re-record adds another.
- The reel runs 23.8 s: inside the 20-30 s target.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-007 MEASURED --by analyst --set metrics.views=...`.
