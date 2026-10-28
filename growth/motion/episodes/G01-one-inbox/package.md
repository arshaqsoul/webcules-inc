# Reel package: G01 - One inbox

Series: Snap it. - Glass Studio. Made entirely in code (growth/motion), no recording and no generated video.

## Files

- Reel: `growth/motion/out/G01/reel.mp4` (1080x1920, 8.27s, 30 fps, -14 LUFS)
- Cover: `growth/motion/out/G01/cover.png`
- QC: `growth/motion/out/G01/qc.json` (8/8 pass)

## Organic post (Instagram and Facebook)

Caption (paste as is):

Every inquiry in one inbox.

When a couple fills in your Snap contact form, their inquiry lands in your Snap inbox, next to every booking, contract and payment, with a CRM behind it. Nothing slips through while you are out shooting.

It is not magic: you still reply and send the quote. Snap just keeps every conversation in one place.

Start free at snaphq.app

Hashtags (first comment):

#weddingphotographer #photographybusiness #photographerlife #clientexperience #photographerworkflow #studiomanagement

## Paid ad (Meta Ads Manager)

- Primary text: Inquiries from your contact form land in one Snap inbox, next to bookings, contracts and payments. 0% commission, free to start.
- Headline: Every inquiry in one inbox.
- Description: Free to start at snaphq.app
- Call to action button: Sign Up
- Placements: instagram_reels, facebook_reels, instagram_stories, facebook_stories
- Destination: https://snaphq.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=not_photography&utm_content=g01

## Claims on screen and in the caption

- New inquiry - {name} lands in the Snap inbox when a client sends your contact form - `apps/snap/lib/repos/leads.ts`
- The inbox subject reads {type} inquiry, e.g. Wedding inquiry - `apps/snap/lib/repos/leads.ts`
- The Free plan includes a contact form - `apps/snap/lib/plans-data.ts`
- New booking event lands in the Snap inbox - `apps/snap/lib/repos/bookings.ts`
- Clients book from your booking page, on the Free plan - `apps/snap/lib/plans-data.ts`
- Contract signed event lands in the Snap inbox; clients sign in the browser - `apps/snap/lib/contracts.ts`
- Invoice paid event; payment goes into your own Stripe - `apps/snap/lib/invoices.ts`
- Clients pay through your own Stripe - `apps/snap/lib/connect.ts`
- Gallery first view event lands in the Snap inbox - `apps/snap/lib/shares/gallery-auth.ts`
- Unified inbox on the Free plan - `apps/snap/lib/tier-cards.ts`
- 0% commission - `apps/snap/lib/connect.ts`
- Free to start (Free plan, $0) - `apps/snap/lib/plans-data.ts`

## The pain point

Photographers want to spend the day shooting, but bookings, contracts, payments and gallery follow-ups pull them back to the desk and spread across separate tools.

- https://www.aiarty.com/ai-photography-guide/best-booking-app-for-photographers.htm - Guide describes booking sessions in one app and delivering galleries in another, the stitched-together setup many photographers run.
- https://petapixel.com/2023/09/25/photographer-goes-viral-calling-up-clients-to-pay-outstanding-invoices - News piece (Sep 2023): a photographer's video about phoning clients over unpaid invoices drew millions of views and many photographers said the same.
- https://fstoppers.com/business/when-should-you-receive-payment-your-work-503435 - Photography business article on chasing invoice payments well past 60 days.
- https://blog.pic-time.com/blog/honeybook-and-pic-time - A gallery vendor explains pairing its galleries with a separate client-management tool, so the workflow lives in two products.

## Posting notes

- The reel carries its own synthesised score and sound effects; it works muted too, since every beat is on screen.
- Keep the in-app "original audio" on. If you add a trending sound, keep it low.
- Cover: pick 0s or upload cover.png.
