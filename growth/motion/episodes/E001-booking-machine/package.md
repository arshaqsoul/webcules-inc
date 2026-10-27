# Reel package: E001 - The Booking Machine

Series: Not Photography. Made entirely in code (growth/motion), no recording and no generated video.

## Files

- Reel: `growth/motion/out/E001/reel.mp4` (1080x1920, 24s, 30 fps, -14 LUFS)
- Cover: `growth/motion/out/E001/cover.png`
- QC: `growth/motion/out/E001/qc.json` (8/8 pass)

## Organic post (Instagram and Facebook)

Caption (paste as is):

Booking one wedding client shouldn't take six apps.

An inbox for the inquiry. A scheduler for the date. A contract you print, sign and scan. An invoice tool. A payment you chase. A gallery link you send twice.
None of that is photography.

Snap puts booking, contracts, invoices, payments and galleries in one place. Clients book from your page, sign in their browser and pay through your own Stripe. Snap takes 0% commission.
It is not magic: the Free plan has one session type, two contract templates and five active galleries. Lite raises session types and galleries; Studio makes all three unlimited.

Start free at snaphq.app

Hashtags (first comment):

#weddingphotographer #photographybusiness #photographerworkflow #photographycrm #smallbusinessowner #photographytips #clientgallery

## Paid ad (Meta Ads Manager)

- Primary text: Booking one client shouldn't take six apps. Snap runs booking, contracts, invoices, payments and galleries in one place, with 0% commission.
- Headline: Every client, one tab
- Description: Free to start at snaphq.app
- Call to action button: Sign Up
- Placements: instagram_reels, facebook_reels, instagram_stories, facebook_stories
- Destination: https://snaphq.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=not_photography&utm_content=e001

## Claims on screen and in the caption

- 0% commission - `apps/snap/lib/connect.ts`
- Clients pay through your own Stripe - `apps/snap/lib/connect.ts`
- Free to start (Free plan, $0) - `apps/snap/lib/plans-data.ts`
- Booking page on the Free plan (one session type) - `apps/snap/lib/plans-data.ts`
- Contracts signed in the browser, on the Free plan (two templates) - `apps/snap/lib/contracts.ts`
- Invoices with secure client links - `apps/snap/lib/invoices.ts`
- Client galleries on the Free plan (five active) - `apps/snap/lib/plans-data.ts`
- Lite: 3 session types and 15 galleries - `apps/snap/lib/tier-cards.ts`
- Studio: unlimited galleries, session types and contract templates - `apps/snap/lib/tier-cards.ts`
- Full CRM and pipeline on Free - `apps/snap/lib/tier-cards.ts`

## The pain point

Booking one client means stitching together separate tools for the inquiry, the date, the contract, the invoice, the payment and the gallery, and chasing each step by hand.

- https://www.aiarty.com/ai-photography-guide/best-booking-app-for-photographers.htm - Guide describes the common setup of booking sessions in one scheduling app and delivering galleries in a separate gallery tool, and notes a popular scheduler has no built-in contracts and only basic payments.
- https://unscriptedphotographers.com/blog/honeybook-alternative - A photographer-business blog says a popular client-management tool relies on a separate gallery integration, framing the setup as multiple tools and subscriptions. Competitor-adjacent source, weigh accordingly.
- https://blog.pic-time.com/blog/honeybook-and-pic-time - A gallery vendor's own blog explains how to pair it with a separate CRM, confirming that the two halves of the workflow live in different products.
- https://petapixel.com/2023/09/25/photographer-goes-viral-calling-up-clients-to-pay-outstanding-invoices - News piece (Sep 2023): a photographer's video about chasing clients for unpaid invoices went viral and many photographers said they had the same problem.

## Posting notes

- The reel carries its own synthesised score and sound effects; it works muted too, since every beat is on screen.
- Keep the in-app "original audio" on. If you add a trending sound, keep it low.
- Cover: pick 6.4s or upload cover.png.
