# Reel package: S03 - Delivered

Series: Snap it. - Out Here. Made entirely in code (growth/motion), no recording and no generated video.

## Files

- Reel: `growth/motion/out/S03/reel.mp4` (1080x1920, 25.87s, 30 fps, -14 LUFS)
- Cover: `growth/motion/out/S03/cover.png`
- QC: `growth/motion/out/S03/qc.json` (8/8 pass)

## Organic post (Instagram and Facebook)

Caption (paste as is):

Shot today. Delivered tonight.

A rooftop engagement session at 6:30. A quiet night of editing at 11:40. And by 8 the next morning, Priya and Sam are on their sofa opening their gallery.
When you deliver a gallery in Snap, it lands in your inbox as gallery delivered, and you see the moment your client opens it for the first time.
Snap takes 0% commission.

It is not magic: you still shoot, edit and send the gallery yourself. Snap just keeps the delivery and the first open in one place.

Start free at snaphq.app

Hashtags (first comment):

#photographerlife #dayinthelife #engagementphotographer #weddingphotographer #clientgallery #photographybusiness #photographerworkflow

## Paid ad (Meta Ads Manager)

- Primary text: Shot today, delivered tonight. Send the gallery from Snap and see the moment your client opens it. 0% commission.
- Headline: Snap it.
- Description: Free to start at snaphq.app
- Call to action button: Sign Up
- Placements: instagram_reels, facebook_reels, instagram_stories, facebook_stories
- Destination: https://snaphq.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=not_photography&utm_content=s03

## Claims on screen and in the caption

- Gallery delivered event lands in the Snap inbox - `apps/snap/lib/shares/notify.ts`
- Client opened their gallery for the first time event lands in the Snap inbox - `apps/snap/lib/shares/gallery-auth.ts`
- Invoice paid event; payment goes into your own Stripe - `apps/snap/lib/invoices.ts`
- Clients pay through your own Stripe - `apps/snap/lib/connect.ts`
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
- Cover: pick 1.2s or upload cover.png.
