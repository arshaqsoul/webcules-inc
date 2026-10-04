# Reel package: PP-004

This is what the founder posts.
The packager filled it in and checked every field.
This is the first post on the `snap.webcules` account, so it is written as an introduction.

## Files

- Reel: `growth/packages/PP-004/reel.mp4`
- Cover: `growth/packages/PP-004/cover.png`
- QC report: `growth/packages/PP-004/qc.json`

## Caption (paste as is)

One tab for your leads, shoots, galleries and payments.

I'm Arshaq and I built Snap.
A photographer friend wanted to send clients links to selected photos, and it grew into a full platform for running the studio.
This reel is a quick tour: the overview, the projects board, a project's photos and the Transactions screen.
0% commission, and the free plan has 20 GB of storage.
The studio in the reel is demo data, so none of the numbers are real earnings.

Link in bio if you want to try it.

(The first line is 55 characters, well under the 125 character fold. Everything above this note is the caption.)

## Hashtags (paste as the first comment or at the end)

#photographybusiness #photographerworkflow #weddingphotographer #clientgallery #photographycrm #portraitphotographer #smallbusinessowner

## Audio

The reel already carries synthesised sound effects (clicks, captions, the end chime), so it can be posted as is.
The captions still carry every step for viewers who scroll with sound off.
If you also add a trending sound inside Instagram, keep it at low volume and lower the reel's original audio slider a little so the effects stay audible.
Suggested trend ids from `growth/trends/`: none.
`growth/trends/` has no validated trends yet, so no trend is claimed, and any sound you add is your own call.

## When to post

Post this reel BEFORE the PP-003 reel, about 2 days earlier.
Suggested: Monday 2026-10-05, around 8:00 pm Eastern (5:00 pm Pacific).
Then post PP-003 on Wednesday 2026-10-07 at the same time.
Note that `growth/packages/PP-003/package.md` currently suggests Tuesday 2026-10-06.
That suggestion was written before this reel existed.
If you follow this plan, move PP-003 to Wednesday 2026-10-07, or keep Tuesday and post this reel on Sunday 2026-10-04 evening.
Do not post both on the same day.

Reasoning:

- The account has 0 followers and 0 posts.
  The first reel is the first impression for everyone who lands on the profile, and it is the one that answers "what is Snap and who made it".
  PP-003 is about one specific worry (a forwarded gallery link).
  Someone who sees it first has to work out what the product is from the end card alone.
- The profile bio already reads "Your studio, in focus. Booking - client galleries - payments - 0% commission, 20 GB free".
  This reel is the one that shows that bio, so the bio and the first post match.
- Two days apart lets the first post be seen and replied to before the second one lands on the grid.
  It also gives you a gap to answer every comment in the first hour on each.
  Posting two reels from a brand new account on the same day splits the little reach there is.
- Wedding and event photographers shoot at weekends, so Monday and Wednesday evenings are when they are at their desks.
  Evening Eastern is late afternoon on the west coast, so the Canadian audience is mostly awake and off the clock.
- This is a judgment call, not measured data, because the account has no history yet.
  You can override it, and the analyst will compare results after 48 hours.

## Link and call to action

Link in bio points to: https://snap.webcules.com/?utm_source=instagram&utm_medium=reel&utm_campaign=PP-004
Pinned first comment: The studio in the reel is a demo studio on a paid plan, so some of what you see goes beyond the free plan. The pricing page on the site lists exactly what each plan includes. I'm happy to answer questions here.

## Engagement plan (human actions only)

- Reply to every comment on this reel in the first hour.
- Nothing below has been sent.
  Each draft is for you to send or discard, and you adapt it to what the account actually posted.
  No private individuals are named.
  Pick relevant wedding, portrait or studio-business photographer accounts yourself.
- Rule for all drafts: a comment that mentions or could imply Snap starts with a disclosure.
  A comment that does not mention Snap still should not pretend to be neutral about a product you make, so the disclosure stays in.
  Do not drop these comments under a post that has nothing to do with the topic, and do not send them in bulk.
