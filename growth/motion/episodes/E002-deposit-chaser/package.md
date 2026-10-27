# Reel package: E002 - The Deposit Chaser

Series: Not Photography. Made entirely in code (growth/motion), no recording and no generated video.

## Files

- Reel: `growth/motion/out/E002/reel.mp4` (1080x1920, 23.6s, 30 fps, -14 LUFS)
- Cover: `growth/motion/out/E002/cover.png`
- QC: `growth/motion/out/E002/qc.json` (8/8 pass)

## Organic post (Instagram and Facebook)

Caption (paste as is):

Sent the invoice three weeks ago. Still "just following up".

Reminder emails, sticky notes, a voicemail you rehearsed twice. Chasing a deposit is a part-time job nobody signed up for.
None of that is photography.

In Snap, the invoice goes out with a pay link inside. Your client pays by card, the money goes straight into your own Stripe, and the invoice marks itself paid. You see it land on their thread in your inbox. Snap takes 0% commission.
It is not magic: pay links need your Stripe account connected, and Stripe's own processing fee still applies.

Start free at snaphq.app

Hashtags (first comment):

#weddingphotographer #photographybusiness #gettingpaid #photographerworkflow #smallbusinessowner #photographytips #invoicing

## Paid ad (Meta Ads Manager)

- Primary text: Stop chasing deposits. Snap invoices carry a pay link, the money goes to your own Stripe, and the invoice marks itself paid. 0% commission.
- Headline: Send it once. Get paid.
- Description: Free to start at snaphq.app
- Call to action button: Sign Up
- Placements: instagram_reels, facebook_reels, instagram_stories, facebook_stories
- Destination: https://snaphq.app/?utm_source=meta&utm_medium=paid_social&utm_campaign=not_photography&utm_content=e002

## Claims on screen and in the caption

- Sending an invoice creates a pay link on your own Stripe account - `apps/snap/lib/invoices.ts`
- Clients pay through your own Stripe - `apps/snap/lib/connect.ts`
- The invoice flips to paid when the client pays - `apps/snap/lib/invoices.ts`
- The payment lands in your inbox on the client's thread - `apps/snap/lib/invoices.ts`
- 0% commission - `apps/snap/lib/connect.ts`
- Pay links need an active Stripe account connected - `apps/snap/lib/invoices.ts`
- Free to start (Free plan, $0) - `apps/snap/lib/plans-data.ts`
- Invoice actions are gated by role, not by plan - `apps/snap/app/api/invoices/[id]/action/route.ts`

## The pain point

After the client says yes, the photographer sends the invoice and then spends days or weeks chasing the deposit with reminder emails, notes and calls, often with no answer.

- https://petapixel.com/2023/09/25/photographer-goes-viral-calling-up-clients-to-pay-outstanding-invoices - News piece (Sep 2023): a photographer's video about phoning clients to get outstanding invoices paid drew millions of views, and many photographers said they were dealing with the same thing.
- https://fstoppers.com/business/when-should-you-receive-payment-your-work-503435 - Photography business article describes chasing invoice payments well past 60 days, and photographers sometimes never delivering files because the client has not paid.
- https://shootdotedit.com/blogs/news/late-payments - A photography post-production company's blog on late payments advises clear payment terms and reminders so payments do not slip through, treating late payment as a routine problem for photographers.
- https://blog.freelancersunion.org/2022/11/24/how-to-get-paid-on-time/ - Freelancers Union guidance on getting paid on time: set terms up front and use reminders, because following up on late invoices is a common and uncomfortable part of freelance work.

## Posting notes

- The reel carries its own synthesised score and sound effects; it works muted too, since every beat is on screen.
- Keep the in-app "original audio" on. If you add a trending sound, keep it low.
- Cover: pick 6s or upload cover.png.
