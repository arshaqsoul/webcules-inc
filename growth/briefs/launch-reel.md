# Brief - Snap launch reel

Record kind: `launch` (PP-004).
This is the first reel on the `snap.webcules` Instagram account, so it introduces the product rather than answering one pain point.

## Goal

A working photographer watches 25 seconds and understands what Snap is, that it is for them, and that trying it costs nothing.
The action we want is a tap on the link in the bio, then a free signup.

## Audience

Solo and small-studio wedding, event and portrait photographers.
They currently stitch together a CRM, a gallery host, contracts and invoicing from several tools, and they resent commission on sales.

## The one message

Booking, client galleries, contracts and payments in one place.
0% commission.
20 GB free.

## Tone

Plain, specific and calm.
No hype words, no superlatives, no comparisons that name a competitor, no invented numbers.
It sounds like a photographer who built a tool, not an agency.

## Format

Desktop recording, 22 to 30 seconds, 4 to 6 steps, one idea per step.
Hook of 6 words or fewer, for example "Your whole studio, one tab" (the designer may improve it).
First frame already shows the product, never a logo card.

## Flow to show (all read-only navigation in the staging demo studio)

1. The studio overview: leads, upcoming sessions, projects, pipeline.
2. The unified inbox: every conversation in one place.
3. A project: the work for one shoot, including its client gallery area.
4. The calendar or booking view, if it reads clearly on screen.
5. Transactions: getting paid.

The designer chooses the order, the exact screens and the captions from what actually looks best in staging.
Every screen must exist and show real demo data.

## Hard constraints

- **No data changes.**
  Navigate and hover only: no creating, sending, deleting, revoking or saving.
  So no teardown is needed and the take is trivially repeatable.
- **No email is sent.**
  The take does not set `sendsEmail`.
- **Every email address on screen is blurred** (the default mask).
- **Claims only from code.**
  The words `Free`, `Lite`, `Studio`, `Pro`, `$`, `GB` and `%` may appear on screen only if they are in `meta.claims` with a real source.
  Candidate claims and sources:
  - "0% commission" and "20 GB free": `apps/snap/components/landing/hero.tsx` (the proof strip), `apps/snap/components/landing/final-cta.tsx`, `apps/snap/lib/plans-data.ts` (Free storage is 20 GB).
  - The Free tier list: `apps/snap/lib/tier-cards.ts`.
- **The staging studio is on the Studio plan**, so paid-only controls may be visible.
  Do not zoom on them and do not claim them.
- **Do not show:** the "Studio setup" onboarding card as a feature, any billing page, any revoke control, anything half-built.
- No em dashes.

## End card

Claim line: something like "Booking, galleries and payments in one place".
Note line: "0% commission. 20 GB free." (only if both are in the claims table with sources).
Link text: `snap.webcules.com`.

## Success looks like

The reel passes `reel.mjs check` and QC, the frames show real screens with correct highlights, the payoff (the money screen or the end message) is readable, and the package caption makes no claim the code cannot back.