- Drafts:
  - On a post about juggling several tools for clients: "I build Snap, so I'm biased. How many separate tools do you use between enquiry and delivery? I'm curious where it gets messy for you."
  - On a post about sending a client a selection of photos: "I build Snap, a studio tool. It started because a photographer friend wanted to send clients links to selected photos. How do you send selections today?"
  - On a post about commission or fees on print or gallery sales: "I build Snap, so take this with that in mind. Do you pay a commission on sales today, or a flat fee? I'd like to hear how it works out for you."
  - On a post about client booking or inquiry workflow: "Disclosure, I make a studio management tool called Snap. What is the one step in your booking flow you wish you could skip?"
  - On a post about a storage or backup problem: "I build Snap, so I'm not neutral. How much storage do you realistically use per wedding?"

## Claims check

Each file was re-opened on 2026-10-03 and the claim confirmed.

| Claim in the reel or caption | Source file in apps/snap | Verified |
|---|---|---|
| 0% commission, the platform takes nothing from bookings | apps/snap/lib/connect.ts | Header comment, lines 3 to 4: "Monetization is subscription-only: destination charges carry application_fee_amount 0 (the platform takes nothing from bookings)." Also `app/api/embed/bookings/route.ts` line 103 omits `application_fee_amount`, so it is 0. Confirmed. |
| 0% commission, landing page | apps/snap/components/landing/hero.tsx | Line 12: `PROOF = ["0% commission", "20 GB free", "No credit card"]`. Confirmed. |
| 0% commission and 20 GB free, landing call to action | apps/snap/components/landing/final-cta.tsx | Line 51: "20 GB free · no credit card · 0% commission, ever". Confirmed. The caption does not use "ever". |
| The free plan has 20 GB of storage | apps/snap/lib/plans-data.ts | `free` plan, `priceMonthlyUsd: 0`, `storageBytes: 20 * GB` (line 61). Confirmed. |
| The Free card lists 20 GB storage | apps/snap/lib/tier-cards.ts | Free card, `"20 GB storage (incl. 3 GB RAW trial)"`. Confirmed. The card also lists unified inbox, full CRM and pipeline, secure client galleries and unlimited bookings. It does not list contracts, invoices or payments, so the caption does not say they are on Free. |
| The sidebar has Overview, Projects and Transactions | apps/snap/components/dashboard-nav.tsx | `NAV_ITEMS` lines 22 to 33 contain Overview, Projects and Transactions. Transactions is hidden for non-owners (line 199), which is true of the demo owner account and is not claimed. Confirmed. |
| A project has a Files tab | apps/snap/app/dashboard/projects/[id]/page.tsx | `TABS` lines 50 to 57 include `{ key: "files", label: "Files" }`. Confirmed. |
| End card "Booking, galleries and payments in one place" | apps/snap/components/dashboard-nav.tsx and apps/snap/app/dashboard/projects/[id]/page.tsx | Booking (Calendar, Leads), galleries (Galleries, project "Client gallery" tab) and payments (Transactions, project "Payments & invoices" tab) all exist in the product. This is a statement about the product as a whole, not about the Free plan. |
| "I built Snap after a photographer friend wanted to send clients links to selected photos, and it grew into a full platform" | Founder's own account | Not a code claim. It is the founder's origin story as given to the packager, and nothing beyond it is invented. |

Not claimed anywhere: that contracts, invoices or payments are on the Free plan, any plan price, any storage beyond 20 GB, any competitor, any earnings or numbers about users.
The words "Free" and "20 GB" appear in the caption only as the Free plan's storage, which is what the code says.

## Known blemishes

- While the Files page loads, one zoom briefly includes the Studio-only "Heat" button for about 1.5 seconds.
  It is not claimed and the caption does not mention it.
- The reel is about 32 seconds (QC: 32.1 s, allowed 8 to 45 s).
  The brief asked for 22 to 30 seconds.
- Every number on screen is seeded demo data (the Collected total, the transaction rows, names and dates).
  The caption says so, and nothing in it presents them as earnings.
- The demo studio runs on a paid plan, so a few screens show features beyond the Free card.
  The pinned comment says so.
- Every email address on screen is blurred, and the take sends no email.
- A frame check on the cover and a few frames showed the end card, the Transactions screen and step captions rendering cleanly.

## Notes for the founder

- `~/VOICE.md` does not exist on this machine, so the caption follows the plain, direct voice in the brief.
  Edit the wording freely.
- The reel does not name a plan.
  If someone asks, the pricing page is the source, not the reel.

## Measurement

After 48 hours record views, saves, sends, profile visits, link clicks and signups with `ledger.mjs transition PP-004 MEASURED --by analyst --set metrics.views=...`.
Because this is the first post, compare it against PP-003 only loosely: the account had no audience when it went out.
