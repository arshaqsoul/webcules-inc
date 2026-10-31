# Reel package: G02 - I wish they'd just pay

Series: Snap it. - Glass Studio. Hybrid: keyframes and clips generated on local ComfyUI (Z-Image, Wan 2.2); every word, inbox card and the end card drawn in code (growth/motion), no recording.

**Turn on Instagram's and Facebook's AI label when posting (generated footage).**

## Files

- Reel: `growth/motion/out/G02/reel.mp4` (1080x1920, 8.27s, 30 fps, -14 LUFS)
- Cover: `growth/motion/out/G02/cover.png`
- QC: `growth/motion/out/G02/qc.json` (8/8 pass)

## Organic post (Instagram and Facebook)

Caption (paste as is):

I wish they'd just pay.

The shoot was lovely. Then comes the part nobody enjoys: chasing the invoice.
With Snap you send a numbered invoice with a secure payment link. Your client pays online in a few taps, the money goes into your own Stripe, and "Invoice paid" lands in your Snap inbox.
Snap takes 0% commission.

It is not magic: you still send the invoice. Snap just makes paying it the easy part.

Start free at snaphq.app

Hashtags (first comment):

#familyphotographer #photographybusiness #photographerlife #gettingpaid #photographerworkflow #smallbusinessowner

## Paid ad (Meta Ads Manager)

- Primary text: Send a numbered invoice with a secure payment link. Clients pay online, straight into your own Stripe. 0% commission, free to start.
- Headline: I wish they'd just pay.
- Description: Free to start at snaphq.app
- Call to action button: Sign Up
- Placements: instagram_reels, facebook_reels, instagram_stories, facebook_stories
- Destination: https://snaphq.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=not_photography&utm_content=g02

## Claims on screen and in the caption

- Invoice {number} paid lands in the Snap inbox - `apps/snap/lib/invoices.ts`
- Clients pay the invoice online through Stripe Checkout - `apps/snap/lib/invoices.ts`
- Payments go into the photographer's own Stripe account - `apps/snap/lib/connect.ts`
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
